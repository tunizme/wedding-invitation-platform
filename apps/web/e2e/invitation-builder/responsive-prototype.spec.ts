import { test, expect } from '@playwright/test';
import {
  openResponsiveHost,
  resizeHost,
  mockRsvp,
} from './responsive-fixtures';

test('container threshold, intrinsic long content and grid order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openResponsiveHost(page, { width: 767, mode: 'preview' }, 'production');
  const root = page.locator('[data-invitation-root]');
  for (const [width, expected] of [
    [767, 480],
    [768, 768],
    [900, 900],
    [1440, 900],
  ]) {
    await resizeHost(page, width);
    await expect
      .poll(async () => (await root.boundingBox())?.width)
      .toBeCloseTo(expected, 0);
    expect(
      await root.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
  const photos = page.getByRole('img');
  expect((await photos.nth(0).boundingBox())!.y).toBeCloseTo(
    (await photos.nth(1).boundingBox())!.y,
    0,
  );
  await resizeHost(page, 390);
  expect((await photos.nth(1).boundingBox())!.y).toBeGreaterThan(
    (await photos.nth(0).boundingBox())!.y,
  );
  const before = (await root.boundingBox())!.height;
  await root.evaluate((el) => {
    const targets = [
      ...el.querySelectorAll<HTMLElement>('[data-measure-content], h3, button'),
    ];
    const sizes = targets.map((target) =>
      parseFloat(getComputedStyle(target).fontSize),
    );
    targets.forEach((target, index) => {
      target.style.fontSize = `${sizes[index] * 2}px`;
    });
  });
  expect(
    await root.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  expect((await root.boundingBox())!.height).toBeGreaterThan(before);
});
test('public RSVP retains focus and values across breakpoint without duplicate submission', async ({
  page,
}) => {
  const submissions = await mockRsvp(page);
  await openResponsiveHost(page, { width: 767, mode: 'public' }, 'production');
  const name = page.getByRole('textbox', { name: 'Tên khách mời' });
  await name.fill('Nguyễn Minh Anh');
  await name.focus();
  await resizeHost(page, 768);
  await expect(name).toHaveValue('Nguyễn Minh Anh');
  await expect(name).toBeFocused();
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cảm ơn');
  await resizeHost(page, 390);
  await expect(page.getByRole('status')).toContainText('Cảm ơn');
  expect(submissions).toHaveLength(1);
});
