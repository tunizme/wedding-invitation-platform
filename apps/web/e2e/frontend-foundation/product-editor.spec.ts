import { test, expect, seed, hold, type Account } from './helpers';
import type { Page } from '@playwright/test';
type EditorSeed = ReturnType<typeof seed> & {
  editorInvitation: string;
  editorTemplateId: string;
  editorRevisionId: string;
};
const fixture = () => seed() as EditorSeed;
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
}
for (const width of [360, 375, 390, 430, 768, 1440]) {
  test(`US7 editor accordion draft retention and aligned fields at ${width}px`, async ({
    page,
  }) => {
    const f = fixture();
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page, f.customerA);
    await page.goto(`/invitations/${f.editorInvitation}/edit`);
    const bride = page.getByLabel('Tên cô dâu', { exact: true });
    const groom = page.getByLabel('Tên chú rể', { exact: true });
    await bride.fill(`Ngọc Anh ${width}`);
    await expect(groom).toBeVisible();
    const dateInput = page.getByLabel('Ngày và giờ tổ chức', { exact: true });
    const venueInput = page.getByLabel('Tên địa điểm · ceremony', {
      exact: true,
    });
    const addressInput = page.getByLabel('Địa chỉ · ceremony', { exact: true });
    const dateBox = await dateInput.boundingBox();
    const venueBox = await venueInput.boundingBox();
    const addressBox = await addressInput.boundingBox();
    for (const input of [bride, groom, dateInput, venueInput, addressInput]) {
      const boundary = await input.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          height: el.getBoundingClientRect().height,
          border: style.borderTopColor,
          width: style.borderTopWidth,
        };
      });
      expect(boundary.height).toBeGreaterThanOrEqual(44);
      expect(boundary.border).toBe('rgb(102, 88, 74)');
      expect(boundary.width).toBe('1px');
    }
    expect(Math.abs(dateBox!.height - venueBox!.height)).toBeLessThan(1);
    expect(Math.abs(addressBox!.x - dateBox!.x)).toBeLessThan(1);
    if (width >= 768) {
      expect(
        Math.abs(
          addressBox!.x + addressBox!.width - venueBox!.x - venueBox!.width,
        ),
      ).toBeLessThan(1);
      expect(addressBox!.width).toBeGreaterThan(dateBox!.width * 1.9);
    } else {
      expect(Math.abs(addressBox!.width - dateBox!.width)).toBeLessThan(1);
    }
    if (width >= 768) {
      const a = await bride.boundingBox(),
        b = await groom.boundingBox();
      expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
      expect(a!.width).toBeCloseTo(b!.width, 0);
      const date = await page
        .getByLabel('Ngày và giờ tổ chức', { exact: true })
        .boundingBox();
      const venue = await page
        .getByLabel('Tên địa điểm · ceremony', { exact: true })
        .boundingBox();
      expect(Math.abs(date!.y - venue!.y)).toBeLessThan(2);
      expect(date!.width).toBeCloseTo(venue!.width, 0);
    }
    const card = page.locator('details').filter({
      has: page.locator('summary', { hasText: 'Thông tin cơ bản' }),
    });
    expect(
      await card.evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(720);
    await card.locator('summary').click();
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    await expect(page.getByTestId('customer-preview-host')).toBeVisible();
    expect(
      await page
        .getByTestId('customer-preview-host')
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
    await expect(card).not.toHaveAttribute('open');
    await card.locator('summary').click();
    await expect(bride).toHaveValue(`Ngọc Anh ${width}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const save = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        new URL(r.url()).pathname ===
          `/api/v1/invitations/${f.editorInvitation}/draft`,
    );
    await page
      .getByRole('button', { name: 'Lưu bản nháp', exact: true })
      .click();
    const saved = await save;
    expect(saved.status()).toBe(200);
    const payload = saved.request().postDataJSON();
    expect(Object.keys(payload).sort()).toEqual([
      'expectedVersion',
      'weddingData',
    ]);
    expect(payload.weddingData.bride.name).toBe(`Ngọc Anh ${width}`);
    await expect(
      page.getByText('Đã lưu bản nháp.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(bride).toHaveValue(`Ngọc Anh ${width}`);
  });
}
test('US7 real version conflict preserves dirty edits until reload is confirmed', async ({
  page,
  context,
}) => {
  const f = fixture();
  await signIn(page, f.customerA);
  await page.goto(`/invitations/${f.editorInvitation}/edit`);
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toBeVisible();
  const peer = await context.newPage();
  try {
    await peer.goto(`/invitations/${f.editorInvitation}/edit`);
    await peer.getByLabel('Tên cô dâu', { exact: true }).fill('Bản đang nhập');
    await page.getByLabel('Tên cô dâu', { exact: true }).fill('Bản đã lưu');
    await page
      .getByRole('button', { name: 'Lưu bản nháp', exact: true })
      .click();
    await expect(
      page.getByText('Đã lưu bản nháp.', { exact: true }),
    ).toBeVisible();
    const conflict = peer.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().endsWith('/draft'),
    );
    await peer
      .getByRole('button', { name: 'Lưu bản nháp', exact: true })
      .click();
    expect((await conflict).status()).toBe(409);
    await expect(
      peer
        .getByRole('alert')
        .filter({ hasText: /phiên bản|thay đổi|VERSION/i }),
    ).toBeVisible();
    await expect(peer.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
      'Bản đang nhập',
    );
    peer.once('dialog', (d) => d.dismiss());
    await peer.getByRole('button', { name: 'Tải lại bản đã lưu' }).click();
    await expect(peer.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
      'Bản đang nhập',
    );
    peer.once('dialog', (d) => d.accept());
    await peer.getByRole('button', { name: 'Tải lại bản đã lưu' }).click();
    await expect(peer.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
      'Bản đã lưu',
    );
  } finally {
    await peer.close();
  }
});
test('US7 delayed save cannot publish after the owner changes', async ({
  page,
  context,
}) => {
  const f = fixture();
  await signIn(page, f.customerA);
  await page.goto(`/invitations/${f.editorInvitation}/edit`);
  await page.getByLabel('Tên cô dâu', { exact: true }).fill('Dữ liệu riêng A');
  const delayed = await hold(
    page,
    `**/invitations/${f.editorInvitation}/draft`,
  );
  let publishes = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/publish')) publishes++;
  });
  const peer = await context.newPage();
  try {
    await page.getByRole('button', { name: 'Xuất bản thiệp' }).click();
    await delayed.ready;
    await signIn(peer, f.customerB);
    await expect(page.getByLabel('Tên cô dâu', { exact: true })).toHaveCount(0);
    delayed.release();
    expect(publishes).toBe(0);
  } finally {
    delayed.release();
    await peer.close();
  }
});
test('US7 publishes a real saved draft, opens public snapshot and manages RSVP state', async ({
  page,
}) => {
  const f = fixture();
  await signIn(page, f.customerA);
  await page.goto('/templates');
  await page
    .getByRole('button', {
      name: 'Xem mẫu Frontend editor template',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Chọn mẫu này' }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Chọn mẫu này' }).click();
  await expect(page).toHaveURL(/\/invitations\/[^/]+\/edit$/);
  const id = new URL(page.url()).pathname.split('/')[2];
  await page.getByLabel('Tên cô dâu', { exact: true }).fill('Ngày vui của Anh');
  await page.getByRole('button', { name: 'Xuất bản thiệp' }).click();
  await expect(
    page.getByText('Đã xuất bản thiệp.', { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole('dialog', { name: 'Thiệp đã sẵn sàng gửi' })
    .getByRole('button', { name: 'Đóng thông tin chia sẻ' })
    .click();
  const publicUrl = await page
    .getByRole('link', { name: 'Xem thiệp công khai' })
    .getAttribute('href');
  await page.getByRole('link', { name: 'Phản hồi RSVP', exact: true }).click();
  const changed = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().endsWith('/rsvp-state'),
  );
  await page.getByRole('button', { name: 'Đóng nhận RSVP' }).click();
  expect((await changed).status()).toBe(200);
  await expect(
    page.getByText('Nhận RSVP: Đã đóng', { exact: true }),
  ).toBeVisible();
  await page.goto(`/invitations/${id}/edit`);
  await page
    .getByLabel('Tên cô dâu', { exact: true })
    .fill('Bản nháp chưa xuất bản');
  page.once('dialog', (d) => d.accept());
  await page.goto(publicUrl!);
  await expect(
    page.getByText('Ngày vui của Anh', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Bản nháp chưa xuất bản', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Tài khoản', exact: true }),
  ).toHaveCount(0);
});
