import type { Server } from 'node:http';
import { createRequire } from 'node:module';
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

const { validateSchema } = createRequire(__filename)(
  '../../../scripts/validate-iam-contract.cjs',
) as { validateSchema: (name: string, value: unknown) => boolean };

interface CustomerPageBody {
  items: { id: string; role: string }[];
  page: { hasMore: boolean; nextCursor: string | null };
}
type AdminCustomerBody = Record<string, unknown>;

describe.sequential('Admin Customer HTTP contract', () => {
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

  async function seed(role: 'ADMIN' | 'CUSTOMER', email: string) {
    const [{ id }] = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,display_name,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL',$3,'ACTIVE',now(),$4,now(),now()) RETURNING id`,
      [
        email,
        await fixture.crypto.hashPassword('Contract password!'),
        role,
        email.split('@')[0],
      ],
    );
    const session = await fixture.db.transaction((manager) =>
      app.get(SessionService).issue(manager, id),
    );
    return { id, token: session.accessToken };
  }
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('requires ADMIN and lists only filtered Customers with an opaque bound cursor', async () => {
    const admin = await seed('ADMIN', 'admin@example.test');
    const customer = await seed('CUSTOMER', 'alice@example.test');
    await seed('CUSTOMER', 'bob@example.test');

    await request(app.getHttpServer())
      .get('/api/v1/admin/customers')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/customers')
      .set(bearer(customer.token))
      .expect(403);
    const first = await request(app.getHttpServer())
      .get('/api/v1/admin/customers?limit=1&status=ACTIVE&q=example')
      .set(bearer(admin.token))
      .expect(200);
    const firstBody = first.body as CustomerPageBody;
    expect(validateSchema('CustomerPage', firstBody)).toBe(true);
    expect(firstBody.items).toHaveLength(1);
    expect(firstBody.items[0].role).toBe('CUSTOMER');
    expect(firstBody.page).toMatchObject({ hasMore: true });
    expect(firstBody.page.nextCursor).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );

    const second = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/customers?limit=1&status=ACTIVE&q=example&cursor=${firstBody.page.nextCursor}`,
      )
      .set(bearer(admin.token))
      .expect(200);
    const secondBody = second.body as CustomerPageBody;
    expect(secondBody.items).toHaveLength(1);
    expect(secondBody.items[0].id).not.toBe(firstBody.items[0].id);
    await request(app.getHttpServer())
      .get(
        `/api/v1/admin/customers?limit=1&status=LOCKED&q=example&cursor=${firstBody.page.nextCursor}`,
      )
      .set(bearer(admin.token))
      .expect(422);
  });

  it('returns a closed safe Customer detail', async () => {
    const admin = await seed('ADMIN', 'admin@example.test');
    const customer = await seed('CUSTOMER', 'detail@example.test');
    const response = await request(app.getHttpServer())
      .get(`/api/v1/admin/customers/${customer.id}`)
      .set(bearer(admin.token))
      .expect(200);
    const responseBody = response.body as AdminCustomerBody;
    expect(validateSchema('AdminCustomer', responseBody)).toBe(true);
    expect(Object.keys(responseBody).sort()).toEqual(
      [
        'avatarUrl',
        'createdAt',
        'displayName',
        'email',
        'emailVerified',
        'id',
        'loginMethod',
        'phoneNumber',
        'role',
        'status',
        'updatedAt',
      ].sort(),
    );
    expect(JSON.stringify(responseBody)).not.toMatch(
      /password|token|credential|identity/i,
    );
    await request(app.getHttpServer())
      .get(`/api/v1/admin/customers/${admin.id}`)
      .set(bearer(admin.token))
      .expect(404);
  });

  it('exposes only lock and unlock mutations for Customer targets', async () => {
    const admin = await seed('ADMIN', 'admin@example.test');
    const customer = await seed('CUSTOMER', 'target@example.test');
    await request(app.getHttpServer())
      .post(`/api/v1/admin/customers/${customer.id}/lock`)
      .set(bearer(admin.token))
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/customers/${customer.id}/unlock`)
      .set(bearer(admin.token))
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/customers/${admin.id}/lock`)
      .set(bearer(admin.token))
      .expect(404);
    for (const method of ['delete', 'patch'] as const) {
      const operation = request(app.getHttpServer());
      await (
        method === 'delete'
          ? operation.delete(`/api/v1/admin/customers/${customer.id}`)
          : operation.patch(`/api/v1/admin/customers/${customer.id}`)
      )
        .set(bearer(admin.token))
        .send({ role: 'ADMIN' })
        .expect(404);
    }
  });

  it.each([
    '/api/v1/admin/customers?limit=0',
    '/api/v1/admin/customers?limit=101',
    `/api/v1/admin/customers?q=${'x'.repeat(101)}`,
    '/api/v1/admin/customers?status=ADMIN',
    '/api/v1/admin/customers?cursor=not-signed',
  ])('rejects invalid list query %s', async (path) => {
    const admin = await seed('ADMIN', 'admin@example.test');
    await request(app.getHttpServer())
      .get(path)
      .set(bearer(admin.token))
      .expect(422);
  });
});
