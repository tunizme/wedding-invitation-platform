import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registrationFixture } from '../../registration-fixture';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import {
  lockUsers,
  lockSessions,
} from '../../../src/modules/identity-access/infrastructure/transactions';

// Password-change HTTP belongs to T086. Its credential mutation is controlled SQL here,
// using the canonical User -> Sessions -> Challenges lock order, never a public bypass.
describe.sequential('US2 reset credential-version races and rollback', () => {
  let f: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  let id: string;
  const original = 'Original password 🔒';
  const replacement = 'Replacement password 🔐';
  beforeAll(async () => {
    f = await registrationFixture();
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(databaseOptions()), IdentityAccessModule],
    })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(f.config)
      .overrideProvider(EmailOutboxWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });
  const worker = () =>
    new EmailOutboxWorker(
      f.db,
      f.crypto,
      { send: () => Promise.resolve('accepted') },
      f.config.frontendOrigin,
    );
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1/auth/${path}`)
      .set('Origin', 'http://localhost:3000')
      .send(body);
  const confirm = (proof: string) =>
    post('password-resets/confirm', { proof, newPassword: replacement });
  beforeEach(async () => {
    await f.clear();
    await f.register.register('race@example.test', original);
    await worker().runOnce();
    const [user] = await f.db.query<{ id: string }[]>('SELECT id FROM users');
    id = user.id;
    await f.db.query(
      'UPDATE users SET email_verified_at=now(),credential_version=9007199254740993 WHERE id=$1',
      [id],
    );
    const sessions = new SessionService(
      f.config,
      f.crypto,
      new AccessTokenService(f.config),
    );
    await f.db.transaction((m) => sessions.issue(m, id));
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (f) await f.close();
    }
  });
  async function issue() {
    await post('password-resets', { email: 'race@example.test' }).expect(202);
    const [row] = await f.db.query<
      {
        id: string;
        outbox_id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
        credential_version_snapshot: string;
      }[]
    >(
      `SELECT c.id,c.credential_version_snapshot,o.id AS outbox_id,o.payload_ciphertext,o.encryption_key_version
       FROM auth_challenges c JOIN email_outbox o ON o.challenge_id=c.id WHERE c.purpose='PASSWORD_RESET' ORDER BY c.generation DESC LIMIT 1`,
    );
    expect(row.credential_version_snapshot).toBe('9007199254740993');
    return {
      id: row.id,
      proof: f.crypto.decrypt(
        {
          ciphertext: row.payload_ciphertext,
          keyVersion: row.encryption_key_version,
        },
        `outbox:${row.outbox_id}`,
      ),
    };
  }
  async function snapshot() {
    return {
      users: await f.db.query<Record<string, unknown>[]>(
        'SELECT password_hash,credential_version,status FROM users',
      ),
      sessions: await f.db.query<Record<string, unknown>[]>(
        'SELECT id,revoked_at,revocation_reason FROM auth_sessions ORDER BY id',
      ),
      challenges: await f.db.query<Record<string, unknown>[]>(
        'SELECT id,status,consumed_at,revoked_at FROM auth_challenges ORDER BY id',
      ),
    };
  }
  it('allows one winner among different proofs of the same bigint credential version', async () => {
    const first = await issue();
    await worker().runOnce();
    const second = await issue();
    await worker().runOnce();
    // Two independently active proofs with the same version exercise the completion guard.
    await f.db.query(
      "UPDATE auth_challenges SET status='ACTIVE',revoked_at=NULL WHERE id=$1",
      [first.id],
    );
    const results = await Promise.all([
      confirm(first.proof),
      confirm(second.proof),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
    const [user] = await f.db.query<
      { credential_version: string; password_hash: string }[]
    >('SELECT credential_version,password_hash FROM users');
    expect(user.credential_version).toBe('9007199254740994');
    expect(await f.crypto.verifyPassword(user.password_hash, replacement)).toBe(
      true,
    );
    expect(
      await f.db.query(
        "SELECT id FROM auth_challenges WHERE purpose='PASSWORD_RESET' AND status='CONSUMED'",
      ),
    ).toHaveLength(1);
    expect(
      await f.db.query('SELECT id FROM auth_sessions WHERE revoked_at IS NULL'),
    ).toHaveLength(0);
  });
  it('rechecks snapshot after waiting behind a password-change transaction', async () => {
    const issued = await issue();
    await worker().runOnce();
    const hash = await f.crypto.hashPassword('Changed password 🔑');
    const runner = f.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await lockUsers(runner.manager, [id]);
      await lockSessions(runner.manager, id);
      const [{ pid }] = await runner.manager.query<{ pid: number }[]>(
        'SELECT pg_backend_pid() AS pid',
      );
      const response = confirm(issued.proof).then((r) => r);
      // Observe the actual PostgreSQL wait, rather than relying on request scheduling.
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline) {
        const [row] = await f.db.query<{ blocked: boolean }[]>(
          'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',
          [pid],
        );
        if (row.blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await runner.query(
        'SELECT id FROM auth_challenges WHERE user_id=$1 ORDER BY id FOR UPDATE',
        [id],
      );
      await runner.query(
        'UPDATE users SET password_hash=$2,credential_version=credential_version+1,credentials_updated_at=now() WHERE id=$1',
        [id, hash],
      );
      await runner.commitTransaction();
      expect((await response).status).toBe(400);
      const [user] = await f.db.query<{ password_hash: string }[]>(
        'SELECT password_hash FROM users',
      );
      expect(user.password_hash).toBe(hash);
      expect(
        await f.db.query(
          "SELECT id FROM auth_challenges WHERE id=$1 AND status='CONSUMED'",
          [issued.id],
        ),
      ).toHaveLength(0);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
  it('never activates a delayed reset email after the credential version changes', async () => {
    const issued = await issue();
    const w = worker();
    const claim = await w.claim();
    expect(claim?.challenge_id).toBe(issued.id);
    await f.db.query(
      'UPDATE users SET credential_version=credential_version+1 WHERE id=$1',
      [id],
    );
    await w.finalize(claim!, { accepted: true, messageId: 'late' });
    expect(
      await f.db.query(
        "SELECT id FROM auth_challenges WHERE id=$1 AND status='REVOKED'",
        [issued.id],
      ),
    ).toHaveLength(1);
    await confirm(issued.proof).expect(400);
  });
  it('rolls back hash/version, proof consumption, sibling invalidation and session revocation together', async () => {
    const issued = await issue();
    await worker().runOnce();
    await issue(); // pending sibling must survive rollback as well
    const before = await snapshot();
    await f.db.query(
      "ALTER TABLE auth_sessions ADD CONSTRAINT test_reset_rollback CHECK (revocation_reason IS DISTINCT FROM 'PASSWORD_RESET')",
    );
    try {
      await confirm(issued.proof).expect(500);
    } finally {
      await f.db.query(
        'ALTER TABLE auth_sessions DROP CONSTRAINT test_reset_rollback',
      );
    }
    expect(await snapshot()).toEqual(before);
    await confirm(issued.proof).expect(204);
  });
  it('resets a locked verified LOCAL account without unlocking or creating a session', async () => {
    await f.db.query("UPDATE users SET status='LOCKED' WHERE id=$1", [id]);
    const issued = await issue();
    await worker().runOnce();
    const response = await confirm(issued.proof).expect(204);
    expect(response.headers['set-cookie']).toBeUndefined();
    const [user] = await f.db.query<{ status: string }[]>(
      'SELECT status FROM users',
    );
    expect(user.status).toBe('LOCKED');
    expect(
      await f.db.query('SELECT id FROM auth_sessions WHERE revoked_at IS NULL'),
    ).toHaveLength(0);
  });
  it('keeps a proof valid across an opportunistic hash-only rehash', async () => {
    const issued = await issue();
    await worker().runOnce();
    const rehash = await f.crypto.hashPassword(original);
    await f.db.transaction(async (m) => {
      await lockUsers(m, [id]);
      await m.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        id,
        rehash,
      ]);
    });
    await confirm(issued.proof).expect(204);
    const [user] = await f.db.query<{ credential_version: string }[]>(
      'SELECT credential_version FROM users',
    );
    expect(user.credential_version).toBe('9007199254740994');
  });
});
