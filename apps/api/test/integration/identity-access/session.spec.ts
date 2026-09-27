import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { RefreshService } from '../../../src/modules/identity-access/auth/refresh.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { transaction } from '../../../src/modules/identity-access/infrastructure/transactions';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('refresh rotation and logout transactions', () => {
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

  async function issue(email: string) {
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
      [email, await fixture.crypto.hashPassword('Session Password')],
    );
    return {
      id,
      ...(await fixture.db.transaction((manager) =>
        app.get(SessionService).issue(manager, id),
      )),
    };
  }
  async function csrf(token: string) {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', `wedding_rt=${token}`)
      .expect(200);
    return (response.body as { csrfToken: string }).csrfToken;
  }
  const rotate = (token: string, csrfToken: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', `wedding_rt=${token}`);

  it('keeps history, increments one generation and never extends the 14-day boundary', async () => {
    const current = await issue('rotate@example.test');
    const response = await rotate(
      current.refreshToken,
      await csrf(current.refreshToken),
    ).expect(200);
    const rows = await fixture.db.query<
      {
        generation: number;
        consumed_at: Date | null;
        replaced_by_id: string | null;
        expires_at: Date;
        absolute_expires_at: Date;
      }[]
    >(
      `SELECT c.generation,c.consumed_at,c.replaced_by_id,c.expires_at,s.absolute_expires_at
       FROM refresh_credentials c JOIN auth_sessions s ON s.id=c.session_id
       WHERE s.id=$1 ORDER BY c.generation`,
      [current.sessionId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.generation)).toEqual([0, 1]);
    expect(rows[0].consumed_at).not.toBeNull();
    expect(rows[0].replaced_by_id).not.toBeNull();
    expect(rows[1].expires_at.getTime()).toBe(
      rows[1].absolute_expires_at.getTime(),
    );
    expect((response.body as { csrfToken: string }).csrfToken).toBe(
      await csrf(
        decodeURIComponent(
          response.headers['set-cookie'][0].match(/^wedding_rt=([^;]+)/)![1],
        ),
      ),
    );
  });

  it('commits family revocation before returning 401 on consumed-token reuse', async () => {
    const current = await issue('reuse@example.test');
    const token = await csrf(current.refreshToken);
    await rotate(current.refreshToken, token).expect(200);
    await rotate(current.refreshToken, token).expect(401);
    const [row] = await fixture.db.query<
      { revoked_at: Date | null; revocation_reason: string | null }[]
    >('SELECT revoked_at,revocation_reason FROM auth_sessions WHERE id=$1', [
      current.sessionId,
    ]);
    expect(row.revoked_at).not.toBeNull();
    expect(row.revocation_reason).toBe('REFRESH_REUSE');
  });

  it('allows only one concurrent successor and revokes the family on the loser reuse', async () => {
    const current = await issue('concurrent@example.test');
    const token = await csrf(current.refreshToken);
    const results = await Promise.all([
      rotate(current.refreshToken, token),
      rotate(current.refreshToken, token),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    expect(
      await fixture.db.query(
        'SELECT id FROM refresh_credentials WHERE session_id=$1 AND generation=1',
        [current.sessionId],
      ),
    ).toHaveLength(1);
    const [family] = await fixture.db.query<{ revocation_reason: string }[]>(
      'SELECT revocation_reason FROM auth_sessions WHERE id=$1',
      [current.sessionId],
    );
    expect(family.revocation_reason).toBe('REFRESH_REUSE');
  });

  it('logout-current affects one family while logout-all affects every owner family', async () => {
    const owner = await issue('owner-sessions@example.test');
    const sibling = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, owner.id),
    );
    const other = await issue('other-sessions@example.test');
    await app.get(RefreshService).revokeCurrent(owner.refreshToken);
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE id=$1 AND revoked_at IS NULL',
        [sibling.sessionId],
      ),
    ).toHaveLength(1);
    await transaction(fixture.db, (manager) =>
      app.get(SessionService).revokeAll(manager, owner.id, 'LOGOUT_ALL'),
    );
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [owner.id],
      ),
    ).toHaveLength(0);
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [other.id],
      ),
    ).toHaveLength(1);
  });
});
