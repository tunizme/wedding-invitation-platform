import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';
import { verifyPreviewFlow } from './preview-flow';

// Compare pixels at the same device-pixel origin without changing authored boxes.
async function alignCapture(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element) => {
    const canvas = element.closest<HTMLElement>('[data-testid="workarea"]');
    if (!canvas) throw new Error('Missing canonical canvas');
    canvas.style.left = '';
    canvas.style.top = '';
    const rect = element.getBoundingClientRect();
    canvas.style.left = `${Math.round(rect.x) - rect.x}px`;
    canvas.style.top = `${Math.round(rect.y) - rect.y}px`;
  });
}

test.beforeEach(async ({ page, builderOrigin }, testInfo) => {
  const seedPath = process.env.BUILDER_TEST_BROWSER_SEED;
  if (!seedPath)
    throw new Error(
      'The builder runner must seed real browser accounts/assets.',
    );
  const accounts = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    admin: { email: string; password: string };
    secondAdmin: { email: string; password: string };
    phase11Admin: { email: string; password: string };
  };
  const seed = {
    admin: testInfo.title.startsWith('preserves')
      ? accounts.secondAdmin
      : testInfo.title.startsWith('keeps primitive')
        ? accounts.phase11Admin
        : accounts.admin,
  };
  await page.goto(builderOrigin + '/login');
  await expect(
    page.getByRole('button', { name: 'Đăng nhập', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill(seed.admin.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(seed.admin.password);
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập thành công', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await expect(page.locator('#product-account-disclosure')).toContainText(
    seed.admin.email,
  );
});

test('authors primitives with properties, layers, history and durable reload', async ({
  page,
  builderOrigin,
}) => {
  await page.goto(builderOrigin + '/admin/templates/new');
  await page
    .getByLabel('Tên mẫu', { exact: true })
    .fill('Authoring ' + randomUUID());
  await page.getByLabel('Danh mục', { exact: true }).fill('Wedding');
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[^/]+\/edit$/);
  await page.getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
  await page
    .getByLabel('Nội dung', { exact: true })
    .fill('Trân trọng kính mời');
  await page.getByLabel('Nội dung', { exact: true }).blur();
  await page.getByLabel('Cỡ chữ', { exact: true }).fill('28');
  await page.getByLabel('Cỡ chữ', { exact: true }).blur();
  await page.getByLabel('X', { exact: true }).fill('35');
  await page.getByLabel('X', { exact: true }).blur();
  // Resize the actual editor target at a scaled, rotated geometry.
  await page.getByLabel('Góc xoay', { exact: true }).fill('30');
  await page.getByLabel('Góc xoay', { exact: true }).blur();
  await page.getByLabel('Zoom', { exact: true }).selectOption('0.5');
  const readWidth = async () =>
    Number(await page.getByLabel('Chiều rộng', { exact: true }).inputValue());
  const width = await readWidth();
  const handle = page.locator('.moveable-se');
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeInViewport();
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error('Missing resize handle');
  const x = Math.floor(bounds.x + bounds.width / 2),
    y = Math.floor(bounds.y + bounds.height / 2);
  // Integer CSS-pixel pointer coordinates are consistent across engines.
  const dx = Math.floor(
    (40 * Math.cos(Math.PI / 6) - 20 * Math.sin(Math.PI / 6)) * 0.5,
  );
  const dy = Math.floor(
    (40 * Math.sin(Math.PI / 6) + 20 * Math.cos(Math.PI / 6)) * 0.5,
  );
  const expectedWidth =
    width + (dx * Math.cos(Math.PI / 6) + dy * Math.sin(Math.PI / 6)) / 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await expect(
    page.getByRole('button', { name: 'Xuất bản', exact: true }),
  ).toBeDisabled();
  await page.mouse.up();
  await expect(
    page.getByRole('button', { name: 'Xuất bản', exact: true }),
  ).toBeEnabled();
  await expect.poll(readWidth).toBeCloseTo(expectedWidth, 0);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect.poll(readWidth).toBe(width);
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await expect.poll(readWidth).toBeCloseTo(expectedWidth, 0);
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  await page.getByLabel('Nội dung', { exact: true }).focus();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('layer-item')).toHaveCount(1);
  await page
    .getByLabel('Nội dung', { exact: true })
    .fill('Trân trọng kính mời');
  await page.getByLabel('Nội dung', { exact: true }).blur();
  await page
    .getByRole('button', { name: 'Thêm hình dạng', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Nhân bản phần tử', exact: true })
    .click();
  await expect(page.getByTestId('layer-item')).toHaveCount(3);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByTestId('layer-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await expect(page.getByTestId('layer-item')).toHaveCount(3);
  await page.getByTestId('layer-item').first().getByRole('button').click();
  await page.getByRole('button', { name: 'Khóa phần tử', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Xóa phần tử', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Mở khóa phần tử', exact: true })
    .click();
  await page.getByRole('button', { name: 'Ẩn phần tử', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu');
  await page.reload();
  await expect(page.getByTestId('layer-item')).toHaveCount(3);
  await expect(page.getByTestId('workarea')).toContainText(
    'Trân trọng kính mời',
  );
  await page
    .getByRole('button', { name: 'Thêm hình ảnh', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Chọn Ảnh kiểm thử', exact: true })
    .first()
    .click();
  await expect(page.getByTestId('layer-item')).toHaveCount(4);
  await page
    .getByRole('button', { name: 'Thêm trang trí', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Chọn Ảnh kiểm thử', exact: true })
    .first()
    .click();
  await expect(page.getByTestId('layer-item')).toHaveCount(5);
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu');
  await verifyPreviewFlow(page, builderOrigin);
});

test('preserves dirty edits on stale save and confirms discarding before reload', async ({
  page,
  context,
  builderOrigin,
}) => {
  await page.goto(builderOrigin + '/admin/templates/new');
  await page
    .getByLabel('Tên mẫu', { exact: true })
    .fill('Conflict ' + randomUUID());
  await page.getByLabel('Danh mục', { exact: true }).fill('Wedding');
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByTestId('workarea')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu');
  await second
    .getByRole('button', { name: 'Thêm hình dạng', exact: true })
    .click();
  await second
    .getByRole('button', { name: 'Lưu bản nháp', exact: true })
    .click();
  await expect(
    second.getByRole('alert').filter({ hasText: 'phiên bản' }),
  ).toContainText('phiên bản');
  await expect(second.getByTestId('layer-item')).toHaveCount(1);
  second.once('dialog', (dialog) => dialog.dismiss());
  await second
    .getByRole('button', { name: 'Tải lại bản đã lưu', exact: true })
    .click();
  await expect(
    second.getByRole('alert').filter({ hasText: 'phiên bản' }),
  ).toContainText('phiên bản');
  let releaseReload: () => void = () => {};
  const reloadGate = new Promise<void>((resolve) => {
    releaseReload = resolve;
  });
  let reloading = false;
  await second.route('**/api/v1/admin/templates/*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    reloading = true;
    await reloadGate;
    await route.fulfill({ response });
  });
  second.once('dialog', (dialog) => dialog.accept());
  await second
    .getByRole('button', { name: 'Tải lại bản đã lưu', exact: true })
    .click();
  try {
    await expect.poll(() => reloading).toBe(true);
    await expect(second.locator('.moveable-control-box')).toHaveCount(0);
    await expect(
      second.getByRole('button', { name: 'Xuất bản', exact: true }),
    ).toBeDisabled();
    await expect(
      second.getByRole('button', { name: 'Thêm văn bản', exact: true }),
    ).toBeDisabled();
    await second.locator('body').click({ position: { x: 2, y: 2 } });
    await second.keyboard.press('Control+z');
    await expect(second.getByTestId('layer-item')).toHaveCount(1);
  } finally {
    releaseReload();
  }
  await expect(second.getByTestId('workarea')).toContainText('Văn bản');
  await second.close();
});

test('keeps primitive geometry across editor/preview and blocks dirty traversal and logout', async ({
  page,
  builderOrigin,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto(builderOrigin + '/admin/templates/new');
  await page
    .getByLabel('Tên mẫu', { exact: true })
    .fill('Frames ' + randomUUID());
  await page.getByLabel('Danh mục', { exact: true }).fill('Wedding');
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const editUrl = page.url();
  await page
    .getByRole('button', { name: 'Thêm hình dạng', exact: true })
    .click();
  await page.getByLabel('Chiều rộng', { exact: true }).fill('180');
  await page.getByLabel('Chiều rộng', { exact: true }).blur();
  await page.getByLabel('Chiều cao', { exact: true }).fill('90');
  await page.getByLabel('Chiều cao', { exact: true }).blur();
  await page.getByLabel('Độ dày viền', { exact: true }).fill('2');
  await page.getByLabel('Độ dày viền', { exact: true }).blur();
  await page.getByLabel('Bo góc', { exact: true }).fill('8');
  await page.getByLabel('Bo góc', { exact: true }).blur();
  await page.addStyleTag({
    content: '.moveable-control-box {display:none!important}',
  });
  for (const primitive of ['rectangle', 'ellipse', 'line']) {
    await page.getByLabel('Hình dạng').selectOption(primitive);
    for (const zoom of ['0.5', '1', '2']) {
      await page.getByLabel('Zoom', { exact: true }).selectOption(zoom);
      const dimensions = await page
        .locator('[data-element-id]')
        .evaluate((frame) => {
          const content = frame.querySelector(
            '[data-measure-content]',
          ) as HTMLElement;
          const shape = content.firstElementChild as HTMLElement;
          return {
            contentWidth: content.offsetWidth,
            contentHeight: content.offsetHeight,
            shapeWidth: shape.offsetWidth,
            shapeHeight: shape.offsetHeight,
            radius: getComputedStyle(frame).borderRadius,
            border: getComputedStyle(frame).borderWidth,
          };
        });
      expect(dimensions.contentWidth).toBe(primitive === 'line' ? 180 : 176);
      expect(dimensions.contentHeight).toBe(primitive === 'line' ? 90 : 86);
      expect(dimensions.shapeWidth).toBe(primitive === 'line' ? 180 : 176);
      if (primitive !== 'line') expect(dimensions.shapeHeight).toBe(86);
      if (primitive === 'ellipse') expect(dimensions.radius).toBe('50%');
      if (primitive === 'line') expect(dimensions.border).toBe('0px');
    }
    await page.getByLabel('Zoom', { exact: true }).selectOption('1');
    await alignCapture(page.locator('[data-element-id]').first());
    const pixels = await page
      .locator('[data-element-id]')
      .first()
      .screenshot({ animations: 'disabled', scale: 'css' });
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    const dimensions = await page
      .locator('[data-rendered-element] [data-measure-content]')
      .first()
      .evaluate((content) => ({
        width: (content as HTMLElement).offsetWidth,
        height: (content as HTMLElement).offsetHeight,
      }));
    expect(dimensions).toEqual({
      width: primitive === 'line' ? 180 : 176,
      height: primitive === 'line' ? 90 : 86,
    });
    await alignCapture(page.locator('[data-rendered-element]').first());
    const snapshotName = `frame-${primitive}.png`;
    const baseline = testInfo.snapshotPath(snapshotName);
    await mkdir(dirname(baseline), { recursive: true });
    await writeFile(baseline, pixels);
    await expect(
      page.locator('[data-rendered-element]').first(),
    ).toHaveScreenshot(snapshotName, {
      animations: 'disabled',
      scale: 'css',
      maxDiffPixelRatio: 0.02,
    });
    await page
      .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
      .click();
    await page.getByTestId('layer-item').first().getByRole('button').click();
  }
  await page.getByLabel('Zoom', { exact: true }).selectOption('1');
  for (const file of ['photo.png', 'decoration.png']) {
    await page
      .getByRole('button', { name: 'Thêm hình ảnh', exact: true })
      .click();
    const library = page.getByRole('dialog', { name: 'Thư viện ảnh' });
    await library.locator('input[type=file]').setInputFiles({
      name: file,
      mimeType: 'image/png',
      buffer: readFileSync(
        resolve(
          __dirname,
          '../../../../specs/004-invitation-builder/contracts/fixtures/assets',
          file,
        ),
      ),
    });
    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/admin/template-assets'),
    );
    await library
      .getByRole('button', { name: 'Tải ảnh lên và chọn', exact: true })
      .click();
    const uploaded = await upload;
    const uploadResult = (await uploaded.json()) as { code?: string };
    expect(uploaded.status(), uploadResult.code).toBe(201);
    await expect(library).not.toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Chiều rộng', { exact: true }).fill('160');
    await page.getByLabel('Chiều rộng', { exact: true }).blur();
    await page.getByLabel('Chiều cao', { exact: true }).fill('130');
    await page.getByLabel('Chiều cao', { exact: true }).blur();
    const image = page.locator('[data-element-id] img').last();
    await expect
      .poll(() =>
        image.evaluate(
          (img) =>
            img instanceof HTMLImageElement &&
            img.complete &&
            img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    for (const zoom of ['0.5', '1', '2']) {
      await page.getByLabel('Zoom', { exact: true }).selectOption(zoom);
      expect(
        await image.evaluate((img) => ({
          width: (img as HTMLElement).offsetWidth,
          height: (img as HTMLElement).offsetHeight,
        })),
      ).toEqual({ width: 160, height: 130 });
    }
    await page.getByLabel('Zoom', { exact: true }).selectOption('1');
    await alignCapture(page.locator('[data-element-id]').last());
    const imagePixels = await page
      .locator('[data-element-id]')
      .last()
      .screenshot({ animations: 'disabled', scale: 'css' });
    await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
    expect(
      await page
        .locator('[data-rendered-element] img')
        .last()
        .evaluate((img) => ({
          width: (img as HTMLElement).offsetWidth,
          height: (img as HTMLElement).offsetHeight,
        })),
    ).toEqual({ width: 160, height: 130 });
    await alignCapture(page.locator('[data-rendered-element]').last());
    const imageSnapshot = `image-${file}`;
    const imageBaseline = testInfo.snapshotPath(imageSnapshot);
    await mkdir(dirname(imageBaseline), { recursive: true });
    await writeFile(imageBaseline, imagePixels);
    await expect(
      page.locator('[data-rendered-element]').last(),
    ).toHaveScreenshot(imageSnapshot, {
      animations: 'disabled',
      scale: 'css',
      maxDiffPixelRatio: 0.02,
    });
    await page
      .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
      .click();
  }
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(editUrl);
  await expect(page.getByTestId('layer-item')).toHaveCount(3);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByTestId('layer-item')).toHaveCount(3);
  await expect(page.locator('#product-account-disclosure')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu');
  await page.reload();
  await expect(page.locator('[data-element-id]')).toHaveCount(3);
  await page.getByTestId('layer-item').first().getByRole('button').click();
  await expect(page.getByLabel('Chiều cao', { exact: true })).toHaveValue(
    '130',
  );
  await page.getByLabel('Chiều rộng', { exact: true }).fill('165');
  await page.getByLabel('Chiều rộng', { exact: true }).blur();
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu');
  await expect(
    page.getByRole('button', { name: 'Hoàn tác', exact: true }),
  ).toBeEnabled();
  let releasePoll: () => void = () => {};
  const pollGate = new Promise<void>((resolve) => {
    releasePoll = resolve;
  });
  let polling = false;
  await page.route('**/api/v1/publication-operations/*', async (route) => {
    polling = true;
    await pollGate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  try {
    await expect.poll(() => polling).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Hoàn tác', exact: true }),
    ).toBeDisabled();
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    await page.keyboard.press('Control+z');
    await expect(page.getByLabel('Chiều rộng', { exact: true })).toHaveValue(
      '165',
    );
    await page.keyboard.press('Control+Shift+z');
    await expect(page.getByTestId('layer-item')).toHaveCount(3);
  } finally {
    releasePoll();
  }
  await expect(
    page.getByRole('region', { name: 'Xuất bản mẫu' }).getByRole('status'),
  ).toContainText('Đã xuất bản phiên bản mới', { timeout: 60_000 });
});
