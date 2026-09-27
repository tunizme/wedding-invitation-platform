import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

const { validateSchema } = createRequire(__filename)(
  '../../../scripts/validate-iam-contract.cjs',
) as { validateSchema: (name: string, value: unknown) => boolean };

interface LoginResponse {
  accessToken: string;
  csrfToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: Record<string, unknown>;
}

describe.sequential('POST /auth/login contract', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  const password = '  Login Password 🔒  ';

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

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send(body as object);

  async function seed(
    email: string,
    options: {
      verified?: boolean;
      status?: 'ACTIVE' | 'LOCKED';
      method?: 'LOCAL' | 'GOOGLE' | 'FACEBOOK';
    } = {},
  ) {
    const method = options.method ?? 'LOCAL';
    const hash =
      method === 'LOCAL' ? await fixture.crypto.hashPassword(password) : null;
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,'CUSTOMER',$4,$5,now(),now()) RETURNING id`,
      [
        email,
        hash,
        method,
        options.status ?? 'ACTIVE',
        options.verified === false ? null : new Date(),
      ],
    );
    return id;
  }

  function safeProblem(
    result: Response,
    status: number,
    secrets: string[] = [],
  ) {
    expect(result.status).toBe(status);
    expect(result.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(validateSchema('Problem', result.body)).toBe(true);
    expect(result.body).toMatchObject({ status });
    const serialized = JSON.stringify(result.body);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(
      /password_hash|refreshToken|accessToken|token_hash|stack|SELECT |INSERT /,
    );
    const comparable = { ...(result.body as Record<string, unknown>) };
    delete comparable.requestId;
    return comparable;
  }

  it('returns a safe AccessSession and a narrow host-only HttpOnly refresh cookie', async () => {
    const id = await seed('person@example.test');
    const result = await post({
      email: ' PERSON@example.test ',
      password,
    }).expect(200);
    const body = result.body as LoginResponse;

    expect(validateSchema('AccessSession', body)).toBe(true);
    expect(body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id,
        email: 'person@example.test',
        emailVerified: true,
        loginMethod: 'LOCAL',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        displayName: null,
        phoneNumber: null,
        avatarUrl: null,
      },
    });
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(body)).not.toMatch(
      /password|passwordHash|refreshToken|credentialVersion|csrfSeed/,
    );
    expect(result.headers['cache-control']).toBe('no-store');
    const cookies = result.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^wedding_rt=[A-Za-z0-9_-]{43};/);
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('Path=/api/v1/auth');
    expect(cookies[0]).toContain('SameSite=Lax');
    expect(cookies[0]).toMatch(/Max-Age=1209\d{3}/);
    expect(cookies[0]).not.toMatch(/Domain=|Secure/);

    const principal = fixture.crypto
      ? app
          .get(
            // Resolve by its runtime token without adding a test-only controller.
            (
              await import('../../../src/modules/identity-access/auth/access-token.service')
            ).AccessTokenService,
          )
          .verify(body.accessToken)
      : undefined;
    expect(principal).toMatchObject({ userId: id, role: 'CUSTOMER' });
  });

  it('uses the same 401 response for unknown email, wrong password, LOCKED and social accounts', async () => {
    await seed('wrong@example.test');
    await seed('locked@example.test', { status: 'LOCKED' });
    await seed('google@example.test', { method: 'GOOGLE' });
    const attempts = [
      { email: 'missing@example.test', password },
      { email: 'wrong@example.test', password: 'wrong password' },
      { email: 'locked@example.test', password },
      { email: 'google@example.test', password },
    ];
    const errors: Record<string, unknown>[] = [];
    for (const body of attempts) {
      await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
      errors.push(
        safeProblem(await post(body).expect(401), 401, [body.password]),
      );
    }
    for (const error of errors) expect(error).toEqual(errors[0]);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('reveals the verification next step only after the correct LOCAL password', async () => {
    await seed('unverified@example.test', { verified: false });
    safeProblem(
      await post({
        email: 'unverified@example.test',
        password: 'wrong password',
      }).expect(401),
      401,
    );
    await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
    safeProblem(
      await post({ email: 'unverified@example.test', password }).expect(403),
      403,
      [password],
    );
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it.each([
    {},
    { email: 'bad', password },
    { email: 'person@example.test' },
    { email: 42, password },
    { email: 'person@example.test', password: '' },
    { email: 'person@example.test', password: 'x'.repeat(129) },
    { email: 'person@example.test', password, role: 'ADMIN' },
  ])('rejects malformed or additional fields: %j', async (body) => {
    safeProblem(await post(body).expect(422), 422, [password, 'ADMIN']);
  });

  it('requires exact Origin and JSON', async () => {
    for (const origin of [undefined, 'https://evil.test']) {
      const call = request(app.getHttpServer()).post('/api/v1/auth/login');
      if (origin) call.set('Origin', origin);
      safeProblem(
        await call.send({ email: 'person@example.test', password }).expect(403),
        403,
        [password],
      );
    }
    safeProblem(
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .type('form')
        .send({ email: 'person@example.test', password })
        .expect(403),
      403,
      [password],
    );
  });

  it('rate limits normalized email attempts and returns Retry-After without a cookie', async () => {
    for (let attempt = 0; attempt < 5; attempt++)
      await post({
        email: attempt % 2 ? ' PERSON@example.test ' : 'person@example.test',
        password: 'wrong password',
      }).expect(401);
    const result = await post({
      email: 'person@example.test',
      password: 'wrong password',
    }).expect(429);
    safeProblem(result, 429);
    expect(result.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(result.headers['retry-after']).toMatch(/^[1-9]\d*$/);
  });
});
