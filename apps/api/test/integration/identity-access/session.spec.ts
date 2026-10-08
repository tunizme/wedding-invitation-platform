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
  const rotate = (token: string, csrfToken: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfToken)
      .set('Cookie', `wedding_rt=${token}`);

  // T062 allowlist (FR-003/FR-014): legacy endpoint writes stop at cutover;
  // 006 contract/integration suites retain current-slot rotation coverage.
  it('rejects legacy refresh without consuming credentials or changing history', async () => {
    const current = await issue('rotate@example.test');
    const response = await rotate(current.refreshToken, 'legacy-csrf').expect(
      401,
    );
    expect(response.headers['set-cookie'][0]).toMatch(
      /^wedding_rt=;.*Max-Age=0/,
    );
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
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => row.generation)).toEqual([0]);
    expect(rows[0].consumed_at).toBeNull();
    expect(rows[0].replaced_by_id).toBeNull();
    expect(rows[0].expires_at.getTime()).toBe(
      rows[0].absolute_expires_at.getTime(),
    );
  });

  it('does not let legacy refresh requests trigger token-reuse revocation', async () => {
    const current = await issue('reuse@example.test');
    await rotate(current.refreshToken, 'legacy-csrf').expect(401);
    await rotate(current.refreshToken, 'legacy-csrf').expect(401);
    const [row] = await fixture.db.query<
      { revoked_at: Date | null; revocation_reason: string | null }[]
    >('SELECT revoked_at,revocation_reason FROM auth_sessions WHERE id=$1', [
      current.sessionId,
    ]);
    expect(row.revoked_at).toBeNull();
    expect(row.revocation_reason).toBeNull();
    expect(
      await fixture.db.query(
        'SELECT id FROM refresh_credentials WHERE session_id=$1 AND consumed_at IS NOT NULL',
        [current.sessionId],
      ),
    ).toHaveLength(0);
  });

  it('rejects concurrent legacy refreshes without creating successor credentials', async () => {
    const current = await issue('concurrent@example.test');
    const results = await Promise.all([
      rotate(current.refreshToken, 'legacy-csrf'),
      rotate(current.refreshToken, 'legacy-csrf'),
    ]);
    expect(results.map((result) => result.status)).toEqual([401, 401]);
    expect(
      await fixture.db.query(
        'SELECT id FROM refresh_credentials WHERE session_id=$1 AND generation=1',
        [current.sessionId],
      ),
    ).toHaveLength(0);
    const [family] = await fixture.db.query<{ revocation_reason: string }[]>(
      'SELECT revocation_reason FROM auth_sessions WHERE id=$1',
      [current.sessionId],
    );
    expect(family.revocation_reason).toBeNull();
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
