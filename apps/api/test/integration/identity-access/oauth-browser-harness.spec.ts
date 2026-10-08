import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import {
  startOAuthBrowserHarness,
  type OAuthBrowserHarness,
} from '../../fixtures/identity-access/oauth-browser-harness';

class CookieJar {
  private readonly values = new Map<string, string>();
  apply(lines: string[]) {
    for (const line of lines) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (attributes.some((attribute) => /^max-age=0$/i.test(attribute)))
        this.values.delete(name);
      else this.values.set(name, value);
    }
  }
  header() {
    return [...this.values]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

/** Self-test for the test-only OAuth browser harness (006 T003). */
describe.sequential('OAuth browser harness', () => {
  let harness: OAuthBrowserHarness;
  let db: DataSource;

  beforeAll(async () => {
    if (!process.env.IAM_TEST_SCHEMA)
      throw new Error('Run inside a disposable IAM test schema');
    db = new DataSource(databaseOptions());
    await db.initialize();
    await db.runMigrations();
    process.env.FRONTEND_ORIGIN ??= 'http://localhost:3000';
    harness = await startOAuthBrowserHarness();
  });

  beforeEach(async () => {
    await db.query(
      'TRUNCATE users,external_identities,auth_sessions,refresh_credentials,pending_social_onboardings,auth_challenges,oauth_transactions,auth_contexts,auth_intents,auth_cookie_names,auth_rate_limit_buckets,email_outbox CASCADE',
    );
    harness.adapter.identities.clear();
    await fetch(`${harness.providerUrl}/reset-rate-limits`, { method: 'POST' });
  });

  afterAll(async () => {
    await harness?.close();
    await db?.destroy();
  });

  async function reserveOAuthIntent() {
    const jar = new CookieJar();
    const origin = 'http://localhost:3000';
    const provision = await fetch(`${harness.apiUrl}/api/v1/auth/contexts`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(provision.status).toBe(201);
    jar.apply(provision.headers.getSetCookie());
    const { contextId } = (await provision.json()) as { contextId: string };
    const confirm = await fetch(
      `${harness.apiUrl}/api/v1/auth/contexts/${contextId}/confirm`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-Auth-Context': contextId,
          Cookie: jar.header(),
        },
        body: '{}',
      },
    );
    expect(confirm.status).toBe(200);
    jar.apply(confirm.headers.getSetCookie());
    const reserve = await fetch(
      `${harness.apiUrl}/api/v1/auth/contexts/${contextId}/intents`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-Auth-Context': contextId,
          Cookie: jar.header(),
        },
        body: JSON.stringify({ kind: 'OAUTH', expectedRevision: 0 }),
      },
    );
    expect(reserve.status).toBe(201);
    const { intentId } = (await reserve.json()) as { intentId: string };
    return { jar, contextId, intentId };
  }

  it('drives the real start/callback flow with a registered provider identity', async () => {
    const flow = await reserveOAuthIntent();
    const start = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/start?intent=${flow.intentId}`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    expect(start.status).toBe(302);
    const location = new URL(start.headers.get('location') ?? '');
    expect(location.origin).toBe(harness.providerUrl);
    const state = location.searchParams.get('state');
    expect(state).toBeTruthy();
    flow.jar.apply(start.headers.getSetCookie());
    expect(flow.jar.header()).toContain('wedding_oauth=');

    const register = await fetch(`${harness.providerUrl}/identities`, {
      method: 'POST',
      body: JSON.stringify({
        code: 'code-returning-1',
        identity: {
          provider: 'GOOGLE',
          subject: 'harness-subject-1',
          email: 'harness.user@example.test',
          emailVerified: true,
          displayName: 'Harness User',
          avatarUrl: null,
        },
      }),
    });
    expect(register.status).toBe(204);

    const callback = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state ?? '')}&code=code-returning-1`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe(
      `http://localhost:3000/oauth-result?result=success&intent=${flow.intentId}`,
    );
    expect(
      callback.headers.getSetCookie().some((cookie) => /^wa_s_/.test(cookie)),
    ).toBe(true);
    const [{ count }] = await db.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM auth_sessions WHERE context_id=$1',
      [flow.contextId],
    );
    expect(count).toBe('1');
  });

  it('rejects an unregistered or reused authorization code', async () => {
    const flow = await reserveOAuthIntent();
    const start = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/start?intent=${flow.intentId}`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    const state =
      new URL(start.headers.get('location') ?? '').searchParams.get('state') ??
      '';
    flow.jar.apply(start.headers.getSetCookie());
    const callback = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=code-returning-1`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    expect(callback.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects a callback whose reserved OAuth intent was superseded', async () => {
    const flow = await reserveOAuthIntent();
    const start = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/start?intent=${flow.intentId}`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    const state =
      new URL(start.headers.get('location') ?? '').searchParams.get('state') ??
      '';
    flow.jar.apply(start.headers.getSetCookie());
    const newer = await fetch(
      `${harness.apiUrl}/api/v1/auth/contexts/${flow.contextId}/intents`,
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'X-Auth-Context': flow.contextId,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({ kind: 'LOCAL_LOGIN', expectedRevision: 1 }),
      },
    );
    expect(newer.status).toBe(201);
    await fetch(`${harness.providerUrl}/identities`, {
      method: 'POST',
      body: JSON.stringify({
        code: 'superseded-callback',
        identity: {
          provider: 'GOOGLE',
          subject: 'superseded-subject',
          email: 'superseded@example.test',
          emailVerified: true,
          displayName: 'Superseded',
          avatarUrl: null,
        },
      }),
    });
    const before = await db.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM auth_sessions',
    );
    const callback = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=superseded-callback`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe(
      'http://localhost:3000/oauth-result?result=superseded',
    );
    const after = await db.query<{ count: string }[]>(
      'SELECT count(*)::text AS count FROM auth_sessions',
    );
    expect(after[0].count).toBe(before[0].count);
    expect(
      await db.query('SELECT id FROM users WHERE email=$1', [
        'superseded@example.test',
      ]),
    ).toHaveLength(0);
  });

  it('rejects a pre-cutover OAuth transaction with no intent authority', async () => {
    const flow = await reserveOAuthIntent();
    const start = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/start?intent=${flow.intentId}`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    const state =
      new URL(start.headers.get('location') ?? '').searchParams.get('state') ??
      '';
    flow.jar.apply(start.headers.getSetCookie());
    const transactionId = state.split('.')[0];
    await db.query('UPDATE oauth_transactions SET intent_id=NULL WHERE id=$1', [
      transactionId,
    ]);
    const callback = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=missing-provider-code`,
      { redirect: 'manual', headers: { cookie: flow.jar.header() } },
    );
    expect(callback.status).toBeGreaterThanOrEqual(400);
    expect(await db.query('SELECT id FROM auth_sessions')).toHaveLength(0);
  });

  it('completes first-time onboarding only under a new current intent', async () => {
    const flow = await reserveOAuthIntent();
    const start = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/start?intent=${flow.intentId}`,
      {
        redirect: 'manual',
        headers: { cookie: flow.jar.header() },
      },
    );
    const state =
      new URL(start.headers.get('location') ?? '').searchParams.get('state') ??
      '';
    flow.jar.apply(start.headers.getSetCookie());
    await fetch(`${harness.providerUrl}/identities`, {
      method: 'POST',
      body: JSON.stringify({
        code: 'onboarding-current',
        identity: {
          provider: 'GOOGLE',
          subject: 'onboarding-current-subject',
          email: null,
          emailVerified: false,
          displayName: 'First timer',
          avatarUrl: null,
        },
      }),
    });
    const callback = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=onboarding-current`,
      {
        redirect: 'manual',
        headers: { cookie: flow.jar.header() },
      },
    );
    expect(callback.headers.get('location')).toBe(
      'http://localhost:3000/social-onboarding',
    );
    flow.jar.apply(callback.headers.getSetCookie());
    const onboarding = await fetch(
      `${harness.apiUrl}/api/v1/auth/social-onboarding`,
      { headers: { cookie: flow.jar.header() } },
    );
    const { csrfToken } = (await onboarding.json()) as { csrfToken: string };
    const email = 'onboarding-current@example.test';
    const sent = await fetch(
      `${harness.apiUrl}/api/v1/auth/social-onboarding/email`,
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({ email }),
      },
    );
    expect(sent.status).toBe(202);
    const proofReply = await fetch(`${harness.providerUrl}/social-proof`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const { proof } = (await proofReply.json()) as { proof: string };
    const staleIntent = await fetch(
      `${harness.apiUrl}/api/v1/auth/contexts/${flow.contextId}/intents`,
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'X-Auth-Context': flow.contextId,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({
          kind: 'ONBOARDING_COMPLETE',
          expectedRevision: 1,
        }),
      },
    );
    const { intentId: staleIntentId } = (await staleIntent.json()) as {
      intentId: string;
    };
    const newerIntent = await fetch(
      `${harness.apiUrl}/api/v1/auth/contexts/${flow.contextId}/intents`,
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'X-Auth-Context': flow.contextId,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({ kind: 'OAUTH', expectedRevision: 2 }),
      },
    );
    expect(newerIntent.status).toBe(201);
    const staleConfirm = await fetch(
      `${harness.apiUrl}/api/v1/auth/social-onboarding/verifications/confirm`,
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Auth-Context': flow.contextId,
          'X-Auth-Intent': staleIntentId,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({ proof }),
      },
    );
    expect(staleConfirm.status).toBe(409);
    expect(
      await db.query('SELECT id FROM users WHERE email=$1', [email]),
    ).toHaveLength(0);

    const finalIntent = await fetch(
      `${harness.apiUrl}/api/v1/auth/contexts/${flow.contextId}/intents`,
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'X-Auth-Context': flow.contextId,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({
          kind: 'ONBOARDING_COMPLETE',
          expectedRevision: 3,
        }),
      },
    );
    expect(finalIntent.status).toBe(201);
    const { intentId } = (await finalIntent.json()) as { intentId: string };
    const complete = await fetch(
      `${harness.apiUrl}/api/v1/auth/social-onboarding/verifications/confirm`,
      {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Auth-Context': flow.contextId,
          'X-Auth-Intent': intentId,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({ proof }),
      },
    );
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({
      authProtocol: 2,
      sessionTag: expect.any(String) as unknown,
      contextRevision: 4,
    });
    expect(
      complete.headers.getSetCookie().some((line) => /^wa_s_/.test(line)),
    ).toBe(true);
    expect(
      await db.query('SELECT id FROM users WHERE email=$1', [email]),
    ).toHaveLength(1);
  });
});
