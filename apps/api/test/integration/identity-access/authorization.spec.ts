import { randomUUID } from 'node:crypto';
import { Controller, Get, Req, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import { type AuthenticatedRequest } from '../../../src/modules/identity-access/authorization/auth.guard';
import { Roles } from '../../../src/modules/identity-access/authorization/roles.guard';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

@Controller('_test/authorization')
class AuthorizationProbeController {
  @Get('protected')
  protected(@Req() request: AuthenticatedRequest) {
    return request.principal;
  }

  @Get('admin')
  @Roles('ADMIN')
  admin(@Req() request: AuthenticatedRequest) {
    return { userId: request.principal.userId };
  }
}

describe.sequential('authorization guard bindings', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let app: INestApplication<Server>;
  let tokens: AccessTokenService;

  beforeAll(async () => {
    fixture = await registrationFixture();
    const module = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(databaseOptions()), IdentityAccessModule],
      controllers: [AuthorizationProbeController],
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
    tokens = app.get(AccessTokenService);
  });

  beforeEach(async () => fixture.clear());
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (fixture) await fixture.close();
    }
  });

  const token = (role: 'CUSTOMER' | 'ADMIN', userId = randomUUID()) =>
    tokens.issue({ sub: userId, sid: randomUUID(), role });

  it('binds default authentication and ADMIN role metadata to verified principals', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/_test/authorization/protected')
      .expect(401);
    const customerId = randomUUID();
    const customer = token('CUSTOMER', customerId);
    const protectedResponse = await request(app.getHttpServer())
      .get('/api/v1/_test/authorization/protected?role=ADMIN&userId=forged')
      .set('Authorization', `Bearer ${customer}`)
      .expect(200);
    expect(protectedResponse.body).toMatchObject({
      userId: customerId,
      role: 'CUSTOMER',
    });
    expect(protectedResponse.body).not.toHaveProperty('sub');
    await request(app.getHttpServer())
      .get('/api/v1/_test/authorization/admin')
      .set('Authorization', `Bearer ${customer}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/_test/authorization/admin')
      .set('Authorization', `Bearer ${token('ADMIN')}`)
      .expect(200);
  });

  it('ignores forged authority on a protected IAM operation and revokes only the principal owner', async () => {
    const customerId = randomUUID();
    const adminId = randomUUID();
    for (const [id, email, role] of [
      [customerId, 'customer@example.test', 'CUSTOMER'],
      [adminId, 'admin@example.test', 'ADMIN'],
    ] as const)
      await fixture.db.query(
        `INSERT INTO users
         (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
         VALUES ($1,$2,$3,'LOCAL',$4,'ACTIVE',now(),now(),now())`,
        [id, email, await fixture.crypto.hashPassword('Strong Password'), role],
      );
    const sessions = app.get(SessionService);
    const customerSession = await fixture.db.transaction((manager) =>
      sessions.issue(manager, customerId),
    );
    const adminSession = await fixture.db.transaction((manager) =>
      sessions.issue(manager, adminId),
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${customerSession.accessToken}`)
      .send({ role: 'ADMIN', userId: adminId, ownerId: adminId })
      .expect(204);

    const rows = await fixture.db.query<
      { user_id: string; revoked_at: Date | null }[]
    >('SELECT user_id,revoked_at FROM auth_sessions ORDER BY user_id');
    expect(rows.find((row) => row.user_id === customerId)?.revoked_at).not.toBe(
      null,
    );
    expect(rows.find((row) => row.user_id === adminId)?.revoked_at).toBeNull();
    expect(adminSession.accessToken).toBeTruthy();
  });
});
