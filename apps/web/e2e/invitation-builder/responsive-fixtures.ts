import { expect, type Page } from '@playwright/test';
import type { HostInput } from '../responsive-host/mount';

export async function openResponsiveHost(
  page: Page,
  input: HostInput,
  adapter: 'stub' | 'production' = 'production',
) {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.responsiveHost));
  await page.evaluate(
    async ({ input, adapter }) => window.responsiveHost.mount(input, adapter),
    { input, adapter },
  );
  await expect(page.locator('[data-test-host]')).toBeAttached();
}
export async function resizeHost(page: Page, width: number) {
  await page.evaluate((width) => window.responsiveHost.resize(width), width);
}
export async function mockRsvp(page: Page) {
  const submissions: { payload: unknown; key: string | undefined }[] = [];
  await page.route('**/api/v1/public/invitations/*/rsvp-state', (route) =>
    route.fulfill({ json: { open: true, available: true } }),
  );
  await page.route('**/api/v1/public/invitations/*/rsvps', async (route) => {
    submissions.push({
      payload: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key'],
    });
    await route.fulfill({
      status: 201,
      json: {
        receiptId: '10000000-0000-4000-8000-000000000001',
        acceptedAt: '2026-10-11T00:00:00.000Z',
      },
    });
  });
  return submissions;
}
