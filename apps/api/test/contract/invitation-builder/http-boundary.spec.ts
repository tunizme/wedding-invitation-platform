import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { BuilderProblemException } from '../../../src/common/errors/public-problem.exception';
import { configureRequestBoundaries } from '../../../src/common/http/request-boundaries';
import { StorageUnavailableError } from '../../../src/modules/invitation-assets/domain/asset-store.port';

const problem = (response: request.Response) =>
  response.body as {
    code: string;
    issues: { path: string; code: string; nodeId?: string }[];
  };

@Controller()
class BoundaryProbe {
  @Post([
    'admin/templates/example/draft',
    'invitations/example/data',
    'public/invitations/example/rsvps',
    'auth/login',
    'invitations/example/guests/import',
    'admin/invitations/example/guests/import',
  ])
  echo(@Body() body: unknown) {
    return { parsed: !!body };
  }
  @Patch('admin/invitations/example/draft')
  draft(@Body() body: unknown) {
    return { parsed: !!body };
  }
  @Get('probe/issues')
  issues() {
    throw new BuilderProblemException(
      422,
      'DOCUMENT_INVALID',
      Array.from({ length: 150 }, () => ({
        path: '/bride/secret-name',
        code: 'SECRET_CUSTOMER_VALUE',
        nodeId: 'customer-secret',
      })),
    );
  }
  @Get('probe/runtime')
  runtime() {
    throw new Error('private SQL and credentials');
  }
  @Get('probe/storage')
  storage() {
    throw new StorageUnavailableError();
  }
  @Get('probe/queue')
  queue() {
    throw new BuilderProblemException(503, 'RENDER_QUEUE_FULL', [], 5);
  }
}
describe('builder HTTP boundaries alongside IAM', () => {
  let app: INestApplication<Server>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BoundaryProbe],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api/v1');
    configureRequestBoundaries(app, 'http://localhost:3000');
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('allows a large template while retaining invitation, RSVP and IAM bounds', async () => {
    for (const [path, accepted, rejected] of [
      ['admin/templates/example/draft', 1200000, 1572864],
      ['invitations/example/data', 270000, 278528],
      ['public/invitations/example/rsvps', 7000, 8192],
      ['auth/login', 90000, 102400],
    ] as const) {
      await request(app.getHttpServer())
        .post('/api/v1/' + path)
        .send({ data: 'a'.repeat(accepted) })
        .expect(201);
      const response = await request(app.getHttpServer())
        .post('/api/v1/' + path)
        .send({ data: 'a'.repeat(rejected) })
        .expect(413);
      expect(problem(response).code).toBe('PAYLOAD_TOO_LARGE');
    }
  });
  it('accepts managed drafts near 1 MiB and large guest imports on both role routes', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/invitations/example/draft')
      .send({ data: 'a'.repeat(1024 * 1024 - 100) })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/invitations/example/draft')
      .send({ data: 'a'.repeat(1536 * 1024) })
      .expect(413);
    const guests = Array.from({ length: 1000 }, (_, index) => ({
      name: `Khách ${index} ${'Á'.repeat(90)}`,
      group: 'Nhóm gia đình '.repeat(6),
    }));
    expect(Buffer.byteLength(JSON.stringify({ guests }))).toBeGreaterThan(
      272 * 1024,
    );
    for (const prefix of ['invitations', 'admin/invitations']) {
      await request(app.getHttpServer())
        .post(`/api/v1/${prefix}/example/guests/import`)
        .send({ guests })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/${prefix}/example/guests/import`)
        .send({ data: 'a'.repeat(1536 * 1024) })
        .expect(413);
    }
  });
  it('rejects malformed JSON and unsupported encoding without reflecting input', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/templates/example/draft')
      .type('json')
      .send('{"private":"value"')
      .expect(400);
    expect(JSON.stringify(response.body)).not.toContain('private');
    await request(app.getHttpServer())
      .post('/api/v1/admin/templates/example/draft')
      .set('Content-Type', 'application/json; charset=invalid')
      .send('{}')
      .expect(415);
  });
  it('caps and sanitizes issue paths/codes and hides runtime details', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/probe/issues')
      .expect(422);
    expect(problem(response).issues).toHaveLength(100);
    expect(problem(response).issues[0]).toEqual({
      path: '/bride/field',
      code: 'INVALID_VALUE',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/secret|CUSTOMER_VALUE/);
    const failure = await request(app.getHttpServer())
      .get('/api/v1/probe/runtime')
      .expect(500);
    expect(problem(failure).code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(failure.body)).not.toMatch(/SQL|credentials/);
    const storage = await request(app.getHttpServer())
      .get('/api/v1/probe/storage')
      .expect(503);
    expect(problem(storage).code).toBe('STORAGE_UNAVAILABLE');
    await request(app.getHttpServer())
      .get('/api/v1/probe/queue')
      .expect(503)
      .expect('Retry-After', '5');
  });
  it('keeps exact-origin credentials and exposes mutation headers', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/v1/assets/example')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'DELETE')
      .set('Access-Control-Request-Headers', 'Idempotency-Key')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-methods']).toContain(
      'DELETE',
    );
    expect(response.headers['access-control-allow-headers']).toContain(
      'Idempotency-Key',
    );
    const get = await request(app.getHttpServer())
      .get('/api/v1/probe/storage')
      .set('Origin', 'http://localhost:3000');
    expect(get.headers['access-control-expose-headers']).toContain('Location');
    const foreign = await request(app.getHttpServer())
      .options('/api/v1/assets/example')
      .set('Origin', 'https://foreign.invalid')
      .set('Access-Control-Request-Method', 'DELETE');
    expect(foreign.headers['access-control-allow-origin']).not.toBe(
      'https://foreign.invalid',
    );
  });
});
