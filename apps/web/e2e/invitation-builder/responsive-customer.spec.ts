import { test, expect } from '@playwright/test';
import { seed, login, api, publish } from './responsive-product-fixtures';
import type { Page } from '@playwright/test';
async function geometry(page: Page) {
  return page.locator('[data-invitation-root]').evaluate((root) => {
    const r = root.getBoundingClientRect();
    return {
      text: root.textContent,
      order: [...root.querySelectorAll('[data-rendered-element]')].map((el) =>
        el.getAttribute('data-rendered-element'),
      ),
      rects: [
        root,
        ...root.querySelectorAll(
          '[data-section],[data-role="flow"],img,input,select,textarea,button',
        ),
      ].map((el) => {
        const b = el.getBoundingClientRect();
        return {
          id:
            el.getAttribute('data-rendered-element') ??
            el.getAttribute('data-section') ??
            el.tagName,
          x: b.x - r.x,
          y: b.y - r.y,
          width: b.width,
          height: b.height,
        };
      }),
    };
  });
}
test('Customer real data-only save, mobile preview/public parity, pinned publish and guest RSVP', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const s = seed();
  const adminContext = await browser.newContext({
    baseURL: new URL(process.env.RESPONSIVE_HOST_URL!).origin,
  });
  const adminPage = await adminContext.newPage();
  let revisionId: string;
  try {
    const admin = api(adminPage.request, await login(adminPage, s.admin));
    const detail = await admin(`/admin/templates/${s.templateId}`);
    const result = await publish(
      admin,
      `/admin/templates/${s.templateId}/publish`,
      detail.body.editVersion,
    );
    expect(result.status).toBe('SUCCEEDED');
    revisionId = result.result.revisionId;
  } finally {
    await adminContext.close();
  }
  const token = await login(page, s.customer);
  const call = api(page.request, token);
  await page.clock.setFixedTime(new Date(process.env.RESPONSIVE_PARITY_AS_OF!));
  await page.addInitScript(() => {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        document.documentElement.style.fontSize = '200%';
      },
      { once: true },
    );
  });
  await page.goto('/templates');
  await page
    .getByRole('button', { name: 'Chọn mẫu Mẫu kiểm thử', exact: true })
    .press('Enter');
  await expect(page).toHaveURL(/\/invitations\/[0-9a-f-]+\/edit$/);
  const id = new URL(page.url()).pathname.split('/').at(-2)!;
  const editUrl = page.url();
  const name = page.getByLabel('Tên cô dâu', { exact: true });
  await name.focus();
  await name.pressSequentially('Nguyễn Thị Mai Anh');
  await name.press('Tab');
  const payloads: unknown[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'PATCH' &&
      request.url().endsWith(`/invitations/${id}/draft`)
    )
      payloads.push(request.postDataJSON());
  });
  await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
  await expect(
    page.locator('section[aria-label="Thông tin thiệp"] > p[role="status"]'),
  ).toContainText('Đã lưu bản nháp');
  expect(payloads.length).toBeGreaterThan(0);
  for (const payload of payloads)
    expect(Object.keys(payload as object).sort()).toEqual([
      'expectedVersion',
      'weddingData',
    ]);
  await page.reload();
  await expect(name).toHaveValue('Nguyễn Thị Mai Anh');
  await expect(page.getByLabel('Thiết bị')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await expect
    .poll(
      async () =>
        (await page.locator('[data-invitation-root]').boundingBox())?.width,
    )
    .toBe(390);
  await page
    .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
    .click();
  await expect(
    page.locator('section[aria-label="Thông tin thiệp"] > p[role="status"]'),
  ).toContainText('Đã xuất bản thiệp', { timeout: 90000 });
  const detail = await call(`/invitations/${id}`);
  expect(detail.body.designRevisionId).toBe(revisionId!);
  expect(detail.body.document.schemaVersion).toBe(2);
  const guestContext = await browser.newContext({
    baseURL: new URL(editUrl).origin,
  });
  const guest = await guestContext.newPage();
  try {
    const asOf = process.env.RESPONSIVE_PARITY_AS_OF!;
    expect(asOf).toBeTruthy();
    await page.clock.setFixedTime(new Date(asOf));
    for (const width of [360, 375, 390]) {
      await page
        .locator('[data-testid="customer-preview-host"]')
        .evaluate((el, width) => {
          (el as HTMLElement).style.width = `${width}px`;
        }, width);
      await expect
        .poll(
          async () =>
            (await page.locator('[data-invitation-root]').boundingBox())?.width,
        )
        .toBe(width);
      await guest.setViewportSize({ width, height: 1100 });
      await guest.goto(detail.body.publicUrl);
      await expect(guest.locator('[data-invitation-root]')).toBeVisible();
      await expect(
        guest.getByRole('button', { name: 'Gửi phản hồi', exact: true }),
      ).toBeEnabled();
      for (const target of [page, guest])
        await target
          .locator('[data-invitation-root]')
          .evaluate(async (root) => {
            const faces = await document.fonts.load(
              '18px "Invitation Noto Sans v1"',
              'AgẮệỹ',
            );
            if (!faces.length) throw new Error('FONT_UNAVAILABLE');
            await document.fonts.ready;
            await Promise.all(
              [...root.querySelectorAll('img')].map((img) => img.decode()),
            );
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
          });
      const preview = await geometry(page),
        published = await geometry(guest);
      expect(preview.text).toBe(published.text);
      expect(preview.order).toEqual(published.order);
      expect(preview.rects.length).toBe(published.rects.length);
      const differences = preview.rects.flatMap((rect, index) =>
        ['x', 'y', 'width', 'height'].some(
          (key) =>
            Math.abs(rect[key as 'x'] - published.rects[index][key as 'x']) > 1,
        )
          ? [{ index, preview: rect, published: published.rects[index] }]
          : [],
      );
      if (differences.length)
        console.log(JSON.stringify({ width, differences }));
      preview.rects.forEach((rect, index) => {
        expect(rect.id).toBe(published.rects[index].id);
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(
            Math.abs(rect[key] - published.rects[index][key]),
          ).toBeLessThanOrEqual(1);
      });
    }
    await guest.locator('[data-invitation-root]').evaluate((root) => {
      const sizes = [...root.querySelectorAll<HTMLElement>('*')].map(
        (element) => ({
          element,
          size: parseFloat(getComputedStyle(element).fontSize),
        }),
      );
      for (const { element, size } of sizes)
        element.style.fontSize = `${size * 2}px`;
    });
    await guest
      .getByRole('textbox', { name: 'Tên khách mời' })
      .fill('Khách kiểm thử');
    await guest
      .getByRole('button', { name: 'Gửi phản hồi', exact: true })
      .focus();
    await guest.keyboard.press('Enter');
    await expect(guest.getByRole('status')).toContainText('Cảm ơn');
    await page
      .getByLabel('Tên cô dâu', { exact: true })
      .fill('Bản nháp chưa công khai');
    await page
      .getByRole('button', { name: 'Lưu bản nháp', exact: true })
      .click();
    await expect(
      page.locator('section[aria-label="Thông tin thiệp"] > p[role="status"]'),
    ).toContainText('Đã lưu bản nháp');
    await guest.reload();
    await expect(guest.locator('[data-invitation-root]')).toContainText(
      'Nguyễn Thị Mai Anh',
    );
    const failedPublish = `**/api/v1/invitations/${id}/publish`;
    await page.route(failedPublish, (route) =>
      route.fulfill({ status: 503, json: { code: 'RENDER_UNAVAILABLE' } }),
    );
    await page
      .getByRole('button', { name: 'Xuất bản thiệp', exact: true })
      .click();
    await expect(
      page.locator('section[aria-label="Thông tin thiệp"] > p[role="alert"]'),
    ).toContainText(/giữ|hiện tại/);
    await page.unroute(failedPublish);
    await guest.reload();
    await expect(guest.locator('[data-invitation-root]')).toContainText(
      'Nguyễn Thị Mai Anh',
    );
    const current = await call(`/invitations/${id}`);
    expect(
      (
        await call(`/invitations/${id}/draft`, 'PATCH', {
          expectedVersion: current.body.editVersion,
          weddingData: { schemaVersion: 1, bride: { name: 'Remote save' } },
        })
      ).status,
    ).toBe(200);
    await name.fill('Local conflict input');
    await name.press('Tab');
    await page
      .getByRole('button', { name: 'Lưu bản nháp', exact: true })
      .click();
    await expect(
      page.locator('section[aria-label="Thông tin thiệp"] > p[role="alert"]'),
    ).toContainText(/phiên bản|giữ/);
    await expect(name).toHaveValue('Local conflict input');
    await name.focus();
    await page.keyboard.press('Tab');
  } finally {
    await guestContext.close();
  }
});
