import { test, expect, seed, login } from './helpers';
import type { Page } from '@playwright/test';

async function layoutReady(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.decode().catch(() => undefined),
      ),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
}
for (const width of [390, 1440]) {
  test(`US9 guided Admin creation preserves fields on rejection and creates real schema ${width === 390 ? 1 : 2} at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page, seed().adminA);
    await page.goto('/admin/templates/new');
    await expect(
      page.getByRole('heading', { name: 'Tạo mẫu thiệp', exact: true }),
    ).toBeVisible();
    const name = `Parity ${testInfo.project.name} ${width}`;
    await page.getByLabel('Tên mẫu', { exact: true }).fill(`  ${name}  `);
    await page.getByLabel('Danh mục', { exact: true }).fill('  Thanh lịch  ');
    await page
      .getByLabel('Kiểu thiết kế', { exact: true })
      .selectOption(width === 390 ? '1' : '2');
    let rejected = false;
    await page.route('**/admin/templates', async (route) => {
      if (route.request().method() === 'POST' && !rejected) {
        rejected = true;
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'DOCUMENT_INVALID', issues: [] }),
        });
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
    await expect(
      page.locator('[role="alert"]:not(#__next-route-announcer__)'),
    ).toBeVisible();
    await expect(page.getByLabel('Tên mẫu', { exact: true })).toHaveValue(
      `  ${name}  `,
    );
    await layoutReady(page);
    await testInfo.attach(`admin-create-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/admin/templates') &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
    const response = await responsePromise;
    expect(response.request().postDataJSON()).toEqual({
      name,
      category: 'Thanh lịch',
      ...(width === 1440 ? { schemaVersion: 2 } : {}),
    });
    const created = (await response.json()) as {
      id: string;
      status: string;
      draftDocument: { schemaVersion: number };
    };
    expect(created.status).toBe('DRAFT');
    expect(created.draftDocument.schemaVersion).toBe(width === 390 ? 1 : 2);
    await expect(page).toHaveURL(
      new RegExp(`/admin/templates/${created.id}/edit$`),
    );
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
  });
  test(`US10 mapped Admin list and account surfaces preserve token geometry at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page, seed().adminA);
    await page.goto('/admin/templates');
    await expect(
      page.getByRole('link', { name: 'Frontend owned template', exact: true }),
    ).toBeVisible();
    for (const label of ['Tìm mẫu', 'Danh mục', 'Nhãn', 'Trạng thái']) {
      const control = page.getByLabel(label, { exact: true });
      const geometry = await control.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        border: getComputedStyle(element).borderTopColor,
      }));
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.border).toBe('rgb(102, 88, 74)');
    }
    await layoutReady(page);
    await testInfo.attach(`admin-list-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Tài khoản', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Quản lý mẫu', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Thiệp của tôi', exact: true }),
    ).toHaveCount(0);
  });
}
test('US9 native duplicate preserves input after a rejection and confirms the real source version', async ({
  page,
}, testInfo) => {
  await login(page, seed().adminA);
  await page.goto('/admin/templates');
  await page
    .getByRole('button', {
      name: 'Nhân bản Frontend owned template',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Nhân bản Frontend owned template',
    exact: true,
  });
  const copyName = `Copied ${testInfo.project.name}`;
  await dialog
    .getByLabel('Tên bản sao', { exact: true })
    .fill(`  ${copyName}  `);
  let rejected = false;
  await page.route('**/admin/templates/*/duplicate', async (route) => {
    if (!rejected) {
      rejected = true;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'VERSION_CONFLICT', issues: [] }),
      });
    } else await route.continue();
  });
  await dialog
    .getByRole('button', { name: 'Nhân bản mẫu', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Tên bản sao', { exact: true })).toHaveValue(
    `  ${copyName}  `,
  );
  const accepted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/duplicate') &&
      response.status() === 201,
  );
  await dialog
    .getByRole('button', { name: 'Nhân bản mẫu', exact: true })
    .click();
  const response = await accepted;
  expect(response.request().postDataJSON()).toMatchObject({
    name: copyName,
    expectedVersion: expect.any(Number),
  });
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Tìm mẫu', { exact: true }).fill(copyName);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await expect(
    page.getByRole('link', { name: copyName, exact: true }),
  ).toBeVisible();
});
test('US8 Customer local date control writes the declared-zone ISO through the actual draft API', async ({
  page,
}) => {
  const fixture = seed() as ReturnType<typeof seed> & {
    editorInvitation: string;
  };
  await login(page, fixture.customerA);
  await page.goto(`/invitations/${fixture.editorInvitation}/edit`);
  const dateInput = page.getByLabel('Ngày và giờ tổ chức', { exact: true });
  // An input filled before React hydrates keeps its value but never reaches state;
  // clear and refill until the form reports the edit.
  await expect(async () => {
    await dateInput.fill('');
    await dateInput.fill('2026-12-21T18:30');
    await expect(
      page.getByText('Có thay đổi chưa lưu', { exact: true }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      response
        .url()
        .endsWith(`/invitations/${fixture.editorInvitation}/draft`) &&
      response.status() === 200,
  );
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  const response = await saved;
  expect(
    response.request().postDataJSON().weddingData.events.ceremony,
  ).toMatchObject({
    datetime: '2026-12-21T18:30:00+07:00',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  await expect(
    page.getByText('Đã lưu bản nháp.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel('Ngày và giờ tổ chức', { exact: true }),
  ).toHaveValue(/^2026-12-21T18:30(:00)?$/);
});
