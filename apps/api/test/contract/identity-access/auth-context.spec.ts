import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProblemFilter } from '../../../src/common/errors/problem.filter';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import {
  IDENTITY_CONFIG,
  IdentityAccessModule,
} from '../../../src/modules/identity-access/identity-access.module';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

const ORIGIN = 'http://localhost:3000';
const pair = (setCookie: string) => setCookie.split(';')[0];

/** 006 T008: provision / confirm / reserve HTTP contract. */
describe.sequential('auth context HTTP contract', () => {
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
  beforeEach(async () => {
    await fixture.clear();
    await fixture.db.query(
      'TRUNCATE auth_cookie_names, auth_intents, auth_contexts CASCADE',
    );
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (fixture) await fixture.close();
    }
  });

  const http = () => request(app.getHttpServer());

  async function provision(cookies: string[] = []) {
    const response = await http()
      .post('/api/v1/auth/contexts')
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.join('; '))
      .send({});
    return response;
  }

  async function active(cookies: string[] = []) {
    const created = await provision(cookies);
    expect(created.status).toBe(201);
    const contextId = (created.body as { contextId: string }).contextId;
    const binding = pair(created.headers['set-cookie'][0]);
    const confirmed = await http()
      .post(`/api/v1/auth/contexts/${contextId}/confirm`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', [...cookies, binding].join('; '))
      .send({})
      .expect(200);
    return { contextId, binding, confirmed };
  }

  it('provisions a PROVISIONAL context and emits one provisional binding cookie', async () => {
    const response = await provision();
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'authProtocol',
      'contextId',
      'revision',
      'state',
    ]);
    expect(body).toMatchObject({
      authProtocol: 2,
      state: 'PROVISIONAL',
      revision: 0,
    });
    expect(body.contextId).toMatch(/^[0-9a-f-]{36}$/);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    const id = (response.body as { contextId: string }).contextId;
    expect(cookies[0]).toMatch(new RegExp(`^wa_cb_${id}=[A-Za-z0-9_-]{43};`));
    expect(cookies[0]).toContain('Path=/;');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
    expect(cookies[0]).toContain('Max-Age=900');
  });

  it('requires the exact Origin and an empty JSON body', async () => {
    await http().post('/api/v1/auth/contexts').send({}).expect(403);
    await http()
      .post('/api/v1/auth/contexts')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    const extra = await http()
      .post('/api/v1/auth/contexts')
      .set('Origin', ORIGIN)
      .send({ attemptId: 'x' });
    expect(extra.status).toBe(422);
    expect(extra.headers['set-cookie']).toBeUndefined();
  });

  it('confirms only with exactly one matching binding cookie', async () => {
    const created = await provision();
    const contextId = (created.body as { contextId: string }).contextId;
    const binding = pair(created.headers['set-cookie'][0]);
    const confirm = (cookie: string, header = contextId) =>
      http()
        .post(`/api/v1/auth/contexts/${contextId}/confirm`)
        .set('Origin', ORIGIN)
        .set('X-Auth-Context', header)
        .set('Cookie', cookie)
        .send({});
    for (const bad of [
      '',
      `wa_cb_${contextId}=${'A'.repeat(43)}`,
      `${binding}; ${binding}`,
    ]) {
      const response = await confirm(bad);
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ code: 'BINDING_INVALID' });
    }
    const mismatch = await confirm(
      binding,
      '00000000-0000-4000-8000-000000000000',
    );
    expect(mismatch.status).toBe(401);
    const ok = await confirm(binding);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({
      authProtocol: 2,
      contextId,
      state: 'ACTIVE',
      revision: 0,
      sessionTag: null,
    });
    expect(ok.headers['set-cookie'][0]).toContain('Max-Age=2592000');
    expect(pair(ok.headers['set-cookie'][0])).toBe(binding);
  });

  it('reserves with expected-revision CAS and reports STALE_REVISION read-only', async () => {
    const { contextId, binding } = await active();
    const reserve = (expectedRevision: number, kind = 'LOCAL_LOGIN') =>
      http()
        .post(`/api/v1/auth/contexts/${contextId}/intents`)
        .set('Origin', ORIGIN)
        .set('X-Auth-Context', contextId)
        .set('Cookie', binding)
        .send({ kind, expectedRevision });
    const first = await reserve(0);
    expect(first.status).toBe(201);
    const reserved = first.body as Record<string, unknown>;
    expect(Object.keys(reserved).sort()).toEqual([
      'authProtocol',
      'expiresAt',
      'intentId',
      'kind',
      'revision',
    ]);
    expect(reserved).toMatchObject({
      authProtocol: 2,
      kind: 'LOCAL_LOGIN',
      revision: 1,
    });
    expect(reserved.intentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof reserved.expiresAt).toBe('string');
    const stale = await reserve(0);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      code: 'STALE_REVISION',
      currentRevision: 1,
    });
    const [{ revision }] = await fixture.db.query<{ revision: string }[]>(
      'SELECT revision::text FROM auth_contexts WHERE id=$1',
      [contextId],
    );
    expect(revision).toBe('1');
    const unknownField = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: 1, contextId });
    expect(unknownField.status).toBe(422);
  });

  it('reads intent outcomes without emitting cookies and enforces context binding', async () => {
    const { contextId, binding } = await active();
    const reserved = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: 0 })
      .expect(201);
    const intentId = (reserved.body as { intentId: string }).intentId;
    const outcome = await http()
      .get(`/api/v1/auth/contexts/${contextId}/intents/${intentId}`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .expect(200);
    expect(outcome.headers['cache-control']).toBe('no-store');
    expect(outcome.headers['set-cookie']).toBeUndefined();
    expect(outcome.body).toEqual({
      authProtocol: 2,
      intentId,
      state: 'RESERVED',
      outcomeCode: null,
      contextRevision: 1,
      currentSessionTag: null,
    });
    await http()
      .get(`/api/v1/auth/contexts/${contextId}/intents/${intentId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', binding)
      .expect(401);
    await http()
      .get(
        `/api/v1/auth/contexts/${contextId}/intents/00000000-0000-4000-8000-000000000000`,
      )
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .expect(404);
  });

  it('reports an elapsed reserved intent as EXPIRED while it remains retained', async () => {
    const { contextId, binding } = await active();
    const reserved = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: 0 })
      .expect(201);
    const intentId = (reserved.body as { intentId: string }).intentId;
    await fixture.db.query(
      "UPDATE auth_intents SET created_at=now()-interval '2 seconds',expires_at=now()-interval '1 second' WHERE id=$1",
      [intentId],
    );
    const response = await http()
      .get(`/api/v1/auth/contexts/${contextId}/intents/${intentId}`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .expect(200);
    expect(response.body).toMatchObject({
      intentId,
      state: 'EXPIRED',
      outcomeCode: null,
    });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects reservation on a PROVISIONAL or RETIRED context', async () => {
    const created = await provision();
    const contextId = (created.body as { contextId: string }).contextId;
    const binding = pair(created.headers['set-cookie'][0]);
    const response = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: 0 });
    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({ code: 'CONTEXT_UNAVAILABLE' });
  });

  it('rejects new names with CAPACITY_EXHAUSTED before emitting any cookie', async () => {
    const { contextId, binding } = await active();
    const [{ group_id }] = await fixture.db.query<{ group_id: string }[]>(
      'SELECT group_id FROM auth_contexts WHERE id=$1',
      [contextId],
    );
    // Fill the group with unresolved emissions up to CAP_NAMES.
    for (let i = 0; i < fixture.config.authContext.capNames - 1; i++)
      await fixture.db.query(
        `INSERT INTO auth_cookie_names (group_id,name,kind,owner_session_id,last_set_digest,unresolved_set,bytes)
         VALUES ($1,$2,'SLOT',gen_random_uuid(),$3,true,80)`,
        [group_id, `wa_s_${String(i).padStart(22, 'x')}`, Buffer.alloc(32, i)],
      );
    const response = await provision([binding]);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'CAPACITY_EXHAUSTED' });
    expect(response.headers['set-cookie']).toBeUndefined();
    const login = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: 0 });
    expect(login.status).toBe(409);
    expect(login.body).toMatchObject({ code: 'CAPACITY_EXHAUSTED' });
    const logout = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'LOGOUT', expectedRevision: 0, expectedSessionTag: null });
    expect(logout.status).toBe(201);
  });

  it('requires an explicit expectedSessionTag for LOGOUT but accepts null', async () => {
    const ctx = await active();
    const revision = (ctx.confirmed.body as { revision: number }).revision;
    const endpoint = `/api/v1/auth/contexts/${ctx.contextId}/intents`;
    const reserve = () =>
      http()
        .post(endpoint)
        .set('Origin', ORIGIN)
        .set('X-Auth-Context', ctx.contextId)
        .set('Cookie', ctx.binding);

    await reserve()
      .send({ kind: 'LOGOUT', expectedRevision: revision })
      .expect(422);
    await reserve()
      .send({
        kind: 'LOGOUT',
        expectedRevision: revision,
        expectedSessionTag: null,
      })
      .expect(201);
  });

  it('rate limits provisioning per IP', async () => {
    const limit = fixture.config.rates.AUTH_CONTEXT_PROVISION.limit;
    for (let i = 0; i < limit; i++)
      expect((await provision()).status).toBe(201);
    const limited = await provision();
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
