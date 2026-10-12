import { test, expect, seed, hold, type Account } from './helpers';
import type { Page } from '@playwright/test';

type ProductSeed = ReturnType<typeof seed> & {
  responsiveTemplateId: string;
  responsiveRevisionId: string;
};
const productSeed = () => seed() as ProductSeed;
async function signIn(page: Page, account: Account) {
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập thành công', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Tài khoản', exact: true }),
  ).toBeVisible();
}
async function openResponsive(page: Page) {
  await page.goto('/templates');
  const trigger = page.getByRole('button', {
    name: 'Xem mẫu Frontend responsive template',
    exact: true,
  });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(
    page.getByRole('dialog', { name: 'Frontend responsive template' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Chọn mẫu này', exact: true }),
  ).toBeEnabled();
  return trigger;
}
for (const width of [360, 375, 390, 430, 768, 1440]) {
  test(`US6 catalog popup keyboard and rectangle at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page, seed().customerA);
    let creates = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/invitations'
      )
        creates++;
    });
    const trigger = await openResponsive(page);
    expect(new URL(page.url()).pathname).toBe('/templates');
    expect(creates).toBe(0);
    const dialog = page.getByRole('dialog');
    expect(
      await page
        .getByTestId('template-mobile-preview')
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(390);
    await expect(dialog.locator('[data-host-policy="mobile"]')).toHaveCount(1);
    await expect(
      page.getByRole('img', { name: 'Mã QR mở demo trên điện thoại' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(
        // Native dialogs may traverse browser chrome at the tab boundary.
        // No focusable control in the background may receive focus.
        await dialog.evaluate(
          (el) =>
            document.activeElement === document.body ||
            el.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
test('US6 creates an invitation pinned to the revision confirmed in the popup', async ({
  page,
}) => {
  const f = productSeed();
  await signIn(page, f.customerA);
  await openResponsive(page);
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === '/api/v1/invitations',
  );
  await page.getByRole('button', { name: 'Chọn mẫu này', exact: true }).click();
  const created = await response;
  expect(created.request().postDataJSON()).toEqual({
    templateId: f.responsiveTemplateId,
    designRevisionId: f.responsiveRevisionId,
  });
  expect(created.status()).toBe(201);
  const detail = await created.json();
  expect(detail.designRevisionId).toBe(f.responsiveRevisionId);
  await expect(page).toHaveURL(new RegExp(`/invitations/${detail.id}/edit$`));
});
test('US6 demo opening and 900px adaptive preview never submits RSVP', async ({
  page,
}) => {
  const f = productSeed();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, f.customerA);
  let rsvpWrites = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /rsvp/.test(r.url())) rsvpWrites++;
  });
  await page.goto(
    `/templates/${f.responsiveTemplateId}/demo?revision=${f.responsiveRevisionId}`,
  );
  const opening = page.getByRole('region', { name: 'Lời mời mở thiệp' });
  await expect(
    page.getByRole('button', { name: 'Mở thiệp', exact: true }),
  ).toBeEnabled();
  expect(await opening.evaluate((el) => el.getBoundingClientRect().width)).toBe(
    600,
  );
  await expect(
    page.getByRole('link', { name: 'Tiệm làm thiệp — Trang chủ' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('template-demo-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  const root = page.locator('[data-invitation-root]');
  await expect
    .poll(() => root.evaluate((el) => el.getBoundingClientRect().width))
    .toBe(900);
  await expect(page.locator('[data-host-policy="adaptive"]')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /Gửi phản hồi|Gửi xác nhận/ }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => root.evaluate((el) => el.getBoundingClientRect().width))
    .toBe(390);
  expect(rsvpWrites).toBe(0);
  await page.getByRole('button', { name: 'Xem lại lời mời' }).click();
  await expect(page.getByRole('button', { name: 'Mở thiệp' })).toBeFocused();
});
test('US6 canonical demo resolves a real current published revision and rejects missing revisions', async ({
  page,
}) => {
  const f = productSeed();
  await signIn(page, f.customerA);
  await page.goto(`/templates/${f.responsiveTemplateId}/demo`);
  await expect(page.getByRole('button', { name: 'Mở thiệp' })).toBeEnabled();
  await page.goto(
    `/templates/${f.responsiveTemplateId}/demo?revision=99999999-9999-4999-8999-999999999999`,
  );
  await expect(
    page.getByText(/Mẫu đã thay đổi hoặc không còn khả dụng/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở thiệp' })).toBeDisabled();
});
test('US6 stale popup revision cannot return after a peer owner switch', async ({
  page,
  context,
}) => {
  const f = productSeed();
  await signIn(page, f.customerA);
  await page.goto('/templates');
  const delayed = await hold(
    page,
    `**/templates/${f.responsiveTemplateId}/revisions/${f.responsiveRevisionId}`,
  );
  const peer = await context.newPage();
  try {
    await page
      .getByRole('button', { name: 'Xem mẫu Frontend responsive template' })
      .click();
    await delayed.ready;
    await signIn(peer, f.customerB);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    delayed.release();
    await expect(page.getByTestId('template-mobile-preview')).toHaveCount(0);
  } finally {
    delayed.release();
    await peer.close();
  }
});
test('US6 account workspace displays loaded-page statistics and persists the real profile', async ({
  page,
}) => {
  await signIn(page, seed().customerA);
  await page.goto('/overview');
  await expect(page.getByText(/Thống kê trong 20 thiệp đã tải/)).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Không gian của bạn' });
  await expect(nav.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('link', { name: 'Thông tin cá nhân' }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Minh Anh');
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' &&
      new URL(r.url()).pathname === '/api/v1/me',
  );
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(
    page.locator('aside').getByText('Minh Anh', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tài khoản' }).click();
  await expect(
    page
      .locator('#product-account-disclosure')
      .getByText('Minh Anh', { exact: true }),
  ).toBeVisible();
});
