import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

test('publishes through the trusted renderer and keeps the template editable after unpublish', async ({
  page,
  builderOrigin,
}) => {
  test.setTimeout(180_000);
  const seedPath = process.env.BUILDER_TEST_BROWSER_SEED;
  if (!seedPath)
    throw new Error('The builder runner must seed a real Admin account.');
  const accounts = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    publicationAdmin: { email: string; password: string };
  };
  await page.goto(builderOrigin + '/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(accounts.publicationAdmin.email);
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill(accounts.publicationAdmin.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toContainText(accounts.publicationAdmin.email);

  await page.goto(builderOrigin + '/admin/templates/new');
  const name = 'Publication ' + randomUUID();
  await page.getByLabel('Tên mẫu', { exact: true }).fill(name);
  await page.getByLabel('Danh mục', { exact: true }).fill('Wedding');
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[^/]+\/edit$/);
  const templateUrl = page.url();

  const templateId = new URL(templateUrl).pathname.split('/').at(-2)!;
  const failedRefresh = `**/api/v1/admin/templates/${templateId}`;
  const failGet = async (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 503, json: { code: 'RENDER_UNAVAILABLE' } });
  };
  await page.route(failedRefresh, failGet);
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã xuất bản phiên bản mới' }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole('status').filter({ hasText: 'chưa tải được thông tin' }),
  ).toBeVisible();
  await page.unroute(failedRefresh);
  await page.getByRole('button', { name: 'Thử tải lại thông tin' }).click();
  await expect(
    page.getByRole('button', { name: 'Thử tải lại thông tin' }),
  ).toHaveCount(0);
  // An unavailable refresh must not roll back the committed unpublish version.
  await page.route(failedRefresh, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 503, json: { code: 'RENDER_UNAVAILABLE' } });
  });
  await page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã gỡ mẫu khỏi thư viện' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(templateUrl);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Không thể tải lại mẫu.' }),
  ).toBeVisible();
  await page.unroute(failedRefresh);

  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã xuất bản phiên bản mới' }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Thêm văn bản', exact: true }).click();
  await page
    .getByLabel('Nội dung', { exact: true })
    .fill('Nội dung quá dài '.repeat(30));
  await page.getByLabel('Nội dung', { exact: true }).blur();
  await page.getByLabel('Cỡ chữ', { exact: true }).fill('80');
  await page.getByLabel('Cỡ chữ', { exact: true }).blur();
  await page.getByLabel('Chiều cao', { exact: true }).fill('24');
  await page.getByLabel('Chiều cao', { exact: true }).blur();
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Không thể xuất bản. Bản công khai hiện tại vẫn được giữ.',
    }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('status').filter({ hasText: 'Không thể xuất bản.' }),
  ).toContainText('CONTENT_OVERFLOW');
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toBeVisible();

  const copyName = name + ' copy';
  await page.goto(builderOrigin + '/admin/templates');
  await page.getByLabel('Tìm mẫu', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Nhân bản ' + name, exact: true }),
  ).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept(copyName));
  await page
    .getByRole('button', { name: 'Nhân bản ' + name, exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: copyName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: copyName, exact: true }).locator('..'),
  ).toContainText('DRAFT');
  await page.getByRole('link', { name: copyName, exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Xuất bản', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Gỡ xuất bản', exact: true }),
  ).toHaveCount(0);

  // Exercise catalog request ownership using the same authenticated session.
  let releaseList!: () => void;
  let listGate: Promise<void> | null = null;
  let failList = false;
  const queries: string[] = [];
  const listRoute = '**/api/v1/admin/templates?*';
  await page.route(listRoute, async (route) => {
    const url = new URL(route.request().url());
    queries.push(url.search);
    const held = listGate;
    if (held) await held;
    if (failList)
      return route.fulfill({
        status: 503,
        json: { code: 'STORAGE_UNAVAILABLE' },
      });
    url.searchParams.set('limit', '1');
    await route.fulfill({
      response: await route.fetch({ url: url.toString() }),
    });
  });
  try {
    await page.goto(builderOrigin + '/admin/templates');
    await page.getByLabel('Tìm mẫu', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Trang tiếp' }),
    ).toBeVisible();
    listGate = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    await page
      .getByLabel('Danh mục', { exact: true })
      .fill('Missing ' + randomUUID());
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Trang tiếp' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('status')).toContainText('Đang tải danh sách');
    listGate = null;
    releaseList();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: copyName, exact: true }),
    ).toHaveCount(0);
    expect(queries.at(-1)).not.toContain('cursor=');
    failList = true;
    await page.getByLabel('Danh mục', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Thử tải lại danh sách' }),
    ).toBeVisible();
    failList = false;
    await page.getByRole('button', { name: 'Thử tải lại danh sách' }).click();
    await expect(
      page.getByRole('button', { name: 'Trang tiếp' }),
    ).toBeVisible();
    // Hold the duplicate receipt while the user changes the search.
    let releaseDuplicate!: () => void;
    const duplicateGate = new Promise<void>((resolve) => {
      releaseDuplicate = resolve;
    });
    let committed = false;
    const duplicateRoute = '**/api/v1/admin/templates/*/duplicate';
    await page.route(duplicateRoute, async (route) => {
      const response = await route.fetch();
      committed = true;
      await duplicateGate;
      await route.fulfill({ response });
    });
    try {
      const duplicateButton = page
        .getByRole('button', { name: /^Nhân bản / })
        .first();
      page.once('dialog', (dialog) => dialog.accept(name + ' delayed copy'));
      await duplicateButton.click();
      await expect.poll(() => committed).toBe(true);
      await page.getByLabel('Tìm mẫu', { exact: true }).fill(copyName);
      await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
      await expect(
        page.getByRole('link', { name: copyName, exact: true }),
      ).toBeVisible();
      releaseDuplicate();
      await expect(
        page.getByRole('button', { name: 'Nhân bản ' + copyName, exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: copyName, exact: true }),
      ).toBeVisible();
      expect(queries.at(-1)).toContain(
        'q=' + encodeURIComponent(copyName).replaceAll('%20', '+'),
      );
    } finally {
      releaseDuplicate();
      await page.unroute(duplicateRoute);
    }
  } finally {
    releaseList?.();
    await page.unroute(listRoute);
  }
});

test('keeps template CAS baseline when another tab edits before publication refresh or retry', async ({
  page,
  context,
  builderOrigin,
}) => {
  test.setTimeout(300_000);
  const seed = JSON.parse(
    readFileSync(process.env.BUILDER_TEST_BROWSER_SEED!, 'utf8'),
  ) as { casAdmin: { email: string; password: string } };
  await page.goto(builderOrigin + '/login');
  await page.getByLabel('Email', { exact: true }).fill(seed.casAdmin.email);
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill(seed.casAdmin.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toContainText(seed.casAdmin.email);
  for (const retry of [false, true])
    for (const dirty of [false, true]) {
      await page.goto(builderOrigin + '/admin/templates/new');
      await page
        .getByLabel('Tên mẫu', { exact: true })
        .fill('Refresh CAS ' + randomUUID());
      await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
      await expect(page).toHaveURL(/\/edit$/);
      const editUrl = page.url(),
        id = new URL(editUrl).pathname.split('/').at(-2)!;
      // Navigation can finish before the initial detail GET (especially WebKit).
      // Install the refresh interception only after that read mounted the editor.
      await expect(
        page.getByLabel('Chiều cao thiệp', { exact: true }),
      ).toHaveValue('1600');
      const routePath = `**/api/v1/admin/templates/${id}`;
      let refreshSeen = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(routePath, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        if (!refreshSeen) {
          refreshSeen = true;
          if (retry)
            return route.fulfill({
              status: 503,
              json: { code: 'STORAGE_UNAVAILABLE' },
            });
          await gate;
        }
        await route.fulfill({ response: await route.fetch() });
      });
      const height = page.getByLabel('Chiều cao thiệp', { exact: true });
      if (dirty) {
        await height.fill('1800');
        await height.blur();
      }
      await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
      await expect.poll(() => refreshSeen, { timeout: 90_000 }).toBe(true);
      const remote = await context.newPage();
      try {
        await remote.goto(editUrl);
        await remote
          .getByLabel('Chiều cao thiệp', { exact: true })
          .fill('2200');
        await remote.getByLabel('Chiều cao thiệp', { exact: true }).blur();
        await remote
          .getByRole('button', { name: 'Xem trước', exact: true })
          .click();
        await remote
          .getByLabel('Tên cô dâu mẫu', { exact: true })
          .fill('Remote sample');
        await remote
          .getByRole('button', { name: 'Dùng dữ liệu này khi xuất bản' })
          .click();
        await remote
          .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
          .click();
        await remote
          .getByRole('button', { name: 'Lưu bản nháp', exact: true })
          .click();
        await expect(
          remote.getByRole('status').filter({ hasText: 'Đã lưu' }),
        ).toBeVisible();
        await remote.getByText('Thông tin mẫu', { exact: true }).click();
        await remote
          .getByLabel('Danh mục', { exact: true })
          .fill('Remote category');
        await remote
          .getByRole('button', { name: 'Lưu thông tin mẫu', exact: true })
          .click();
        await expect(
          remote
            .getByRole('status')
            .filter({ hasText: 'Đã lưu thông tin mẫu' }),
        ).toBeVisible();
        release();
        if (retry)
          await page
            .getByRole('button', { name: 'Thử tải lại thông tin' })
            .click();
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: 'Bản sửa của bạn vẫn được giữ' }),
        ).toBeVisible();
        await expect(height).toHaveValue(dirty ? '1800' : '1600');
        await height.fill('1900');
        await height.blur();
        await page
          .getByRole('button', { name: 'Hoàn tác', exact: true })
          .click();
        await expect(height).toHaveValue(dirty ? '1800' : '1600');
        await page
          .getByRole('button', { name: 'Làm lại', exact: true })
          .click();
        await expect(height).toHaveValue('1900');
        await page
          .getByRole('button', { name: 'Lưu bản nháp', exact: true })
          .click();
        await expect(
          page.getByRole('alert').filter({ hasText: 'phiên bản mới' }),
        ).toBeVisible();
        await expect(height).toHaveValue('1900');
        await remote.reload();
        await expect(
          remote.getByLabel('Chiều cao thiệp', { exact: true }),
        ).toHaveValue('2200');
        page.once('dialog', (dialog) => dialog.accept());
        await page
          .getByRole('button', { name: 'Tải lại bản đã lưu', exact: true })
          .click();
        await expect(height).toHaveValue('2200');
        await page.getByText('Thông tin mẫu', { exact: true }).click();
        await expect(page.getByLabel('Danh mục', { exact: true })).toHaveValue(
          'Remote category',
        );
        await page
          .getByRole('button', { name: 'Xem trước', exact: true })
          .click();
        await expect(
          page.getByLabel('Tên cô dâu mẫu', { exact: true }),
        ).toHaveValue('Remote sample');
        await page
          .getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Xuất bản', exact: true })
          .click();
        await expect(
          page
            .getByRole('status')
            .filter({ hasText: /^Đã xuất bản phiên bản mới\.$/ }),
        ).toBeVisible({ timeout: 90_000 });
      } finally {
        release();
        await page.unroute(routePath);
        await remote.close();
      }
    }
});
