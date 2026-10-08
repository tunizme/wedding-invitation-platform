import { BrowserSecurityService } from '../../../src/modules/identity-access/auth/browser-security.service';
import { AuthContextService } from '../../../src/modules/identity-access/context/auth-context.service';
import { AuthIntentService } from '../../../src/modules/identity-access/context/auth-intent.service';
import { CookieLedgerService } from '../../../src/modules/identity-access/context/cookie-ledger.service';
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
const firstCookie = (value: string) => value.split(';')[0];

describe.sequential('intent outcome contract', () => {
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

  it('returns only the bound intent receipt without Set-Cookie and retains EXPIRED state', async () => {
    const http = () => request(app.getHttpServer());
    const created = await http()
      .post('/api/v1/auth/contexts')
      .set('Origin', ORIGIN)
      .send({})
      .expect(201);
    const contextId = (created.body as { contextId: string }).contextId;
    const binding = firstCookie(created.headers['set-cookie'][0]);
    await http()
      .post(`/api/v1/auth/contexts/${contextId}/confirm`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({})
      .expect(200);
    const reserve = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: 0 })
      .expect(201);
    const intentId = (reserve.body as { intentId: string }).intentId;
    await fixture.db.query(
      "UPDATE auth_intents SET created_at=now()-interval '2 seconds', expires_at=now()-interval '1 second' WHERE id=$1",
      [intentId],
    );

    const receipt = await http()
      .get(`/api/v1/auth/contexts/${contextId}/intents/${intentId}`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', binding)
      .expect(200);
    expect(receipt.headers['cache-control']).toBe('no-store');
    expect(receipt.headers['set-cookie']).toBeUndefined();
    expect(receipt.body).toEqual({
      authProtocol: 2,
      intentId,
      state: 'EXPIRED',
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

  it('co-present outcome HTTP lookups never mutate groups, activity or capacity and never emit cookies', async () => {
    const browser = app.get(BrowserSecurityService);
    const contexts = app.get(AuthContextService);
    const intents = app.get(AuthIntentService);
    const ledger = app.get(CookieLedgerService);
    const req = (jar: Map<string, string>, id?: string) => ({
      headers: {
        cookie: [...jar].map(([n, v]) => `${n}=${v}`).join('; '),
        ...(id ? { 'x-auth-context': id } : {}),
      },
      ip: '127.0.0.1',
    });
    const create = async () => {
      const created = await contexts.provision(req(new Map()));
      const jar = new Map([
        [browser.bindingCookieName(created.contextId), created.secret],
      ]);
      await contexts.confirm(req(jar, created.contextId), created.contextId);
      const reserved = await intents.reserve(
        req(jar, created.contextId),
        created.contextId,
        { kind: 'LOCAL_LOGIN', expectedRevision: 0 },
      );
      const [row] = await fixture.db.query<{ group_id: string }[]>(
        'SELECT group_id FROM auth_contexts WHERE id=$1',
        [created.contextId],
      );
      return {
        jar,
        contextId: created.contextId,
        reserved,
        group: row.group_id,
      };
    };
    const pair = [await create(), await create()].sort((a, b) =>
      a.group.localeCompare(b.group),
    );
    const [survivor, losing] = pair;
    await fixture.db.transaction(async (manager) => {
      for (let i = 0; i < fixture.config.authContext.capNames - 1; i++)
        await ledger.recordSet(manager, losing.group, {
          name: browser.slotCookieName(String(i).padStart(22, 'Q')),
          kind: 'SLOT',
          ownerSessionId: '00000000-0000-4000-8000-00000000000' + i,
          value: `v${i}`,
        });
    });
    await fixture.db.query(
      "UPDATE auth_contexts SET last_seen_at=now()-interval '2 minutes'",
    );
    const cookie = req(new Map([...survivor.jar, ...losing.jar])).headers
      .cookie;
    const snapshot = async () => ({
      contexts: await fixture.db.query<unknown[]>(
        'SELECT id,group_id,last_seen_at,revision,current_intent_id,current_session_id FROM auth_contexts ORDER BY id',
      ),
      ledger: await fixture.db.query<unknown[]>(
        "SELECT md5(string_agg(row_to_json(n)::text, '' ORDER BY group_id,name)) AS fingerprint FROM auth_cookie_names n",
      ),
    });
    const before = await snapshot();
    const lookup = (id: string) =>
      request(app.getHttpServer())
        .get(`/api/v1/auth/contexts/${survivor.contextId}/intents/${id}`)
        .set('Origin', ORIGIN)
        .set('X-Auth-Context', survivor.contextId)
        .set('Cookie', cookie);
    const valid = await lookup(survivor.reserved.intentId).expect(200);
    expect(valid.headers['set-cookie']).toBeUndefined();
    expect(valid.headers['cache-control']).toBe('no-store');
    expect((valid.body as { state: string }).state).toBe('RESERVED');
    expect(await snapshot()).toEqual(before);
    await fixture.db.query(
      "UPDATE auth_intents SET created_at=now()-interval '2 seconds',expires_at=now()-interval '1 second' WHERE id=$1",
      [survivor.reserved.intentId],
    );
    const expired = await lookup(survivor.reserved.intentId).expect(200);
    expect((expired.body as { state: string }).state).toBe('EXPIRED');
    expect(expired.headers['set-cookie']).toBeUndefined();
    expect(await snapshot()).toEqual(before);
    const missing = await lookup('00000000-0000-4000-8000-000000000000').expect(
      404,
    );
    expect(missing.headers['set-cookie']).toBeUndefined();
    expect(await snapshot()).toEqual(before);
    const refused = await request(app.getHttpServer())
      .post('/api/v1/auth/contexts')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({})
      .expect(409);
    expect((refused.body as { code: string }).code).toBe('CAPACITY_EXHAUSTED');
    expect(refused.headers['set-cookie']).toBeUndefined();
    expect(await snapshot()).toEqual(before);
  });
});
