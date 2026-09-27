import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registrationFixture } from '../../registration-fixture';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';

const { validateSchema } = createRequire(__filename)(
  '../../../scripts/validate-iam-contract.cjs',
) as { validateSchema: (name: string, value: unknown) => boolean };

const flows = [
  { path: '/auth/email-verifications', purpose: 'LOCAL_EMAIL_VERIFICATION' },
  { path: '/auth/password-resets', purpose: 'PASSWORD_RESET' },
] as const;
type Purpose = (typeof flows)[number]['purpose'];
const password = '  New password 🔒  ';
const accepted = {
  message:
    'If the request is eligible, follow the instructions sent to the email address.',
};

// T032 is intentionally RED until T035–T037 register the real endpoints.
// Import the production module so missing routes fail as HTTP assertions,
// not unresolved imports. Only mail delivery is disabled; no fake controllers.
describe.sequential('US2 verification and recovery HTTP contracts', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  let passwordHash: string;

  beforeAll(async () => {
    fixture = await registrationFixture();
    passwordHash = await fixture.crypto.hashPassword('Original password 🔒');
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

  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Origin', 'http://localhost:3000')
      .send(body);

  function privateResponse(result: Response) {
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.headers.location).toBeUndefined();
  }

  function problem(result: Response, status: number, secrets: string[] = []) {
    expect(result.status).toBe(status);
    expect(result.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(validateSchema('Problem', result.body)).toBe(true);
    expect(result.body).toMatchObject({ status });
    const body = result.body as Record<string, unknown>;
    expect(body.requestId).toEqual(expect.any(String));
    expect(String(body.requestId).length).toBeGreaterThan(0);
    const serialized = JSON.stringify(body);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(
      /password_hash|token_hash|credential_version|accessToken|refreshToken|stack|SELECT |INSERT /,
    );
    privateResponse(result);
    // Correlation IDs differ, but invalid-proof reasons must not be disclosed.
    const publicError = { ...body };
    delete publicError.requestId;
    return publicError;
  }

  async function seedUser(
    email: string,
    method = 'LOCAL',
    verified = false,
    status = 'ACTIVE',
  ) {
    const id = randomUUID();
    await fixture.db.query(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,'CUSTOMER',$5,$6,now(),now())`,
      [
        id,
        email,
        method === 'LOCAL' ? passwordHash : null,
        method,
        status,
        verified ? new Date() : null,
      ],
    );
    return id;
  }

  async function seedProof(
    purpose: Purpose,
    state = 'ACTIVE',
    expired = false,
  ) {
    const email = `${randomUUID()}@example.test`;
    const userId = await seedUser(email, 'LOCAL', purpose === 'PASSWORD_RESET');
    const proof = fixture.crypto.randomToken();
    await fixture.db.query(
      `INSERT INTO auth_challenges
       (id,purpose,status,user_id,email,token_hash,token_key_version,generation,
        credential_version_snapshot,created_at,expires_at,activated_at,consumed_at,revoked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,now()-interval '2 days',$9,
        CASE WHEN $3::varchar <> 'PENDING_DELIVERY' THEN now()-interval '1 hour' END,
        CASE WHEN $3::varchar = 'CONSUMED' THEN now() END,
        CASE WHEN $3::varchar = 'REVOKED' THEN now() END)`,
      [
        randomUUID(),
        purpose,
        state,
        userId,
        email,
        fixture.crypto.proofDigest(proof),
        fixture.config.keyVersion,
        purpose === 'PASSWORD_RESET' ? '0' : null,
        new Date(Date.now() + (expired ? -60_000 : 600_000)),
      ],
    );
    return proof;
  }

  for (const flow of flows) {
    const confirm = `${flow.path}/confirm`;
    const payload = (proof: string) =>
      flow.purpose === 'PASSWORD_RESET'
        ? { proof, newPassword: password }
        : { proof };

    for (const path of [flow.path, confirm]) {
      it(`protects Origin and JSON on ${path}`, async () => {
        const body =
          path === confirm
            ? payload('p'.repeat(43))
            : { email: 'person@example.test' };
        for (const origin of [undefined, 'https://evil.test']) {
          const call = request(app.getHttpServer()).post(`/api/v1${path}`);
          if (origin) call.set('Origin', origin);
          problem(await call.send(body).expect(403), 403);
        }
        problem(
          await request(app.getHttpServer())
            .post(`/api/v1${path}`)
            .set('Origin', 'http://localhost:3000')
            .type('form')
            .send(body)
            .expect(403),
          403,
        );
      });
    }
    describe(`POST ${flow.path}`, () => {
      it('returns identical public 202 for missing, unverified, verified, locked and social accounts', async () => {
        await seedUser('unverified@example.test');
        await seedUser('verified@example.test', 'LOCAL', true);
        await seedUser('locked@example.test', 'LOCAL', true, 'LOCKED');
        await seedUser('google@example.test', 'GOOGLE', true);
        await seedUser('facebook@example.test', 'FACEBOOK', true);
        for (const email of [
          'missing',
          'unverified',
          'verified',
          'locked',
          'google',
          'facebook',
        ]) {
          // Each account response is independent of the IP quota tested below.
          await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
          const result = await post(flow.path, {
            email: `${email}@example.test`,
          }).expect(202);
          expect(result.body).toEqual(accepted);
          expect(validateSchema('GenericAccepted', result.body)).toBe(true);
          expect(result.headers['content-type']).toContain('application/json');
          privateResponse(result);
        }
      });

      it.each([
        {},
        { email: 'not-an-email' },
        { email: 42 },
        { email: null },
        { email: ['person@example.test'] },
        { email: `${'x'.repeat(243)}@example.test` },
        { email: 'person@example.test', role: 'ADMIN' },
      ])('rejects malformed or additional fields: %j', async (body) => {
        const result = await post(flow.path, body).expect(422);
        problem(result, 422, ['person@example.test', 'not-an-email', 'ADMIN']);
        expect(result.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      });

      it('limits normalized email resend requests including nonexistent accounts', async () => {
        for (let i = 0; i < 3; i++) {
          await post(flow.path, {
            email: i % 2 ? ' PERSON@example.test ' : 'person@example.test',
          }).expect(202);
        }
        const result = await post(flow.path, {
          email: 'person@example.test',
        }).expect(429);
        problem(result, 429, ['person@example.test']);
        expect(result.body).toMatchObject({ code: 'RATE_LIMITED' });
        expect(result.headers['retry-after']).toMatch(/^[1-9]\d*$/);
      });

      it('limits IP requests across different email addresses', async () => {
        for (let i = 0; i < 5; i++)
          await post(flow.path, { email: `missing-${i}@example.test` }).expect(
            202,
          );
        const result = await post(flow.path, {
          email: 'another@example.test',
        }).expect(429);
        problem(result, 429);
        expect(result.body).toMatchObject({ code: 'RATE_LIMITED' });
        expect(result.headers['retry-after']).toMatch(/^[1-9]\d*$/);
      });
    });

    describe(`POST ${confirm}`, () => {
      it('accepts an active purpose-bound proof with empty 204 and no automatic login', async () => {
        const proof = await seedProof(flow.purpose);
        const result = await post(confirm, payload(proof)).expect(204);
        expect(result.text).toBe('');
        privateResponse(result);
      });

      it.each([
        {},
        { proof: '' },
        { proof: 'p'.repeat(39) },
        { proof: 'p'.repeat(513) },
        { proof: 42 },
        { proof: null },
        { proof: ['p'.repeat(43)] },
        { proof: 'p'.repeat(43), extra: 'private-extra' },
      ])('rejects malformed proof fields: %j', async (body) => {
        const result = await post(
          confirm,
          flow.purpose === 'PASSWORD_RESET'
            ? { newPassword: password, ...body }
            : body,
        ).expect(422);
        problem(result, 422, [password, 'p'.repeat(39), 'private-extra']);
        expect(result.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      });

      it('returns the same safe 400 for unknown, expired, used, revoked, undelivered and wrong-purpose proofs', async () => {
        const proofs = [
          fixture.crypto.randomToken(),
          await seedProof(flow.purpose, 'ACTIVE', true),
          await seedProof(flow.purpose, 'CONSUMED'),
          await seedProof(flow.purpose, 'REVOKED'),
          await seedProof(flow.purpose, 'PENDING_DELIVERY'),
          await seedProof(
            flow.purpose === 'PASSWORD_RESET'
              ? 'LOCAL_EMAIL_VERIFICATION'
              : 'PASSWORD_RESET',
          ),
        ];
        const errors = [];
        for (const proof of proofs) {
          await fixture.db.query('TRUNCATE auth_rate_limit_buckets');
          const result = await post(confirm, payload(proof)).expect(400);
          errors.push(problem(result, 400, [proof, password]));
        }
        for (const error of errors) expect(error).toEqual(errors[0]);
      });

      it('rejects replay after successful confirmation', async () => {
        const proof = await seedProof(flow.purpose);
        await post(confirm, payload(proof)).expect(204);
        problem(await post(confirm, payload(proof)).expect(400), 400, [
          proof,
          password,
        ]);
      });

      it('returns safe 429 and Retry-After for an exhausted known challenge', async () => {
        const proof = await seedProof(flow.purpose);
        await fixture.db.query(
          'UPDATE auth_challenges SET attempt_count=5 WHERE token_hash=$1',
          [fixture.crypto.proofDigest(proof)],
        );
        const result = await post(confirm, payload(proof)).expect(429);
        problem(result, 429, [proof, password]);
        expect(result.body).toMatchObject({ code: 'RATE_LIMITED' });
        expect(result.headers['retry-after']).toMatch(/^[1-9]\d*$/);
      });

      it('rate limits unknown proofs by IP without requiring authentication', async () => {
        for (let i = 0; i < 5; i++)
          await post(confirm, payload(fixture.crypto.randomToken())).expect(
            400,
          );
        const proof = fixture.crypto.randomToken();
        const result = await post(confirm, payload(proof)).expect(429);
        problem(result, 429, [proof, password]);
        expect(result.body).toMatchObject({ code: 'RATE_LIMITED' });
        expect(result.headers['retry-after']).toMatch(/^[1-9]\d*$/);
      });
    });
  }

  it.each([
    undefined,
    null,
    42,
    '',
    'short',
    'x'.repeat(129),
    '🔒'.repeat(129),
  ])(
    'rejects invalid reset newPassword (%s) without echoing credentials',
    async (newPassword) => {
      const proof = await seedProof('PASSWORD_RESET');
      const result = await post('/auth/password-resets/confirm', {
        proof,
        newPassword,
      }).expect(422);
      problem(result, 422, [
        proof,
        ...(typeof newPassword === 'string' && newPassword
          ? [newPassword]
          : []),
      ]);
      expect(result.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    },
  );
});
