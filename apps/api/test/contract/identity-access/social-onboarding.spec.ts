import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { SocialOnboardingService } from '../../../src/modules/identity-access/oauth/social-onboarding.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('social onboarding HTTP contract', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
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

  async function pending(subject = 'provider-subject') {
    return app.get(SocialOnboardingService).begin({
      provider: 'FACEBOOK',
      subject,
      email: null,
      emailVerified: false,
      displayName: 'Khách mới',
      avatarUrl: null,
    });
  }
  const cookie = (binding: string) => `wedding_ob=${binding}`;

  async function browserState(binding: string) {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/social-onboarding')
      .set('Cookie', cookie(binding))
      .expect(200);
    return (response.body as { csrfToken: string }).csrfToken;
  }

  async function activeProof(contextId: string) {
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
    await new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.resolve('accepted') },
      fixture.config.frontendOrigin,
    ).runOnce();
    return proof;
  }

  async function prepared(subject: string, email: string) {
    const context = await pending(subject);
    const csrfToken = await browserState(context.binding);
    await request(app.getHttpServer())
      .post('/api/v1/auth/social-onboarding/email')
      .set('Origin', fixture.config.frontendOrigin)
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', cookie(context.binding))
      .send({ email })
      .expect(202);
    return {
      context,
      csrfToken,
      proof: await activeProof(context.id),
    };
  }

  it('returns safe pending state and a context-bound CSRF token', async () => {
    const context = await pending();
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/social-onboarding')
      .set('Cookie', cookie(context.binding))
      .expect(200);
    const body = response.body as Record<string, unknown> & {
      csrfToken: string;
    };
    expect(body).toMatchObject({
      provider: 'FACEBOOK',
      status: 'PENDING_EMAIL',
      emailCandidate: null,
    });
    expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(
      /subject|binding|token_hash/,
    );
  });

  it('requires binding, exact Origin and CSRF for mutations', async () => {
    const context = await pending();
    const state = await request(app.getHttpServer())
      .get('/api/v1/auth/social-onboarding')
      .set('Cookie', cookie(context.binding));
    const csrfToken = (state.body as { csrfToken: string }).csrfToken;
    await request(app.getHttpServer())
      .get('/api/v1/auth/social-onboarding')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/social-onboarding/email')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie(context.binding))
      .send({ email: 'new@example.test' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/social-onboarding/email')
      .set('Origin', 'https://evil.test')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', cookie(context.binding))
      .send({ email: 'new@example.test' })
      .expect(403);
  });

  it('accepts email and resend generically without creating a Customer', async () => {
    const context = await pending();
    const state = await request(app.getHttpServer())
      .get('/api/v1/auth/social-onboarding')
      .set('Cookie', cookie(context.binding));
    const csrfToken = (state.body as { csrfToken: string }).csrfToken;
    for (const path of ['email', 'verifications']) {
      const call = request(app.getHttpServer())
        .post(`/api/v1/auth/social-onboarding/${path}`)
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', cookie(context.binding));
      const response = await (
        path === 'email'
          ? call.send({ email: ' NEW@example.test ' })
          : call.send()
      ).expect(202);
      expect(response.body).toHaveProperty('message');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
  });

  it('completes once with a safe session and rejects proof replay', async () => {
    const context = await pending();
    const state = await request(app.getHttpServer())
      .get('/api/v1/auth/social-onboarding')
      .set('Cookie', cookie(context.binding));
    const csrfToken = (state.body as { csrfToken: string }).csrfToken;
    await request(app.getHttpServer())
      .post('/api/v1/auth/social-onboarding/email')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', cookie(context.binding))
      .send({ email: 'social@example.test' })
      .expect(202);
    const [mail] = await fixture.db.query<
      {
        id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      'SELECT id,payload_ciphertext,encryption_key_version FROM email_outbox LIMIT 1',
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
    const confirm = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/social-onboarding/verifications/confirm')
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', cookie(context.binding))
        .send({ proof });
    const completed = await confirm().expect(200);
    expect(completed.body as Record<string, unknown>).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        email: 'social@example.test',
        loginMethod: 'FACEBOOK',
        emailVerified: true,
        role: 'CUSTOMER',
      },
    });
    const setCookie = completed.headers['set-cookie'] as unknown;
    expect(
      Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie),
    ).toMatch(/wedding_rt=.*wedding_ob=;/);
    await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
    await confirm().expect(401);
  });

  it.each(['email', 'identity'] as const)(
    'returns the stable onboarding conflict code for a valid %s uniqueness conflict',
    async (kind) => {
      const flow = await prepared(
        `contract-${kind}-conflict`,
        `${kind}-candidate@example.test`,
      );
      if (kind === 'email') {
        await fixture.db.query(
          `INSERT INTO users
           (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
           VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
          [
            'email-candidate@example.test',
            await fixture.crypto.hashPassword('Existing Password'),
          ],
        );
      } else {
        const [{ id }] = await fixture.db.query<{ id: string }[]>(
          `INSERT INTO users
           (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
           VALUES (gen_random_uuid(),'identity-owner@example.test',NULL,'FACEBOOK','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
        );
        await fixture.db.query(
          `INSERT INTO external_identities
           (id,user_id,provider,provider_subject,created_at)
           VALUES (gen_random_uuid(),$1,'FACEBOOK','contract-identity-conflict',now())`,
          [id],
        );
      }
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/social-onboarding/verifications/confirm')
        .set('Origin', fixture.config.frontendOrigin)
        .set('X-CSRF-Token', flow.csrfToken)
        .set('Cookie', cookie(flow.context.binding))
        .send({ proof: flow.proof })
        .expect(409);
      expect(response.body).toMatchObject({
        status: 409,
        code: 'ONBOARDING_CANNOT_COMPLETE',
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /email-candidate|identity-owner|FACEBOOK/i,
      );
      expect(
        await fixture.db.query('SELECT id FROM auth_sessions'),
      ).toHaveLength(0);
    },
  );

  it('rate limits email and resend without creating a Customer or session', async () => {
    const context = await pending('request-limit');
    const csrfToken = await browserState(context.binding);
    const call = (path: 'email' | 'verifications') => {
      const operation = request(app.getHttpServer())
        .post(`/api/v1/auth/social-onboarding/${path}`)
        .set('Origin', fixture.config.frontendOrigin)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', cookie(context.binding));
      return path === 'email'
        ? operation.send({ email: 'limited@example.test' })
        : operation.send();
    };
    for (let attempt = 0; attempt < 3; attempt += 1)
      await call('email').expect(202);
    const emailLimited = await call('email').expect(429);
    expect(emailLimited.headers['retry-after']).toBeDefined();
    await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
    for (let attempt = 0; attempt < 3; attempt += 1)
      await call('verifications').expect(202);
    const resendLimited = await call('verifications').expect(429);
    expect(resendLimited.headers['retry-after']).toBeDefined();
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('rate limits known and unknown proof attempts without partial access', async () => {
    const target = await prepared('attempt-target', 'target@example.test');
    const foreign = await prepared('attempt-foreign', 'foreign@example.test');
    const confirm = (proof: string) =>
      request(app.getHttpServer())
        .post('/api/v1/auth/social-onboarding/verifications/confirm')
        .set('Origin', fixture.config.frontendOrigin)
        .set('X-CSRF-Token', target.csrfToken)
        .set('Cookie', cookie(target.context.binding))
        .send({ proof });
    await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
    for (let attempt = 0; attempt < 5; attempt += 1)
      await confirm(foreign.proof).expect(400);
    const knownLimited = await confirm(foreign.proof).expect(429);
    expect(knownLimited.headers['retry-after']).toBe('3600');
    await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
    const unknown = 'x'.repeat(43);
    for (let attempt = 0; attempt < 5; attempt += 1)
      await confirm(unknown).expect(400);
    const unknownLimited = await confirm(unknown).expect(429);
    expect(unknownLimited.headers['retry-after']).toBeDefined();
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });
});
