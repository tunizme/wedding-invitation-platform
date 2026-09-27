import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registrationFixture } from '../../registration-fixture';
import { RegistrationController } from '../../../src/modules/identity-access/auth/registration.controller';
import { RegisterLocalService } from '../../../src/modules/identity-access/application/register-local.service';
import { RateLimitService } from '../../../src/modules/identity-access/infrastructure/rate-limit.service';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
const { validateSchema } = createRequire(__filename)(
  '../../../scripts/validate-iam-contract.cjs',
) as { validateSchema: (name: string, value: unknown) => boolean };

describe.sequential('POST /auth/registrations', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  beforeAll(async () => {
    fixture = await registrationFixture();
    const module = await Test.createTestingModule({
      controllers: [RegistrationController],
      providers: [
        { provide: RegisterLocalService, useValue: fixture.register },
        {
          provide: RateLimitService,
          useValue: new RateLimitService(fixture.db, fixture.config),
        },
        {
          provide: BrowserSecurityService,
          useValue: new BrowserSecurityService(fixture.config),
        },
      ],
    }).compile();
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
      .post('/api/v1/auth/registrations')
      .set('Origin', 'http://localhost:3000')
      .send(body as object);
  it('returns identical safe 202 for new/duplicate emails, with no session cookie', async () => {
    const first = await post({
      email: 'Person@example.test',
      password: '  Password 🔒  ',
    }).expect(202);
    const duplicate = await post({
      email: ' person@example.test ',
      password: 'different password',
    }).expect(202);
    expect(first.body).toEqual({
      message:
        'If the request is eligible, follow the instructions sent to the email address.',
    });
    expect(duplicate.body).toEqual(first.body);
    expect(validateSchema('GenericAccepted', first.body)).toBe(true);
    expect(validateSchema('GenericAccepted', duplicate.body)).toBe(true);
    expect(first.headers['set-cookie']).toBeUndefined();
    expect(duplicate.headers['set-cookie']).toBeUndefined();
    expect(first.headers['cache-control']).toBe('no-store');
  });
  it('rejects invalid/unknown fields with safe 422 and rejects foreign Origin', async () => {
    for (const body of [
      { email: 'bad', password: 'long enough' },
      { email: 'a@example.test', password: 'short' },
      { email: 'a@example.test', password: 'long enough', role: 'ADMIN' },
      { email: 42, password: 'long enough' },
    ]) {
      const result = await post(body).expect(422);
      expect(validateSchema('Problem', result.body)).toBe(true);
      expect(result.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(result.body).toMatchObject({
        status: 422,
        code: 'VALIDATION_FAILED',
      });
      expect(JSON.stringify(result.body)).not.toMatch(
        /long enough|ADMIN|password/,
      );
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/registrations')
      .set('Origin', 'https://evil.test')
      .send({ email: 'a@example.test', password: 'long enough' })
      .expect(403);
  });
  it('enforces rate limits for duplicates and returns Retry-After', async () => {
    for (let i = 0; i < 3; i++)
      await post({ email: 'a@example.test', password: 'long enough' }).expect(
        202,
      );
    const result = await post({
      email: 'a@example.test',
      password: 'long enough',
    }).expect(429);
    expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
    expect(result.body).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
