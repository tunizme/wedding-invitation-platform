import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startDeliveryProxy } from './support/delivery-proxy';
import { expect, test } from './support/fixtures';
import { resetRateLimits } from './support/stack';

/**
 * A5 (research R12): per-host cookie retention and accepted Cookie header size,
 * measured on the SERVER side through the owned proxy (size-only observation).
 * Synthetic cookies match production name/value length (~85 bytes). Values are
 * random test data, never credentials.
 */
const apiUrl = process.env.AUTH_TRANSITION_API_URL;
const webUrl = process.env.AUTH_TRANSITION_WEB_URL;
const resultsFile = path.resolve(
  process.env.AUTH_TRANSITION_ARTIFACTS ?? '../../.artifacts/auth-transition',
  'a5-cookie-limits.json',
);
const ATTEMPT = 250;
const LIVE = '/api/v1/health/live';

test.skip(
  !apiUrl || !webUrl,
  'Owned API and web URLs are required (start the stack)',
);

function setCookies(count: number) {
  const value = 'v'.repeat(43);
  for (let i = 0; i < count; i++) {
    const name = `wa_cb_${String(i).padStart(4, '0')}${'x'.repeat(32)}`;
    document.cookie = `${name}=${value}; Path=/; Max-Age=600`;
  }
}

test('A5: per-host cookie retention and accepted Cookie header size', async ({
  context,
  page,
  browserName,
}, info) => {
  const proxy = await startDeliveryProxy({ upstream: apiUrl ?? '' });
  try {
    await page.goto(`${proxy.url}${LIVE}`);

    // 1. Retention: set ATTEMPT cookies one by one, then let the browser send them.
    await page.evaluate(setCookies, ATTEMPT);
    const status = await page.evaluate(
      async (url) => (await fetch(url, { credentials: 'include' })).status,
      LIVE,
    );
    const seen = proxy.observations().at(-1);
    const retained = (await context.cookies(proxy.url)).length;

    // 2. Accepted header size: grow in steps until the API stops answering 200.
    let acceptedCount = 0;
    let acceptedBytes = 0;
    let rejectedStatus: number | null = null;
    for (let count = 10; count <= ATTEMPT; count += 10) {
      await context.clearCookies();
      await page.evaluate(setCookies, count);
      const stepStatus = await page.evaluate(
        async (url) =>
          (await fetch(url, { credentials: 'include' }).catch(() => null))
            ?.status ?? 0,
        LIVE,
      );
      const observed = proxy.observations().at(-1);
      if (stepStatus !== 200) {
        rejectedStatus = stepStatus;
        break;
      }
      acceptedCount = observed?.cookieCount ?? 0;
      acceptedBytes = observed?.cookieHeaderBytes ?? 0;
      if ((observed?.cookieCount ?? 0) < count) break; // browser cap reached
    }

    // 3. Probe the real protocol-2 provisioning route from the actual web
    // origin. Synthetic wa_cb_* names contain non-hex characters, so none can
    // identify or authenticate an AuthContext. Each accepted response creates
    // an isolated context; clear the jar before the next size step.
    await page.goto(`${webUrl}/login`);
    let protocolAcceptedCount = 0;
    let protocolAcceptedBytes = 0;
    let protocolStatus: number | null = null;
    let protocolVersion: number | null = null;
    let protocolCorsSucceeded = false;
    let protocolAcceptedStatus: number | null = null;
    let protocolAcceptedVersion: number | null = null;
    let protocolAcceptedCors = false;
    let protocolFirstFailureCount: number | null = null;
    let protocolFirstFailureStatus: number | null = null;
    let protocolBrowserSentCount = 0;
    for (let count = 10; count <= ATTEMPT; count += 10) {
      await resetRateLimits();
      await context.clearCookies();
      await page.evaluate(setCookies, count);
      const priorObservations = proxy.observations().length;
      const result = await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          const body = response.ok
            ? ((await response.json()) as { authProtocol?: unknown })
            : null;
          return {
            status: response.status,
            responseType: response.type,
            authProtocol:
              typeof body?.authProtocol === 'number' ? body.authProtocol : null,
          };
        } catch {
          return { status: 0, responseType: 'error', authProtocol: null };
        }
      }, `${proxy.url}/api/v1/auth/contexts`);
      const observed = proxy
        .observations()
        .slice(priorObservations)
        .filter(
          (entry) =>
            entry.method === 'POST' && entry.path === '/api/v1/auth/contexts',
        )
        .at(-1);
      protocolStatus = result.status;
      protocolVersion = result.authProtocol;
      protocolCorsSucceeded = result.responseType === 'cors';
      protocolBrowserSentCount = observed?.cookieCount ?? 0;
      if (result.status !== 201 || result.authProtocol !== 2) {
        protocolFirstFailureCount = count;
        protocolFirstFailureStatus = result.status;
        break;
      }
      protocolAcceptedCount = observed?.cookieCount ?? 0;
      protocolAcceptedBytes = observed?.cookieHeaderBytes ?? 0;
      protocolAcceptedStatus = result.status;
      protocolAcceptedVersion = result.authProtocol;
      protocolAcceptedCors = protocolCorsSucceeded;
      if (protocolBrowserSentCount < count) break; // browser cap reached
    }
    await context.clearCookies();

    const entry = {
      engine: browserName,
      project: info.project.name,
      browserVersion: context.browser()?.version() ?? 'unknown',
      attempted: ATTEMPT,
      retainedInStore: retained,
      sentToServerAfterBulkSet: seen?.cookieCount ?? 0,
      bulkHeaderBytes: seen?.cookieHeaderBytes ?? 0,
      bulkStatus: status,
      maxAcceptedCookieCount: acceptedCount,
      maxAcceptedCookieHeaderBytes: acceptedBytes,
      firstRejectedStatus: rejectedStatus,
      protocolProbe: {
        route: 'POST /api/v1/auth/contexts',
        origin: webUrl,
        browserSentCookieCount: protocolBrowserSentCount,
        acceptedCookieHeaderBytes: protocolAcceptedBytes,
        acceptedSyntheticCookieCount: protocolAcceptedCount,
        lastResponseStatus: protocolStatus,
        lastAuthProtocol: protocolVersion,
        corsSucceeded: protocolCorsSucceeded,
        lastAcceptedStatus: protocolAcceptedStatus,
        lastAcceptedAuthProtocol: protocolAcceptedVersion,
        corsSucceededForAcceptedResponse: protocolAcceptedCors,
        firstFailureAttemptedCookieCount: protocolFirstFailureCount,
        firstFailureStatus: protocolFirstFailureStatus,
        firstFailureClassification:
          protocolFirstFailureStatus === 431
            ? 'HEADER_LIMIT'
            : protocolFirstFailureStatus === null
              ? null
              : protocolFirstFailureStatus === 0
                ? 'CORS_HIDDEN_OR_NETWORK'
                : 'BUSINESS_OR_OTHER',
      },
      measuredAt: new Date().toISOString(),
    };
    mkdirSync(path.dirname(resultsFile), { recursive: true });
    let all: Record<string, typeof entry> = {};
    try {
      all = JSON.parse(readFileSync(resultsFile, 'utf8'));
    } catch {}
    all[info.project.name] = entry;
    writeFileSync(resultsFile, `${JSON.stringify(all, null, 2)}\n`);
    console.log(`A5 ${info.project.name}: ${JSON.stringify(entry)}`);

    expect(entry.retainedInStore).toBeGreaterThan(0);
    expect(entry.maxAcceptedCookieCount).toBeGreaterThan(0);
    expect([200, 431]).toContain(entry.bulkStatus);
    expect(entry.protocolProbe.acceptedSyntheticCookieCount).toBeGreaterThan(0);
    expect(entry.protocolProbe.lastAcceptedStatus).toBe(201);
    expect(entry.protocolProbe.lastAcceptedAuthProtocol).toBe(2);
    expect(entry.protocolProbe.corsSucceededForAcceptedResponse).toBe(true);
  } finally {
    await proxy.close();
  }
});
