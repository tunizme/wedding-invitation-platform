import { test, expect } from '@playwright/test';
import { seed, login, api, publish } from './responsive-product-fixtures';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
test('Admin authors section pilot with history, artwork, bindings, real publish and390/900 public parity', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const s = seed();
  const call = api(page.request, await login(page, s.admin));
  await page.clock.setFixedTime(new Date(process.env.RESPONSIVE_PARITY_AS_OF!));
  await page.addInitScript(() => {
    const apply = () => {
      const style = document.createElement('style');
      style.textContent =
        '[data-section-controls]{font-size:200%} [data-section-controls] :is(button,input,select,textarea){font:inherit}';
      document.head.append(style);
    };
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    else apply();
  });
  await page.goto('/admin/templates/new');
  await page
    .getByLabel('Tên mẫu', { exact: true })
    .fill(`Pilot ${randomUUID()}`);
  await page.getByLabel('Kiểu thiết kế').selectOption('2');
  await page
    .getByRole('button', { name: 'Tạo mẫu', exact: true })
    .press('Enter');
  await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+\/edit$/);
  const id = new URL(page.url()).pathname.split('/').at(-2)!;
  await expect(
    page.getByRole('heading', { name: 'Thiết kế responsive' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Chọn Tên cô dâu và chú rể', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Nội dung', exact: true })
    .fill('Nguyễn Minh Anh & Đặng Hoàng Nam');
  await page.getByLabel('Cỡ chữ (mobile)', { exact: true }).fill('30');
  await page.getByLabel('Cỡ chữ (mobile)', { exact: true }).press('Tab');
  await page
    .getByLabel('Liên kết văn bản', { exact: true })
    .selectOption('bride.name');
  await page
    .getByRole('button', { name: 'Mẫu dữ liệu A', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Chọn section Lễ thành hôn', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Thêm hình trang trí', exact: true })
    .click();
  await page.getByLabel('X (%)', { exact: true }).fill('70');
  await page.getByLabel('X (%)', { exact: true }).press('Tab');
  await page.getByLabel('Tên section mới', { exact: true }).fill('Thông tin');
  await page
    .getByRole('button', { name: 'Thêm section', exact: true })
    .press('Enter');
  await page
    .getByRole('button', { name: 'Hoàn tác', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('button', { name: 'Chọn section Thông tin', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Làm lại', exact: true })
    .press('Enter');
  await page
    .getByRole('button', { name: 'Đưa section Thông tin lên', exact: true })
    .press('Enter');
  await page
    .getByRole('button', { name: 'Đưa section Thông tin xuống', exact: true })
    .press('Enter');
  await page.getByRole('button', { name: 'Thêm Text', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Nội dung', exact: true })
    .fill(
      'Trân trọng kính mời gia đình và bạn bè đến chung vui. Địa chỉ minh họa, Thành phố Hồ Chí Minh.',
    );
  await page.getByLabel('Tên section mới', { exact: true }).fill('Ảnh đôi');
  await page
    .getByRole('button', { name: 'Thêm section', exact: true })
    .press('Enter');
  await page
    .getByRole('combobox', { name: 'Bố cục desktop', exact: true })
    .selectOption('grid');
  await page
    .getByRole('combobox', { name: 'Số cột desktop', exact: true })
    .selectOption('2');
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: 'Thêm Image', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Ảnh mẫu', exact: true })
      .selectOption(s.assets[index]);
    await page
      .getByLabel('Mô tả ảnh', { exact: true })
      .fill(`Ảnh kỷ niệm của đôi uyên ương ${index + 1}`);
    await page.getByLabel('Tỉ lệ ảnh', { exact: true }).fill('1.5');
    await page.getByLabel('Tỉ lệ ảnh', { exact: true }).press('Tab');
  }
  await page.getByLabel('Tên section mới', { exact: true }).fill('Xác nhận');
  await page
    .getByRole('button', { name: 'Thêm section', exact: true })
    .press('Enter');
  await page
    .getByRole('combobox', { name: 'Độ rộng nội dung mobile', exact: true })
    .selectOption('form');
  await page.getByRole('button', { name: 'Thêm RSVP', exact: true }).click();
  await page
    .getByRole('button', { name: 'Lưu thiết kế', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu thiết kế' }),
  ).toBeVisible();
  const stored = await call(`/admin/templates/${id}`);
  expect(stored.body.draftDocument.schemaVersion).toBe(2);
  expect(stored.body.draftDocument.sectionOrder).toHaveLength(4);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Chọn section Ảnh đôi', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Xuất bản', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã xuất bản phiên bản mới' }),
  ).toBeVisible({ timeout: 90000 });
  expect(
    await page
      .locator('[aria-label="Trình thiết kế sections"]')
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  const current = await call(`/admin/templates/${id}`);
  const customerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const customerPage = await customerContext.newPage();
  try {
    const customer = api(
      customerPage.request,
      await login(customerPage, s.customer),
    );
    const created = await customer('/invitations', 'POST', {
      templateId: id,
      designRevisionId: current.body.publishedRevisionId,
    });
    expect(created.status).toBe(201);
    const saved = await customer(
      `/invitations/${created.body.id}/draft`,
      'PATCH',
      {
        expectedVersion: created.body.editVersion,
        weddingData: stored.body.draftSampleData,
      },
    );
    expect(saved.status).toBe(200);
    expect(
      (
        await publish(
          customer,
          `/invitations/${created.body.id}/publish`,
          saved.body.editVersion,
        )
      ).status,
    ).toBe('SUCCEEDED');
    const detail = await customer(`/invitations/${created.body.id}`);
    for (const width of [390, 900]) {
      await page
        .getByRole('combobox', { name: 'Chiều rộng xem trước', exact: true })
        .selectOption(String(width));
      await customerPage.setViewportSize({ width, height: 1100 });
      await customerPage.goto(detail.body.publicUrl);
      await expect(
        customerPage.getByRole('button', { name: 'Gửi phản hồi', exact: true }),
      ).toBeEnabled();
      const measure = async (target: typeof page) =>
        target.locator('[data-invitation-root]').evaluate(async (root) => {
          await document.fonts.ready;
          await Promise.all(
            [...root.querySelectorAll('img')].map((img) => img.decode()),
          );
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const r = root.getBoundingClientRect();
          return {
            text: root.textContent,
            rects: [
              root,
              ...root.querySelectorAll(
                '[data-section],[data-role="flow"],input,select,textarea,button,img',
              ),
            ].map((el) => {
              const b = el.getBoundingClientRect();
              return {
                x: b.x - r.x,
                y: b.y - r.y,
                width: b.width,
                height: b.height,
              };
            }),
          };
        });
      const preview = await measure(page),
        guest = await measure(customerPage);
      expect(preview.text).toBe(guest.text);
      expect(preview.rects.length).toBe(guest.rects.length);
      expect(preview.rects[0].width).toBe(width);
      preview.rects.forEach((rect, index) => {
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(
            Math.abs(rect[key] - guest.rects[index][key]),
          ).toBeLessThanOrEqual(1);
      });
    }
  } finally {
    await customerContext.close();
  }
  writeFileSync(
    join(process.env.RESPONSIVE_ARTIFACTS!, 'pilot-v2-ui.json'),
    JSON.stringify(stored.body.draftDocument, null, 2) + '\n',
  );
  // A remote save must preserve local authoring input on stale CAS.
  await page
    .getByRole('button', { name: 'Chọn section Thông tin', exact: true })
    .click();
  await page
    .getByLabel('Tên section', { exact: true })
    .fill('Local information');
  const fresh = await call(`/admin/templates/${id}`);
  expect(
    (
      await call(`/admin/templates/${id}/draft`, 'PATCH', {
        expectedVersion: fresh.body.editVersion,
        document: fresh.body.draftDocument,
        sampleData: fresh.body.draftSampleData,
      })
    ).status,
  ).toBe(200);
  await page
    .getByRole('button', { name: 'Lưu thiết kế', exact: true })
    .press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'phiên bản' }),
  ).toBeVisible();
  await expect(page.getByLabel('Tên section', { exact: true })).toHaveValue(
    'Local information',
  );
});

test('manual re-authoring uses explicit sections, preserves v1 source and old invitation pin', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const s = seed(),
    admin = api(page.request, await login(page, s.admin));
  const legacy = await admin('/admin/templates', 'POST', {
    name: `Nguồn canvas ${randomUUID()}`,
    category: 'Test',
  });
  expect(legacy.status).toBe(201);
  const { primitiveNode, defaultTextStyle } =
    await import('../../src/features/invitation-builder/editor/defaults');
  const old = structuredClone(legacy.body.draftDocument);
  const textId = randomUUID(),
    imageId = randomUUID();
  const text = primitiveNode('Text');
  text.custom.layerName = 'Lời mời gốc';
  text.props.content = {
    text: 'Trân trọng kính mời',
    textStyle: defaultTextStyle,
  };
  const image = primitiveNode('Image', s.assets[0]);
  image.custom.layerName = 'Ảnh gốc';
  old.nodes.ROOT.nodes = [textId, imageId];
  old.nodes[textId] = text;
  old.nodes[imageId] = image;
  const saved = await admin(
    `/admin/templates/${legacy.body.id}/draft`,
    'PATCH',
    { expectedVersion: 1, document: old, sampleData: { schemaVersion: 1 } },
  );
  expect(saved.status).toBe(200);
  const released = await publish(
    admin,
    `/admin/templates/${legacy.body.id}/publish`,
    saved.body.editVersion,
  );
  expect(released.status).toBe('SUCCEEDED');
  const context = await browser.newContext({
      baseURL: new URL(page.url()).origin,
    }),
    customerPage = await context.newPage();
  try {
    const customer = api(
      customerPage.request,
      await login(customerPage, s.customer),
    );
    const invitation = await customer('/invitations', 'POST', {
      templateId: legacy.body.id,
      designRevisionId: released.result.revisionId,
    });
    expect(invitation.status).toBe(201);
    await page.goto('/admin/templates/new');
    await page
      .getByLabel('Tên mẫu', { exact: true })
      .fill(`Chuyển thủ công ${randomUUID()}`);
    await page.getByLabel('Kiểu thiết kế').selectOption('2');
    await page
      .getByRole('button', { name: 'Tạo mẫu', exact: true })
      .press('Enter');
    await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+\/edit$/);
    const id = new URL(page.url()).pathname.split('/').at(-2)!;
    let release!: () => void;
    let first = true;
    let fetched!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve)),
      arrived = new Promise<void>((resolve) => (fetched = resolve));
    await page.route(`**/admin/templates/${legacy.body.id}`, async (route) => {
      if (!first) {
        await route.continue();
        return;
      }
      first = false;
      const response = await route.fetch();
      const body = await response.json();
      body.draftDocument.nodes[textId].custom.layerName =
        'Nội dung trễ không được nhận';
      fetched();
      await held;
      await route.fulfill({ response, json: body }).catch(() => {});
    });
    const sourcePicker = page.getByRole('combobox', {
      name: 'Mẫu cũ',
      exact: true,
    });
    await sourcePicker.selectOption(legacy.body.id);
    await page.getByRole('button', { name: 'Tải mẫu cũ', exact: true }).click();
    await arrived;
    await sourcePicker.selectOption(s.templateId);
    await sourcePicker.selectOption(legacy.body.id);
    await page.getByRole('button', { name: 'Tải mẫu cũ', exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Nội dung từ mẫu cũ', exact: true }),
    ).toContainText('Lời mời gốc');
    release();
    await expect(
      page.getByRole('combobox', { name: 'Nội dung từ mẫu cũ', exact: true }),
    ).not.toContainText('Nội dung trễ');
    await page
      .getByRole('combobox', { name: 'Nội dung từ mẫu cũ', exact: true })
      .selectOption(textId);
    await page
      .getByRole('button', { name: 'Đưa nội dung vào section', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Chọn Lời mời gốc', exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Tên section mới', { exact: true })
      .fill('Ảnh tái sử dụng');
    await page
      .getByRole('button', { name: 'Thêm section', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Nội dung từ mẫu cũ', exact: true })
      .selectOption(imageId);
    await page
      .getByRole('button', { name: 'Đưa nội dung vào section', exact: true })
      .click();
    await page
      .getByLabel('Mô tả ảnh', { exact: true })
      .fill('Ảnh kỷ niệm tái sử dụng từ mẫu cũ');
    await page
      .getByRole('button', { name: 'Lưu thiết kế', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã lưu thiết kế' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Xuất bản', exact: true })
      .press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã xuất bản phiên bản mới' }),
    ).toBeVisible({ timeout: 90000 });
    const converted = await admin(`/admin/templates/${id}`);
    expect(converted.body.publishedRevisionId).not.toBe(
      released.result.revisionId,
    );
    expect(converted.body.draftDocument.sectionOrder).toHaveLength(2);
    const original = await admin(`/admin/templates/${legacy.body.id}`);
    expect(original.body.draftDocument).toEqual(old);
    expect(original.body.publishedRevisionId).toBe(released.result.revisionId);
    expect(
      (await customer(`/invitations/${invitation.body.id}`)).body
        .designRevisionId,
    ).toBe(released.result.revisionId);
  } finally {
    await context.close();
  }
});
