import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { CustomerStatusService } from '../../../src/modules/identity-access/admin/customer-status.service';
import { LocalLoginService } from '../../../src/modules/identity-access/auth/local-login.service';
import { RefreshService } from '../../../src/modules/identity-access/auth/refresh.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { PasswordResetService } from '../../../src/modules/identity-access/verification/password-reset.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('Admin Customer transactional integration', () => {
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

  async function seed(
    role: 'ADMIN' | 'CUSTOMER',
    email: string,
    status = 'ACTIVE',
  ) {
    const password = 'Admin integration password!';
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL',$3,$4,now(),now(),now()) RETURNING id`,
      [email, await fixture.crypto.hashPassword(password), role, status],
    );
    return { id, email, password };
  }

  it('records CHANGED and NO_CHANGE audits and never restores revoked sessions', async () => {
    const actor = await seed('ADMIN', 'admin@example.test');
    const target = await seed('CUSTOMER', 'target@example.test');
    const session = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, target.id),
    );
    const service = app.get(CustomerStatusService);
    await service.change(actor.id, target.id, 'LOCK', 'request-lock-1');
    await service.change(actor.id, target.id, 'LOCK', 'request-lock-2');
    await expect(
      app.get(RefreshService).rotate(session.refreshToken),
    ).rejects.toBeDefined();
    await service.change(actor.id, target.id, 'UNLOCK', 'request-unlock-1');
    await service.change(actor.id, target.id, 'UNLOCK', 'request-unlock-2');

    const audits = await fixture.db.query<
      {
        action: string;
        outcome: string;
        previous_status: string;
        new_status: string;
        request_id: string;
      }[]
    >(
      `SELECT action,outcome,previous_status,new_status,request_id
       FROM admin_audit_events ORDER BY id`,
    );
    expect(audits).toEqual([
      {
        action: 'CUSTOMER_LOCKED',
        outcome: 'CHANGED',
        previous_status: 'ACTIVE',
        new_status: 'LOCKED',
        request_id: 'request-lock-1',
      },
      {
        action: 'CUSTOMER_LOCKED',
        outcome: 'NO_CHANGE',
        previous_status: 'LOCKED',
        new_status: 'LOCKED',
        request_id: 'request-lock-2',
      },
      {
        action: 'CUSTOMER_UNLOCKED',
        outcome: 'CHANGED',
        previous_status: 'LOCKED',
        new_status: 'ACTIVE',
        request_id: 'request-unlock-1',
      },
      {
        action: 'CUSTOMER_UNLOCKED',
        outcome: 'NO_CHANGE',
        previous_status: 'ACTIVE',
        new_status: 'ACTIVE',
        request_id: 'request-unlock-2',
      },
    ]);
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [target.id],
      ),
    ).toHaveLength(0);
  });

  it('rejects non-ADMIN actors and non-CUSTOMER targets without audit', async () => {
    const customerActor = await seed('CUSTOMER', 'actor@example.test');
    const customer = await seed('CUSTOMER', 'target@example.test');
    const adminTarget = await seed('ADMIN', 'other-admin@example.test');
    const service = app.get(CustomerStatusService);
    await expect(
      service.change(customerActor.id, customer.id, 'LOCK', 'denied-1'),
    ).rejects.toBeDefined();
    await expect(
      service.change(adminTarget.id, adminTarget.id, 'LOCK', 'denied-2'),
    ).rejects.toBeDefined();
    expect(
      await fixture.db.query('SELECT id FROM admin_audit_events'),
    ).toHaveLength(0);
  });

  it('rolls back status and session revocation when audit insertion fails', async () => {
    const actor = await seed('ADMIN', 'admin@example.test');
    const target = await seed('CUSTOMER', 'rollback@example.test');
    await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, target.id),
    );
    await fixture.db.query(`
      CREATE OR REPLACE FUNCTION reject_admin_audit() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'audit unavailable'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_admin_audit BEFORE INSERT ON admin_audit_events
      FOR EACH ROW EXECUTE FUNCTION reject_admin_audit();
    `);
    try {
      await expect(
        app
          .get(CustomerStatusService)
          .change(actor.id, target.id, 'LOCK', 'rollback'),
      ).rejects.toBeDefined();
    } finally {
      await fixture.db.query(
        'DROP TRIGGER reject_admin_audit ON admin_audit_events; DROP FUNCTION reject_admin_audit()',
      );
    }
    const [user] = await fixture.db.query<{ status: string }[]>(
      'SELECT status FROM users WHERE id=$1',
      [target.id],
    );
    expect(user.status).toBe('ACTIVE');
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [target.id],
      ),
    ).toHaveLength(1);
  });

  it('serializes lock against login and refresh so no refreshable session survives', async () => {
    const actor = await seed('ADMIN', 'admin@example.test');
    const target = await seed('CUSTOMER', 'race@example.test');
    const existing = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, target.id),
    );
    const outcomes = await Promise.allSettled([
      app.get(LocalLoginService).login(target.email, target.password),
      app.get(RefreshService).rotate(existing.refreshToken),
      app
        .get(CustomerStatusService)
        .change(actor.id, target.id, 'LOCK', 'race-lock'),
    ]);
    expect(outcomes[2].status).toBe('fulfilled');
    const [stored] = await fixture.db.query<{ status: string }[]>(
      'SELECT status FROM users WHERE id=$1',
      [target.id],
    );
    expect(stored.status).toBe('LOCKED');
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [target.id],
      ),
    ).toHaveLength(0);
  });

  it('serializes lock against password reset and leaves the account locked with no session', async () => {
    const actor = await seed('ADMIN', 'admin@example.test');
    const target = await seed('CUSTOMER', 'reset-race@example.test');
    await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, target.id),
    );
    await fixture.challenges.enqueuePasswordReset(
      fixture.db.manager,
      target.id,
      target.email,
    );
    const [row] = await fixture.db.query<
      {
        outbox_id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      `SELECT o.id AS outbox_id,o.payload_ciphertext,o.encryption_key_version
       FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id WHERE c.user_id=$1`,
      [target.id],
    );
    const proof = fixture.crypto.decrypt(
      {
        ciphertext: row.payload_ciphertext,
        keyVersion: row.encryption_key_version,
      },
      `outbox:${row.outbox_id}`,
    );
    const worker = new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.resolve('accepted') },
      fixture.config.frontendOrigin,
    );
    await worker.runOnce();
    await Promise.allSettled([
      app.get(PasswordResetService).confirm(proof, 'Replacement password!'),
      app
        .get(CustomerStatusService)
        .change(actor.id, target.id, 'LOCK', 'reset-lock'),
    ]);
    const [stored] = await fixture.db.query<{ status: string }[]>(
      'SELECT status FROM users WHERE id=$1',
      [target.id],
    );
    expect(stored.status).toBe('LOCKED');
    expect(
      await fixture.db.query(
        'SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',
        [target.id],
      ),
    ).toHaveLength(0);
  });
});
