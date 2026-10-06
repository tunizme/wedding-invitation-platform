import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

test('customer keeps a pinned invitation and publishes only current-release assets at mobile and desktop widths', async ({
  page,
  browser,
  builderOrigin,
}) => {
  test.setTimeout(180_000);
  const seedPath = process.env.BUILDER_TEST_BROWSER_SEED;
  if (!seedPath)
    throw new Error(
      'The builder runner must seed a Customer and a published template.',
    );
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    customer: { email: string; password: string };
    customerFlowAdmin: { email: string; password: string };
    customerPhotos: [string, string];
    publishedTemplate: { id: string; revisionId: string };
  };
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!apiBase)
    throw new Error('The builder runner must expose the API origin.');
  await page.goto(builderOrigin + '/login');
  await page.getByLabel('Email', { exact: true }).fill(seed.customer.email);
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill(seed.customer.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toContainText(seed.customer.email);

  await page.goto(builderOrigin + '/templates');
  await expect(
    page.getByRole('button', { name: 'Chọn mẫu Mẫu kiểm thử' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Chọn mẫu Mẫu kiểm thử' }).click();
  await expect(page).toHaveURL(/\/invitations\/[0-9a-f-]+\/edit$/);
  const editUrl = page.url();
  await expect(page.getByText('Mẫu: Mẫu kiểm thử · DRAFT')).toBeVisible();
  await page.getByLabel('Tên cô dâu').click();
  await page.evaluate(() =>
    history.pushState(
      history.state,
      '',
      location.pathname + '?history-probe=1',
    ),
  );
  await page.getByLabel('Tên cô dâu').fill('Mai');
  await page.getByLabel('Ảnh đã tải lên').selectOption(seed.customerPhotos[0]);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  const backPrompt = page
    .waitForEvent('dialog', { timeout: 10_000 })
    .then((dialog) => dialog.dismiss());
  await page.evaluate(() => history.back());
  await backPrompt;
  await expect(page).toHaveURL(editUrl + '?history-probe=1');
  await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Mai');
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu bản nháp');
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(editUrl);
  await page.getByLabel('Tên cô dâu').fill('Local navigation edits');
  const forwardPrompt = page
    .waitForEvent('dialog', { timeout: 10_000 })
    .then((dialog) => dialog.dismiss());
  await page.evaluate(() => history.forward());
  await forwardPrompt;
  await expect(page).toHaveURL(editUrl);
  await expect(page.getByLabel('Tên cô dâu')).toHaveValue(
    'Local navigation edits',
  );
  await page.getByLabel('Tên cô dâu').fill('Mai');
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Mai');

  const invitationId = new URL(editUrl).pathname.split('/').at(-2)!;
  const failedRefresh = `**/api/v1/invitations/${invitationId}`;
  const failGet = async (route: import('@playwright/test').Route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 503, json: { code: 'RENDER_UNAVAILABLE' } });
  };
  await page.route(failedRefresh, failGet);
  await page.getByRole('button', { name: 'Xuất bản thiệp' }).click();
  await expect(page.getByRole('status')).toContainText('Đã xuất bản thiệp', {
    timeout: 90_000,
  });
  await expect(page.getByText('Mẫu: Mẫu kiểm thử · PUBLISHED')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gỡ xuất bản' })).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Thao tác đã thành công' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Xem thiệp công khai' }),
  ).toHaveCount(0);
  await page.unroute(failedRefresh);
  await page.getByRole('button', { name: 'Thử tải lại thông tin' }).click();
  const publicLink = page.getByRole('link', { name: 'Xem thiệp công khai' });
  await expect(publicLink).toHaveAttribute('href', /\/i\/[0-9a-f-]+$/);
  const publicPath = await publicLink.getAttribute('href');
  expect(publicPath).toBeTruthy();
  const slug = publicPath!.split('/').at(-1);
  const publicResponse = await page.request.get(
    `${apiBase}/public/invitations/${slug}`,
  );
  expect(publicResponse.ok()).toBe(true);
  const firstScene = (await publicResponse.json()) as {
    context: { assetUrls: Record<string, string> };
  };
  const firstAsset = new URL(
    firstScene.context.assetUrls[seed.customerPhotos[0]],
    apiBase,
  ).href;
  expect((await page.request.get(firstAsset)).status()).toBe(200);

  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(builderOrigin + publicPath);
    await expect(page.getByTestId('public-workarea')).toBeVisible();
    await expect(page.getByText('Mai', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.goto(editUrl);
  await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Mai');

  const adminPage = await browser.newPage();
  await adminPage.goto(builderOrigin + '/login');
  await adminPage
    .getByLabel('Email', { exact: true })
    .fill(seed.customerFlowAdmin.email);
  await adminPage
    .getByLabel('Mật khẩu', { exact: true })
    .fill(seed.customerFlowAdmin.password);
  await adminPage
    .getByRole('button', { name: 'Đăng nhập', exact: true })
    .click();
  await expect(
    adminPage.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toContainText(seed.customerFlowAdmin.email);
  await adminPage.goto(
    `${builderOrigin}/admin/templates/${seed.publishedTemplate.id}/edit`,
  );
  await adminPage
    .getByRole('button', { name: 'Gỡ xuất bản', exact: true })
    .click();
  await expect(
    adminPage
      .getByRole('status')
      .filter({ hasText: 'Đã gỡ mẫu khỏi thư viện' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Mai');
  expect(
    (await page.request.get(`${apiBase}/public/invitations/${slug}`)).status(),
  ).toBe(200);

  await page.getByLabel('Ảnh đã tải lên').selectOption(seed.customerPhotos[1]);
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu bản nháp');
  expect((await page.request.get(firstAsset)).status()).toBe(200);
  await page.getByRole('button', { name: 'Xuất bản thiệp' }).click();
  await expect(page.getByRole('status')).toContainText('Đã xuất bản thiệp', {
    timeout: 90_000,
  });
  await expect(
    page.getByRole('link', { name: 'Xem thiệp công khai' }),
  ).toHaveAttribute('href', publicPath!);
  const secondResponse = await page.request.get(
    `${apiBase}/public/invitations/${slug}`,
  );
  const secondScene = (await secondResponse.json()) as {
    context: { assetUrls: Record<string, string> };
  };
  const secondAsset = new URL(
    secondScene.context.assetUrls[seed.customerPhotos[1]],
    apiBase,
  ).href;
  expect((await page.request.get(firstAsset)).status()).toBe(404);
  expect((await page.request.get(secondAsset)).status()).toBe(200);

  await page.getByLabel('Tên cô dâu').fill('Local unpublish edit');
  await page.route(failedRefresh, failGet);
  await page.getByRole('button', { name: 'Gỡ xuất bản' }).click();
  await expect(page.getByRole('status')).toContainText('Đã gỡ thiệp công khai');
  await expect(page.getByText('Mẫu: Mẫu kiểm thử · UNPUBLISHED')).toBeVisible();
  await expect(page.getByLabel('Tên cô dâu')).toHaveValue(
    'Local unpublish edit',
  );
  await page.unroute(failedRefresh);
  await page.getByLabel('Tên cô dâu').fill('Mai');
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu bản nháp');
  await page.goto(builderOrigin + publicPath);
  await expect(page.getByText('Thiệp không khả dụng.')).toBeVisible();
  expect((await page.request.get(secondAsset)).status()).toBe(404);
  await page.goto(editUrl);
  await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Mai');
  await adminPage
    .getByRole('button', { name: 'Xuất bản', exact: true })
    .click();
  await expect(
    adminPage
      .getByRole('status')
      .filter({ hasText: 'Đã xuất bản phiên bản mới' }),
  ).toBeVisible({ timeout: 90_000 });
  await adminPage.close();
  await page.getByLabel('Tên cô dâu').fill('Discard on logout');
  const acceptedLogout = page
    .waitForEvent('dialog', { timeout: 10_000 })
    .then((dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await acceptedLogout;
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).not.toBeVisible();
});

test('preserves customer CAS through publication reads when another tab saves WeddingData', async ({
  page,
  context,
  builderOrigin,
}) => {
  test.setTimeout(420_000);
  const seed = JSON.parse(
    readFileSync(process.env.BUILDER_TEST_BROWSER_SEED!, 'utf8'),
  ) as {
    casCustomer: { email: string; password: string };
    casPhoto: string;
  };
  await page.goto(builderOrigin + '/login');
  await page.getByLabel('Email', { exact: true }).fill(seed.casCustomer.email);
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill(seed.casCustomer.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Phiên đăng nhập' }),
  ).toContainText(seed.casCustomer.email);
  const scenarios = [
    { mutation: 'publish', first: true, dirty: false, retry: false },
    { mutation: 'publish', first: true, dirty: true, retry: true },
    { mutation: 'publish', first: false, dirty: false, retry: false },
    { mutation: 'publish', first: false, dirty: true, retry: true },
    { mutation: 'unpublish', first: false, dirty: false, retry: false },
    { mutation: 'unpublish', first: false, dirty: true, retry: true },
  ];
  for (const scenario of scenarios) {
    await page.goto(builderOrigin + '/templates');
    await page.getByLabel('Tìm mẫu', { exact: true }).fill('Mẫu CAS');
    await expect(
      page.getByRole('button', { name: 'Chọn mẫu Mẫu CAS', exact: true }),
    ).toBeVisible();
    const created = page
      .waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/invitations') &&
          response.request().method() === 'POST',
        { timeout: 15_000 },
      )
      .catch(async () => {
        throw new Error(
          'No invitation create response; alerts: ' +
            (await page.getByRole('alert').allTextContents()).join(' | '),
        );
      });
    await page
      .getByRole('button', { name: 'Chọn mẫu Mẫu CAS', exact: true })
      .click();
    expect((await created).status()).toBe(201);
    await expect(page).toHaveURL(/\/invitations\/[0-9a-f-]+\/edit$/, {
      timeout: 15_000,
    });
    const editUrl = page.url(),
      id = new URL(editUrl).pathname.split('/').at(-2)!;
    await page.getByLabel('Tên cô dâu').fill('Mai');
    await page.getByLabel('Ảnh đã tải lên').selectOption(seed.casPhoto);
    await page
      .getByRole('button', { name: 'Lưu bản nháp', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Đã lưu bản nháp');
    if (!scenario.first) {
      await page
        .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
        .click();
      await expect(
        page.getByRole('link', { name: 'Xem thiệp công khai' }),
      ).toBeVisible({ timeout: 90_000 });
    }
    if (scenario.dirty) await page.getByLabel('Tên cô dâu').fill('Lan');
    const routePath = `**/api/v1/invitations/${id}`;
    let refreshSeen = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(routePath, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      if (!refreshSeen) {
        refreshSeen = true;
        if (scenario.retry)
          return route.fulfill({
            status: 503,
            json: { code: 'STORAGE_UNAVAILABLE' },
          });
        await gate;
      }
      await route.fulfill({ response: await route.fetch() });
    });
    await page
      .getByRole('button', {
        name:
          scenario.mutation === 'publish' ? 'Xuất bản thiệp' : 'Gỡ xuất bản',
        exact: true,
      })
      .click();
    await expect.poll(() => refreshSeen, { timeout: 90_000 }).toBe(true);
    const remote = await context.newPage();
    try {
      await remote.goto(editUrl);
      const publicPath = await remote
        .getByRole('link', { name: 'Xem thiệp công khai' })
        .getAttribute('href');
      await remote.getByLabel('Tên cô dâu').fill('Sen');
      await remote
        .getByRole('button', { name: 'Lưu bản nháp', exact: true })
        .click();
      await expect(remote.getByRole('status')).toContainText('Đã lưu bản nháp');
      release();
      if (scenario.retry)
        await page
          .getByRole('button', { name: 'Thử tải lại thông tin' })
          .click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'phiên bản mới' }),
      ).toBeVisible();
      await expect(page.getByLabel('Tên cô dâu')).toHaveValue(
        scenario.dirty ? 'Lan' : 'Mai',
      );
      await page.getByLabel('Tên cô dâu').fill('Nga');
      await page
        .getByRole('button', { name: 'Lưu bản nháp', exact: true })
        .click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'phiên bản mới' }),
      ).toBeVisible();
      await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Nga');
      await page
        .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Xuất bản thiệp', exact: true }),
      ).toBeEnabled();
      await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Nga');
      await remote.reload();
      await expect(remote.getByLabel('Tên cô dâu')).toHaveValue('Sen');
      const publicPage = await context.newPage();
      try {
        await publicPage.goto(builderOrigin + publicPath);
        if (scenario.mutation === 'unpublish')
          await expect(
            publicPage.getByText('Thiệp không khả dụng.'),
          ).toBeVisible();
        else
          await expect(
            publicPage.getByText(scenario.dirty ? 'Lan' : 'Mai', {
              exact: true,
            }),
          ).toBeVisible();
      } finally {
        await publicPage.close();
      }
      page.once('dialog', (dialog) => dialog.accept());
      await page
        .getByRole('button', { name: 'Tải lại bản đã lưu', exact: true })
        .click();
      await expect(page.getByLabel('Tên cô dâu')).toHaveValue('Sen');
      await page
        .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
        .click();
      await expect(page.getByRole('status')).toContainText(
        'Đã xuất bản thiệp',
        { timeout: 90_000 },
      );
      await expect(
        page.getByRole('button', { name: 'Thử tải lại thông tin' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Xem thiệp công khai' }),
      ).toHaveAttribute('href', publicPath!);
    } finally {
      release();
      await page.unroute(routePath);
      await remote.close();
    }
  }
});
