import type { Page } from '@playwright/test';
import type { DeliveryProxy } from './support/delivery-proxy';
import { expect, test } from './support/fixtures';
import {
  env,
  loginViaUi,
  principalAfterReload,
  seedUser,
  stackReady,
  startProxy,
} from './support/stack';

test.skip(!stackReady, 'Requires the owned stack (AUTH_TRANSITION_WITH_WEB=1)');

let proxy: DeliveryProxy;
test.beforeAll(async () => {
  proxy = await startProxy();
});
test.afterAll(async () => proxy?.close());
test.afterEach(async ({ context }) => {
  proxy?.clearHolds();
  await context.clearCookies();
});

async function issueLegacyRefresh(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    return response.status;
  });
}

test('B14: legacy refresh cannot replace a fresh login after delayed delivery', async ({
  context,
}) => {
  // Also works when the pre-started warm web process points directly at API;
  // all browser API traffic for this case crosses the owned response proxy.
  await context.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    return route.continue({ url: `${proxy.url}${url.pathname}${url.search}` });
  });
  const email = await seedUser('b14-fresh');
  const legacyPage = await context.newPage();
  const page = await context.newPage();
  await legacyPage.goto(`${env.webUrl}/login`);
  await page.context().addCookies([
    {
      name: 'wedding_rt',
      value: 'legacy-stale-credential',
      domain: new URL(env.webUrl!).hostname,
      path: '/api/v1/auth',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  proxy.hold({ method: 'POST', path: '/api/v1/auth/refresh', times: 1 });
  const pendingLegacyRefresh = issueLegacyRefresh(legacyPage);
  const held = await proxy.nextHeld({ path: '/api/v1/auth/refresh' });
  await held.committed;
  expect(held.status).toBe(401);

  await loginViaUi(page, email);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  expect(await principalAfterReload(page)).toBe(email);
  const activeSlot = (await context.cookies()).find((cookie) =>
    cookie.name.startsWith('wa_s_'),
  );
  expect(activeSlot?.value).toBeTruthy();

  await held.release();
  await expect(pendingLegacyRefresh).resolves.toBe(401);
  expect(await principalAfterReload(page)).toBe(email);
  const cookies = await context.cookies();
  expect(
    cookies
      .filter((cookie) => cookie.name === 'wedding_rt')
      .every((cookie) => cookie.value.length === 0),
  ).toBe(true);
  expect(
    cookies.some(
      (cookie) => cookie.name === activeSlot?.name && cookie.value.length > 0,
    ),
  ).toBe(true);
});
