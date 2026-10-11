import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, type Page, type APIRequestContext } from '@playwright/test';
export const seed = () => {
  if (!process.env.BUILDER_TEST_BROWSER_SEED)
    throw new Error('Missing owned responsive seed');
  return JSON.parse(
    readFileSync(process.env.BUILDER_TEST_BROWSER_SEED, 'utf8'),
  ) as {
    admin: { email: string; password: string };
    customer: { email: string; password: string };
    templateId: string;
    document: unknown;
    assets: string[];
  };
};
export async function login(
  page: Page,
  account: { email: string; password: string },
) {
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith('/auth/login') &&
      r.request().method() === 'POST',
  );
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter');
  const session = await (await response).json();
  expect(typeof session.accessToken).toBe('string');
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toContainText(account.email);
  return session.accessToken as string;
}
export function api(request: APIRequestContext, token: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) throw new Error('Missing owned API origin');
  return async (path: string, method = 'GET', body?: unknown, key?: string) => {
    const response = await request.fetch(base + path, {
      method,
      data: body,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
    });
    return { status: response.status(), body: await response.json() };
  };
}
export async function publish(
  call: ReturnType<typeof api>,
  path: string,
  expectedVersion: number,
) {
  const started = Date.now();
  const accepted = await call(path, 'POST', { expectedVersion }, randomUUID());
  expect(accepted.status).toBe(202);
  let terminal: Awaited<ReturnType<typeof call>> | undefined;
  await expect
    .poll(
      async () => {
        terminal = await call(`/publication-operations/${accepted.body.id}`);
        return terminal.body.status;
      },
      { timeout: 90000, intervals: [250, 500, 1000] },
    )
    .toMatch(/SUCCEEDED|FAILED/);
  const elapsedMs = Date.now() - started;
  if (process.env.RESPONSIVE_ARTIFACTS) {
    mkdirSync(process.env.RESPONSIVE_ARTIFACTS, { recursive: true });
    appendFileSync(
      join(process.env.RESPONSIVE_ARTIFACTS, 'publication-timing.jsonl'),
      JSON.stringify({
        schema: 'responsive-publish-timing-1',
        status: terminal!.body.status,
        elapsedMs,
        captureBudgetMs: 30000,
        leaseMs: 45000,
        jobMs: 90000,
      }) + '\n',
    );
  }
  return { ...terminal!.body, elapsedMs };
}
