import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';
import {
  startOAuthBrowserHarness,
  type OAuthBrowserHarness,
} from '../../fixtures/identity-access/oauth-browser-harness';

class Jar {
  private values = new Map<string, string>();
  apply(lines: string[]) {
    for (const line of lines) {
      const [pair, ...attributes] = line.split(';').map((part) => part.trim());
      const i = pair.indexOf('=');
      if (attributes.some((part) => /^max-age=0$/i.test(part)))
        this.values.delete(pair.slice(0, i));
      else this.values.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  header() {
    return [...this.values].map(([n, v]) => `${n}=${v}`).join('; ');
  }
}

/** 006 T049: OAuth intent binding and callback/onboarding HTTP contract. */
describe.sequential('auth transition OAuth HTTP contract', () => {
  let harness: OAuthBrowserHarness;
  let db: DataSource;
  const origin = 'http://localhost:3000';

  beforeAll(async () => {
    if (!process.env.IAM_TEST_SCHEMA)
      throw new Error('Requires isolated IAM schema');
    process.env.FRONTEND_ORIGIN ??= origin;
    db = new DataSource(databaseOptions());
    await db.initialize();
    await db.runMigrations();
    harness = await startOAuthBrowserHarness();
  });
  beforeEach(async () => {
    await db.query(
      'TRUNCATE users,external_identities,auth_sessions,refresh_credentials,pending_social_onboardings,auth_challenges,oauth_transactions,auth_contexts,auth_intents,auth_cookie_names,auth_rate_limit_buckets,email_outbox CASCADE',
    );
  });
  afterAll(async () => {
    await harness?.close();
    await db?.destroy();
  });

  async function contextAndIntent(kind = 'OAUTH') {
    const jar = new Jar();
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
        body: JSON.stringify({ kind, expectedRevision: 0 }),
      },
    );
    expect(reserve.status).toBe(201);
    const { intentId } = (await reserve.json()) as { intentId: string };
    return { jar, contextId, intentId };
  }

  it('redirects missing/invalid start intents as superseded without setting OAuth state', async () => {
    const flow = await contextAndIntent();
    for (const query of ['', '?intent=not-a-uuid']) {
      const response = await fetch(
        `${harness.apiUrl}/api/v1/auth/oauth/google/start${query}`,
        {
          redirect: 'manual',
          headers: { cookie: flow.jar.header() },
        },
      );
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(
        `${origin}/oauth-result?result=superseded`,
      );
      expect(
        response.headers
          .getSetCookie()
          .some((line) => line.startsWith('wedding_oauth=')),
      ).toBe(false);
    }
  });

  it('redirects successful callbacks with intent and slot cookie, then rejects replayed state', async () => {
    const flow = await contextAndIntent();
    const start = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/start?intent=${flow.intentId}`,
      {
        redirect: 'manual',
        headers: { cookie: flow.jar.header() },
      },
    );
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    )!;
    flow.jar.apply(start.headers.getSetCookie());
    await fetch(`${harness.providerUrl}/identities`, {
      method: 'POST',
      body: JSON.stringify({
        code: 'contract-returning',
        identity: {
          provider: 'GOOGLE',
          subject: 'contract-subject',
          email: 'contract@example.test',
          emailVerified: true,
          displayName: 'Contract',
          avatarUrl: null,
        },
      }),
    });
    const callbackUrl = `${harness.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=contract-returning`;
    const callback = await fetch(callbackUrl, {
      redirect: 'manual',
      headers: { cookie: flow.jar.header() },
    });
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe(
      `${origin}/oauth-result?result=success&intent=${flow.intentId}`,
    );
    expect(
      callback.headers.getSetCookie().some((line) => /^wa_s_/.test(line)),
    ).toBe(true);
    const replay = await fetch(callbackUrl, {
      redirect: 'manual',
      headers: { cookie: flow.jar.header() },
    });
    expect(replay.status).toBeGreaterThanOrEqual(400);
  });

  it('requires context and intent headers for social onboarding confirmation while preserving proof body', async () => {
    const flow = await contextAndIntent();
    const start = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/start?intent=${flow.intentId}`,
      {
        redirect: 'manual',
        headers: { cookie: flow.jar.header() },
      },
    );
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    )!;
    flow.jar.apply(start.headers.getSetCookie());
    await fetch(`${harness.providerUrl}/identities`, {
      method: 'POST',
      body: JSON.stringify({
        code: 'contract-onboarding',
        identity: {
          provider: 'GOOGLE',
          subject: 'contract-onboarding-subject',
          email: null,
          emailVerified: false,
          displayName: 'Onboarding',
          avatarUrl: null,
        },
      }),
    });
    const callback = await fetch(
      `${harness.apiUrl}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=contract-onboarding`,
      {
        redirect: 'manual',
        headers: { cookie: flow.jar.header() },
      },
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe(
      `${origin}/social-onboarding`,
    );
    flow.jar.apply(callback.headers.getSetCookie());
    const onboarding = await fetch(
      `${harness.apiUrl}/api/v1/auth/social-onboarding`,
      { headers: { cookie: flow.jar.header() } },
    );
    expect(onboarding.status).toBe(200);
    const csrf = ((await onboarding.json()) as { csrfToken: string }).csrfToken;
    const email = 'contract-onboarding@example.test';
    const sent = await fetch(
      `${harness.apiUrl}/api/v1/auth/social-onboarding/email`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({ email }),
      },
    );
    expect(sent.status).toBe(202);
    const proofResponse = await fetch(`${harness.providerUrl}/social-proof`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const { proof } = (await proofResponse.json()) as { proof: string };
    const confirm = await fetch(
      `${harness.apiUrl}/api/v1/auth/social-onboarding/verifications/confirm`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
          Cookie: flow.jar.header(),
        },
        body: JSON.stringify({ proof }),
      },
    );
    expect(confirm.status).toBe(422);
    expect(confirm.headers.get('set-cookie')).toBeNull();
  });
});
