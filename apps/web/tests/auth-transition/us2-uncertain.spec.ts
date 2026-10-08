import type { DeliveryProxy } from './support/delivery-proxy';
import { expect, test } from './support/fixtures';
import {
  env,
  openLogin,
  seedUser,
  stackReady,
  startProxy,
  submitLogin,
} from './support/stack';

/** B6–B7 exercise uncertainty through the real login page and API. */
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

function loginPostCount() {
  return proxy
    .observations()
    .filter(
      (request) =>
        request.method === 'POST' && request.path === '/api/v1/auth/login',
    ).length;
}

test('B6: a login request dropped before reaching the API is never replayed', async ({
  page,
}) => {
  const loginPostsBefore = loginPostCount();
  const email = await seedUser('b6-pre-dispatch');
  await openLogin(page);
  let dropped = false;
  await page.route('**/auth/login', async (route) => {
    dropped = true;
    await route.abort('failed');
  });
  await submitLogin(page, email);
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    /Chưa xác nhận được kết quả đăng nhập/,
  );
  expect(dropped).toBe(true);
  expect(loginPostCount() - loginPostsBefore).toBe(0);
  await page.unroute('**/auth/login');
  // Recovery is read-only. Reload may probe the reservation but must not issue
  // the credential-bearing mutation a second time.
  await page.goto(`${env.webUrl}/login`);
  await expect(page.getByRole('status')).toContainText(/chưa được xác nhận/);
  expect(loginPostCount() - loginPostsBefore).toBe(0);
});

test('B6: an API-committed login whose delivery exceeds the request deadline remains uncertain without replay', async ({
  page,
}) => {
  const loginPostsBefore = loginPostCount();
  test.setTimeout(45_000);
  const email = await seedUser('b6-dispatched-deadline');
  await openLogin(page);
  proxy.hold({ method: 'POST', path: '/api/v1/auth/login', times: 1 });
  await submitLogin(page, email);
  const held = await proxy.nextHeld({ path: '/api/v1/auth/login' });
  await held.committed;
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    /Chưa xác nhận được kết quả đăng nhập/,
    { timeout: 20_000 },
  );
  await held.release();
  await page.goto(`${env.webUrl}/login`);
  await expect(page.getByRole('status')).toContainText(/chưa được xác nhận/);
  expect(loginPostCount() - loginPostsBefore).toBe(1);
});

test('B6: a committed login with an unreadable response remains uncertain and is probed read-only', async ({
  page,
}) => {
  const loginPostsBefore = loginPostCount();
  const email = await seedUser('b6-body-parse');
  await openLogin(page);
  await page.route('**/auth/login', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: '{ unreadable response' });
  });
  await submitLogin(page, email);
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    /Chưa xác nhận được kết quả đăng nhập/,
  );
  await expect
    .poll(
      () =>
        proxy
          .observations()
          .filter(
            (request) =>
              request.method === 'POST' &&
              request.path === '/api/v1/auth/login',
          ).length - loginPostsBefore,
    )
    .toBe(1);
  await page.unroute('**/auth/login');
  await page.goto(`${env.webUrl}/login`);
  await expect(page.getByRole('status')).toContainText(/chưa được xác nhận/);
  await expect
    .poll(
      () =>
        proxy
          .observations()
          .filter((request) => /\/intents\/[^/]+$/.test(request.path)).length,
    )
    .toBeGreaterThan(0);
  expect(loginPostCount() - loginPostsBefore).toBe(1);
});

test('B7: closing a tab during a committed pending login and reopening probes its receipt without replay', async ({
  context,
}) => {
  const loginPostsBefore = loginPostCount();
  const email = await seedUser('b7-close-tab');
  const pending = await context.newPage();
  await openLogin(pending);
  proxy.hold({ method: 'POST', path: '/api/v1/auth/login', times: 1 });
  await submitLogin(pending, email);
  const held = await proxy.nextHeld({ path: '/api/v1/auth/login' });
  await held.committed;
  await pending.close();

  const reopened = await context.newPage();
  await reopened.goto(`${env.webUrl}/login`);
  await expect(reopened.getByRole('status')).toContainText(
    /chưa được xác nhận/,
  );
  await expect
    .poll(
      () =>
        proxy
          .observations()
          .filter((request) => /\/intents\/[^/]+$/.test(request.path)).length,
    )
    .toBeGreaterThan(0);
  expect(loginPostCount() - loginPostsBefore).toBe(1);
  await held.release();
});

for (const operation of ['logout', 'logout-all'] as const) {
  test(`Phase20: lost ${operation} response ends local admission and shows mounted recovery without replay`, async ({
    page,
  }) => {
    const email = await seedUser(`phase20-${operation}`);
    await openLogin(page);
    await submitLogin(page, email);
    await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
    const path = `/api/v1/auth/${operation}`;
    const before = proxy
      .observations()
      .filter((r) => r.method === 'POST' && r.path === path).length;
    if (operation === 'logout')
      await page.route('**/auth/contexts/*/intents/*', (route) =>
        route.abort('failed'),
      );
    await page.route(`**/auth/${operation}`, async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    await page
      .getByRole('button', {
        name: operation === 'logout' ? 'Đăng xuất' : 'Đăng xuất mọi thiết bị',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Chưa xác nhận được kết quả trên máy chủ' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole('status')
        .or(
          page
            .getByRole('alert')
            .filter({ hasText: 'Chưa xác nhận được kết quả trên máy chủ' }),
        ),
    ).toBeVisible();
    expect(
      proxy.observations().filter((r) => r.method === 'POST' && r.path === path)
        .length - before,
    ).toBe(1);
  });
}

for (const failure of [
  'csrf-fetch',
  'refresh-unreadable',
  'refresh-lost',
  'refresh-timeout',
] as const) {
  test(`Phase20: ${failure} failure has truthful persistent recovery without refresh replay`, async ({
    page,
  }) => {
    const email = await seedUser(`phase20-${failure}`);
    await openLogin(page);
    await submitLogin(page, email);
    await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
    const before = proxy
      .observations()
      .filter(
        (r) => r.method === 'POST' && r.path === '/api/v1/auth/refresh',
      ).length;
    if (failure === 'refresh-timeout') {
      test.setTimeout(45_000);
      proxy.hold({ method: 'POST', path: '/api/v1/auth/refresh', times: 1 });
    } else
      await page.route(
        failure === 'csrf-fetch' ? '**/auth/csrf' : '**/auth/refresh',
        async (route) => {
          if (failure === 'csrf-fetch') await route.abort('failed');
          else if (failure === 'refresh-lost') {
            await route.fetch();
            await route.abort('failed');
          } else {
            const response = await route.fetch();
            await route.fulfill({ response, body: '{ unreadable' });
          }
        },
      );
    await page.reload();
    const held =
      failure === 'refresh-timeout'
        ? await proxy.nextHeld({ path: '/api/v1/auth/refresh' })
        : null;
    if (held) await held.committed;
    const recovery = page.getByRole('alert').filter({
      hasText:
        failure === 'csrf-fetch'
          ? 'Không thể gửi yêu cầu'
          : 'Chưa xác nhận được kết quả trên máy chủ',
    });
    await expect(recovery).toContainText(
      failure === 'csrf-fetch'
        ? 'Không thể gửi yêu cầu'
        : 'Chưa xác nhận được kết quả trên máy chủ',
      { timeout: 20_000 },
    );
    if (held) await held.release();
    await page.reload();
    await expect(recovery).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
    ).toHaveCount(0);
    expect(
      proxy
        .observations()
        .filter((r) => r.method === 'POST' && r.path === '/api/v1/auth/refresh')
        .length - before,
    ).toBe(failure === 'csrf-fetch' ? 0 : 1);
  });
}

for (const scenario of [
  {
    stage: 'provision',
    action: 'local',
    glob: '**/auth/contexts',
    path: /^\/api\/v1\/auth\/contexts$/,
  },
  {
    stage: 'confirm',
    action: 'local',
    glob: '**/auth/contexts/*/confirm',
    path: /\/contexts\/[^/]+\/confirm$/,
  },
  {
    stage: 'reserve',
    action: 'local',
    glob: '**/auth/contexts/*/intents',
    path: /\/contexts\/[^/]+\/intents$/,
  },
  {
    stage: 'reserve',
    action: 'logout',
    glob: '**/auth/contexts/*/intents',
    path: /\/contexts\/[^/]+\/intents$/,
  },
  {
    stage: 'reserve',
    action: 'social',
    glob: '**/auth/contexts/*/intents',
    path: /\/contexts\/[^/]+\/intents$/,
  },
]) {
  test(`Phase21: lost ${scenario.stage} response during ${scenario.action} has persistent scoped recovery without replay`, async ({
    page,
  }) => {
    const email = await seedUser(
      `phase21-${scenario.stage}-${scenario.action}`,
    );
    await openLogin(page);
    if (scenario.action !== 'local') {
      await submitLogin(page, email);
      await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
    }
    const count = () =>
      proxy
        .observations()
        .filter((r) => r.method === 'POST' && scenario.path.test(r.path))
        .length;
    const before = count();
    const probeBefore = proxy
      .observations()
      .filter(
        (r) => r.method === 'GET' && /\/intents\/[^/]+$/.test(r.path),
      ).length;
    await page.route(scenario.glob, async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    if (scenario.action === 'local') await submitLogin(page, email);
    else
      await page
        .getByRole('button', {
          name:
            scenario.action === 'logout' ? 'Đăng xuất' : 'Tiếp tục với Google',
          exact: true,
        })
        .click();
    const notice = page
      .getByRole('alert')
      .filter({ hasText: 'Phiên cục bộ đã kết thúc' });
    await expect(notice).toContainText(
      'Chưa xác nhận được kết quả trên máy chủ',
    );
    await expect(
      notice.getByRole('link', { name: 'Đăng nhập lại' }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
    ).toHaveCount(0);
    expect(count() - before).toBe(1);
    await page.reload();
    await expect(notice).toBeVisible();
    expect(count() - before).toBe(1);
    // No reservation ID was delivered, so no receipt URL may be fabricated.
    expect(
      proxy
        .observations()
        .filter((r) => r.method === 'GET' && /\/intents\/[^/]+$/.test(r.path))
        .length - probeBefore,
    ).toBe(0);
    await page.unroute(scenario.glob);
    await submitLogin(page, email);
    await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  });
}

test('Phase21: lease queue expiry explains NOT_DISPATCHED and explicit login resolves it', async ({
  page,
}) => {
  const email = await seedUser('phase21-queue');
  await openLogin(page);
  await submitLogin(page, email);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('wedding-auth', 1);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('selector', 'readwrite');
          const objects = tx.objectStore('selector');
          const read = objects.get('current');
          read.onsuccess = () =>
            objects.put(
              {
                ...read.result,
                refreshLease: { attemptId: 'other-tab', at: Date.now() },
              },
              'current',
            );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  const before = proxy
    .observations()
    .filter(
      (r) => r.method === 'POST' && r.path === '/api/v1/auth/refresh',
    ).length;
  const started = Date.now();
  await page.reload();
  const notice = page
    .getByRole('alert')
    .filter({ hasText: 'Không thể gửi yêu cầu xác nhận phiên đăng nhập' });
  await expect(notice).toBeVisible({ timeout: 12_000 });
  expect(Date.now() - started).toBeLessThan(15_000);
  await expect(
    notice.getByRole('link', { name: 'Đăng nhập lại' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toHaveCount(0);
  expect(
    proxy
      .observations()
      .filter((r) => r.method === 'POST' && r.path === '/api/v1/auth/refresh')
      .length - before,
  ).toBe(0);
  await submitLogin(page, email);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  await expect(notice).toHaveCount(0);
});

for (const status of [403, 429, 500]) {
  test(`Phase21: parsed ${status} refresh rejection shows confirmed failure without replay`, async ({
    page,
  }) => {
    const email = await seedUser(`phase21-refresh-${status}`);
    await openLogin(page);
    await submitLogin(page, email);
    await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
    let requests = 0;
    await page.route('**/auth/refresh', async (route) => {
      requests++;
      // Real browser transport parses a confirmed rejection without executing
      // a refresh. Timeout/lost-body cases separately cover committed mutation.
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'CONFIRMED_REJECTION' }),
      });
    });
    await page.reload();
    const notice = page
      .getByRole('alert')
      .filter({ hasText: 'Máy chủ không hoàn tất thao tác' });
    await expect(notice).toBeVisible();
    await expect(
      page.getByText('Chưa xác nhận được kết quả trên máy chủ', {
        exact: false,
      }),
    ).toHaveCount(0);
    await page.reload();
    await expect(notice).toBeVisible();
    expect(requests).toBe(1);
    await page.unroute('**/auth/refresh');
    await submitLogin(page, email);
    await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
  });
}
