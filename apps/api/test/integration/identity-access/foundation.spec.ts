import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { validateIdentityEnvironment } from '../../../src/config/identity-access.environment';
import { identityFixture } from '../../identity-fixture';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { CredentialCrypto } from '../../../src/modules/identity-access/infrastructure/credential-crypto';
import { RateLimitService } from '../../../src/modules/identity-access/infrastructure/rate-limit.service';

describe.sequential('IAM schema foundation', () => {
  let db: DataSource;
  beforeAll(async () => {
    if (!process.env.IAM_TEST_SCHEMA && !process.env.BUILDER_TEST_SCHEMA)
      throw new Error(
        'Use validate:iam or validate:builder with a disposable test schema',
      );
    db = new DataSource(databaseOptions());
    await db.initialize();
    await db.runMigrations();
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('applies all ten IAM tables on the baseline without schema synchronization', async () => {
    const rows = await db.query<{ tablename: string }[]>(
      'SELECT tablename FROM pg_tables WHERE schemaname = current_schema()',
    );
    expect(rows.map((r) => r.tablename).sort()).toEqual(
      [
        'users',
        'external_identities',
        'auth_sessions',
        'refresh_credentials',
        'auth_challenges',
        'oauth_transactions',
        'pending_social_onboardings',
        'auth_rate_limit_buckets',
        'email_outbox',
        'admin_audit_events',
        'foundation_migrations',
        'invitation_templates',
        'template_design_revisions',
        'invitations',
        'assets',
        'asset_storage_writes',
        'template_draft_asset_refs',
        'template_revision_asset_refs',
        'invitation_asset_refs',
        'publication_jobs',
        'publication_job_asset_refs',
      ].sort(),
    );
    expect(db.options.synchronize).toBe(false);
    expect(db.options.migrationsRun).toBe(false);
    expect(await db.runMigrations()).toHaveLength(0);
  });

  it('enforces normalized unique email, one login method and nonnegative credential version', async () => {
    const insert = (
      email: string,
      method = 'LOCAL',
      hash: string | null = 'hash',
      version = '0',
    ) =>
      db.query(
        'INSERT INTO users (id,email,login_method,password_hash,role,status,credential_version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())',
        [randomUUID(), email, method, hash, 'CUSTOMER', 'ACTIVE', version],
      );
    await insert('a.b+tag@example.test');
    await expect(insert('a.b+tag@example.test')).rejects.toMatchObject({
      code: '23505',
    });
    await expect(insert(' UPPER@example.test ')).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      insert('social@example.test', 'GOOGLE', 'hash'),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      insert('negative@example.test', 'LOCAL', 'hash', '-1'),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('reserves provider subjects only while onboarding is pending', async () => {
    const insert = (status: string) =>
      db.query(
        "INSERT INTO pending_social_onboardings (id,provider,provider_subject,binding_hash,csrf_seed,csrf_key_version,status,expires_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,1,$6,now()+interval '30 minutes',now(),now())",
        [
          randomUUID(),
          'GOOGLE',
          'subject',
          randomBytes(32),
          randomBytes(32),
          status,
        ],
      );
    await insert('EXPIRED');
    await insert('CANCELLED');
    await insert('PENDING_EMAIL');
    await expect(insert('PENDING_VERIFICATION')).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('requires reset version snapshots and enforces owner/purpose consistency', async () => {
    const [{ id }] = await db.query<{ id: string }[]>(
      'SELECT id FROM users LIMIT 1',
    );
    const insert = (purpose: string, snapshot: string | null) =>
      db.query(
        "INSERT INTO auth_challenges (id,purpose,status,user_id,email,token_key_version,generation,credential_version_snapshot,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,1,0,$6,now(),now()+interval '30 minutes')",
        [
          randomUUID(),
          purpose,
          'PENDING_DELIVERY',
          id,
          'a.b+tag@example.test',
          snapshot,
        ],
      );
    await expect(insert('PASSWORD_RESET', null)).rejects.toMatchObject({
      code: '23514',
    });
    await expect(insert('LOCAL_EMAIL_VERIFICATION', '0')).rejects.toMatchObject(
      { code: '23514' },
    );
    await expect(
      insert('SOCIAL_EMAIL_VERIFICATION', null),
    ).rejects.toMatchObject({ code: '23514' });
    await insert('PASSWORD_RESET', '0');
    await expect(insert('PASSWORD_RESET', '0')).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('issues isolated sessions, rolls back revocation and preserves access-token residual life', async () => {
    const config = validateIdentityEnvironment(identityFixture());
    const tokens = new AccessTokenService(config);
    const crypto = new CredentialCrypto(config);
    const sessions = new SessionService(config, crypto, tokens);
    const [{ id }] = await db.query<{ id: string }[]>(
      'SELECT id FROM users LIMIT 1',
    );
    await expect(
      db.transaction((manager) => sessions.issue(manager, id)),
    ).rejects.toThrow('SESSION_NOT_ALLOWED');
    await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [
      id,
    ]);
    const first = await db.transaction((manager) =>
      sessions.issue(manager, id),
    );
    const second = await db.transaction((manager) =>
      sessions.issue(manager, id),
    );
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.refreshToken).not.toBe(second.refreshToken);
    const credentials = await db.query<{ token_hash: Buffer }[]>(
      'SELECT token_hash FROM refresh_credentials WHERE session_id = $1',
      [first.sessionId],
    );
    expect(credentials[0].token_hash).toEqual(
      crypto.refreshDigest(first.refreshToken, 1),
    );
    await expect(
      db.transaction(async (manager) => {
        await sessions.revokeAll(manager, id, 'PASSWORD_RESET');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      (
        await db.query<{ count: string }[]>(
          'SELECT count(*) FROM auth_sessions WHERE revoked_at IS NOT NULL',
        )
      )[0].count,
    ).toBe('0');
    await db.transaction((manager) =>
      sessions.revokeAll(manager, id, 'PASSWORD_RESET'),
    );
    expect(
      (
        await db.query<{ count: string }[]>(
          'SELECT count(*) FROM auth_sessions WHERE revoked_at IS NOT NULL',
        )
      )[0].count,
    ).toBe('2');
    expect(tokens.verify(first.accessToken).userId).toBe(id);
  });

  it('atomically limits concurrent requests without storing raw subjects', async () => {
    const limiter = new RateLimitService(
      db,
      validateIdentityEnvironment(identityFixture()),
    );
    const subject = 'rate-limit-subject@example.test';
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        limiter.consume('REGISTER_EMAIL', subject, 1000),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(9);
    const rows = await db.query<{ subject_hash: Buffer; count: number }[]>(
      'SELECT subject_hash,count FROM auth_rate_limit_buckets',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(12);
    expect(rows[0].subject_hash).toHaveLength(32);
    expect(rows[0].subject_hash.includes(Buffer.from(subject))).toBe(false);
    const [{ id }] = await db.query<{ id: string }[]>(
      'SELECT id FROM auth_challenges LIMIT 1',
    );
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => limiter.consumeProof(id, '127.0.0.1')),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(3);
  });

  it('reverts and reapplies IAM without removing the foundation history', async () => {
    // Remove additive feature migrations first, then exercise the original IAM
    // rollback. This still proves IAM reversal rather than just the latest file.
    for (;;) {
      const latest = await db.query<{ name: string }[]>(
        'SELECT name FROM foundation_migrations ORDER BY id DESC LIMIT 1',
      );
      if (latest[0].name === 'IdentityAccess20260926000100') break;
      if (latest[0].name === 'InitialFoundation20260923000000')
        throw new Error('Missing IAM migration');
      await db.undoLastMigration();
    }
    await db.undoLastMigration();
    expect(await db.showMigrations()).toBe(true);
    const rows = await db.query<{ name: string }[]>(
      'SELECT name FROM foundation_migrations',
    );
    expect(rows).toEqual([{ name: 'InitialFoundation20260923000000' }]);
    await db.runMigrations();
    expect(await db.showMigrations()).toBe(false);
  });
});
