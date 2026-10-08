import type { Server } from 'node:http';
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
import {
  GoogleAdapter,
  type GoogleAuthorizationInput,
  type GoogleCallbackInput,
} from '../../../src/modules/identity-access/oauth/google.adapter';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('Google OAuth HTTP contract', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  const google = {
    authorizationUrl: vi.fn<(input: GoogleAuthorizationInput) => string>(
      () => 'https://accounts.google.test/authorize',
    ),
    verifyCallback: vi.fn<
      (input: GoogleCallbackInput) => Promise<{
        provider: 'GOOGLE';
        subject: string;
        email: string;
        emailVerified: boolean;
        displayName: string;
        avatarUrl: null;
      }>
    >(() =>
      Promise.resolve({
        provider: 'GOOGLE',
        subject: 'google-contract-subject',
        email: 'google-contract@example.test',
        emailVerified: true,
        displayName: 'Google Guest',
        avatarUrl: null,
      }),
    ),
  };

  beforeAll(async () => {
    fixture = await registrationFixture();
    const config = {
      ...fixture.config,
      googleEnabled: true,
      googleClientId: 'contract-client.apps.googleusercontent.com',
      googleClientSecret: 'contract-secret',
    };
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(databaseOptions()), IdentityAccessModule],
    })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(config)
      .overrideProvider(GoogleAdapter)
      .useValue(google)
      .overrideProvider(EmailOutboxWorker)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });
  beforeEach(async () => {
    await fixture.clear();
    await fixture.db.query(
      'TRUNCATE auth_cookie_names, auth_intents, auth_contexts CASCADE',
    );
    google.authorizationUrl.mockClear();
    google.verifyCallback.mockClear();
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (fixture) await fixture.close();
    }
  });

  // 006 FR-003/FR-014: exercise the preserved provider contract through CSP1.
  async function start() {
    const http = () => request(app.getHttpServer());
    const created = await http()
      .post('/api/v1/auth/contexts')
      .set('Origin', fixture.config.frontendOrigin)
      .send({})
      .expect(201);
    const contextId = (created.body as { contextId: string }).contextId;
    const binding = (
      created.headers['set-cookie'] as unknown as string[]
    )[0].split(';')[0];
    await http()
      .post(`/api/v1/auth/contexts/${contextId}/confirm`)
      .set('Origin', fixture.config.frontendOrigin)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({})
      .expect(200);
    const reserved = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', fixture.config.frontendOrigin)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'OAUTH', expectedRevision: 0 })
      .expect(201);
    const intentId = (reserved.body as { intentId: string }).intentId;
    const response = await http()
      .get('/api/v1/auth/oauth/google/start')
      .set('Cookie', binding)
      .query({ intent: intentId })
      .expect(302);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return {
      response,
      intentId,
      cookie: `${binding}; ${cookies[0].split(';')[0]}`,
    };
  }

  it('starts only the allowlisted provider with an HttpOnly one-time binding', async () => {
    const { response } = await start();
    expect(response.headers.location).toBe(
      'https://accounts.google.test/authorize',
    );
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toMatch(/^wedding_oauth=[^;]+;/);
    expect(setCookie).toMatch(/Max-Age=(?:599|600)/);
    expect(setCookie).toContain('Path=/api/v1/auth');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const authorization = google.authorizationUrl.mock.calls.at(-1)![0];
    expect(authorization.state).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(authorization.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorization.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/unknown/start')
      .expect(400);
  });

  it('rejects callbacks without the matching state and browser binding', async () => {
    await start();
    const currentState = google.authorizationUrl.mock.calls.at(-1)![0].state;
    await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/google/callback')
      .query({ code: 'code', state: currentState })
      .expect(400);
    expect(google.verifyCallback).not.toHaveBeenCalled();
  });

  it('sets only an internal refresh cookie and redirects to a fixed frontend result', async () => {
    const { cookie, intentId } = await start();
    const transaction = google.authorizationUrl.mock.calls.at(-1)![0];
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/google/callback')
      .set('Cookie', cookie)
      .query({ code: 'provider-code', state: transaction.state })
      .expect(303);
    expect(response.headers.location).toBe(
      `http://localhost:3000/oauth-result?result=success&intent=${intentId}`,
    );
    expect(response.headers.location).not.toMatch(/code|token|provider-code/);
    expect(String(response.headers['set-cookie'])).toMatch(
      /wa_s_[A-Za-z0-9_-]{22}=[A-Za-z0-9_-]{43}/,
    );
    expect(String(response.headers['set-cookie'])).toMatch(/wedding_oauth=;/);
    const callback = google.verifyCallback.mock.calls.at(-1)![0];
    expect(callback.code).toBe('provider-code');
    expect(callback.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(callback.expectedNonceHash).toBeInstanceOf(Buffer);
  });

  it('claims cancellation once and rejects callback replay before provider work', async () => {
    const { cookie } = await start();
    const { state } = google.authorizationUrl.mock.calls.at(-1)![0];
    const callback = () =>
      request(app.getHttpServer())
        .get('/api/v1/auth/oauth/google/callback')
        .set('Cookie', cookie)
        .query({ error: 'access_denied', state });
    await callback().expect(400);
    await callback().expect(400);
    expect(google.verifyCallback).not.toHaveBeenCalled();
  });
});
