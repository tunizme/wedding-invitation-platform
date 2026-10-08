import type { Server } from 'node:http';
import { decode } from 'jsonwebtoken';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { PasswordResetService } from '../../../src/modules/identity-access/verification/password-reset.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('session revocation races and hard expiry', () => {
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
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
      [email, await fixture.crypto.hashPassword('Original Password')],
    );
    return {
      id,
      ...(await fixture.db.transaction((manager) =>
        app.get(SessionService).issue(manager, id),
      )),
    };
  }

  function csrf(current: Awaited<ReturnType<typeof issue>>) {
    return app.get(BrowserSecurityService).csrf({
      type: 'session',
      id: current.sessionId,
      seed: current.csrfSeed,
      keyVersion: current.csrfKeyVersion,
    });
  }

  function refresh(current: Awaited<ReturnType<typeof issue>>) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf(current))
      .set('Cookie', `wedding_rt=${current.refreshToken}`);
  }

  // T062 allowlist (FR-003/FR-014): legacy refresh cannot reach credential state.
  it('rejects legacy refresh at the absolute boundary and enforces exact 15-minute access expiry', async () => {
    const current = await issue('expiry@example.test');
    await fixture.db.query(
      `UPDATE auth_sessions SET created_at=now()-interval '14 days',absolute_expires_at=now()
       WHERE id=$1`,
      [current.sessionId],
    );
    await fixture.db.query(
      `UPDATE refresh_credentials SET issued_at=now()-interval '14 days',expires_at=now()
       WHERE session_id=$1`,
      [current.sessionId],
    );
    await refresh(current).expect(401);
    const [family] = await fixture.db.query<{ revocation_reason: string }[]>(
      'SELECT revocation_reason FROM auth_sessions WHERE id=$1',
      [current.sessionId],
    );
    expect(family.revocation_reason).toBeNull();

    const claims = decode(current.accessToken) as { iat: number };
    const tokens = app.get(AccessTokenService);
    expect(tokens.verify(current.accessToken, claims.iat + 899).userId).toBe(
      current.id,
    );
    expect(() => tokens.verify(current.accessToken, claims.iat + 900)).toThrow(
      'INVALID_ACCESS_TOKEN',
    );
  });

  it('rejects legacy refresh while logout-all revokes every session', async () => {
    const current = await issue('logout-race@example.test');
    const [rotated, loggedOut] = await Promise.all([
      refresh(current),
      request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${current.accessToken}`),
    ]);
    expect(rotated.status).toBe(401);
    expect(loggedOut.status).toBe(204);
    const [family] = await fixture.db.query<
      { revoked_at: Date | null; revocation_reason: string | null }[]
    >('SELECT revoked_at,revocation_reason FROM auth_sessions WHERE id=$1', [
      current.sessionId,
    ]);
    expect(family.revoked_at).not.toBeNull();
    expect(family.revocation_reason).toBe('LOGOUT_ALL');
    expect(
      await fixture.db.query(
        'SELECT id FROM refresh_credentials WHERE session_id=$1 AND generation=1',
        [current.sessionId],
      ),
    ).toHaveLength(0);
    expect(app.get(AccessTokenService).verify(current.accessToken).userId).toBe(
      current.id,
    );
  });

  it('rejects legacy refresh while password reset preserves reset revocation', async () => {
    const current = await issue('reset-race@example.test');
    const resets = app.get(PasswordResetService);
    await resets.request('reset-race@example.test');
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
    const [rotated] = await Promise.all([
      refresh(current),
      resets.confirm(proof, 'Replacement Password'),
    ]);
    expect(rotated.status).toBe(401);
    const [family] = await fixture.db.query<
      { revoked_at: Date | null; revocation_reason: string | null }[]
    >('SELECT revoked_at,revocation_reason FROM auth_sessions WHERE id=$1', [
      current.sessionId,
    ]);
    expect(family.revoked_at).not.toBeNull();
    expect(family.revocation_reason).toBe('PASSWORD_RESET');
  });
});
