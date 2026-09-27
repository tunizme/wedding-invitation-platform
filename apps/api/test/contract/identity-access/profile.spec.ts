import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

const { validateSchema } = createRequire(__filename)(
  '../../../scripts/validate-iam-contract.cjs',
) as { validateSchema: (name: string, value: unknown) => boolean };

describe.sequential('profile HTTP contract', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  const currentPassword = 'Current password 🔐';

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

  async function seed(method: 'LOCAL' | 'GOOGLE' = 'LOCAL') {
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,display_name,phone_number,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,'CUSTOMER','ACTIVE',now(),'Before','0900',now(),now()) RETURNING id`,
      [
        `${method.toLowerCase()}@example.test`,
        method === 'LOCAL'
          ? await fixture.crypto.hashPassword(currentPassword)
          : null,
        method,
      ],
    );
    const session = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, id),
    );
    return { id, ...session };
  }
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('returns only the closed safe profile and requires authentication', async () => {
    const local = await seed();
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set(bearer(local.accessToken))
      .expect(200);
    expect(validateSchema('UserProfile', response.body)).toBe(true);
    expect(response.body).toEqual({
      id: local.id,
      email: 'local@example.test',
      emailVerified: true,
      loginMethod: 'LOCAL',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      displayName: 'Before',
      phoneNumber: '0900',
      avatarUrl: null,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /password|credential|token|identity|createdAt|updatedAt/,
    );
  });

  it('updates only displayName and phoneNumber, including explicit null', async () => {
    const local = await seed();
    const changed = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set(bearer(local.accessToken))
      .send({ displayName: '  Người dùng  ', phoneNumber: null })
      .expect(200);
    expect(
      validateSchema('UserProfile', changed.body),
      JSON.stringify(changed.body),
    ).toBe(true);
    expect(changed.body).toMatchObject({
      id: local.id,
      displayName: 'Người dùng',
      phoneNumber: null,
    });
  });

  it.each([
    {},
    { displayName: '' },
    { displayName: 'x'.repeat(101) },
    { phoneNumber: 'x'.repeat(33) },
    { email: 'attacker@example.test' },
    { role: 'ADMIN', status: 'LOCKED' },
    { emailVerified: false, passwordHash: 'secret', identity: {} },
  ])(
    'rejects empty, oversized, or forbidden profile fields: %j',
    async (body) => {
      const local = await seed();
      await request(app.getHttpServer())
        .patch('/api/v1/me')
        .set(bearer(local.accessToken))
        .send(body)
        .expect(422);
      const [user] = await fixture.db.query<
        { email: string; role: string; status: string; display_name: string }[]
      >('SELECT email,role,status,display_name FROM users WHERE id=$1', [
        local.id,
      ]);
      expect(user).toEqual({
        email: 'local@example.test',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        display_name: 'Before',
      });
    },
  );

  it('changes a LOCAL password, clears the cookie, and exposes no credential version', async () => {
    const local = await seed();
    const response = await request(app.getHttpServer())
      .post('/api/v1/me/password')
      .set(bearer(local.accessToken))
      .send({ currentPassword, newPassword: 'Replacement password 🔑' })
      .expect(204);
    expect(response.headers['set-cookie'][0]).toMatch(
      /^wedding_rt=;.*Max-Age=0.*Path=\/api\/v1\/auth/,
    );
    expect(response.text).toBe('');
    const [user] = await fixture.db.query<
      { password_hash: string; credential_version: string }[]
    >('SELECT password_hash,credential_version FROM users WHERE id=$1', [
      local.id,
    ]);
    expect(user.credential_version).toBe('1');
    expect(
      await fixture.crypto.verifyPassword(
        user.password_hash,
        'Replacement password 🔑',
      ),
    ).toBe(true);
  });

  it('rejects wrong current password and social-only accounts without mutation', async () => {
    const local = await seed();
    await request(app.getHttpServer())
      .post('/api/v1/me/password')
      .set(bearer(local.accessToken))
      .send({ currentPassword: 'Wrong password', newPassword: 'New password!' })
      .expect(400);
    const social = await seed('GOOGLE');
    const response = await request(app.getHttpServer())
      .post('/api/v1/me/password')
      .set(bearer(social.accessToken))
      .send({ currentPassword: 'Anything', newPassword: 'New password!' })
      .expect(400);
    expect(response.body).toMatchObject({
      status: 400,
      code: 'PASSWORD_CHANGE_NOT_APPLICABLE',
    });
    const [user] = await fixture.db.query<
      { password_hash: string | null; credential_version: string }[]
    >('SELECT password_hash,credential_version FROM users WHERE id=$1', [
      social.id,
    ]);
    expect(user).toEqual({ password_hash: null, credential_version: '0' });
  });

  it('strictly validates password input and rate limits attempts per principal', async () => {
    const local = await seed();
    for (const body of [
      {},
      { currentPassword, newPassword: 'short' },
      { currentPassword, newPassword: 'Valid123\ud800' },
      { currentPassword, newPassword: 'Valid password', role: 'ADMIN' },
    ])
      await request(app.getHttpServer())
        .post('/api/v1/me/password')
        .set(bearer(local.accessToken))
        .send(body)
        .expect(422);

    for (let attempt = 0; attempt < 5; attempt++)
      await request(app.getHttpServer())
        .post('/api/v1/me/password')
        .set(bearer(local.accessToken))
        .send({
          currentPassword: 'Wrong password',
          newPassword: 'Valid password',
        })
        .expect(400);
    const limited = await request(app.getHttpServer())
      .post('/api/v1/me/password')
      .set(bearer(local.accessToken))
      .send({
        currentPassword: 'Wrong password',
        newPassword: 'Valid password',
      })
      .expect(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited.headers['retry-after']).toMatch(/^[1-9]\d*$/);
  });
});
