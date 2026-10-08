import type { Server } from 'node:http';
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

describe.sequential('session HTTP contract', () => {
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

  async function session(email = 'session@example.test') {
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
      [email, await fixture.crypto.hashPassword('Contract Password')],
    );
    const issued = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, id),
    );
    return { id, ...issued };
  }
  const cookie = (token: string) => `wedding_rt=${token}`;

  // T062 allowlist (FR-003/FR-014): legacy singleton sessions are no longer
  // current after CSP-1 cutover; the 006 session contract covers rotation.
  it('rejects legacy CSRF and refresh after cutover and clears only the singleton cookie', async () => {
    const current = await session();
    const first = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', cookie(current.refreshToken))
      .expect(401);
    expect(first.headers['set-cookie']).toHaveLength(1);
    expect(first.headers['set-cookie'][0]).toMatch(/^wedding_rt=;.*Max-Age=0/);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie(current.refreshToken))
      .expect(401);
    expect(refreshed.headers['set-cookie']).toHaveLength(1);
    expect(refreshed.headers['set-cookie'][0]).toMatch(
      /^wedding_rt=;.*Max-Age=0/,
    );
    for (const clearedCookie of refreshed.headers[
      'set-cookie'
    ] as unknown as string[])
      expect(clearedCookie).not.toMatch(/wa_(?:cb|s)_/);
  });

  // T062 allowlist (FR-003/FR-014): no-context requests are rejected at cutover.
  it('requires Origin before rejecting legacy refresh and logout', async () => {
    const current = await session();
    const csrf = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', cookie(current.refreshToken));
    const csrfToken = (csrf.body as { csrfToken: string }).csrfToken;
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(current.refreshToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie(current.refreshToken))
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', cookie(current.refreshToken))
      .expect(401);
    expect(csrfToken).toBeUndefined();
  });

  // T062 allowlist (FR-003/FR-014): context-less logout is unauthorized,
  // while repeated legacy cleanup remains idempotent and singleton-only.
  it('clears the cookie idempotently when no active session can be resolved', async () => {
    for (const value of [undefined, 'malformed']) {
      const call = request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://localhost:3000');
      if (value) call.set('Cookie', cookie(value));
      const response = await call.expect(401);
      expect(response.headers['set-cookie'][0]).toMatch(
        /^wedding_rt=;.*Max-Age=0.*Path=\/api\/v1\/auth.*HttpOnly.*SameSite=Lax/,
      );
    }
  });

  it('revokes all sessions with bearer authentication and clears the cookie', async () => {
    const first = await session('all@example.test');
    const second = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, first.id),
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(204);
    expect(response.headers['set-cookie'][0]).toContain('Max-Age=0');
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .expect(401);
    const rows = await fixture.db.query<{ revocation_reason: string }[]>(
      'SELECT revocation_reason FROM auth_sessions WHERE user_id=$1',
      [first.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.revocation_reason === 'LOGOUT_ALL')).toBe(
      true,
    );
  });
});
