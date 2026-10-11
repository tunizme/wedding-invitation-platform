import { test, expect } from '@playwright/test';
import { openResponsiveHost, resizeHost } from './responsive-fixtures';

test('isolated stub host can mount preview/public and resize without a production global', async ({
  page,
}) => {
  await openResponsiveHost(page, { width: 900, mode: 'public' }, 'stub');
  await expect(page.locator('[data-host-stub]')).toHaveText('public host');
  await resizeHost(page, 390);
  expect(
    await page
      .locator('[data-test-host]')
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBe(390);
  expect(
    await page.evaluate(
      () => 'invitationRenderer' in window || 'invitationRendererV2' in window,
    ),
  ).toBe(false);
});
