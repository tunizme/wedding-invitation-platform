import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CompleteSocialOnboardingService } from '../../../src/modules/identity-access/application/complete-social-onboarding.service';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import {
  RateLimitExceeded,
  RateLimitService,
} from '../../../src/modules/identity-access/infrastructure/rate-limit.service';
import { SocialOnboardingService } from '../../../src/modules/identity-access/oauth/social-onboarding.service';
import { ChallengeService } from '../../../src/modules/identity-access/verification/challenge.service';
import { registrationFixture } from '../../registration-fixture';
import { ProviderIdentityFake } from '../../fixtures/identity-access/provider.fake';

describe.sequential('social onboarding lifecycle and races', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let onboarding: SocialOnboardingService;
  let completion: CompleteSocialOnboardingService;
  beforeAll(async () => {
    fixture = await registrationFixture();
    const sessions = new SessionService(
      fixture.config,
      fixture.crypto,
      new AccessTokenService(fixture.config),
    );
    onboarding = new SocialOnboardingService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      new ChallengeService(fixture.crypto),
    );
    completion = new CompleteSocialOnboardingService(
      fixture.db,
      fixture.crypto,
      sessions,
      onboarding,
    );
  });
  beforeEach(async () => fixture.clear());
  afterAll(async () => fixture.close());

  const identity = (subject = 'subject-a') => ({
    provider: 'FACEBOOK' as const,
    subject,
    email: null,
    emailVerified: false,
    displayName: 'Tên xã hội',
    avatarUrl: 'https://images.example.test/avatar.png',
  });

  async function activate(contextId: string) {
    const [mail] = await fixture.db.query<
      {
        id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      `SELECT o.id,o.payload_ciphertext,o.encryption_key_version
       FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id
       WHERE c.social_onboarding_id=$1 ORDER BY o.created_at DESC LIMIT 1`,
      [contextId],
    );
    const proof = fixture.crypto.decrypt(
      {
        ciphertext: mail.payload_ciphertext,
        keyVersion: mail.encryption_key_version,
      },
      `outbox:${mail.id}`,
    );
    const worker = new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.resolve('accepted') },
      fixture.config.frontendOrigin,
    );
    await worker.runOnce();
    return proof;
  }

  async function deliveries(contextId: string) {
    return fixture.db.query<
      {
        id: string;
        challenge_id: string;
        generation: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      `SELECT o.id,o.challenge_id,c.generation,o.payload_ciphertext,o.encryption_key_version
       FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id
       WHERE c.social_onboarding_id=$1 ORDER BY c.generation`,
      [contextId],
    );
  }

  async function finalizeDelivery(
    delivery: Awaited<ReturnType<typeof deliveries>>[number],
    accepted: boolean,
  ) {
    const proof = fixture.crypto.decrypt(
      {
        ciphertext: delivery.payload_ciphertext,
        keyVersion: delivery.encryption_key_version,
      },
      `outbox:${delivery.id}`,
    );
    await fixture.db.query(
      `UPDATE email_outbox
       SET next_attempt_at=CASE WHEN id=$1 THEN now()-interval '1 second' ELSE now()+interval '1 hour' END
       WHERE status IN ('PENDING','RETRYABLE_FAILURE')`,
      [delivery.id],
    );
    const worker = new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.resolve('unused') },
      fixture.config.frontendOrigin,
    );
    const claim = await worker.claim();
    expect(claim?.id).toBe(delivery.id);
    await expect(
      worker.finalize(
        claim!,
        accepted
          ? { accepted: true, messageId: 'accepted' }
          : { accepted: false, terminal: true },
      ),
    ).resolves.toBe(true);
    return proof;
  }

  it('uses a controlled provider response without a public onboarding bypass', async () => {
    const expected = identity('controlled-provider');
    const provider = new ProviderIdentityFake(
      new Map([['one-time-code', expected]]),
    );
    const verified = await provider.verifyCallback({ code: 'one-time-code' });
    const context = await onboarding.begin(verified);
    expect((await onboarding.resolve(context.binding)).provider_subject).toBe(
      'controlled-provider',
    );
    await expect(
      provider.verifyCallback({ code: 'unrecognized-code' }),
    ).rejects.toThrow('PROVIDER_CALLBACK_REJECTED');
  });

  it('restarts with fresh binding and invalidates the old context before cleanup', async () => {
    const first = await onboarding.begin(identity());
    await fixture.db.query(
      "UPDATE pending_social_onboardings SET expires_at=now()-interval '1 second' WHERE id=$1",
      [first.id],
    );
    const second = await onboarding.begin(identity());
    expect(second.id).not.toBe(first.id);
    expect(second.binding).not.toBe(first.binding);
    await expect(onboarding.resolve(first.binding)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const rows = await fixture.db.query<{ id: string; status: string }[]>(
      'SELECT id,status FROM pending_social_onboardings ORDER BY created_at',
    );
    expect(rows).toEqual([
      { id: first.id, status: 'EXPIRED' },
      { id: second.id, status: 'PENDING_EMAIL' },
    ]);
  });

  it('allows one concurrent restart winner without replacing that winner', async () => {
    const first = await onboarding.begin(identity('restart-race'));
    const results = await Promise.allSettled([
      onboarding.begin(identity('restart-race'), first.id),
      onboarding.begin(identity('restart-race'), first.id),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(onboarding.resolve(first.binding)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(
      await fixture.db.query(
        "SELECT id FROM pending_social_onboardings WHERE provider_subject='restart-race' AND status IN ('PENDING_EMAIL','PENDING_VERIFICATION')",
      ),
    ).toHaveLength(1);
  });

  it('keeps failed delivery and email conflicts from creating partial accounts', async () => {
    const context = await onboarding.begin(identity('conflict'));
    await onboarding.submitEmail(context.binding, 'used@example.test');
    await fixture.db.query(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),'used@example.test',$1,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
      [await fixture.crypto.hashPassword('Existing Password')],
    );
    const proof = await activate(context.id);
    await expect(
      completion.complete(context.binding, proof),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await fixture.db.query('SELECT id FROM external_identities'),
    ).toHaveLength(0);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('keeps a terminal mail failure pending without any partial Customer', async () => {
    const context = await onboarding.begin(identity('mail-failure'));
    await onboarding.submitEmail(context.binding, 'mail-failure@example.test');
    const worker = new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.reject(new Error('controlled failure')) },
      fixture.config.frontendOrigin,
    );
    const claim = await worker.claim();
    expect(claim).toBeDefined();
    await worker.finalize(claim!, { accepted: false, terminal: true });
    const [challenge] = await fixture.db.query<{ status: string }[]>(
      'SELECT status FROM auth_challenges WHERE social_onboarding_id=$1',
      [context.id],
    );
    expect(challenge.status).toBe('DELIVERY_FAILED');
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('keeps the previous active proof when a same-email resend fails', async () => {
    const context = await onboarding.begin(identity('failed-resend'));
    await onboarding.submitEmail(context.binding, 'resend@example.test');
    const previousProof = await activate(context.id);

    await onboarding.resend(context.binding);
    const rows = await deliveries(context.id);
    expect(rows).toHaveLength(2);
    const [before] = await fixture.db.query<{ status: string }[]>(
      'SELECT status FROM auth_challenges WHERE id=$1',
      [rows[0].challenge_id],
    );
    expect(before.status).toBe('ACTIVE');

    await finalizeDelivery(rows[1], false);
    const statuses = await fixture.db.query<
      { generation: string; status: string }[]
    >(
      'SELECT generation,status FROM auth_challenges WHERE social_onboarding_id=$1 ORDER BY generation',
      [context.id],
    );
    expect(statuses).toEqual([
      { generation: '0', status: 'ACTIVE' },
      { generation: '1', status: 'DELIVERY_FAILED' },
    ]);
    await expect(
      completion.complete(context.binding, previousProof),
    ).resolves.toHaveProperty('user.email', 'resend@example.test');
  });

  it('replaces the previous proof only after a same-email resend is delivered', async () => {
    const context = await onboarding.begin(identity('successful-resend'));
    await onboarding.submitEmail(context.binding, 'replace@example.test');
    await activate(context.id);

    await onboarding.resend(context.binding);
    const rows = await deliveries(context.id);
    const before = await fixture.db.query<
      { generation: string; status: string }[]
    >(
      'SELECT generation,status FROM auth_challenges WHERE social_onboarding_id=$1 ORDER BY generation',
      [context.id],
    );
    expect(before).toEqual([
      { generation: '0', status: 'ACTIVE' },
      { generation: '1', status: 'PENDING_DELIVERY' },
    ]);

    const replacementProof = await finalizeDelivery(rows[1], true);
    const after = await fixture.db.query<
      { generation: string; status: string }[]
    >(
      'SELECT generation,status FROM auth_challenges WHERE social_onboarding_id=$1 ORDER BY generation',
      [context.id],
    );
    expect(after).toEqual([
      { generation: '0', status: 'REVOKED' },
      { generation: '1', status: 'ACTIVE' },
    ]);
    await expect(
      completion.complete(context.binding, replacementProof),
    ).resolves.toHaveProperty('user.email', 'replace@example.test');
  });

  it('does not let a stale resend delivery replace a newer active proof', async () => {
    const context = await onboarding.begin(identity('stale-resend'));
    await onboarding.submitEmail(context.binding, 'stale@example.test');
    await onboarding.resend(context.binding);
    const rows = await deliveries(context.id);
    expect(rows).toHaveLength(2);

    const newestProof = await finalizeDelivery(rows[1], true);
    await finalizeDelivery(rows[0], true);
    const statuses = await fixture.db.query<
      { generation: string; status: string }[]
    >(
      'SELECT generation,status FROM auth_challenges WHERE social_onboarding_id=$1 ORDER BY generation',
      [context.id],
    );
    expect(statuses).toEqual([
      { generation: '0', status: 'REVOKED' },
      { generation: '1', status: 'ACTIVE' },
    ]);
    await expect(
      completion.complete(context.binding, newestProof),
    ).resolves.toHaveProperty('user.email', 'stale@example.test');
  });

  it('rolls back completion when the provider identity becomes owned', async () => {
    const context = await onboarding.begin(identity('identity-conflict'));
    await onboarding.submitEmail(context.binding, 'candidate@example.test');
    const proof = await activate(context.id);
    const [{ id: ownerId }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),'owner@example.test',NULL,'FACEBOOK','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
    );
    await fixture.db.query(
      `INSERT INTO external_identities
       (id,user_id,provider,provider_subject,created_at)
       VALUES (gen_random_uuid(),$1,'FACEBOOK','identity-conflict',now())`,
      [ownerId],
    );
    await expect(
      completion.complete(context.binding, proof),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('serializes restart against completion without reviving the old context', async () => {
    const providerIdentity = identity('restart-completion');
    const context = await onboarding.begin(providerIdentity);
    await onboarding.submitEmail(context.binding, 'winner@example.test');
    const proof = await activate(context.id);
    const results = await Promise.allSettled([
      completion.complete(context.binding, proof),
      onboarding.begin(providerIdentity, context.id),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const active = await fixture.db.query<{ id: string }[]>(
      `SELECT id FROM pending_social_onboardings
       WHERE provider_subject='restart-completion'
         AND status IN ('PENDING_EMAIL','PENDING_VERIFICATION')`,
    );
    const users = await fixture.db.query<{ id: string }[]>(
      'SELECT id FROM users',
    );
    expect(active.length + users.length).toBe(1);
    await expect(completion.complete(context.binding, proof)).rejects.toThrow();
  });

  it('creates user, identity and session atomically and rejects old proof/binding', async () => {
    const context = await onboarding.begin(identity('complete'));
    await onboarding.submitEmail(context.binding, 'complete@example.test');
    const proof = await activate(context.id);
    const result = await completion.complete(context.binding, proof);
    expect(result.user.loginMethod).toBe('FACEBOOK');
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
    expect(
      await fixture.db.query('SELECT id FROM external_identities'),
    ).toHaveLength(1);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      1,
    );
    await expect(completion.complete(context.binding, proof)).rejects.toThrow();
    await expect(onboarding.resolve(context.binding)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('persists social proof attempts and rejects the sixth known attempt without partial access', async () => {
    const context = await onboarding.begin(identity('proof-attempt-limit'));
    await onboarding.submitEmail(
      context.binding,
      'proof-attempt-limit@example.test',
    );
    const proof = await activate(context.id);
    const challenges = new ChallengeService(fixture.crypto);
    const limiter = new RateLimitService(fixture.db, fixture.config);
    const challenge = await challenges.identify(fixture.db.manager, proof);
    expect(challenge).toBeDefined();
    for (let attempt = 0; attempt < 5; attempt += 1)
      await expect(
        limiter.consumeProof(challenge.id, 'integration-client'),
      ).resolves.toBeUndefined();
    await expect(
      limiter.consumeProof(challenge.id, 'integration-client'),
    ).rejects.toBeInstanceOf(RateLimitExceeded);
    const [persisted] = await fixture.db.query<{ attempt_count: number }[]>(
      'SELECT attempt_count FROM auth_challenges WHERE id=$1',
      [challenge.id],
    );
    expect(persisted.attempt_count).toBe(5);
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });
});
