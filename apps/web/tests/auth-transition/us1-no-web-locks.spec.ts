import type { DeliveryProxy } from './support/delivery-proxy';
import { expect, test } from './support/fixtures';
import {
  loginViaUi,
  principalAfterReload,
  seedUser,
  stackReady,
  startProxy,
} from './support/stack';

/**
 * 006 B5: the US1 guarantees without Web Locks. B1–B3/B15 run again under the
 * `chromium-no-web-locks` project (us1-late-effects.spec.ts); this file adds
 * the cross-tab refresh serialization check that relies on the IndexedDB lease.
 */
test.skip(!stackReady, 'Requires the owned stack (AUTH_TRANSITION_WITH_WEB=1)');

let proxy: DeliveryProxy;
test.beforeAll(async () => {
  proxy = await startProxy();
});
test.afterAll(async () => proxy?.close());

test('B5: two tabs renew sequentially without a token branch or reuse revocation', async ({
  context,
  page,
}) => {
  const a = await seedUser('b5-a');
  await loginViaUi(page, a);
  const tab2 = await context.newPage();
  const [first, second] = await Promise.all([
    principalAfterReload(page),
    principalAfterReload(tab2),
  ]);
  expect(first).toBe(a);
  expect(second).toBe(a);
  // Both refreshes rotated in order: the session is still alive afterwards.
  expect(await principalAfterReload(page)).toBe(a);
  const refreshes = proxy
    .observations()
    .filter((entry) => entry.path === '/api/v1/auth/refresh');
  expect(refreshes.length).toBeGreaterThanOrEqual(2);
});
