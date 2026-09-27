import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { RefreshService } from '../../../src/modules/identity-access/auth/refresh.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { ChangePasswordService } from '../../../src/modules/identity-access/profile/change-password.service';
import { PasswordResetService } from '../../../src/modules/identity-access/verification/password-reset.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('profile and password integration', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  const currentPassword = 'Current password 🔐';

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

  async function local(email: string) {
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
      [email, await fixture.crypto.hashPassword(currentPassword)],
    );
    const session = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, id),
    );
    return { id, ...session };
  }

  it('derives ownership only from the verified principal', async () => {
    const first = await local('first@example.test');
    const second = await local('second@example.test');
    const response = await request(app.getHttpServer())
      .patch('/api/v1/me?userId=' + second.id)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ displayName: 'Owner', userId: second.id })
      .expect(422);
    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });

    await request(app.getHttpServer())
      .patch('/api/v1/me?userId=' + second.id)
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ displayName: 'Owner' })
      .expect(200);
    const rows = await fixture.db.query<
      { id: string; display_name: string | null }[]
    >('SELECT id,display_name FROM users ORDER BY id');
    expect(rows.find((row) => row.id === first.id)?.display_name).toBe('Owner');
    expect(rows.find((row) => row.id === second.id)?.display_name).toBeNull();
  });

  it('keeps hash, version, sessions, and reset proofs unchanged for a wrong current password', async () => {
    const user = await local('wrong@example.test');
    await fixture.challenges.enqueuePasswordReset(
      fixture.db.manager,
      user.id,
      'wrong@example.test',
    );
    const before = {
      user: await fixture.db.query<Record<string, unknown>[]>(
        'SELECT password_hash,credential_version FROM users WHERE id=$1',
        [user.id],
      ),
      sessions: await fixture.db.query<Record<string, unknown>[]>(
        'SELECT id,revoked_at,revocation_reason FROM auth_sessions WHERE user_id=$1',
        [user.id],
      ),
      challenges: await fixture.db.query<Record<string, unknown>[]>(
        'SELECT id,status,revoked_at FROM auth_challenges WHERE user_id=$1',
        [user.id],
      ),
    };
    await expect(
      app
        .get(ChangePasswordService)
        .change(user.id, 'Wrong password', 'Replacement password 🔑'),
    ).rejects.toBeDefined();
    expect({
      user: await fixture.db.query<Record<string, unknown>[]>(
        'SELECT password_hash,credential_version FROM users WHERE id=$1',
        [user.id],
      ),
      sessions: await fixture.db.query<Record<string, unknown>[]>(
        'SELECT id,revoked_at,revocation_reason FROM auth_sessions WHERE user_id=$1',
        [user.id],
      ),
      challenges: await fixture.db.query<Record<string, unknown>[]>(
        'SELECT id,status,revoked_at FROM auth_challenges WHERE user_id=$1',
        [user.id],
      ),
    }).toEqual(before);
  });

  it('never creates a LOCAL credential for a social-only account', async () => {
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),'social@example.test',NULL,'GOOGLE','CUSTOMER','ACTIVE',now(),now(),now()) RETURNING id`,
    );
    await expect(
      app
        .get(ChangePasswordService)
        .change(id, 'Anything', 'Replacement password 🔑'),
    ).rejects.toMatchObject({ problemCode: 'PASSWORD_CHANGE_NOT_APPLICABLE' });
    const [user] = await fixture.db.query<
      { password_hash: null; credential_version: string }[]
    >('SELECT password_hash,credential_version FROM users WHERE id=$1', [id]);
    expect(user).toEqual({ password_hash: null, credential_version: '0' });
  });

  it('serializes change-password against refresh and leaves no refreshable session', async () => {
    const user = await local('refresh-race@example.test');
    const change = app
      .get(ChangePasswordService)
      .change(user.id, currentPassword, 'Replacement password 🔑');
    const rotate = app.get(RefreshService).rotate(user.refreshToken);
    const [changed, rotated] = await Promise.allSettled([change, rotate]);
    expect(changed.status).toBe('fulfilled');
    expect(['fulfilled', 'rejected']).toContain(rotated.status);
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [user.id],
      ),
    ).toHaveLength(0);
    const rows = await fixture.db.query<{ revocation_reason: string }[]>(
      'SELECT revocation_reason FROM auth_sessions WHERE user_id=$1',
      [user.id],
    );
    expect(
      rows.every((row) => row.revocation_reason === 'PASSWORD_CHANGE'),
    ).toBe(true);
  });

  it('allows exactly one winner when password change races password reset', async () => {
    const user = await local('change-reset-race@example.test');
    const worker = new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.resolve('accepted') },
      fixture.config.frontendOrigin,
    );
    await fixture.challenges.enqueuePasswordReset(
      fixture.db.manager,
      user.id,
      'change-reset-race@example.test',
    );
    const [row] = await fixture.db.query<
      {
        outbox_id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      `SELECT o.id AS outbox_id,o.payload_ciphertext,o.encryption_key_version
       FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id
       WHERE c.user_id=$1`,
      [user.id],
    );
    const proof = fixture.crypto.decrypt(
      {
        ciphertext: row.payload_ciphertext,
        keyVersion: row.encryption_key_version,
      },
      `outbox:${row.outbox_id}`,
    );
    await worker.runOnce();

    const results = await Promise.allSettled([
      app
        .get(ChangePasswordService)
        .change(user.id, currentPassword, 'Changed password 🔑'),
      app.get(PasswordResetService).confirm(proof, 'Reset password 🔒'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const [stored] = await fixture.db.query<
      { password_hash: string; credential_version: string }[]
    >('SELECT password_hash,credential_version FROM users WHERE id=$1', [
      user.id,
    ]);
    expect(stored.credential_version).toBe('1');
    expect(
      (await fixture.crypto.verifyPassword(
        stored.password_hash,
        'Changed password 🔑',
      )) ||
        (await fixture.crypto.verifyPassword(
          stored.password_hash,
          'Reset password 🔒',
        )),
    ).toBe(true);
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [user.id],
      ),
    ).toHaveLength(0);
    expect(
      await fixture.db.query(
        `SELECT id FROM auth_challenges
         WHERE user_id=$1 AND status IN ('ACTIVE','PENDING_DELIVERY')`,
        [user.id],
      ),
    ).toHaveLength(0);
  });

  it('invalidates active and pending reset proofs and rejects their later use', async () => {
    const user = await local('reset-race@example.test');
    const worker = new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.resolve('accepted') },
      fixture.config.frontendOrigin,
    );
    await fixture.challenges.enqueuePasswordReset(
      fixture.db.manager,
      user.id,
      'reset-race@example.test',
    );
    const [proofRow] = await fixture.db.query<
      {
        outbox_id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      `SELECT o.id AS outbox_id,o.payload_ciphertext,o.encryption_key_version
       FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id
       WHERE c.user_id=$1 ORDER BY c.generation LIMIT 1`,
      [user.id],
    );
    const proof = fixture.crypto.decrypt(
      {
        ciphertext: proofRow.payload_ciphertext,
        keyVersion: proofRow.encryption_key_version,
      },
      `outbox:${proofRow.outbox_id}`,
    );
    await worker.runOnce();
    await fixture.challenges.enqueuePasswordReset(
      fixture.db.manager,
      user.id,
      'reset-race@example.test',
    );

    await app
      .get(ChangePasswordService)
      .change(user.id, currentPassword, 'Replacement password 🔑');
    const states = await fixture.db.query<{ status: string }[]>(
      `SELECT status FROM auth_challenges
       WHERE user_id=$1 AND purpose='PASSWORD_RESET' ORDER BY generation`,
      [user.id],
    );
    expect(states).toEqual([{ status: 'REVOKED' }, { status: 'REVOKED' }]);
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-resets/confirm')
      .set('Origin', 'http://localhost:3000')
      .send({ proof, newPassword: 'Another password 🔒' })
      .expect(400);
  });

  it('rolls back password, version, session revocation, and proof invalidation together', async () => {
    const user = await local('rollback@example.test');
    await fixture.challenges.enqueuePasswordReset(
      fixture.db.manager,
      user.id,
      'rollback@example.test',
    );
    const before = await fixture.db.query<Record<string, unknown>[]>(
      'SELECT password_hash,credential_version FROM users WHERE id=$1',
      [user.id],
    );
    await fixture.db.query(
      `ALTER TABLE auth_sessions ADD CONSTRAINT test_change_rollback
       CHECK (revocation_reason IS DISTINCT FROM 'PASSWORD_CHANGE')`,
    );
    try {
      await expect(
        app
          .get(ChangePasswordService)
          .change(user.id, currentPassword, 'Replacement password 🔑'),
      ).rejects.toBeDefined();
    } finally {
      await fixture.db.query(
        'ALTER TABLE auth_sessions DROP CONSTRAINT test_change_rollback',
      );
    }
    expect(
      await fixture.db.query<Record<string, unknown>[]>(
        'SELECT password_hash,credential_version FROM users WHERE id=$1',
        [user.id],
      ),
    ).toEqual(before);
    expect(
      await fixture.db.query(
        `SELECT id FROM auth_challenges
         WHERE user_id=$1 AND status='PENDING_DELIVERY'`,
        [user.id],
      ),
    ).toHaveLength(1);
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [user.id],
      ),
    ).toHaveLength(1);
  });
});
