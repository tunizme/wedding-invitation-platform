import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { startDeliveryProxy, type DeliveryProxy } from './delivery-proxy';

/**
 * Shared helpers for the 006 browser matrix. The owned stack
 * (scripts/auth-transition-stack.mjs, AUTH_TRANSITION_WITH_WEB=1) serves the
 * web app on 127.0.0.1 with NEXT_PUBLIC_API_BASE_URL pointing at this proxy.
 */
export const env = {
  webUrl: process.env.AUTH_TRANSITION_WEB_URL,
  apiUrl: process.env.AUTH_TRANSITION_API_URL,
  providerUrl: process.env.AUTH_TRANSITION_PROVIDER_URL,
  proxyPort: Number(process.env.AUTH_TRANSITION_PROXY_PORT ?? 3102),
};
export const stackReady = Boolean(env.webUrl && env.apiUrl && env.providerUrl);
export const PASSWORD = 'Browser Matrix Password 1';

export function startProxy(): Promise<DeliveryProxy> {
  return startDeliveryProxy({
    upstream: env.apiUrl ?? '',
    port: env.proxyPort,
  });
}

/** Test isolation: empty rate-limit buckets before each browser case. */
export async function resetRateLimits(): Promise<void> {
  const response = await fetch(`${env.providerUrl}/reset-rate-limits`, {
    method: 'POST',
  });
  expect(response.status).toBe(204);
}

/** Unique verified LOCAL user via the test-only harness fixture endpoint. */
export async function seedUser(label: string): Promise<string> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const response = await fetch(`${env.providerUrl}/users`, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  expect(response.status).toBe(204);
  return email;
}

export async function openLogin(page: Page) {
  await page.goto(`${env.webUrl}/login`);
  // Next dev keeps an HMR connection open, so wait for `load`; hydration races
  // are handled by the re-fill loop in submitLogin.
  await page.waitForLoadState('load');
  await expect(page.getByLabel('Email')).toBeVisible();
}

export async function submitLogin(page: Page, email: string) {
  await expect(page.getByRole('button', { name: /^Đăng nhập$/ })).toBeEnabled();
  // Controlled inputs: hydration can reset values typed too early, so re-fill
  // until React state holds them.
  await expect(async () => {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/^Mật khẩu$/).fill(PASSWORD);
    await expect(page.getByLabel('Email')).toHaveValue(email, { timeout: 500 });
    await expect(page.getByLabel(/^Mật khẩu$/)).toHaveValue(PASSWORD, {
      timeout: 500,
    });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel(/^Mật khẩu$/).press('Enter');
}

export async function loginViaUi(page: Page, email: string) {
  await openLogin(page);
  await submitLogin(page, email);
  await expect(page.getByText('Đăng nhập thành công')).toBeVisible();
}

/**
 * The principal the API actually renews for this browser: reload, let the app
 * bootstrap (selector → CSRF → refresh) and read the session navigation.
 */
export async function principalAfterReload(page: Page): Promise<string | null> {
  await page.goto(`${env.webUrl}/login`);
  const nav = page.getByRole('navigation', { name: 'Phiên đăng nhập' });
  try {
    await nav.waitFor({ timeout: 10_000 });
  } catch {
    return null;
  }
  return ((await nav.locator('span').first().textContent()) ?? '').trim();
}
