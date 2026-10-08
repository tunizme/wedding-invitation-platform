import type { Page } from '@playwright/test';
import type { DeliveryProxy } from './support/delivery-proxy';
import { expect, test } from './support/fixtures';
import {
  env,
  loginViaUi,
  openLogin,
  PASSWORD,
  principalAfterReload,
  seedUser,
  stackReady,
  startProxy,
  submitLogin,
} from './support/stack';

/**
 * 006 US1 browser matrix (quickstart B1–B4, B15). Every test starts with an
 * empty cookie jar and IndexedDB; held responses are released only after the
 * newer transition is confirmed, and the result is checked through a real
 * reload/renew against the API.
 */
test.skip(!stackReady, 'Requires the owned stack (AUTH_TRANSITION_WITH_WEB=1)');

let proxy: DeliveryProxy;
test.beforeAll(async () => {
  proxy = await startProxy();
});
test.afterAll(async () => proxy?.close());
test.afterEach(() => proxy?.clearHolds());

async function trackCompletion(
  page: Page,
  path: string,
  navigationTag?: string,
) {
  const install = ({ path, tag }: { path: string; tag?: string }) => {
    const original = window.fetch.bind(window);
    const state = window as typeof window & { mutationCompleted?: string };
    window.fetch = async (...args) => {
      const headers = new Headers(
        args[1]?.headers ??
          (args[0] instanceof Request ? args[0].headers : undefined),
      );
      const matches =
        String(args[0]).endsWith(path) &&
        (!tag || headers.get('X-Auth-Session-Tag') === tag);
      try {
        const response = await original(...args);
        if (matches) state.mutationCompleted = `response:${response.status}`;
        return response;
      } catch (error) {
        if (matches) state.mutationCompleted = 'rejected';
        throw error;
      }
    };
  };
  if (navigationTag)
    await page.addInitScript(install, { path, tag: navigationTag });
  else await page.evaluate(install, { path });
}

async function assertCompleted(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { mutationCompleted?: string })
            .mutationCompleted,
      ),
    )
    .toMatch(/^response:2/);
  await page.bringToFront();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test('B1: late provisioning in one tab cannot replace the context selected by another', async ({
  context,
}) => {
  const a = await seedUser('b1-a');
  const b = await seedUser('b1-b');
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  await openLogin(tab1);
  await openLogin(tab2);
  proxy.hold({ method: 'POST', path: '/api/v1/auth/contexts', times: 1 });
  await submitLogin(tab1, a);
  const held = await proxy.nextHeld({ path: '/api/v1/auth/contexts' });
  await held.committed;
  await submitLogin(tab2, b);
  await expect(tab2.getByText('Đăng nhập thành công')).toBeVisible();
  await held.release();
  await expect(tab1.locator('form').getByRole('alert')).toBeVisible();
  expect(await principalAfterReload(tab1)).toBe(b);
  expect(await principalAfterReload(tab2)).toBe(b);
});

test('B2: a refresh of A committed but delivered after login B cannot restore A', async ({
  context,
}) => {
  const a = await seedUser('b2-a');
  const b = await seedUser('b2-b');
  const tab1 = await context.newPage();
  await loginViaUi(tab1, a);
  const slotA = (await context.cookies()).find((cookie) =>
    cookie.name.startsWith('wa_s_'),
  )!.name;
  await trackCompletion(tab1, '/auth/refresh', slotA.slice('wa_s_'.length));
  proxy.hold({ method: 'POST', path: '/api/v1/auth/refresh', times: 1 });
  const reload = tab1.goto(`${env.webUrl}/login`);
  const held = await proxy.nextHeld({ path: '/api/v1/auth/refresh' });
  await held.committed;
  const tab2 = await context.newPage();
  await loginViaUi(tab2, b);
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  // WebKit may expose an expired empty tombstone; no usable A credential remains.
  // Login B clears the obsolete slot while the old set emission remains held.
  await expect
    .poll(async () =>
      (await context.cookies()).some(
        (cookie) =>
          cookie.name === slotA &&
          cookie.value.length > 0 &&
          (cookie.expires === -1 || cookie.expires > Date.now() / 1000),
      ),
    )
    .toBe(false);
  await held.release();
  // Track the originating fetch, scoped to A's tag; a peer renewal of B
  // cannot satisfy this acknowledgement when Firefox omits response events.
  await assertCompleted(tab1);
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  await reload;
  expect(
    (await context.cookies()).filter((cookie) =>
      /^wa_(cb|s)_/.test(cookie.name),
    ).length,
  ).toBeLessThanOrEqual(8);
  expect(await principalAfterReload(tab2)).toBe(b);
  expect(await principalAfterReload(tab1)).toBe(b);
});

test('B3: a late logout of A does not end session B', async ({ context }) => {
  const a = await seedUser('b3-a');
  const b = await seedUser('b3-b');
  const tab1 = await context.newPage();
  await loginViaUi(tab1, a);
  expect(await principalAfterReload(tab1)).toBe(a);
  await trackCompletion(tab1, '/auth/logout');
  proxy.hold({ method: 'POST', path: '/api/v1/auth/logout', times: 1 });
  await tab1
    .getByRole('navigation', { name: 'Phiên đăng nhập' })
    .getByRole('button', { name: 'Đăng xuất', exact: true })
    .click();
  const held = await proxy.nextHeld({ path: '/api/v1/auth/logout' });
  await held.committed;
  const tab2 = await context.newPage();
  await loginViaUi(tab2, b);
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  await held.release();
  await assertCompleted(tab1);
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  expect(await principalAfterReload(tab2)).toBe(b);
});

test('B4: a pending password change of A does not clear or replace session B', async ({
  context,
}) => {
  const a = await seedUser('b4-a');
  const b = await seedUser('b4-b');
  const tab1 = await context.newPage();
  await loginViaUi(tab1, a);
  expect(await principalAfterReload(tab1)).toBe(a);
  await tab1.goto(`${env.webUrl}/account`);
  await tab1.getByLabel('Mật khẩu hiện tại').fill(PASSWORD);
  await tab1.getByLabel('Mật khẩu mới').fill('Another Browser Password 2');
  await trackCompletion(tab1, '/me/password');
  proxy.hold({ method: 'POST', path: '/api/v1/me/password', times: 1 });
  await tab1.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  const held = await proxy.nextHeld({ path: '/api/v1/me/password' });
  await held.committed;
  const tab2 = await context.newPage();
  await loginViaUi(tab2, b);
  // A's account-wide revocation committed; its late response clears only A's slot.
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  await held.release();
  await assertCompleted(tab1);
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  expect(await principalAfterReload(tab2)).toBe(b);
});

test('B15: overlapping logins in one context — the server-accepted later intent wins', async ({
  context,
}) => {
  const a = await seedUser('b15-a');
  const b = await seedUser('b15-b');
  const tab1 = await context.newPage();
  await loginViaUi(tab1, a);
  await tab1
    .getByRole('navigation', { name: 'Phiên đăng nhập' })
    .getByRole('button', { name: 'Đăng xuất', exact: true })
    .click();
  const tab2 = await context.newPage();
  await openLogin(tab1);
  await openLogin(tab2);
  proxy.hold({
    method: 'POST',
    path: /^\/api\/v1\/auth\/contexts\/[^/]+\/intents$/,
    times: 1,
  });
  await submitLogin(tab1, a);
  const held = await proxy.nextHeld({
    path: /^\/api\/v1\/auth\/contexts\/[^/]+\/intents$/,
  });
  await held.committed;
  await submitLogin(tab2, b);
  await expect(tab2.getByText('Đăng nhập thành công')).toBeVisible();
  await held.release();
  await expect(tab1.locator('form').getByRole('alert')).toBeVisible();
  expect(await principalAfterReload(tab1)).toBe(b);
});

test('a delayed reservation binding error from A preserves live B and renewal', async ({
  context,
}) => {
  const a = await seedUser('reserve-error-a');
  const b = await seedUser('reserve-error-b');
  const tab1 = await context.newPage();
  await loginViaUi(tab1, a);
  await tab1.goto(`${env.webUrl}/login`);
  // Force a real server binding rejection; only the error response is delayed.
  const binding = (await context.cookies()).find((cookie) =>
    cookie.name.startsWith('wa_cb_'),
  )!;
  const intentPath = `/api/v1/auth/contexts/${binding.name.slice('wa_cb_'.length)}/intents`;
  let poisoned = false;
  await tab1.route('**/auth/contexts/*/intents', async (route) => {
    // OPTIONS must retain its headers and must not consume the one POST mutation.
    if (route.request().method() === 'POST' && !poisoned) {
      poisoned = true;
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-auth-context': '11111111-1111-4111-8111-111111111111',
        },
      });
    } else await route.continue();
  });
  proxy.hold({
    method: 'POST',
    path: intentPath,
    times: 1,
  });
  await submitLogin(tab1, a);
  const held = await proxy.nextHeld({
    path: intentPath,
  });
  await held.committed;
  expect(poisoned).toBe(true);
  expect(held.status).toBe(401);
  await tab1.unroute('**/auth/contexts/*/intents');
  const tab2 = await context.newPage();
  await loginViaUi(tab2, b);
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  await held.release();
  await expect(tab1.locator('form').getByRole('alert')).toHaveText(
    /được thay thế/,
  );
  await expect(
    tab1.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  expect(await principalAfterReload(tab1)).toBe(b);
  expect(await principalAfterReload(tab2)).toBe(b);
});

test('B2: login B atomically releases its pending fence before old committed refresh A is delivered', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    const state = {
      enabled: false,
      reached: false,
      refreshBody: false,
      completed: 0,
      release: () => {},
    };
    Object.assign(window, { pendingAdmissionGate: state });
    const marked = new WeakSet<IDBTransaction>();
    const afterRefresh = new WeakSet<IDBTransaction>();
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const tx = transaction.apply(this, args);
      if (state.refreshBody) afterRefresh.add(tx);
      return tx;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      const record = value as {
        state?: string;
        revision?: number;
        pendingIntent?: unknown;
        sessionTag?: string;
      };
      if (
        state.enabled &&
        !state.reached &&
        this.name === 'selector' &&
        record.state === 'SELECTED' &&
        (record.revision ?? 0) >= 2 &&
        record.pendingIntent === null &&
        record.sessionTag
      )
        marked.add(this.transaction);
      return put.call(this, value, key);
    };
    const complete = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      'oncomplete',
    );
    if (!complete?.set) throw new Error('Missing IndexedDB completion seam');
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
      ...complete,
      set(handler: ((this: IDBTransaction, event: Event) => unknown) | null) {
        complete.set!.call(this, function (this: IDBTransaction, event: Event) {
          if (!handler) return;
          if (marked.has(this) && !state.reached) {
            state.reached = true;
            state.release = () => handler.call(this, event);
            return;
          }
          handler.call(this, event);
          if (afterRefresh.has(this)) state.completed++;
        });
      },
    });
    const fetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof window.fetch>) => {
      const response = await fetch(...args);
      if (state.enabled && String(args[0]).endsWith('/auth/refresh')) {
        const json = response.json.bind(response);
        response.json = async () => {
          const body = await json();
          state.refreshBody = true;
          return body;
        };
      }
      return response;
    };
  });
  const a = await seedUser('phase23-a');
  const b = await seedUser('phase23-b');
  await loginViaUi(page, a);
  proxy.hold({ method: 'GET', path: '/api/v1/auth/csrf', times: 1 });
  await openLogin(page);
  const csrf = await proxy.nextHeld({ path: '/api/v1/auth/csrf' });
  await csrf.committed;
  await page.evaluate(() => {
    (
      window as typeof window & { pendingAdmissionGate: { enabled: boolean } }
    ).pendingAdmissionGate.enabled = true;
  });
  let releaseLogin!: () => void;
  let reached!: () => void;
  const loginReached = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const loginGate = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  await page.route('**/api/v1/auth/login', async (route) => {
    reached();
    await loginGate;
    await route.continue();
  });
  await submitLogin(page, b);
  await loginReached;
  proxy.hold({ method: 'POST', path: '/api/v1/auth/refresh', times: 1 });
  await csrf.release();
  const refresh = await proxy.nextHeld({ path: '/api/v1/auth/refresh' });
  await refresh.committed;
  expect(refresh.status).toBe(200);
  releaseLogin();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              pendingAdmissionGate: { reached: boolean };
            }
          ).pendingAdmissionGate.reached,
      ),
    )
    .toBe(true);
  await refresh.release();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              pendingAdmissionGate: { completed: number };
            }
          ).pendingAdmissionGate.completed,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await page.evaluate(() => {
    (
      window as typeof window & {
        pendingAdmissionGate: { release: () => void };
      }
    ).pendingAdmissionGate.release();
  });
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }).locator('span'),
  ).toHaveText(b);
  await page.unroute('**/api/v1/auth/login');
  expect(await principalAfterReload(page)).toBe(b);
  const other = await context.newPage();
  expect(await principalAfterReload(other)).toBe(b);
});
