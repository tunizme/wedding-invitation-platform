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

const flows = [
  { path: '/auth/email-verifications', purpose: 'LOCAL_EMAIL_VERIFICATION' },
  { path: '/auth/password-resets', purpose: 'PASSWORD_RESET' },
] as const;
const oldPassword = '  Original password 🔒  ';
const newPassword = '  Replacement password 🔐  ';

describe.sequential(
  'US2 proof lifecycle and password recovery (PostgreSQL)',
  () => {
    let f: Awaited<ReturnType<typeof registrationFixture>>;
    let app: INestApplication<Server>;
    let sessions: SessionService;
    beforeAll(async () => {
      f = await registrationFixture();
      const module = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot(databaseOptions()),
          IdentityAccessModule,
        ],
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
      sessions = new SessionService(
        f.config,
        f.crypto,
        new AccessTokenService(f.config),
      );
    });
    beforeEach(async () => f.clear());
    afterAll(async () => {
      try {
        if (app) await app.close();
      } finally {
        if (f) await f.close();
      }
    });
    const post = (path: string, body: object) =>
      request(app.getHttpServer())
        .post(`/api/v1${path}`)
        .set('Origin', 'http://localhost:3000')
        .send(body);
    const worker = () =>
      new EmailOutboxWorker(
        f.db,
        f.crypto,
        {
          send: () => Promise.resolve('test-accepted'),
        },
        f.config.frontendOrigin,
      );
    async function user(verified: boolean, email = 'owner@example.test') {
      await f.register.register(email, oldPassword);
      const [row] = await f.db.query<{ id: string }[]>(
        'SELECT id FROM users WHERE email=$1',
        [email],
      );
      // Deliver the registration message so reset tests do not claim that outbox row.
      await worker().runOnce();
      if (verified)
        await f.db.query(
          'UPDATE users SET email_verified_at=now() WHERE id=$1',
          [row.id],
        );
      return row.id;
    }
    async function latest(purpose: string) {
      const [row] = await f.db.query<
        {
          id: string;
          status: string;
          payload_ciphertext: Buffer;
          encryption_key_version: number;
          outbox_id: string;
          token_hash: Buffer;
          ttl: number;
        }[]
      >(
        `SELECT c.id,c.status,c.token_hash,extract(epoch FROM (c.expires_at-c.created_at))::int AS ttl,
       o.id AS outbox_id,o.payload_ciphertext,o.encryption_key_version
       FROM auth_challenges c JOIN email_outbox o ON o.challenge_id=c.id
       WHERE c.purpose=$1 ORDER BY c.generation DESC LIMIT 1`,
        [purpose],
      );
      expect(row).toBeDefined();
      expect(row.status).toBe('PENDING_DELIVERY');
      const proof = f.crypto.decrypt(
        {
          ciphertext: row.payload_ciphertext,
          keyVersion: row.encryption_key_version,
        },
        `outbox:${row.outbox_id}`,
      );
      expect(row.token_hash.equals(f.crypto.proofDigest(proof))).toBe(true);
      return { ...row, proof };
    }
    async function states() {
      return f.db.query<{ id: string; status: string }[]>(
        'SELECT id,status FROM auth_challenges ORDER BY id',
      );
    }
    async function account(id: string) {
      const [row] = await f.db.query<
        {
          password_hash: string;
          email_verified_at: Date | null;
          credential_version: string;
          status: string;
        }[]
      >(
        'SELECT password_hash,email_verified_at,credential_version,status FROM users WHERE id=$1',
        [id],
      );
      return row;
    }

    for (const flow of flows) {
      const reset = flow.purpose === 'PASSWORD_RESET';
      const confirm = (proof: string) =>
        post(
          `${flow.path}/confirm`,
          reset ? { proof, newPassword } : { proof },
        );
      async function issue() {
        await post(flow.path, { email: 'owner@example.test' }).expect(202);
        return latest(flow.purpose);
      }
      describe(flow.purpose, () => {
        it('enqueues an encrypted purpose-bound proof with the specified TTL and activates only after delivery', async () => {
          await user(reset);
          const issued = await issue();
          expect(issued.ttl).toBe(reset ? 1800 : 86400);
          await confirm(issued.proof).expect(400);
          await worker().runOnce();
          const [delivered] = await f.db.query<
            { status: string; payload_ciphertext: Buffer | null }[]
          >(
            'SELECT c.status,o.payload_ciphertext FROM auth_challenges c JOIN email_outbox o ON o.challenge_id=c.id WHERE c.id=$1',
            [issued.id],
          );
          expect(delivered).toEqual({
            status: 'ACTIVE',
            payload_ciphertext: null,
          });
          await confirm(issued.proof).expect(204);
        });
        it('consumes once and rejects replay without a second state change', async () => {
          const id = await user(reset);
          const issued = await issue();
          await worker().runOnce();
          const response = await confirm(issued.proof).expect(204);
          expect(response.headers['set-cookie']).toBeUndefined();
          const snapshot = await account(id);
          expect(snapshot.email_verified_at).not.toBeNull();
          expect(
            await f.crypto.verifyPassword(
              snapshot.password_hash,
              reset ? newPassword : oldPassword,
            ),
          ).toBe(true);
          expect((await states()).find((c) => c.id === issued.id)?.status).toBe(
            'CONSUMED',
          );
          await confirm(issued.proof).expect(400);
          expect(await account(id)).toEqual(snapshot);
          expect(await f.db.query('SELECT id FROM auth_sessions')).toHaveLength(
            0,
          );
        });
        it('allows exactly one winner for concurrent consumption of the same proof', async () => {
          const id = await user(reset);
          const issued = await issue();
          await worker().runOnce();
          const results = await Promise.all([
            confirm(issued.proof),
            confirm(issued.proof),
          ]);
          expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
          expect((await states()).find((c) => c.id === issued.id)?.status).toBe(
            'CONSUMED',
          );
          expect((await account(id)).credential_version).toBe(
            reset ? '1' : '0',
          );
        });
        it('rejects expired proofs without changing credentials or verification', async () => {
          const id = await user(reset);
          const issued = await issue();
          await worker().runOnce();
          await f.db.query(
            "UPDATE auth_challenges SET created_at=now()-interval '2 days',expires_at=now()-interval '1 second' WHERE id=$1",
            [issued.id],
          );
          const before = await account(id);
          await confirm(issued.proof).expect(400);
          expect(await account(id)).toEqual(before);
          expect(
            (await states()).find((c) => c.id === issued.id)?.status,
          ).not.toBe('CONSUMED');
        });
        it('rejects a proof at the other purpose endpoint without consuming it', async () => {
          const id = await user(reset);
          const issued = await issue();
          await worker().runOnce();
          const before = await account(id);
          const wrongPath = reset
            ? '/auth/email-verifications/confirm'
            : '/auth/password-resets/confirm';
          await post(
            wrongPath,
            reset
              ? { proof: issued.proof }
              : { proof: issued.proof, newPassword },
          ).expect(400);
          expect(await account(id)).toEqual(before);
          expect((await states()).find((c) => c.id === issued.id)?.status).toBe(
            'ACTIVE',
          );
          await confirm(issued.proof).expect(204);
        });
        it('keeps an older active proof usable when resend delivery fails', async () => {
          await user(reset);
          const first = await issue();
          const w = worker();
          await w.runOnce();
          const resend = await issue();
          const claimed = await w.claim();
          expect(claimed?.challenge_id).toBe(resend.id);
          await w.finalize(claimed!, { accepted: false, terminal: true });
          expect((await states()).find((c) => c.id === first.id)?.status).toBe(
            'ACTIVE',
          );
          expect((await states()).find((c) => c.id === resend.id)?.status).toBe(
            'DELIVERY_FAILED',
          );
          await confirm(first.proof).expect(204);
        });
        it('prevents stale delivery from revoking a newer active proof', async () => {
          await user(reset);
          const older = await issue();
          const w = worker();
          const oldClaim = await w.claim();
          const newer = await issue();
          const newClaim = await w.claim();
          expect(oldClaim?.challenge_id).toBe(older.id);
          expect(newClaim?.challenge_id).toBe(newer.id);
          await w.finalize(newClaim!, { accepted: true, messageId: 'new' });
          await w.finalize(oldClaim!, { accepted: true, messageId: 'old' });
          expect((await states()).find((c) => c.id === older.id)?.status).toBe(
            'REVOKED',
          );
          expect((await states()).find((c) => c.id === newer.id)?.status).toBe(
            'ACTIVE',
          );
          await confirm(older.proof).expect(400);
          await confirm(newer.proof).expect(204);
        });
        it('revokes pending siblings on completion and does not resurrect them after delayed acceptance', async () => {
          await user(reset);
          const first = await issue();
          const w = worker();
          await w.runOnce();
          const pending = await issue();
          const delayed = await w.claim();
          expect(delayed?.challenge_id).toBe(pending.id);
          await confirm(first.proof).expect(204);
          expect(
            (await states()).find((c) => c.id === pending.id)?.status,
          ).toBe('REVOKED');
          await w.finalize(delayed!, { accepted: true, messageId: 'late' });
          expect(
            (await states()).find((c) => c.id === pending.id)?.status,
          ).toBe('REVOKED');
          await confirm(pending.proof).expect(400);
        });
      });
    }

    it('resets the exact password and revokes every owner session while preserving another user session', async () => {
      const id = await user(true);
      const other = await user(true, 'other@example.test');
      await f.db.transaction(async (manager) => {
        await sessions.issue(manager, id);
        await sessions.issue(manager, id);
        await sessions.issue(manager, other);
      });
      await post('/auth/password-resets', {
        email: 'owner@example.test',
      }).expect(202);
      const issued = await latest('PASSWORD_RESET');
      await worker().runOnce();
      const response = await post('/auth/password-resets/confirm', {
        proof: issued.proof,
        newPassword,
      }).expect(204);
      expect(response.text).toBe('');
      expect(response.headers['set-cookie']).toBeUndefined();
      const updated = await account(id);
      expect(
        await f.crypto.verifyPassword(updated.password_hash, newPassword),
      ).toBe(true);
      expect(
        await f.crypto.verifyPassword(updated.password_hash, oldPassword),
      ).toBe(false);
      expect(
        await f.crypto.verifyPassword(
          updated.password_hash,
          newPassword.trim(),
        ),
      ).toBe(false);
      const rows = await f.db.query<
        {
          user_id: string;
          revoked_at: Date | null;
          revocation_reason: string | null;
        }[]
      >('SELECT user_id,revoked_at,revocation_reason FROM auth_sessions');
      expect(rows).toHaveLength(3);
      const owned = rows.filter((r) => r.user_id === id);
      expect(owned).toHaveLength(2);
      for (const row of owned) {
        expect(row.revoked_at).not.toBeNull();
        expect(row.revocation_reason).toBe('PASSWORD_RESET');
      }
      expect(rows.find((r) => r.user_id === other)).toMatchObject({
        revoked_at: null,
        revocation_reason: null,
      });
    });

    it('does not create reset challenges for missing, unverified or social accounts', async () => {
      await user(false);
      for (const method of ['GOOGLE', 'FACEBOOK']) {
        await user(true, `${method.toLowerCase()}@example.test`);
        await f.db.query(
          'UPDATE users SET login_method=$1,password_hash=NULL WHERE email=$2',
          [method, `${method.toLowerCase()}@example.test`],
        );
      }
      for (const email of ['missing', 'owner', 'google', 'facebook'])
        await post('/auth/password-resets', {
          email: `${email}@example.test`,
        }).expect(202);
      expect(
        await f.db.query(
          "SELECT id FROM auth_challenges WHERE purpose='PASSWORD_RESET'",
        ),
      ).toHaveLength(0);
      expect(
        await f.db.query(
          "SELECT o.id FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id WHERE c.purpose='PASSWORD_RESET'",
        ),
      ).toHaveLength(0);
    });
  },
);
