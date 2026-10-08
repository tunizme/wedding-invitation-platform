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
const PASSWORD = 'Contract Password';

/** Minimal cookie jar: applies Set-Cookie like a browser (name-keyed, Max-Age=0 deletes). */
class Jar {
  private readonly cookies = new Map<string, string>();
  apply(setCookie: string[] | string | undefined) {
    for (const line of ([] as string[]).concat(setCookie ?? [])) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (attributes.some((attribute) => /^max-age=0$/i.test(attribute)))
        this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
  names() {
    return [...this.cookies.keys()];
  }
  clone() {
    const copy = new Jar();
    for (const [name, value] of this.cookies) copy.cookies.set(name, value);
    return copy;
  }
}

interface SessionBody {
  authProtocol: number;
  accessToken: string;
  csrfToken: string;
  sessionTag: string;
  contextRevision: number;
  user: { id: string; email: string };
}

/** 006 T027: session routes under CSP-1. */
describe.sequential('auth transition session HTTP contract', () => {
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

  async function user(email: string) {
    await fixture.db.query(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),$1,$2,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
      [email, await fixture.crypto.hashPassword(PASSWORD)],
    );
  }

  async function context(jar = new Jar()) {
    const created = await http()
      .post('/api/v1/auth/contexts')
      .set('Origin', ORIGIN)
      .set('Cookie', jar.header())
      .send({})
      .expect(201);
    jar.apply(created.headers['set-cookie']);
    const contextId = (created.body as { contextId: string }).contextId;
    const confirmed = await http()
      .post(`/api/v1/auth/contexts/${contextId}/confirm`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', jar.header())
      .send({})
      .expect(200);
    jar.apply(confirmed.headers['set-cookie']);
    return { jar, contextId };
  }

  async function reserve(
    ctx: { jar: Jar; contextId: string },
    kind: string,
    expectedRevision: number,
    expectedSessionTag?: string | null,
  ) {
    const response = await http()
      .post(`/api/v1/auth/contexts/${ctx.contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('Cookie', ctx.jar.header())
      .send({
        kind,
        expectedRevision,
        ...(expectedSessionTag !== undefined ? { expectedSessionTag } : {}),
      })
      .expect(201);
    return response.body as { intentId: string; revision: number };
  }

  async function login(
    ctx: { jar: Jar; contextId: string },
    email: string,
    expectedRevision: number,
  ) {
    const intent = await reserve(ctx, 'LOCAL_LOGIN', expectedRevision);
    const response = await http()
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Intent', intent.intentId)
      .set('Cookie', ctx.jar.header())
      .send({ email, password: PASSWORD });
    return { response, intent };
  }

  async function refresh(
    ctx: { jar: Jar; contextId: string },
    session: SessionBody,
  ) {
    return http()
      .post('/api/v1/auth/refresh')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Session-Tag', session.sessionTag)
      .set('X-CSRF-Token', session.csrfToken)
      .set('Cookie', ctx.jar.header());
  }

  it('rejects login without both protocol headers before issuing any session cookie', async () => {
    await user('headers@example.test');
    for (const headers of [
      {},
      { 'X-Auth-Context': '00000000-0000-4000-8000-000000000001' },
      { 'X-Auth-Intent': '00000000-0000-4000-8000-000000000002' },
    ]) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .set(headers)
        .send({ email: 'headers@example.test', password: PASSWORD })
        .expect(422);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('logs in under a reserved intent with an immutable session slot', async () => {
    await user('a@example.test');
    const ctx = await context();
    const { response } = await login(ctx, 'a@example.test', 0);
    expect(response.status).toBe(200);
    const body = response.body as SessionBody;
    expect(body).toMatchObject({ authProtocol: 2, contextRevision: 1 });
    expect(body.sessionTag).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(new RegExp(`^wa_s_${body.sessionTag}=`));
    expect(cookies[0]).toContain('Path=/api/v1/auth');
    expect(cookies.join(';')).not.toContain('wedding_rt=');
  });

  it('keeps the 003 login body allowlist and generic credential errors', async () => {
    await user('a@example.test');
    const ctx = await context();
    const intent = await reserve(ctx, 'LOCAL_LOGIN', 0);
    const send = (body: object) =>
      http()
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .set('X-Auth-Context', ctx.contextId)
        .set('X-Auth-Intent', intent.intentId)
        .set('Cookie', ctx.jar.header())
        .send(body);
    expect(
      (
        await send({
          email: 'a@example.test',
          password: PASSWORD,
          contextId: 'x',
        })
      ).status,
    ).toBe(422);
    const wrong = await send({
      email: 'a@example.test',
      password: 'Wrong Password',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('a superseded intent cannot establish a session', async () => {
    await user('a@example.test');
    await user('b@example.test');
    const ctx = await context();
    const intentA = await reserve(ctx, 'LOCAL_LOGIN', 0);
    const b = await login(ctx, 'b@example.test', 1);
    expect(b.response.status).toBe(200);
    const lateA = await http()
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Intent', intentA.intentId)
      .set('Cookie', ctx.jar.header())
      .send({ email: 'a@example.test', password: PASSWORD });
    expect(lateA.status).toBe(409);
    expect(lateA.body).toMatchObject({ code: 'SUPERSEDED' });
    expect(lateA.headers['set-cookie']).toBeUndefined();
  });

  it('refreshes only the current slot and rejects a stale expected tag', async () => {
    await user('a@example.test');
    await user('b@example.test');
    const ctx = await context();
    const a = await login(ctx, 'a@example.test', 0);
    ctx.jar.apply(a.response.headers['set-cookie']);
    const sessionA = a.response.body as SessionBody;
    const b = await login(ctx, 'b@example.test', 1);
    ctx.jar.apply(b.response.headers['set-cookie']);
    const sessionB = b.response.body as SessionBody;
    const stale = await refresh(ctx, sessionA);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'SUPERSEDED' });
    const ok = await refresh(ctx, sessionB);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      authProtocol: 2,
      sessionTag: sessionB.sessionTag,
      user: { email: 'b@example.test' },
    });
    const setCookies = ok.headers['set-cookie'] as unknown as string[];
    expect(
      setCookies.some((line) =>
        line.startsWith(`wa_s_${sessionB.sessionTag}=`),
      ),
    ).toBe(true);
    expect(
      setCookies.some((line) =>
        line.startsWith(`wa_s_${sessionA.sessionTag}=`),
      ),
    ).toBe(false);
    expect(
      setCookies.some((line) => line.startsWith(`wa_cb_${ctx.contextId}=`)),
    ).toBe(true);
  });

  it('reports CREDENTIAL_MISSING without falling back to historical slots', async () => {
    await user('a@example.test');
    await user('b@example.test');
    const ctx = await context();
    const a = await login(ctx, 'a@example.test', 0);
    ctx.jar.apply(a.response.headers['set-cookie']);
    const b = await login(ctx, 'b@example.test', 1);
    const sessionB = b.response.body as SessionBody;
    // B's slot cookie never arrived; A's slot is still in the jar.
    const response = await refresh(ctx, sessionB);
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'CREDENTIAL_MISSING' });
  });

  it('revokes the family when a consumed value is presented in the current slot (003 reuse)', async () => {
    await user('a@example.test');
    const ctx = await context();
    const a = await login(ctx, 'a@example.test', 0);
    ctx.jar.apply(a.response.headers['set-cookie']);
    const session = a.response.body as SessionBody;
    const before = ctx.jar.clone();
    const first = await refresh(ctx, session);
    expect(first.status).toBe(200);
    const replay = await refresh(
      { jar: before, contextId: ctx.contextId },
      session,
    );
    expect(replay.status).toBe(401);
    const [row] = await fixture.db.query<{ revocation_reason: string }[]>(
      'SELECT revocation_reason FROM auth_sessions WHERE slot_tag=$1',
      [session.sessionTag],
    );
    expect(row.revocation_reason).toBe('REFRESH_REUSE');
  });

  it('logout ends only the captured session and clears only its slot', async () => {
    await user('a@example.test');
    const ctx = await context();
    const a = await login(ctx, 'a@example.test', 0);
    ctx.jar.apply(a.response.headers['set-cookie']);
    const session = a.response.body as SessionBody;
    const intent = await reserve(ctx, 'LOGOUT', 1, session.sessionTag);
    const response = await http()
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Intent', intent.intentId)
      .set('X-CSRF-Token', session.csrfToken)
      .set('Cookie', ctx.jar.header())
      .expect(204);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(new RegExp(`^wa_s_${session.sessionTag}=;`));
    expect(cookies[0]).toContain('Max-Age=0');
    const [contextRow] = await fixture.db.query<
      { current_session_id: string | null }[]
    >('SELECT current_session_id FROM auth_contexts WHERE id=$1', [
      ctx.contextId,
    ]);
    expect(contextRow.current_session_id).toBeNull();
  });

  it('logout-all and password change clear only the bearer session slot', async () => {
    await user('a@example.test');
    const ctx = await context();
    const a = await login(ctx, 'a@example.test', 0);
    const session = a.response.body as SessionBody;
    const all = await http()
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(204);
    const cookies = all.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(new RegExp(`^wa_s_${session.sessionTag}=;`));

    const ctx2 = await context();
    const b = await login(ctx2, 'a@example.test', 0);
    const second = b.response.body as SessionBody;
    const changed = await http()
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'Another Password 1' })
      .expect(204);
    const changedCookies = changed.headers['set-cookie'] as unknown as string[];
    expect(changedCookies).toHaveLength(1);
    expect(changedCookies[0]).toMatch(
      new RegExp(`^wa_s_${second.sessionTag}=;`),
    );
    expect(changedCookies.join(';')).not.toContain('wedding_rt=');
  });
});
