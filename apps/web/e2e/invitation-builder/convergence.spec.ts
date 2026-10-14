import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';

test('authors bindings, persisted samples, widgets and cover; customer publishes a Map and Timeline', async ({
  page,
  browser,
  builderOrigin,
}) => {
  test.setTimeout(240_000);
  const seed = JSON.parse(
    readFileSync(process.env.BUILDER_TEST_BROWSER_SEED!, 'utf8'),
  ) as {
    convergenceAdmin: { email: string; password: string };
    convergenceCustomer: { email: string; password: string };
  };
  await page.goto(builderOrigin + '/login');
  await expect(
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel('Email', { exact: true })
    .fill(seed.convergenceAdmin.email);
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill(seed.convergenceAdmin.password);
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập thành công', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await expect(page.locator('#product-account-disclosure')).toContainText(
    seed.convergenceAdmin.email,
  );
  await page.goto(builderOrigin + '/admin/templates/new');
  const name = 'Convergence ' + randomUUID();
  await page.getByLabel('Tên mẫu', { exact: true }).fill(name);
  await page.getByLabel('Danh mục', { exact: true }).fill('Wedding');
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const templateUrl = page.url();
  await page.getByLabel('Chiều cao thiệp', { exact: true }).fill('4000');
  await page.getByLabel('Chiều cao thiệp', { exact: true }).blur();
  for (const [index, kind] of [
    'Calendar',
    'Countdown',
    'Map',
    'Timeline',
    'RSVP',
    'QRBank',
  ].entries()) {
    await page
      .getByRole('button', { name: `Thêm ${kind}`, exact: true })
      .click();
    await page.getByLabel('Y', { exact: true }).fill(String(index * 600 + 20));
    await page.getByLabel('Y', { exact: true }).blur();
  }
  await expect(page.locator('[data-widget-placeholder]')).toHaveCount(0);
  await expect(page.getByTestId('workarea')).toContainText('Địa điểm mẫu');
  await page
    .getByRole('button', { name: 'Thêm hình ảnh', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Thư viện ảnh' })
    .getByRole('button', { name: /^Chọn / })
    .first()
    .click();
  await page.getByLabel('Y', { exact: true }).fill('3700');
  await page.getByLabel('Y', { exact: true }).blur();
  await page
    .getByLabel('Nguồn dữ liệu', { exact: true })
    .selectOption('bride.photo');
  await page.getByLabel('Ẩn nếu thiếu dữ liệu', { exact: true }).check();
  await page
    .getByRole('button', { name: 'Thêm giá trị dự phòng', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Thư viện ảnh' })
    .getByRole('button', { name: /^Chọn / })
    .first()
    .click();
  await expect(
    page.getByRole('button', { name: 'Thay ảnh dự phòng', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
  await page.getByLabel('Y', { exact: true }).fill('3900');
  await page.getByLabel('Y', { exact: true }).blur();
  await page
    .getByLabel('Liên kết văn bản', { exact: true })
    .selectOption('bride.name');
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  const photos = page.getByLabel('Ảnh mẫu cô dâu', { exact: true });
  await expect(photos).toBeVisible();
  await expect.poll(() => photos.locator('option').count()).toBeGreaterThan(1);
  const photoIds = await photos
    .locator('option')
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean),
    );
  expect(photoIds.length).toBeGreaterThan(0);
  expect(photoIds.length).toBeGreaterThan(1);
  await photos.selectOption(photoIds[0]);
  await page.getByText('Sự kiện mẫu ceremony', { exact: true }).click();
  await page.getByLabel('Ngày giờ ISO mẫu ceremony', { exact: true }).fill('');
  await expect(
    page.getByRole('alert').filter({ hasText: 'BINDING_REQUIRED' }),
  ).toBeVisible();
  await page
    .getByLabel('Ngày giờ ISO mẫu ceremony', { exact: true })
    .fill('2027-01-10T10:00:00+07:00');
  const sampleImage = page.locator('[data-rendered-element] img').last();
  await expect(sampleImage).toHaveAttribute('src', /^blob:/);
  const firstSource = await sampleImage.getAttribute('src');
  await page
    .getByRole('button', { name: 'Mẫu dữ liệu B', exact: true })
    .click();
  await photos.selectOption(photoIds[1]);
  await expect
    .poll(() => sampleImage.getAttribute('src'))
    .not.toBe(firstSource);
  await expect(page.getByTestId('workarea')).toContainText('Trần Ngọc Hà');
  await page
    .getByRole('button', { name: 'Mẫu dữ liệu A', exact: true })
    .click();
  await expect(photos).toHaveValue(photoIds[0]);
  await page
    .getByRole('button', { name: 'Dùng dữ liệu này khi xuất bản', exact: true })
    .click();
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu' }),
  ).toBeVisible();
  await page.route('**/api/v1/admin/template-assets?*', async (route) => {
    const response = await route.fetch();
    const result = (await response.json()) as {
      items: { id: string }[];
      nextCursor: string | null;
    };
    await route.fulfill({
      response,
      json: {
        ...result,
        items: result.items.filter((asset) => asset.id !== photoIds[0]),
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.getByLabel('Ảnh mẫu cô dâu', { exact: true })).toHaveValue(
    photoIds[0],
  );
  await expect(page.getByTestId('workarea')).toContainText('Nguyễn Minh Anh');
  await page
    .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
    .click();
  await page.getByText('Thông tin mẫu', { exact: true }).click();
  await page.getByRole('button', { name: 'Chọn ảnh bìa', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Thư viện ảnh' })
    .getByRole('button', { name: /^Chọn / })
    .first()
    .click();
  let releaseMetadata!: () => void;
  const metadataGate = new Promise<void>((resolve) => {
    releaseMetadata = resolve;
  });
  let metadataPending = false;
  const metadataRoute = '**/api/v1/admin/templates/*';
  await page.route(metadataRoute, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const response = await route.fetch();
    metadataPending = true;
    await metadataGate;
    await route.fulfill({ response });
  });
  await page
    .getByRole('button', { name: 'Lưu thông tin mẫu', exact: true })
    .click();
  try {
    await expect.poll(() => metadataPending).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Xuất bản', exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel('Tên mẫu', { exact: true })).toBeDisabled();
  } finally {
    releaseMetadata();
  }
  await expect(page.getByLabel('Tên mẫu', { exact: true })).toBeEnabled();
  await page.unroute(metadataRoute);

  await expect(page.getByText('Đang dùng ảnh bìa riêng')).toBeVisible();
  const metadataSave = page.getByRole('button', {
    name: 'Lưu thông tin mẫu',
    exact: true,
  });
  const metadataName = page.getByLabel('Tên mẫu', { exact: true });
  await expect(metadataName).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Tải lại bản đã lưu', exact: true }),
  ).toBeEnabled();
  for (const [code, status] of [
    ['VERSION_CONFLICT', 409],
    ['RENDER_UNAVAILABLE', 503],
  ] as const) {
    await metadataName.fill(name + ' retry ' + code);
    const failedMetadata = '**/api/v1/admin/templates/*';
    await page.route(failedMetadata, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await route.fulfill({
        status,
        json: { code, title: 'Metadata retry test', status },
      });
    });
    await metadataSave.click();
    await expect(metadataSave).toBeEnabled();
    await expect(metadataName).toHaveValue(name + ' retry ' + code);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
      .getByRole('button', { name: 'Tải lại bản đã lưu', exact: true })
      .click();
    await expect(metadataName).toHaveValue(name + ' retry ' + code);
    await page.unroute(failedMetadata);
    await metadataSave.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu thông tin mẫu' }),
    ).toBeVisible();
    await expect(metadataName).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Tải lại bản đã lưu', exact: true }),
    ).toBeEnabled();
  }
  await page.reload();
  await page.getByText('Thông tin mẫu', { exact: true }).click();
  await expect(page.getByText('Đang dùng ảnh bìa riêng')).toBeVisible();
  await page
    .getByRole('button', { name: 'Dùng thumbnail làm bìa', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Lưu thông tin mẫu', exact: true })
    .click();
  await metadataName.fill(name + ' published metadata');
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Đã xuất bản phiên bản mới|Không thể xuất bản/ }),
  ).toContainText('Đã xuất bản phiên bản mới', { timeout: 90_000 });

  await expect(
    page.getByRole('button', { name: 'Tải lại bản đã lưu', exact: true }),
  ).toBeEnabled();
  await expect(metadataName).toHaveValue(name + ' published metadata');
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toBeVisible();
  let releaseReload!: () => void;
  const reloadGate = new Promise<void>((resolve) => {
    releaseReload = resolve;
  });
  let reloading = false;
  const templateRoute = '**/api/v1/admin/templates/*';
  await page.route(templateRoute, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    reloading = true;
    await reloadGate;
    await route.fulfill({ response });
  });
  await page
    .getByRole('button', { name: 'Tải lại bản đã lưu', exact: true })
    .click();
  try {
    await expect.poll(() => reloading).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Xuất bản', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
    ).toBeDisabled();
  } finally {
    releaseReload();
  }
  await expect(
    page.getByRole('button', { name: 'Xuất bản', exact: true }),
  ).toBeEnabled();
  await page.unroute(templateRoute);

  // Keep all three kinds of local edits while adopting committed availability/version.
  const category = page.getByLabel('Danh mục', { exact: true });
  await category.fill('Wedding local');
  const canvasHeight = page.getByLabel('Chiều cao thiệp', { exact: true });
  await canvasHeight.fill('4100');
  await canvasHeight.blur();
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await page.getByLabel('Tên cô dâu mẫu', { exact: true }).fill('Minh Anh');
  await page
    .getByRole('button', { name: 'Dùng dữ liệu này khi xuất bản', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã gỡ mẫu khỏi thư viện' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toHaveCount(0);
  await expect(category).toHaveValue('Wedding local');
  await expect(canvasHeight).toHaveValue('4100');
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(canvasHeight).toHaveValue('4000');
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await expect(canvasHeight).toHaveValue('4100');
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.getByLabel('Tên cô dâu mẫu', { exact: true })).toHaveValue(
    'Minh Anh',
  );
  await page
    .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
    .click();
  // No manual reload: both PATCH operations must use the new server version.
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu' }),
  ).toBeVisible();
  await metadataSave.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu thông tin mẫu' }),
  ).toBeVisible();
  await expect(category).toHaveValue('Wedding local');
  await expect
    .poll(() =>
      page.getByRole('alert').filter({ hasText: /\S/ }).allTextContents(),
    )
    .toEqual([]);
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã xuất bản phiên bản mới' }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toBeVisible();

  await metadataName.fill(name + ' discard this edit');
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Tải lại bản đã lưu', exact: true })
    .click();
  await expect(metadataName).toHaveValue(name + ' published metadata');
  await expect(canvasHeight).toHaveValue('4100');
  await expect(category).toHaveValue('Wedding local');
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.getByLabel('Tên cô dâu mẫu', { exact: true })).toHaveValue(
    'Minh Anh',
  );
  await page
    .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
    .click();

  const customer = await browser.newPage();
  await customer.goto(builderOrigin + '/login');
  await expect(
    customer.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await customer
    .getByLabel('Email', { exact: true })
    .fill(seed.convergenceCustomer.email);
  await customer
    .getByLabel('Mật khẩu', { exact: true })
    .fill(seed.convergenceCustomer.password);
  await customer
    .getByRole('button', { name: 'Đăng nhập', exact: true })
    .click();
  await expect(
    customer.getByRole('heading', {
      name: 'Đăng nhập thành công',
      exact: true,
    }),
  ).toBeVisible();
  await customer
    .getByRole('button', { name: 'Tài khoản', exact: true })
    .click();
  await expect(customer.locator('#product-account-disclosure')).toContainText(
    seed.convergenceCustomer.email,
  );
  await customer.goto(builderOrigin + '/templates');
  await customer.getByLabel('Tìm mẫu', { exact: true }).fill(name);
  const cover = customer
    .getByRole('button', {
      name: 'Xem mẫu ' + name + ' published metadata',
      exact: true,
    })
    .locator('..')
    .locator('img');
  await expect(cover).toBeVisible();
  await expect
    .poll(async () => {
      try {
        return await cover.evaluate(async (element) => {
          const image = element as HTMLImageElement;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          return Array.from(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          ).some((value, index) => index % 4 !== 3 && value < 220);
        });
      } catch {
        return false;
      }
    })
    .toBe(true);
  await customer
    .getByRole('button', {
      name: 'Xem mẫu ' + name + ' published metadata',
      exact: true,
    })
    .click();
  await customer
    .getByRole('dialog', { name: name + ' published metadata', exact: true })
    .getByRole('button', { name: 'Chọn mẫu này', exact: true })
    .click();
  await customer.getByLabel('Tên cô dâu', { exact: true }).fill('Mai');
  await customer
    .getByLabel('Ngày giờ ISO', { exact: true })
    .fill('2027-01-10T10:00:00+07:00');
  await customer.getByLabel('Tên địa điểm', { exact: true }).fill('Sảnh Hoa');
  await customer.getByLabel('Địa chỉ', { exact: true }).fill('1 Đường Hoa');
  await customer.getByLabel('Vĩ độ', { exact: true }).fill('10.7769');
  await customer.getByLabel('Kinh độ', { exact: true }).fill('106.7009');
  await customer.getByLabel('Mã BIN ngân hàng', { exact: true }).fill('970436');
  await customer
    .getByLabel('Số tài khoản', { exact: true })
    .fill('000123456789');
  await customer
    .getByLabel('Tên người nhận', { exact: true })
    .fill('NGUYEN MAI');
  for (const [label, value] of [
    ['Tên địa điểm', 'Sảnh Hoa'],
    ['Số tài khoản', '000123456789'],
    ['Ngày giờ ISO', '2027-01-10T10:00:00+07:00'],
  ]) {
    const field = customer.getByLabel(label, { exact: true });
    await field.fill('   ');
    await customer
      .getByRole('button', { name: 'Xem trước', exact: true })
      .click();
    await expect(
      customer.getByRole('alert').filter({ hasText: 'Cần bổ sung:' }),
    ).toBeVisible();
    await expect(
      customer.getByRole('alert').filter({ hasText: 'BINDING_TYPE' }),
    ).toHaveCount(0);
    await customer
      .getByRole('button', { name: 'Chỉnh sửa', exact: true })
      .click();
    await field.fill(value);
  }
  await customer.getByRole('button', { name: 'Thêm mốc', exact: true }).click();
  await customer.getByLabel('Tiêu đề', { exact: true }).fill('Lễ cưới');
  await customer.getByLabel('Thời gian mốc', { exact: true }).fill('Buổi sáng');
  await customer.getByLabel('Ngày giờ ISO', { exact: true }).fill('');
  await customer
    .getByRole('button', { name: 'Xem trước', exact: true })
    .click();
  await expect(
    customer.getByRole('alert').filter({ hasText: 'Cần bổ sung:' }),
  ).toBeVisible();
  await customer
    .getByRole('button', { name: 'Chỉnh sửa', exact: true })
    .click();
  await expect(customer.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
    'Mai',
  );
  await customer
    .getByLabel('Ngày giờ ISO', { exact: true })
    .fill('2027-01-10T10:00:00+07:00');
  await customer
    .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
    .click();
  await expect(
    customer.getByRole('status').filter({ hasText: 'Đã xuất bản thiệp' }),
  ).toBeVisible({ timeout: 90_000 });
  await customer.clock.install({ time: new Date('2027-01-10T02:59:50Z') });
  await customer.clock.pauseAt(new Date('2027-01-10T02:59:58Z'));
  await customer
    .getByRole('link', { name: 'Xem thiệp công khai', exact: true })
    .click();
  await expect(customer.getByText('Sảnh Hoa', { exact: true })).toBeVisible();
  await expect(customer.getByText('Buổi sáng', { exact: true })).toBeVisible();
  await expect(
    customer.getByRole('link', { name: 'Mở chỉ đường' }),
  ).toHaveAttribute('href', /10.7769%2C106.7009/);
  await expect(customer.getByLabel('Giây', { exact: true })).toContainText(
    '02',
  );
  await customer.clock.fastForward(3000);
  await expect(
    customer.getByRole('status').filter({ hasText: 'Ngày vui đã đến' }),
  ).toBeVisible();
  await customer.close();

  // A short-canvas capture must validate the saved 390px height, not cover height.
  await page.goto(templateUrl);
  await page.getByTestId('layer-item').first().getByRole('button').click();
  // Hide existing elements so only one deliberate overflow is measured.
  const layers = page.getByTestId('layer-item');
  for (let index = 0; index < (await layers.count()); index++) {
    await layers.nth(index).getByRole('button').click();
    await page.getByRole('button', { name: 'Ẩn phần tử', exact: true }).click();
  }
  await page.getByLabel('Chiều cao thiệp', { exact: true }).fill('390');
  await page.getByLabel('Chiều cao thiệp', { exact: true }).blur();
  await page
    .getByRole('button', { name: 'Thêm hình dạng', exact: true })
    .click();
  await page.getByLabel('Y', { exact: true }).fill('330');
  await page.getByLabel('Y', { exact: true }).blur();
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'CANVAS_OVERFLOW' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
    .click();
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  const publicationStatus = page
    .getByRole('region', { name: 'Xuất bản mẫu' })
    .getByRole('status');
  await expect(publicationStatus).not.toContainText('Đang chuẩn bị', {
    timeout: 90_000,
  });
  await expect(publicationStatus).toContainText('CANVAS_OVERFLOW');
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toBeVisible();
});
