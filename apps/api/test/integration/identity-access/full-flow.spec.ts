import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { CustomerStatusService } from '../../../src/modules/identity-access/admin/customer-status.service';
import { LocalLoginService } from '../../../src/modules/identity-access/auth/local-login.service';
import { RefreshService } from '../../../src/modules/identity-access/auth/refresh.service';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { RetentionWorker } from '../../../src/modules/identity-access/infrastructure/retention.worker';
import { ProfileService } from '../../../src/modules/identity-access/profile/profile.service';
import { LocalVerificationService } from '../../../src/modules/identity-access/verification/local-verification.service';
import { PasswordResetService } from '../../../src/modules/identity-access/verification/password-reset.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('IAM local full flow', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  let mail: EmailOutboxWorker;

  beforeAll(async () => {
    fixture = await registrationFixture();
    mail = new EmailOutboxWorker(
      fixture.db,
      fixture.crypto,
      { send: () => Promise.resolve('full-flow-accepted') },
      fixture.config.frontendOrigin,
    );
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(databaseOptions()), IdentityAccessModule],
    })
      .overrideProvider(IDENTITY_CONFIG)
      .useValue(fixture.config)
      .overrideProvider(EmailOutboxWorker)
      .useValue({})
      .overrideProvider(RetentionWorker)
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

  async function pendingProof(purpose: string): Promise<string> {
    const [row] = await fixture.db.query<
      {
        outbox_id: string;
        payload_ciphertext: Buffer;
        encryption_key_version: number;
      }[]
    >(
      `SELECT o.id AS outbox_id,o.payload_ciphertext,o.encryption_key_version
       FROM email_outbox o JOIN auth_challenges c ON c.id=o.challenge_id
       WHERE c.purpose=$1 AND o.status='PENDING'
       ORDER BY c.generation DESC LIMIT 1`,
      [purpose],
    );
    expect(row).toBeDefined();
    return fixture.crypto.decrypt(
      {
        ciphertext: row.payload_ciphertext,
        keyVersion: row.encryption_key_version,
      },
      `outbox:${row.outbox_id}`,
    );
  }

  it('registers, verifies, logs in, rotates, updates, resets, and applies Admin lock/unlock', async () => {
    const email = 'full-flow@example.test';
    const initialPassword = 'Initial full-flow password 🔐';
    const resetPassword = 'Reset full-flow password 🔑';

    await fixture.register.register(email, initialPassword);
    const verificationProof = await pendingProof('LOCAL_EMAIL_VERIFICATION');
    await expect(
      app.get(LocalLoginService).login(email, initialPassword),
    ).rejects.toMatchObject({ status: 403 });
    await mail.runOnce();
    await app.get(LocalVerificationService).confirm(verificationProof);

    const login = await app
      .get(LocalLoginService)
      .login(email, initialPassword);
    expect(login.session.accessToken).toBeTruthy();
    const rotated = await app
      .get(RefreshService)
      .rotate(login.session.refreshToken);
    expect(rotated.refreshToken).not.toBe(login.session.refreshToken);

    const profile = await app.get(ProfileService).update(login.user.id, {
      displayName: 'Full Flow Customer',
      phoneNumber: '+84901234567',
    });
    expect(profile).toMatchObject({
      displayName: 'Full Flow Customer',
      phoneNumber: '+84901234567',
    });

    await app.get(PasswordResetService).request(email);
    const resetProof = await pendingProof('PASSWORD_RESET');
    await mail.runOnce();
    await app.get(PasswordResetService).confirm(resetProof, resetPassword);
    await expect(
      app.get(RefreshService).rotate(rotated.refreshToken),
    ).rejects.toBeDefined();
    await expect(
      app.get(LocalLoginService).login(email, initialPassword),
    ).rejects.toBeDefined();
    const afterReset = await app
      .get(LocalLoginService)
      .login(email, resetPassword);

    const [{ id: adminId }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),'full-flow-admin@example.test',$1,'LOCAL','ADMIN','ACTIVE',now(),now(),now())
       RETURNING id`,
      [await fixture.crypto.hashPassword('Admin full-flow password 🔒')],
    );
    const status = app.get(CustomerStatusService);
    await status.change(adminId, login.user.id, 'LOCK', 'full-flow-lock');
    await expect(
      app.get(RefreshService).rotate(afterReset.session.refreshToken),
    ).rejects.toBeDefined();
    await expect(
      app.get(LocalLoginService).login(email, resetPassword),
    ).rejects.toBeDefined();
    await status.change(adminId, login.user.id, 'UNLOCK', 'full-flow-unlock');
    await expect(
      app.get(LocalLoginService).login(email, resetPassword),
    ).resolves.toMatchObject({ user: { id: login.user.id, status: 'ACTIVE' } });

    const audits = await fixture.db.query<
      { action: string; request_id: string }[]
    >('SELECT action,request_id FROM admin_audit_events ORDER BY id');
    expect(audits).toEqual([
      { action: 'CUSTOMER_LOCKED', request_id: 'full-flow-lock' },
      { action: 'CUSTOMER_UNLOCKED', request_id: 'full-flow-unlock' },
    ]);
  });
});
