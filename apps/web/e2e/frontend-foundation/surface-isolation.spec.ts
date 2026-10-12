import {
  test,
  expect,
  login,
  seed,
  capture,
  sessionNav,
  expectSession,
} from './helpers';

test('public invitation loads directly without product session effects', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/auth\/(?:refresh|logout|csrf)/.test(request.url()))
      requests.push(request.url());
  });
  await page.goto(`/i/${seed().publicSlug}`);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  await expect(page.getByRole('button', { name: /đăng xuất/i })).toHaveCount(0);
  await expect(page.getByText(/thiệp không khả dụng/i)).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('product to public to product preserves account and navigation', async ({
  page,
}) => {
  const fixture = seed();
  await login(page, fixture.customerA);
  await page.goto('/invitations');
  await page.evaluate(() => {
    (window as typeof window & { documentMarker?: string }).documentMarker =
      'product-document';
  });
  await page.locator(`a[href="/i/${seed().publicSlug}"]`).click();
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { documentMarker?: string }).documentMarker,
    ),
  ).toBe('product-document');
  await expect(page.getByRole('button', { name: /đăng xuất/i })).toHaveCount(0);
  await expect(
    page.getByText(fixture.customerA.email, { exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expectSession(page, fixture.customerA.email);
  await expect(
    page.locator(`a[href="/i/${fixture.publicSlug}"]`),
  ).toHaveAttribute('href', `/i/${fixture.publicSlug}`);
});

test('isolated capture has no account chrome or auth requests with an active product session', async ({
  page,
}) => {
  await login(page, seed().customerA);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/auth\//.test(request.url())) requests.push(request.method());
  });
  expect((await capture(page)).ready).toBe(true);
  await expect(sessionNav(page)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Tài khoản', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(seed().customerA.email, { exact: true }),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('anonymous and authenticated visitors see the same published authored version', async ({
  page,
}) => {
  const scene = () =>
    page.getByTestId('public-workarea').evaluate((root) =>
      [...root.querySelectorAll('[data-rendered-element]')].map((node) => ({
        id: node.getAttribute('data-rendered-element'),
        style: (node as HTMLElement).style.cssText,
        text: node.textContent,
      })),
    );
  await page.goto(`/i/${seed().publicSlug}`);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  const anonymous = await scene();
  expect(anonymous.length).toBeGreaterThan(0);
  await login(page, seed().customerA);
  await page.goto(`/i/${seed().publicSlug}`);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  expect(await scene()).toEqual(anonymous);
});

test('client navigation releases product peer listeners and pending refresh admission', async ({
  context,
  page,
  delivery,
}) => {
  await context.addInitScript(() => {
    const Native = window.BroadcastChannel;
    const state = window as typeof window & {
      activeProductChannels?: number;
      activeUnloadListeners?: number;
    };
    state.activeProductChannels = 0;
    state.activeUnloadListeners = 0;
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'beforeunload' && listener) listeners.add(listener);
      state.activeUnloadListeners = listeners.size;
      if (listener) add(type, listener, options);
    };
    window.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === 'beforeunload' && listener) listeners.delete(listener);
      state.activeUnloadListeners = listeners.size;
      if (listener) remove(type, listener, options);
    };
    window.BroadcastChannel = class extends Native {
      private owned = false;
      constructor(name: string) {
        super(name);
        this.owned = name === 'wedding-auth-session';
        if (this.owned) state.activeProductChannels!++;
      }
      close() {
        if (this.owned) {
          state.activeProductChannels!--;
          this.owned = false;
        }
        super.close();
      }
    };
  });
  await login(page, seed().customerA);
  await page.goto('/invitations');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { activeUnloadListeners: number })
            .activeUnloadListeners,
      ),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole('button', { name: 'Tải thêm thiệp' }),
  ).toBeEnabled();
  delivery.hold({ method: 'POST', path: '/api/v1/auth/refresh', times: 1 });
  let once = true;
  await page.route('**/api/v1/invitations?*', async (route) => {
    if (once) {
      once = false;
      await route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Tải thêm thiệp' }).click();
  const held = await delivery.nextHeld({ path: '/api/v1/auth/refresh' });
  await held.committed;
  await page.locator(`a[href="/i/${seed().publicSlug}"]`).click();
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { activeProductChannels?: number })
          .activeProductChannels,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { activeUnloadListeners: number })
          .activeUnloadListeners,
    ),
  ).toBe(0);
  await held.release();
  await expect(sessionNav(page)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Tài khoản', exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expectSession(page, seed().customerA.email);
});

test('unavailable public invitation remains outside product chrome', async ({
  page,
}) => {
  await page.goto('/i/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText(/thiệp không khả dụng/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /đăng xuất/i })).toHaveCount(0);
});
