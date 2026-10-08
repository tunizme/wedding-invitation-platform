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
import { AuthCutoverCommand } from '../../../src/modules/identity-access/context/auth-cutover.command';
import { EmailOutboxWorker } from '../../../src/modules/identity-access/infrastructure/email-outbox.worker';
import { registrationFixture } from '../../registration-fixture';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Cutover Integration Password';

class Jar {
  private readonly values = new Map<string, string>();
  apply(headers: string[] | string | undefined) {
    for (const header of ([] as string[]).concat(headers ?? [])) {
      const [pair, ...attributes] = header
        .split(';')
        .map((part) => part.trim());
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      if (attributes.some((attribute) => /^max-age=0$/i.test(attribute)))
        this.values.delete(name);
      else this.values.set(name, pair.slice(index + 1));
    }
  }
  header(extra: Record<string, string> = {}) {
    const pairs = [...this.values].map(([name, value]) => `${name}=${value}`);
    for (const [name, value] of Object.entries(extra))
      pairs.push(`${name}=${value}`);
    return pairs.join('; ');
  }
  names() {
    return [...this.values.keys()];
  }
}

describe.sequential('auth cutover and rollback', () => {
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
    await fixture.db.query(
      `INSERT INTO users (id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
       VALUES (gen_random_uuid(),'cutover@example.test',$1,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())`,
      [await fixture.crypto.hashPassword(PASSWORD)],
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

  async function login() {
    const jar = new Jar();
    const provision = await http()
      .post('/api/v1/auth/contexts')
      .set('Origin', ORIGIN)
      .send({})
      .expect(201);
    jar.apply(provision.headers['set-cookie']);
    const contextId = (provision.body as { contextId: string }).contextId;
    const confirm = await http()
      .post(`/api/v1/auth/contexts/${contextId}/confirm`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', jar.header())
      .send({})
      .expect(200);
    jar.apply(confirm.headers['set-cookie']);
    const reserve = await http()
      .post(`/api/v1/auth/contexts/${contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('Cookie', jar.header())
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: 0 })
      .expect(201);
    const reserveBody = reserve.body as { intentId: string };
    const response = await http()
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', contextId)
      .set('X-Auth-Intent', reserveBody.intentId)
      .set('Cookie', jar.header())
      .send({ email: 'cutover@example.test', password: PASSWORD })
      .expect(200);
    jar.apply(response.headers['set-cookie']);
    return {
      jar,
      contextId,
      session: response.body as { sessionTag: string; csrfToken: string },
    };
  }

  it('rejects legacy refresh, logout and csrf and clears only wedding_rt', async () => {
    const ctx = await login();
    for (const result of [
      await http()
        .post('/api/v1/auth/refresh')
        .set('Origin', ORIGIN)
        .set('Cookie', ctx.jar.header({ wedding_rt: 'legacy-value' })),
      await http()
        .post('/api/v1/auth/logout')
        .set('Origin', ORIGIN)
        .set('Cookie', ctx.jar.header({ wedding_rt: 'legacy-value' })),
      await http()
        .get('/api/v1/auth/csrf')
        .set('Cookie', ctx.jar.header({ wedding_rt: 'legacy-value' })),
    ]) {
      expect(result.status).toBe(401);
      const cleared = ([] as string[])
        .concat(result.headers['set-cookie'] ?? [])
        .filter((line) => /(?:^|;\s*)Max-Age=0/i.test(line));
      expect(cleared).toHaveLength(1);
      expect(cleared[0]).toMatch(/^wedding_rt=/);
      expect(cleared[0]).not.toMatch(/wa_(?:cb|s)_/);
    }
    expect(ctx.jar.names().some((name) => name.startsWith('wa_s_'))).toBe(true);
  });

  it('never treats a context-less legacy session as current', async () => {
    const legacy = await fixture.db.query<{ id: string }[]>(
      `INSERT INTO auth_sessions
       (id,user_id,created_at,last_refreshed_at,absolute_expires_at,csrf_seed,csrf_key_version,revoked_at,revocation_reason,user_agent_summary,context_id,slot_tag)
       SELECT gen_random_uuid(),id,now(),NULL,now()+interval '336 hours',decode(repeat('01',32),'hex'),1,NULL,NULL,NULL,NULL,NULL
       FROM users WHERE email='cutover@example.test' RETURNING id`,
    );
    expect(legacy[0]?.id).toBeTruthy();
    const ctx = await login();
    await fixture.db.query(
      'UPDATE auth_contexts SET current_session_id=$2 WHERE id=$1',
      [ctx.contextId, legacy[0].id],
    );
    const response = await http()
      .get('/api/v1/auth/csrf')
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Session-Tag', ctx.session.sessionTag)
      .set('Cookie', ctx.jar.header())
      .expect(401);
    const [row] = await fixture.db.query<{ current_session_id: string }[]>(
      'SELECT current_session_id FROM auth_contexts WHERE id=$1',
      [ctx.contextId],
    );
    expect(row.current_session_id).toBe(legacy[0].id);
    expect((response.body as { code: string }).code).toBe('CREDENTIAL_MISSING');
  });

  it('rollback revokes context sessions and re-cutover reports CREDENTIAL_MISSING', async () => {
    const ctx = await login();
    const command = new AuthCutoverCommand(fixture.db);
    await expect(command.revokeContextSessions('')).rejects.toThrow(
      'Explicit rollback confirmation is required',
    );
    await expect(
      command.revokeContextSessions('REVOKE_CONTEXT_SESSIONS'),
    ).resolves.toBe(1);
    const csrf = await http()
      .get('/api/v1/auth/csrf')
      .set('X-Auth-Context', ctx.contextId)
      .set('Cookie', ctx.jar.header());
    expect(csrf.status).toBe(401);
    expect((csrf.body as { code: string }).code).toBe('CREDENTIAL_MISSING');
  });

  it('a null LOGOUT target supersedes pending work without revoking a live session', async () => {
    const ctx = await login();
    const [context] = await fixture.db.query<{ revision: number }[]>(
      'SELECT revision FROM auth_contexts WHERE id=$1',
      [ctx.contextId],
    );
    const pending = await http()
      .post(`/api/v1/auth/contexts/${ctx.contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('Cookie', ctx.jar.header())
      .send({ kind: 'LOCAL_LOGIN', expectedRevision: Number(context.revision) })
      .expect(201);
    const pendingBody = pending.body as { intentId: string; revision: number };
    const logout = await http()
      .post(`/api/v1/auth/contexts/${ctx.contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('Cookie', ctx.jar.header())
      .send({
        kind: 'LOGOUT',
        expectedRevision: pendingBody.revision,
        expectedSessionTag: null,
      })
      .expect(201);

    const [oldIntent] = await fixture.db.query<{ state: string }[]>(
      'SELECT state FROM auth_intents WHERE id=$1',
      [pendingBody.intentId],
    );
    expect(oldIntent?.state).toBe('SUPERSEDED');
    await http()
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Intent', (logout.body as { intentId: string }).intentId)
      .set('Cookie', ctx.jar.header())
      .send({})
      .expect(204);

    const [session] = await fixture.db.query<
      {
        revoked_at: Date | null;
        current_session_id: string | null;
        id: string;
      }[]
    >(
      `SELECT s.revoked_at,c.current_session_id,s.id
       FROM auth_sessions s JOIN auth_contexts c ON c.id=s.context_id
       WHERE s.slot_tag=$1 AND c.id=$2`,
      [ctx.session.sessionTag, ctx.contextId],
    );
    expect(session?.revoked_at).toBeNull();
    expect(session?.current_session_id).toBe(session?.id);
  });

  it('a captured stale session tag cannot revoke the newer current session', async () => {
    const ctx = await login();
    const [context] = await fixture.db.query<{ revision: number }[]>(
      'SELECT revision FROM auth_contexts WHERE id=$1',
      [ctx.contextId],
    );
    const establish = await http()
      .post(`/api/v1/auth/contexts/${ctx.contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('Cookie', ctx.jar.header())
      .send({
        kind: 'LOCAL_LOGIN',
        expectedRevision: Number(context.revision),
      })
      .expect(201);
    const renewed = await http()
      .post('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Intent', (establish.body as { intentId: string }).intentId)
      .set('Cookie', ctx.jar.header())
      .send({ email: 'cutover@example.test', password: PASSWORD })
      .expect(200);
    ctx.jar.apply(renewed.headers['set-cookie']);
    const renewedSession = renewed.body as {
      sessionTag: string;
      csrfToken: string;
    };
    const [current] = await fixture.db.query<{ revision: number }[]>(
      'SELECT revision FROM auth_contexts WHERE id=$1',
      [ctx.contextId],
    );
    const logout = await http()
      .post(`/api/v1/auth/contexts/${ctx.contextId}/intents`)
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('Cookie', ctx.jar.header())
      .send({
        kind: 'LOGOUT',
        expectedRevision: Number(current.revision),
        expectedSessionTag: ctx.session.sessionTag,
      })
      .expect(201);
    await http()
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('X-Auth-Context', ctx.contextId)
      .set('X-Auth-Intent', (logout.body as { intentId: string }).intentId)
      .set('X-CSRF-Token', renewedSession.csrfToken)
      .set('Cookie', ctx.jar.header())
      .send({})
      .expect(204);

    const [sessions] = await fixture.db.query<
      { old_revoked_at: Date | null; current_id: string; new_id: string }[]
    >(
      `SELECT old.revoked_at AS old_revoked_at,c.current_session_id AS current_id,new.id AS new_id
       FROM auth_contexts c
       JOIN auth_sessions old ON old.slot_tag=$2
       JOIN auth_sessions new ON new.context_id=c.id AND new.slot_tag=$3
       WHERE c.id=$1`,
      [ctx.contextId, ctx.session.sessionTag, renewedSession.sessionTag],
    );
    expect(sessions?.old_revoked_at).not.toBeNull();
    expect(sessions?.current_id).toBe(sessions?.new_id);
  });
});
