import {
  loadProductionSession,
  type ProductionSessionRealm,
} from './support/production-session';
import type { DeliveryProxy } from './support/delivery-proxy';
import { expect, test } from './support/fixtures';
import {
  env,
  loginViaUi,
  openLogin,
  principalAfterReload,
  resetRateLimits,
  seedUser,
  stackReady,
  startProxy,
  submitLogin,
} from './support/stack';

/** B8–B11 verify explicit recovery against real IndexedDB, cookies and API. */
test.skip(!stackReady, 'Requires the owned stack (AUTH_TRANSITION_WITH_WEB=1)');

let proxy: DeliveryProxy;
test.beforeAll(async () => {
  proxy = await startProxy();
});
test.afterAll(async () => proxy?.close());
test.afterEach(async () => {
  for (const held of proxy?.held() ?? []) await held.release();
  proxy?.clearHolds();
});

async function deleteSelectorDatabase(page: import('@playwright/test').Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('wedding-auth');
        request.onsuccess =
          request.onerror =
          request.onblocked =
            () => resolve();
      }),
  );
}

test('B8: deleting IndexedDB during binding verification cannot admit the late confirmation', async ({
  page,
}) => {
  const email = await seedUser('b8-verifying');
  await openLogin(page);
  proxy.hold({
    method: 'POST',
    path: /\/api\/v1\/auth\/contexts\/[^/]+\/confirm/,
    times: 1,
  });
  await submitLogin(page, email);
  const held = await proxy.nextHeld({
    path: /\/api\/v1\/auth\/contexts\/[^/]+\/confirm/,
  });
  await held.committed;
  await deleteSelectorDatabase(page);
  await held.release();
  await expect(page.locator('form').getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toHaveCount(0);
  expect(await principalAfterReload(page)).toBeNull();
});

test('B8: deleting a selected selector ends admission despite stale cookies, then explicit login recovers', async ({
  context,
  page,
}) => {
  const email = await seedUser('b8-selected');
  await loginViaUi(page, email);
  expect(await principalAfterReload(page)).toBe(email);
  const cachedTab = await context.newPage();
  expect(await principalAfterReload(cachedTab)).toBe(email);
  const before = await page.evaluate(async () => {
    const open = indexedDB.open('wedding-auth', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const request = db
      .transaction('selector')
      .objectStore('selector')
      .get('current');
    const record = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return record.contextId;
  });
  await deleteSelectorDatabase(page);
  expect(
    (await context.cookies()).some((cookie) => cookie.name.startsWith('wa_s_')),
  ).toBe(true);
  expect(await principalAfterReload(page)).toBeNull();
  expect(await principalAfterReload(cachedTab)).toBeNull();
  await submitLogin(page, email);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  const after = await page.evaluate(async () => {
    const open = indexedDB.open('wedding-auth', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const request = db
      .transaction('selector')
      .objectStore('selector')
      .get('current');
    const record = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return record.contextId;
  });
  expect(after).not.toBe(before);
});

test('B9: unavailable IndexedDB leaves public login usable and restored storage permits explicit fresh login', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    const native = window.indexedDB;
    let unavailable =
      sessionStorage.getItem('auth-test-storage') !== 'available';
    Object.defineProperty(window, '__setAuthStorageAvailable', {
      configurable: false,
      value: (available: boolean) => {
        unavailable = !available;
        sessionStorage.setItem(
          'auth-test-storage',
          available ? 'available' : 'unavailable',
        );
      },
    });
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get: () => (unavailable ? undefined : native),
    });
  });
  const email = await seedUser('b9-restore-storage');
  await openLogin(page);
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await submitLogin(page, email);
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    /Không thể xác nhận phiên đăng nhập trong trình duyệt này/,
  );
  expect(await principalAfterReload(page)).toBeNull();
  await page.evaluate(() => {
    (
      window as typeof window & {
        __setAuthStorageAvailable: (available: boolean) => void;
      }
    ).__setAuthStorageAvailable(true);
  });
  await submitLogin(page, email);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  expect(await principalAfterReload(page)).toBe(email);
});

test('B10: committed but undelivered cookie emissions exhaust capacity and a fresh selector cannot bypass it', async ({
  context,
}) => {
  await resetRateLimits();
  const first = await seedUser('b10-capacity-base');
  const basePage = await context.newPage();
  await loginViaUi(basePage, first);
  const browser = context.browser();
  expect(browser).toBeTruthy();
  let bindings = (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith('wa_cb_'),
  );
  expect(bindings.length).toBeGreaterThan(0);

  const unresolved: import('./support/delivery-proxy').HeldResponse[] = [];
  let capacityPage: import('@playwright/test').Page | undefined;
  let capacityContext:
    Awaited<ReturnType<NonNullable<typeof browser>['newContext']>> | undefined;
  for (let index = 0; index < 8 && !capacityPage; index += 1) {
    await resetRateLimits();
    const attemptContext = await browser!.newContext();
    await attemptContext.addCookies(bindings);
    const attemptPage = await attemptContext.newPage();
    await openLogin(attemptPage);
    const email = await seedUser(`b10-capacity-${index}`);
    proxy.hold({ method: 'POST', path: '/api/v1/auth/login', times: 1 });
    await submitLogin(attemptPage, email);

    const result = await Promise.race([
      proxy
        .nextHeld({ path: '/api/v1/auth/login' }, 20_000)
        .then((held) => ({ kind: 'held' as const, held })),
      attemptPage
        .locator('form')
        .getByRole('alert')
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => ({ kind: 'rejected' as const })),
    ]);
    if (result.kind === 'rejected') {
      capacityPage = attemptPage;
      capacityContext = attemptContext;
      break;
    }
    await result.held.committed;
    if (result.held.status < 200 || result.held.status >= 300) {
      await result.held.release();
      await expect(
        attemptPage.locator('form').getByRole('alert'),
      ).toBeVisible();
      capacityPage = attemptPage;
      capacityContext = attemptContext;
      break;
    }
    unresolved.push(result.held);
    bindings = (await attemptContext.cookies()).filter((cookie) =>
      cookie.name.startsWith('wa_cb_'),
    );
    await attemptContext.close();
  }

  expect(
    capacityPage,
    'unresolved delivered-cookie emissions must eventually exhaust the finite budget',
  ).toBeTruthy();
  await expect(capacityPage!.locator('form').getByRole('alert')).toHaveText(
    /Không thể xác nhận phiên đăng nhập trong trình duyệt này/,
  );
  const stateBeforeReset = await capacityPage!.evaluate(async () => {
    const open = indexedDB.open('wedding-auth', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const request = db
      .transaction('selector')
      .objectStore('selector')
      .get('current');
    const record = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return record;
  });
  expect(stateBeforeReset).toMatchObject({
    state: 'RECOVERY_REQUIRED',
    recoveryReason: 'CAPACITY_EXHAUSTED',
  });

  // A new BrowserContext gives this cookie jar a clean IndexedDB selector while
  // preserving its protocol bindings and the server's unresolved emissions.
  const retryContext = await browser!.newContext();
  proxy.clearHolds();
  await retryContext.addCookies(bindings);
  await resetRateLimits();
  const retryPage = await retryContext.newPage();
  await openLogin(retryPage);
  const next = await seedUser('b10-after-reset');
  await submitLogin(retryPage, next);
  await expect(retryPage.locator('form').getByRole('alert')).toHaveText(
    /Không thể xác nhận phiên đăng nhập trong trình duyệt này/,
  );
  const retryState = await retryPage.evaluate(async () => {
    const open = indexedDB.open('wedding-auth', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const request = db
      .transaction('selector')
      .objectStore('selector')
      .get('current');
    const record = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return record;
  });
  expect(retryState).toMatchObject({
    state: 'RECOVERY_REQUIRED',
    recoveryReason: 'CAPACITY_EXHAUSTED',
  });
  await retryContext.close();
  await capacityContext!.close();
  await Promise.all(unresolved.map((held) => held.release()));
});

test('B11: deleting the current slot with stale slot cookies present never restores the older account', async ({
  context,
  page,
}) => {
  const older = await seedUser('b11-older');
  const current = await seedUser('b11-current');
  await loginViaUi(page, older);
  const oldSlotCookies = (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith('wa_s_'),
  );
  const oldSlots = new Set(oldSlotCookies.map((cookie) => cookie.name));
  await page.goto(`${env.webUrl}/login`);
  await submitLogin(page, current);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  // Login B may retire and clear A's slot; re-present its captured opaque
  // cookie to model a stale slot retained by a delayed clear emission.
  await context.addCookies(oldSlotCookies);
  const slots = (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith('wa_s_'),
  );
  const currentSlot = slots.find((cookie) => !oldSlots.has(cookie.name));
  expect(
    currentSlot,
    'second login should emit a distinct current slot',
  ).toBeTruthy();
  await context.clearCookies({ name: currentSlot!.name });
  await page.goto(`${env.webUrl}/login`);
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Phiên đăng nhập trong trình duyệt này đã mất/),
  ).toBeVisible();
  expect(await principalAfterReload(page)).toBeNull();
  expect(
    (await context.cookies()).some((cookie) => oldSlots.has(cookie.name)),
  ).toBe(true);
});

for (const transition of ['recovery', 'logout'] as const) {
  test(`B8: an admitted tab observes peer ${transition}, ends private admission and explicitly recovers`, async ({
    context,
    page,
  }) => {
    const a = await seedUser(`phase22-${transition}-a`);
    const b = await seedUser(`phase22-${transition}-b`);
    await loginViaUi(page, a);
    await loadProductionSession(page);
    expect(
      await page.evaluate(
        async () =>
          (
            await (
              window as ProductionSessionRealm
            ).productionSession.coordinator.bootstrapSession(true)
          )?.user.email,
      ),
    ).toBe(a);
    const other = await context.newPage();
    await openLogin(other);
    await loadProductionSession(other);
    expect(
      await other.evaluate(
        async () =>
          (
            await (
              window as ProductionSessionRealm
            ).productionSession.coordinator.bootstrapSession(true)
          )?.user.email,
      ),
    ).toBe(a);
    let held: import('./support/delivery-proxy').HeldResponse | undefined;
    if (transition === 'recovery') {
      const tag = await other.evaluate(
        async () =>
          (
            await (
              window as ProductionSessionRealm
            ).productionSession.selector.readSelector(
              await (
                window as ProductionSessionRealm
              ).productionSession.selector.selectorStore(),
            )
          ).sessionTag,
      );
      await context.clearCookies({ name: `wa_s_${tag}` });
      await other.evaluate(async () => {
        await (
          window as ProductionSessionRealm
        ).productionSession.coordinator.bootstrapSession(true);
      });
    } else {
      proxy.hold({ method: 'POST', path: '/api/v1/auth/logout', times: 1 });
      await other.evaluate(() => {
        void (
          window as ProductionSessionRealm
        ).productionSession.coordinator.logoutCurrent();
      });
      held = await proxy.nextHeld({ path: '/api/v1/auth/logout' });
      await held.committed;
    }
    const requests: string[] = [];
    page.on('request', (request) => {
      if (/\/auth\/(csrf|refresh)$/.test(new URL(request.url()).pathname))
        requests.push(request.method());
    });
    const observed = await page.evaluate(async () => {
      const {
        coordinator,
        store: { sessionStore },
      } = (window as ProductionSessionRealm).productionSession;
      await coordinator.bootstrapSession(true);
      return {
        admitted: !!sessionStore.get(),
        reason: sessionStore.lastEndReason(),
      };
    });
    expect(observed).toEqual({
      admitted: false,
      reason: transition === 'recovery' ? 'CREDENTIAL_MISSING' : 'LOGOUT',
    });
    expect(requests).toEqual([]);
    await held?.release();
    expect(await principalAfterReload(page)).toBeNull();
    expect(await principalAfterReload(other)).toBeNull();
    await loginViaUi(other, b);
    expect(await principalAfterReload(other)).toBe(b);
    expect(await principalAfterReload(page)).toBe(b);
  });
}
