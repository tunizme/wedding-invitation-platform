import { randomBytes, randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { RetentionWorker } from '../../../src/modules/identity-access/infrastructure/retention.worker';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('IAM retention worker', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;

  beforeAll(async () => {
    fixture = await registrationFixture();
  });
  beforeEach(async () => fixture.clear());
  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  async function seedUser(id: string, email: string, role = 'CUSTOMER') {
    await fixture.db.query(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES ($1,$2,'hash','LOCAL',$3,'ACTIVE',now(),now()-interval '3 years',now())`,
      [id, email, role],
    );
  }

  it('deletes expired records in FK-safe order and retains refresh reuse history through its window', async () => {
    const actor = randomUUID();
    const target = randomUUID();
    await seedUser(actor, 'retention-admin@example.test', 'ADMIN');
    await seedUser(target, 'retention-customer@example.test');

    const oldSession = randomUUID();
    const recentSession = randomUUID();
    await fixture.db.query(
      `INSERT INTO auth_sessions
       (id,user_id,csrf_seed,csrf_key_version,created_at,absolute_expires_at,revoked_at,revocation_reason)
       VALUES
       ($1,$3,$4,1,now()-interval '100 days',now()-interval '86 days',now()-interval '90 days','LOGOUT'),
       ($2,$3,$4,1,now()-interval '20 days',now()-interval '6 days',now()-interval '10 days','LOGOUT')`,
      [oldSession, recentSession, target, randomBytes(32)],
    );
    const oldCredential = randomUUID();
    const recentCredential = randomUUID();
    await fixture.db.query(
      `INSERT INTO refresh_credentials
       (id,session_id,token_hash,hash_key_version,generation,issued_at,expires_at,consumed_at)
       VALUES
       ($1,$3,$5,1,0,now()-interval '100 days',now()-interval '86 days',now()-interval '99 days'),
       ($2,$4,$6,1,0,now()-interval '20 days',now()-interval '6 days',now()-interval '19 days')`,
      [
        oldCredential,
        recentCredential,
        oldSession,
        recentSession,
        randomBytes(32),
        randomBytes(32),
      ],
    );

    const onboarding = randomUUID();
    await fixture.db.query(
      `INSERT INTO pending_social_onboardings
       (id,provider,provider_subject,binding_hash,csrf_seed,csrf_key_version,status,expires_at,created_at,updated_at)
       VALUES ($1,'GOOGLE','old-subject',$2,$3,1,'EXPIRED',now()-interval '20 days',now()-interval '21 days',now()-interval '20 days')`,
      [onboarding, randomBytes(32), randomBytes(32)],
    );
    const challenge = randomUUID();
    const outbox = randomUUID();
    await fixture.db.query(
      `INSERT INTO auth_challenges
       (id,purpose,status,social_onboarding_id,email,token_hash,token_key_version,generation,created_at,expires_at,revoked_at)
       VALUES ($1,'SOCIAL_EMAIL_VERIFICATION','REVOKED',$2,'old@example.test',$3,1,0,now()-interval '50 days',now()-interval '49 days',now()-interval '40 days')`,
      [challenge, onboarding, randomBytes(32)],
    );
    await fixture.db.query(
      `INSERT INTO email_outbox
       (id,challenge_id,template_key,recipient_email,status,next_attempt_at,created_at,updated_at,delivered_at)
       VALUES ($1,$2,'verify','old@example.test','DELIVERED',now()-interval '40 days',now()-interval '50 days',now()-interval '40 days',now()-interval '40 days')`,
      [outbox, challenge],
    );

    const oauth = randomUUID();
    await fixture.db.query(
      `INSERT INTO oauth_transactions
       (id,provider,state_hash,browser_binding_hash,return_target_key,status,created_at,expires_at,consumed_at)
       VALUES ($1,'FACEBOOK',$2,$3,'default','CONSUMED',now()-interval '3 days',now()-interval '2 days',now()-interval '2 days')`,
      [oauth, randomBytes(32), randomBytes(32)],
    );
    await fixture.db.query(
      `INSERT INTO auth_rate_limit_buckets
       (action,subject_hash,hash_key_version,window_started_at,count,expires_at)
       VALUES ('LOGIN_IP',$1,1,now()-interval '3 days',1,now()-interval '2 days')`,
      [randomBytes(32)],
    );
    await fixture.db.query(
      `INSERT INTO admin_audit_events
       (actor_user_id,target_user_id,action,outcome,previous_status,new_status,occurred_at,request_id)
       VALUES ($1,$2,'CUSTOMER_LOCKED','CHANGED','ACTIVE','LOCKED',now()-interval '3 years','retention-old')`,
      [actor, target],
    );

    const metrics = await new RetentionWorker(
      fixture.db,
      fixture.config,
    ).runOnce();
    expect(metrics.failure).toBe(false);
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.deleted).toMatchObject({
      emailOutbox: 1,
      authChallenges: 1,
      pendingOnboardings: 1,
      refreshCredentials: 1,
      authSessions: 1,
      oauthTransactions: 1,
      rateLimitBuckets: 1,
      adminAuditEvents: 1,
    });
    expect(
      await fixture.db.query('SELECT id FROM auth_sessions ORDER BY id'),
    ).toEqual([{ id: recentSession }]);
    expect(
      await fixture.db.query('SELECT id FROM refresh_credentials ORDER BY id'),
    ).toEqual([{ id: recentCredential }]);
  });

  it('caps each cleanup relation at the configured batch size', async () => {
    const batchSize = 2;
    for (let index = 0; index < 3; index += 1) {
      await fixture.db.query(
        `INSERT INTO auth_rate_limit_buckets
         (action,subject_hash,hash_key_version,window_started_at,count,expires_at)
         VALUES ('LOGIN_IP',$1,1,now()-interval '3 days',1,now()-interval '2 days')`,
        [randomBytes(32)],
      );
    }
    const worker = new RetentionWorker(fixture.db, {
      ...fixture.config,
      retention: { ...fixture.config.retention, batchSize },
    });
    const first = await worker.runOnce();
    expect(first.deleted.rateLimitBuckets).toBe(batchSize);
    const [{ count }] = await fixture.db.query<{ count: string }[]>(
      'SELECT count(*) FROM auth_rate_limit_buckets',
    );
    expect(Number(count)).toBe(1);
  });

  it('retires stale contexts and expires/deletes old intents without releasing unresolved cookie names', async () => {
    const contextId = randomUUID();
    const groupId = randomUUID();
    const intentId = randomUUID();
    const name = `wa_s_${'A'.repeat(22)}`;
    await fixture.db.query(
      `INSERT INTO auth_contexts
       (id,binding_digest,binding_key_version,group_id,state,confirmed_seq,revision,created_at,confirmed_at,last_seen_at,retired_at)
       VALUES ($1,$2,1,$3,'ACTIVE',nextval('auth_context_confirm_seq'),1,
         now()-interval '40 days',now()-interval '40 days',now()-interval '31 days',NULL)`,
      [contextId, randomBytes(32), groupId],
    );
    await fixture.db.query(
      `INSERT INTO auth_intents
       (id,context_id,kind,revision,state,expires_at,created_at)
       VALUES ($1,$2,'LOCAL_LOGIN',1,'RESERVED',now()-interval '30 hours',now()-interval '31 hours')`,
      [intentId, contextId],
    );
    await fixture.db.query(
      'UPDATE auth_contexts SET current_intent_id=$2 WHERE id=$1',
      [contextId, intentId],
    );
    await fixture.db.query(
      `INSERT INTO auth_cookie_names
       (group_id,name,kind,owner_session_id,last_set_digest,unresolved_set,observed_present,bytes)
       VALUES ($1,$2,'SLOT',NULL,$3,true,false,80)`,
      [groupId, name, randomBytes(32)],
    );
    const result = await new RetentionWorker(
      fixture.db,
      fixture.config,
    ).runOnce();
    expect(result.terminalized).toMatchObject({
      authContextsRetired: 1,
      authIntentsExpired: 1,
      authIntents: 1,
    });
    const [context] = await fixture.db.query<
      { current_intent_id: string | null }[]
    >('SELECT current_intent_id FROM auth_contexts WHERE id=$1', [contextId]);
    expect(context?.current_intent_id).toBeNull();
    expect(
      await fixture.db.query(
        'SELECT name,unresolved_set FROM auth_cookie_names WHERE name=$1',
        [name],
      ),
    ).toEqual([{ name, unresolved_set: true }]);
  });

  it('expires matching intent/context pairs when bounded batches have different orders', async () => {
    const groupId = randomUUID();
    const firstContext = randomUUID();
    const secondContext = randomUUID();
    const firstIntent = randomUUID();
    const secondIntent = randomUUID();
    for (const contextId of [firstContext, secondContext]) {
      await fixture.db.query(
        `INSERT INTO auth_contexts
         (id,binding_digest,binding_key_version,group_id,state,confirmed_seq,revision,created_at,confirmed_at,last_seen_at)
         VALUES ($1,$2,1,$3,'ACTIVE',nextval('auth_context_confirm_seq'),1,now(),now(),now())`,
        [contextId, randomBytes(32), groupId],
      );
    }
    await fixture.db.query(
      `INSERT INTO auth_intents
       (id,context_id,kind,revision,state,expires_at,created_at)
       VALUES
       ($1,$2,'LOCAL_LOGIN',1,'RESERVED',now()-interval '1 hour',now()-interval '2 hours'),
       ($3,$4,'LOCAL_LOGIN',1,'RESERVED',now()-interval '2 hours',now()-interval '3 hours')`,
      [firstIntent, firstContext, secondIntent, secondContext],
    );
    await fixture.db.query(
      `UPDATE auth_contexts SET current_intent_id=CASE id
         WHEN $1 THEN $3::uuid WHEN $2 THEN $4::uuid END
       WHERE id=ANY($5::uuid[])`,
      [
        firstContext,
        secondContext,
        firstIntent,
        secondIntent,
        [firstContext, secondContext],
      ],
    );

    const worker = new RetentionWorker(fixture.db, {
      ...fixture.config,
      retention: { ...fixture.config.retention, batchSize: 1 },
    });
    const result = await worker.runOnce();
    expect(result.terminalized.authIntentsExpired).toBe(1);
    const rows = await fixture.db.query<
      { id: string; state: string; current_intent_id: string | null }[]
    >(
      `SELECT i.id,i.state,c.current_intent_id FROM auth_intents i
       JOIN auth_contexts c ON c.id=i.context_id ORDER BY i.id`,
    );
    expect(rows.find((row) => row.id === secondIntent)).toMatchObject({
      state: 'EXPIRED',
      current_intent_id: null,
    });
    expect(rows.find((row) => row.id === firstIntent)).toMatchObject({
      state: 'RESERVED',
      current_intent_id: firstIntent,
    });
  });

  it('clears the context pointer before deleting an aged current session', async () => {
    const userId = randomUUID();
    const contextId = randomUUID();
    const sessionId = randomUUID();
    await seedUser(userId, 'retention-context-session@example.test');
    await fixture.db.query(
      `INSERT INTO auth_contexts
       (id,binding_digest,binding_key_version,group_id,state,confirmed_seq,revision,created_at,confirmed_at,last_seen_at)
       VALUES ($1,$2,1,$3,'ACTIVE',nextval('auth_context_confirm_seq'),1,
         now()-interval '40 days',now()-interval '40 days',now())`,
      [contextId, randomBytes(32), randomUUID()],
    );
    await fixture.db.query(
      `INSERT INTO auth_sessions
       (id,user_id,csrf_seed,csrf_key_version,created_at,absolute_expires_at,revoked_at,revocation_reason,context_id,slot_tag)
       VALUES ($1,$2,$3,1,now()-interval '100 days',now()-interval '86 days',
         now()-interval '75 days','LOGOUT',$4,$5)`,
      [sessionId, userId, randomBytes(32), contextId, 'T'.repeat(22)],
    );
    await fixture.db.query(
      'UPDATE auth_contexts SET current_session_id=$2 WHERE id=$1',
      [contextId, sessionId],
    );

    const result = await new RetentionWorker(
      fixture.db,
      fixture.config,
    ).runOnce();
    expect(result.deleted.authSessions).toBe(1);
    const [context] = await fixture.db.query<
      { current_session_id: string | null }[]
    >('SELECT current_session_id FROM auth_contexts WHERE id=$1', [contextId]);
    expect(context?.current_session_id).toBeNull();
  });

  it('serializes context cleanup before a concurrent intent reservation', async () => {
    const userId = randomUUID();
    const contextId = randomUUID();
    const sessionId = randomUUID();
    const intentId = randomUUID();
    await seedUser(userId, 'retention-concurrent@example.test');
    await fixture.db.query(
      `INSERT INTO auth_contexts
       (id,binding_digest,binding_key_version,group_id,state,confirmed_seq,revision,created_at,confirmed_at,last_seen_at)
       VALUES ($1,$2,1,$3,'ACTIVE',nextval('auth_context_confirm_seq'),1,
         now()-interval '40 days',now()-interval '40 days',now())`,
      [contextId, randomBytes(32), randomUUID()],
    );
    await fixture.db.query(
      `INSERT INTO auth_sessions
       (id,user_id,csrf_seed,csrf_key_version,created_at,absolute_expires_at,revoked_at,revocation_reason,context_id,slot_tag)
       VALUES ($1,$2,$3,1,now()-interval '100 days',now()-interval '86 days',
         now()-interval '75 days','LOGOUT',$4,$5)`,
      [sessionId, userId, randomBytes(32), contextId, 'U'.repeat(22)],
    );
    await fixture.db.query(
      'UPDATE auth_contexts SET current_session_id=$2 WHERE id=$1',
      [contextId, sessionId],
    );

    const blocker = fixture.db.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query('SELECT id FROM auth_contexts WHERE id=$1 FOR UPDATE', [
      contextId,
    ]);
    const cleanup = new RetentionWorker(fixture.db, fixture.config).runOnce();
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [activity] = await fixture.db.query<{ count: string }[]>(
        `SELECT count(*) FROM pg_stat_activity
         WHERE wait_event_type='Lock'
           AND query ILIKE '%FROM auth_contexts WHERE id = ANY%'`,
      );
      if (Number(activity?.count) > 0) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const reserve = fixture.db.transaction(async (manager) => {
      await manager.query(
        'SELECT id FROM auth_contexts WHERE id=$1 FOR UPDATE',
        [contextId],
      );
      await manager.query(
        'UPDATE auth_contexts SET revision=revision+1 WHERE id=$1',
        [contextId],
      );
      const [row] = await manager.query<{ revision: number }[]>(
        'SELECT revision FROM auth_contexts WHERE id=$1',
        [contextId],
      );
      await manager.query(
        `INSERT INTO auth_intents
         (id,context_id,kind,revision,state,expires_at,created_at)
         VALUES ($1,$2,'LOCAL_LOGIN',$3,'RESERVED',now()+interval '1 minute',now())`,
        [intentId, contextId, row.revision],
      );
      await manager.query(
        'UPDATE auth_contexts SET current_intent_id=$2 WHERE id=$1',
        [contextId, intentId],
      );
    });
    await blocker.commitTransaction();
    await blocker.release();
    const [cleanupResult] = await Promise.all([cleanup, reserve]);
    expect(waiting).toBe(true);
    expect(cleanupResult.failure).toBe(false);
    const [context] = await fixture.db.query<
      { current_session_id: string | null; current_intent_id: string | null }[]
    >(
      'SELECT current_session_id,current_intent_id FROM auth_contexts WHERE id=$1',
      [contextId],
    );
    expect(context).toEqual({
      current_session_id: null,
      current_intent_id: intentId,
    });
  });

  it('clears terminal OAuth ciphertext before deleting metadata', async () => {
    const oauth = randomUUID();
    await fixture.db.query(
      `INSERT INTO oauth_transactions
       (id,provider,state_hash,browser_binding_hash,nonce_hash,pkce_verifier_ciphertext,encryption_key_version,
        return_target_key,status,created_at,expires_at,consumed_at)
       VALUES ($1,'GOOGLE',$2,$3,$4,$5,1,'default','CONSUMED',now()-interval '2 hours',now()+interval '1 day',now())`,
      [
        oauth,
        randomBytes(32),
        randomBytes(32),
        randomBytes(32),
        randomBytes(64),
      ],
    );
    const metrics = await new RetentionWorker(
      fixture.db,
      fixture.config,
    ).runOnce();
    expect(metrics.ciphertextCleared.oauthTransactions).toBe(1);
    const [row] = await fixture.db.query<
      {
        pkce_verifier_ciphertext: Buffer | null;
        encryption_key_version: number | null;
      }[]
    >(
      'SELECT pkce_verifier_ciphertext,encryption_key_version FROM oauth_transactions WHERE id=$1',
      [oauth],
    );
    expect(row).toEqual({
      pkce_verifier_ciphertext: null,
      encryption_key_version: null,
    });
  });

  it('terminalizes expired challenges and their outbox before deleting an expired onboarding', async () => {
    const onboarding = randomUUID();
    await fixture.db.query(
      `INSERT INTO pending_social_onboardings
       (id,provider,provider_subject,binding_hash,csrf_seed,csrf_key_version,status,expires_at,created_at,updated_at)
       VALUES ($1,'GOOGLE','expired-subject',$2,$3,1,'PENDING_VERIFICATION',now()-interval '40 days',now()-interval '41 days',now()-interval '40 days')`,
      [onboarding, randomBytes(32), randomBytes(32)],
    );
    const challenge = randomUUID();
    const outbox = randomUUID();
    await fixture.db.query(
      `INSERT INTO auth_challenges
       (id,purpose,status,social_onboarding_id,email,token_hash,token_key_version,generation,created_at,expires_at)
       VALUES ($1,'SOCIAL_EMAIL_VERIFICATION','PENDING_DELIVERY',$2,'expired@example.test',$3,1,0,now()-interval '41 days',now()-interval '40 days')`,
      [challenge, onboarding, randomBytes(32)],
    );
    await fixture.db.query(
      `INSERT INTO email_outbox
       (id,challenge_id,template_key,recipient_email,payload_ciphertext,encryption_key_version,status,
        next_attempt_at,lease_owner,lease_expires_at,created_at,updated_at)
       VALUES ($1,$2,'verify','expired@example.test',$3,1,'PROCESSING',now()-interval '40 days',$4,
               now()-interval '40 days',now()-interval '41 days',now()-interval '40 days')`,
      [outbox, challenge, randomBytes(64), randomUUID()],
    );

    const metrics = await new RetentionWorker(
      fixture.db,
      fixture.config,
    ).runOnce();

    expect(metrics.terminalized).toMatchObject({
      emailOutbox: 1,
      authChallenges: 1,
      pendingOnboardings: 1,
    });
    expect(metrics.ciphertextCleared.emailOutbox).toBeGreaterThanOrEqual(1);
    for (const [table, id] of [
      ['email_outbox', outbox],
      ['auth_challenges', challenge],
      ['pending_social_onboardings', onboarding],
    ]) {
      expect(
        await fixture.db.query(`SELECT id FROM ${table} WHERE id=$1`, [id]),
      ).toEqual([]);
    }
  });

  it('expires stale OAuth work and preserves a recently claimed callback', async () => {
    const pending = randomUUID();
    const stale = randomUUID();
    const active = randomUUID();
    for (const [id, status, claimedInterval] of [
      [pending, 'PENDING', null],
      [stale, 'PROCESSING', '2 minutes'],
      [active, 'PROCESSING', '30 seconds'],
    ] as const) {
      await fixture.db.query(
        `INSERT INTO oauth_transactions
         (id,provider,state_hash,browser_binding_hash,nonce_hash,pkce_verifier_ciphertext,encryption_key_version,
          return_target_key,status,created_at,expires_at,claimed_at)
         VALUES ($1,'GOOGLE',$2,$3,$4,$5,1,'default',$6,now()-interval '20 minutes',now()-interval '1 second',
                 CASE WHEN $7::text IS NULL THEN NULL ELSE now()-($7::text)::interval END)`,
        [
          id,
          randomBytes(32),
          randomBytes(32),
          randomBytes(32),
          randomBytes(64),
          status,
          claimedInterval,
        ],
      );
    }

    const metrics = await new RetentionWorker(
      fixture.db,
      fixture.config,
    ).runOnce();
    expect(metrics.terminalized.oauthTransactions).toBe(2);
    expect(metrics.ciphertextCleared.oauthTransactions).toBeGreaterThanOrEqual(
      2,
    );
    const rows = await fixture.db.query<
      {
        id: string;
        status: string;
        pkce_verifier_ciphertext: Buffer | null;
      }[]
    >(
      'SELECT id,status,pkce_verifier_ciphertext FROM oauth_transactions ORDER BY id',
    );
    expect(rows.map(({ id, status }) => ({ id, status }))).toEqual(
      [
        { id: active, status: 'PROCESSING' },
        { id: pending, status: 'EXPIRED' },
        { id: stale, status: 'EXPIRED' },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
    expect(
      Buffer.isBuffer(
        rows.find(({ id }) => id === active)?.pkce_verifier_ciphertext,
      ),
    ).toBe(true);
    expect(
      rows
        .filter(({ id }) => id !== active)
        .every(({ pkce_verifier_ciphertext }) =>
          Object.is(pkce_verifier_ciphertext, null),
        ),
    ).toBe(true);
  });

  it('records sanitized failure metrics, rolls back, and remains retryable', async () => {
    const worker = new RetentionWorker(fixture.db, fixture.config);
    const warnings: string[] = [];
    vi.spyOn(
      (worker as unknown as { logger: { warn: (message: string) => void } })
        .logger,
      'warn',
    ).mockImplementation((message) => warnings.push(message));
    const transaction = vi
      .spyOn(fixture.db, 'transaction')
      .mockRejectedValueOnce(
        new Error('postgresql://user:secret@host/database'),
      );

    await expect(worker.runOnce()).rejects.toThrow();
    const parsed: unknown = JSON.parse(warnings[0]);
    expect(parsed).not.toBeNull();
    expect(typeof parsed).toBe('object');
    const metric = parsed as Record<string, unknown>;
    expect(metric).toMatchObject({ event: 'IAM_RETENTION', failure: true });
    expect(metric.durationMs).toBeGreaterThanOrEqual(0);
    expect(metric.deleted).toEqual({});
    expect(metric.ciphertextCleared).toEqual({});
    expect(JSON.stringify(metric)).not.toContain('secret');

    transaction.mockRestore();
    await expect(worker.runOnce()).resolves.toMatchObject({ failure: false });
  });
});
