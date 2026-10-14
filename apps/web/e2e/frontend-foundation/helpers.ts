import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  test as base,
  expect,
  type Page,
  type Route,
  type Locator,
} from '@playwright/test';
import {
  startDeliveryProxy,
  type DeliveryProxy,
} from '../../tests/auth-transition/support/delivery-proxy';
export { expect };
export const test = base.extend<{ delivery: DeliveryProxy }>({
  delivery: async ({ context }, provide) => {
    const api = process.env.FRONTEND_TEST_API_URL;
    if (!api) throw new Error('Missing runner-owned API URL');
    const proxy = await startDeliveryProxy({ upstream: api });
    try {
      await context.addInitScript(
        ({ api, proxy }) => {
          const fetcher = window.fetch.bind(window);
          window.fetch = (input, init) => {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url;
            if (url.startsWith(api + '/')) {
              const target = proxy + url.slice(api.length);
              return fetcher(
                input instanceof Request ? new Request(target, input) : target,
                init,
              );
            }
            return fetcher(input, init);
          };
        },
        { api, proxy: proxy.url },
      );
      await provide(proxy);
    } finally {
      await proxy.close();
    }
  },
  context: async ({ context }, provide) => {
    const provider = process.env.FRONTEND_TEST_PROVIDER_URL;
    if (!provider) throw new Error('Missing owned provider fixture');
    const response = await fetch(`${provider}/reset-rate-limits`, {
      method: 'POST',
    });
    if (response.status !== 204)
      throw new Error('Cannot reset owned rate limits');
    if (process.env.FRONTEND_TEST_STORAGE_DIAGNOSTICS === '1') {
      context.on('page', (page) =>
        page.on('console', (message) => {
          if (message.text().startsWith('frontend-storage '))
            console.log(message.text());
        }),
      );
      await context.addInitScript(() => {
        const open = indexedDB.open.bind(indexedDB);
        indexedDB.open = (...args) => {
          const started = performance.now();
          const request = open(...args);
          for (const event of ['success', 'error', 'blocked'])
            request.addEventListener(event, () => {
              const elapsed = Math.round(performance.now() - started);
              if (event !== 'success' || elapsed > 100)
                console.log(
                  'frontend-storage open',
                  event,
                  elapsed,
                  event === 'error' ? request.error?.name : '',
                );
            });
          return request;
        };
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
          const started = performance.now();
          const tx = transaction.apply(this, args);
          for (const event of ['complete', 'error', 'abort'])
            tx.addEventListener(event, () => {
              const elapsed = Math.round(performance.now() - started);
              if (event !== 'complete' || elapsed > 100)
                console.log(
                  'frontend-storage transaction',
                  event,
                  elapsed,
                  tx.error?.name ?? '',
                  // Classify native infrastructure text without logging DB names,
                  // keys, record contents or arbitrary exception messages.
                  /connection.*(?:lost|clos)/i.test(tx.error?.message ?? '')
                    ? 'connection-lost'
                    : /internal.*(?:server|error)/i.test(
                          tx.error?.message ?? '',
                        )
                      ? 'internal-server'
                      : /without.*transaction|transaction.*not.*found/i.test(
                            tx.error?.message ?? '',
                          )
                        ? 'transaction-missing'
                        : 'unclassified',
                );
            });
          return tx;
        };
      });
    }
    await provide(context);
  },
});
export async function newAccount(label: string): Promise<Account> {
  const email = `${label}-${randomUUID()}@example.test`;
  const password = 'Frontend browser passphrase 123!';
  const response = await fetch(
    `${process.env.FRONTEND_TEST_PROVIDER_URL}/users`,
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  expect(response.status).toBe(204);
  return { id: '', email, password };
}
export const sessionNav = (page: Page) =>
  page.locator('#product-account-disclosure');

/** Open the real avatar disclosure, including after an owner remount closes it. */
export async function openSessionNav(page: Page, keyboard = false) {
  const trigger = page.getByRole('button', { name: 'Tài khoản', exact: true });
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    if (keyboard) {
      // Load lazily to reuse the real Tab traversal without a module-init cycle.
      const { activateByKeyboard } = await import('./keyboard');
      await activateByKeyboard(page, trigger);
    } else await trigger.click();
  }
  await expect(sessionNav(page)).toBeVisible();
}

export async function expectSession(
  page: Page,
  email: string,
  keyboard = false,
) {
  // Peer login leaves this tab in the background. WebKit can suspend the
  // animation frames that Playwright needs to check the disclosure's stability.
  await page.bringToFront();
  await expect
    .poll(async () => {
      await openSessionNav(page, keyboard);
      return (await sessionNav(page).textContent())?.includes(email) ?? false;
    })
    .toBe(true);
}
export type Account = { id: string; email: string; password: string };
export type Seed = {
  scene: import('../../src/features/invitation-builder/document/editor-document').EditorScene;
  design: import('../../src/features/invitation-builder/document/types').TemplateDesign;
  designRevisionId: string;
  customerA: Account;
  customerB: Account;
  adminA: Account;
  adminB: Account;
  invitationA: string;
  publicSlug: string;
  invitationB: string;
  templateA: string;
  templateB: string;
  assetA: string;
  assetB: string;
};
export function seed(): Seed {
  return JSON.parse(
    readFileSync(process.env.FRONTEND_TEST_SEED!, 'utf8'),
  ) as Seed;
}
export async function login(page: Page, account: Account) {
  if (new URL(page.url()).pathname !== '/login') await page.goto('/login');
  else if (
    await page.getByRole('heading', { name: 'Đăng nhập thành công' }).count()
  )
    await page.reload();
  await expect(
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  // Submit from the field: bootstrap chrome may appear between mouse down/up.
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter');
  // Session chrome can render during provisional admission, before the IDB
  // transaction completes. Wait for LoginForm's confirmed completion before
  // callers navigate away from the login document.
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập thành công', exact: true }),
  ).toBeVisible();
  await expectSession(page, account.email);
}
/** Fetch upstream now; release actual response only after the peer transition. */
export async function hold(page: Page, pattern: string) {
  let release!: () => void;
  let seen!: () => void;
  const ready = new Promise<void>((resolve) => (seen = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(pattern, async (route: Route) => {
    const response = await route.fetch();
    seen();
    await gate;
    await route.fulfill({ response });
  });
  return { ready, release };
}
export async function renew(page: Page) {
  await page.reload();
  await openSessionNav(page);
  await expect(
    page.getByRole('button', { name: 'Đăng xuất', exact: true }),
  ).toBeVisible();
}

export async function submitLogin(page: Page, account: Account) {
  await expect(
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  // Submit from the field: bootstrap chrome may appear between mouse down/up.
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter');
}

export async function capture(
  page: Page,
  scene = seed().scene,
  assetUrls: Record<string, string> = {},
) {
  await page.goto('/internal/invitation-renderer');
  await page.waitForFunction(() => Boolean(window.invitationCanvasRenderer));
  return page.evaluate(
    async ({ scene, assetUrls }) => {
      if (!window.invitationCanvasRenderer)
        throw new Error('Missing capture renderer');
      return window.invitationCanvasRenderer.render({
        candidateHash: 'a'.repeat(64),
        scene,
        context: { mode: 'capture', asOf: '2026-01-01T00:00:00Z', assetUrls },
        states: 'publication-validation',
        containerWidth: 390,
      });
    },
    { scene, assetUrls },
  );
}

export async function proofFor(
  email: string,
  purpose:
    'LOCAL_EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'SOCIAL_EMAIL_VERIFICATION',
) {
  let proof = '';
  await expect(async () => {
    const response = await fetch(
      `${process.env.FRONTEND_TEST_PROVIDER_URL}/email-proof`,
      { method: 'POST', body: JSON.stringify({ email, purpose }) },
    );
    expect(response.status).toBe(200);
    proof = ((await response.json()) as { proof: string }).proof;
    if (!proof) throw new Error('Fixture did not supply a proof');
  }).toPass();
  return proof;
}

export async function startSocial(
  page: Page,
  verified = true,
  activate?: (control: Locator) => Promise<void>,
) {
  await page.goto('/login');
  const button = page.getByRole('button', { name: 'Tiếp tục với Google' });
  if (activate) await activate(button);
  else await button.click();
  await expect(page).toHaveURL(/\/authorize\?/);
  const state = new URL(page.url()).searchParams.get('state');
  if (!state) throw new Error('Missing OAuth state');
  const code = randomUUID(),
    email = `social-${code}@example.test`;
  const response = await fetch(
    `${process.env.FRONTEND_TEST_PROVIDER_URL}/identities`,
    {
      method: 'POST',
      body: JSON.stringify({
        code,
        identity: {
          provider: 'GOOGLE',
          subject: code,
          email,
          emailVerified: verified,
          displayName: 'Nguyễn Thị Ánh với tên dài tiếng Việt',
          avatarUrl: null,
        },
      }),
    },
  );
  expect(response.status).toBe(204);
  return {
    email,
    callback: `${process.env.FRONTEND_TEST_API_URL}/api/v1/auth/oauth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
  };
}
