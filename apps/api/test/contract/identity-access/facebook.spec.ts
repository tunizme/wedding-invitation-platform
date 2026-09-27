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
  FacebookAdapter,
  type FacebookAuthorizationInput,
  type FacebookCallbackInput,
} from '../../../src/modules/identity-access/oauth/facebook.adapter';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('Facebook OAuth HTTP contract', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  const facebook = {
    authorizationUrl: vi.fn<(input: FacebookAuthorizationInput) => string>(
      () => 'https://www.facebook.test/dialog/oauth',
    ),
    verifyCallback: vi.fn<
      (input: FacebookCallbackInput) => Promise<{
        provider: 'FACEBOOK';
        subject: string;
        email: string;
        emailVerified: true;
        displayName: string;
        avatarUrl: null;
      }>
    >(() =>
      Promise.resolve({
        provider: 'FACEBOOK',
        subject: 'facebook-contract-subject',
        email: 'facebook-contract@example.test',
        emailVerified: true,
        displayName: 'Facebook Guest',
        avatarUrl: null,
      }),
    ),
  };

  beforeAll(async () => {
    fixture = await registrationFixture();
    const config = {
      ...fixture.config,
      facebookEnabled: true,
      facebookClientId: 'facebook-contract-client',
      facebookClientSecret: 'facebook-contract-secret',
    };
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(databaseOptions()), IdentityAccessModule],
    })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(config)
      .overrideProvider(FacebookAdapter)
      .useValue(facebook)
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
    facebook.authorizationUrl.mockClear();
    facebook.verifyCallback.mockClear();
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (fixture) await fixture.close();
    }
  });

  async function start() {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/facebook/start')
      .expect(302);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return { response, cookie: cookies[0].split(';')[0] };
  }

  it('starts Facebook with a one-time state and HttpOnly browser binding', async () => {
    const { response } = await start();
    expect(response.headers.location).toBe(
      'https://www.facebook.test/dialog/oauth',
    );
    expect(String(response.headers['set-cookie'])).toMatch(
      /^wedding_oauth=[^;]+;.*HttpOnly.*SameSite=Lax/,
    );
    const authorization = facebook.authorizationUrl.mock.calls.at(-1)![0];
    expect(authorization.state).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(authorization).not.toHaveProperty('nonce');
    expect(authorization).not.toHaveProperty('codeChallenge');
  });

  it('rejects missing binding and does no provider work', async () => {
    await start();
    const { state } = facebook.authorizationUrl.mock.calls.at(-1)![0];
    await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/facebook/callback')
      .query({ code: 'code', state })
      .expect(400);
    expect(facebook.verifyCallback).not.toHaveBeenCalled();
  });

  it('creates a session for valid Facebook email and uses a fixed safe result redirect', async () => {
    const { cookie } = await start();
    const { state } = facebook.authorizationUrl.mock.calls.at(-1)![0];
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/oauth/facebook/callback')
      .set('Cookie', cookie)
      .query({ code: 'facebook-provider-code', state })
      .expect(303);
    expect(response.headers.location).toBe(
      'http://localhost:3000/oauth-result?result=success',
    );
    expect(response.headers.location).not.toMatch(/code|token|facebook/i);
    expect(String(response.headers['set-cookie'])).toMatch(/wedding_rt=/);
    expect(String(response.headers['set-cookie'])).not.toMatch(/wedding_ob=/);
    expect(String(response.headers['set-cookie'])).toMatch(/wedding_oauth=;/);
    expect(facebook.verifyCallback).toHaveBeenCalledWith({
      code: 'facebook-provider-code',
    });
  });

  it('records denial once and rejects replay before provider work', async () => {
    const { cookie } = await start();
    const { state } = facebook.authorizationUrl.mock.calls.at(-1)![0];
    const callback = () =>
      request(app.getHttpServer())
        .get('/api/v1/auth/oauth/facebook/callback')
        .set('Cookie', cookie)
        .query({ error: 'access_denied', state });
    await callback().expect(400);
    await callback().expect(400);
    expect(facebook.verifyCallback).not.toHaveBeenCalled();
  });
});
