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
