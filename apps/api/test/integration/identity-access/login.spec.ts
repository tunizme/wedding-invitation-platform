import type { Server } from 'node:http';
import * as argon2 from 'argon2';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { CredentialCrypto } from '../../../src/modules/identity-access/infrastructure/credential-crypto';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { PasswordResetService } from '../../../src/modules/identity-access/verification/password-reset.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('LOCAL login transactions and races', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  const password = '  Exact Password 🔒  ';
  const accessToken = (response: request.Response) =>
    (response.body as { accessToken: string }).accessToken;

  beforeAll(async () => {
    fixture = await registrationFixture();
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(databaseOptions()), IdentityAccessModule],
    })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(fixture.config)
      .overrideProvider(EmailOutboxWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });
  beforeEach(async () => fixture.clear());
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (fixture) await fixture.close();
    }
  });

  const login = (email: string, supplied = password) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email, password: supplied });

  async function seed(
    email = 'owner@example.test',
    options: { verified?: boolean; status?: string; hash?: string } = {},
  ) {
    const hash = options.hash ?? (await fixture.crypto.hashPassword(password));
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,credential_version,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER',$3,$4,7,now(),now()) RETURNING id`,
      [
        email,
        hash,
        options.status ?? 'ACTIVE',
        options.verified === false ? null : new Date(),
      ],
    );
    return id;
  }

  it('performs a real dummy password verification for an unknown account', async () => {
    const verify = vi.spyOn(CredentialCrypto.prototype, 'verifyPassword');
    await login('missing@example.test').expect(401);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][0]).toMatch(/^\$argon2id\$/);
    expect(verify.mock.calls[0][1]).toBe(password);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
    verify.mockRestore();
  });

  it('creates isolated session families for repeated successful logins', async () => {
    const userId = await seed();
    const first = await login(' OWNER@example.test ').expect(200);
    const second = await login('owner@example.test').expect(200);
    const tokens = app.get(AccessTokenService);
    const firstPrincipal = tokens.verify(accessToken(first));
    const secondPrincipal = tokens.verify(accessToken(second));
    expect(firstPrincipal.userId).toBe(userId);
    expect(secondPrincipal.userId).toBe(userId);
    expect(firstPrincipal.sessionId).not.toBe(secondPrincipal.sessionId);
    expect(first.headers['set-cookie']).not.toEqual(
      second.headers['set-cookie'],
    );
    const sessions = await fixture.db.query<
      {
        id: string;
        absolute_lifetime: number;
        revoked_at: Date | null;
      }[]
    >(
      `SELECT id,extract(epoch FROM (absolute_expires_at-created_at))::int AS absolute_lifetime,revoked_at
       FROM auth_sessions ORDER BY id`,
    );
    expect(sessions).toHaveLength(2);
    for (const session of sessions) {
      expect(session.absolute_lifetime).toBe(14 * 86400);
      expect(session.revoked_at).toBeNull();
    }
    expect(
      await fixture.db.query('SELECT id FROM refresh_credentials'),
    ).toHaveLength(2);
  });

  it('does not create sessions for wrong password, unverified or LOCKED users', async () => {
    await seed('wrong@example.test');
    await seed('unverified@example.test', { verified: false });
    await seed('locked@example.test', { status: 'LOCKED' });
    await login('wrong@example.test', 'wrong password').expect(401);
    await login('unverified@example.test').expect(403);
    await login('locked@example.test').expect(401);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('upgrades an old Argon2 hash after authentication without changing credential_version', async () => {
    const oldHash = await argon2.hash(password, {
      type: argon2.argon2id,
      version: 0x13,
      memoryCost: 8192,
      timeCost: 1,
      parallelism: 1,
      hashLength: 32,
    });
    const id = await seed('rehash@example.test', { hash: oldHash });
    await login('rehash@example.test').expect(200);
    const [user] = await fixture.db.query<
      {
        password_hash: string;
        credential_version: string;
      }[]
    >('SELECT password_hash,credential_version FROM users WHERE id=$1', [id]);
    expect(user.password_hash).not.toBe(oldHash);
    expect(
      argon2.needsRehash(user.password_hash, {
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      }),
    ).toBe(false);
    expect(user.credential_version).toBe('7');
  });

  it('rechecks the hash after waiting behind a password reset writer', async () => {
    const id = await seed();
    const replacement = 'Replacement Password 🔑';
    const replacementHash = await fixture.crypto.hashPassword(replacement);
    const runner = fixture.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
      const pending = login('owner@example.test').then((response) => response);
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline) {
        const [state] = await fixture.db.query<{ blocked: boolean }[]>(
          `SELECT EXISTS(
             SELECT 1 FROM pg_stat_activity
             WHERE cardinality(pg_blocking_pids(pid)) > 0
               AND query LIKE '%FROM users%FOR UPDATE%'
           ) AS blocked`,
        );
        if (state.blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await runner.query(
        `UPDATE users SET password_hash=$2,credential_version=credential_version+1,
         credentials_updated_at=now(),updated_at=now() WHERE id=$1`,
        [id, replacementHash],
      );
      await runner.commitTransaction();
      expect((await pending).status).toBe(401);
      expect(
        await fixture.db.query('SELECT id FROM auth_sessions'),
      ).toHaveLength(0);
      await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
      await login('owner@example.test', replacement).expect(200);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('revokes a newly logged-in session when password reset wins afterward', async () => {
    await seed();
    const loggedIn = await login('owner@example.test').expect(200);
    const sid = app
      .get(AccessTokenService)
      .verify(accessToken(loggedIn)).sessionId;
    const resets = app.get(PasswordResetService);
    await resets.request('owner@example.test');
    const [mail] = await fixture.db.query<
      {
        id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      `SELECT id,payload_ciphertext,encryption_key_version
       FROM email_outbox ORDER BY created_at DESC LIMIT 1`,
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
      { send: () => Promise.resolve('reset-accepted') },
      fixture.config.frontendOrigin,
    );
    await worker.runOnce();
    await resets.confirm(proof, 'Reset winner password');
    const [session] = await fixture.db.query<
      {
        revoked_at: Date | null;
        revocation_reason: string | null;
      }[]
    >('SELECT revoked_at,revocation_reason FROM auth_sessions WHERE id=$1', [
      sid,
    ]);
    expect(session.revoked_at).not.toBeNull();
    expect(session.revocation_reason).toBe('PASSWORD_RESET');
    await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
    await login('owner@example.test').expect(401);
    await login('owner@example.test', 'Reset winner password').expect(200);
  });
});
