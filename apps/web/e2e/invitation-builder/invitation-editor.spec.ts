import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { seed, login, api, publish } from './responsive-product-fixtures';
import {
  createBlankDocument,
  type AdvancedNode,
  type EditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';

test('500px editor saves and publishes; guest scaling, envelope and moderated interactions', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  page.on('pageerror', (error) =>
    console.error('Editor browser runtime:', error.message),
  );
  const s = seed();
  const admin = api(page.request, await login(page, s.admin));
  await page.goto('/admin/templates/new');
  await page
    .getByLabel('Tên mẫu', { exact: true })
    .fill(`Editor500 ${randomUUID()}`);
  await expect(page.getByLabel('Kiểu thiết kế')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+\/edit$/);
  const id = new URL(page.url()).pathname.split('/').at(-2)!;
  await expect(page.getByRole('region', { name: 'Editor500px' })).toBeVisible();
  // The library starts closed; opening a tool shows it, the handle collapses it.
  await page.getByRole('button', { name: 'Hình ảnh', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Thư viện công cụ' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Thu gọn thư viện', exact: true })
    .click();
  await expect(
    page.getByRole('complementary', { name: 'Thư viện công cụ' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở thư viện', exact: true }).click();
  await expect(
    page.getByRole('complementary', { name: 'Thư viện công cụ' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Phóng to', exact: true }),
  ).toBeVisible();

  // The text tool has no library; it adds a text box immediately.
  await page.getByRole('button', { name: 'Văn bản', exact: true }).click();
  await page.locator('[data-editor-node]').first().dblclick();
  await page
    .getByRole('textbox', { name: 'Sửa văn bản trực tiếp', exact: true })
    .fill('Thiệp thử nghiệm 500');
  await page
    .getByRole('textbox', { name: 'Sửa văn bản trực tiếp', exact: true })
    .press('Tab');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Thiệp thử nghiệm 500', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Có bản khôi phục chưa lưu.', { exact: true }),
  ).toHaveCount(0);
  await page.route(`**/api/v1/admin/templates/${id}/draft`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'TEST_TEMPORARILY_UNAVAILABLE' }),
    }),
  );
  await page.locator('[data-editor-node]').first().dblclick();
  await page
    .getByRole('textbox', { name: 'Sửa văn bản trực tiếp', exact: true })
    .fill('Bản khôi phục cục bộ');
  await page
    .getByRole('textbox', { name: 'Sửa văn bản trực tiếp', exact: true })
    .press('Tab');
  await expect(
    page.getByRole('status').filter({ hasText: 'Lưu lỗi' }),
  ).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(
    page.getByText('Có bản khôi phục chưa lưu.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).click();
  await expect(
    page.getByText('Bản khôi phục cục bộ', { exact: true }).first(),
  ).toBeVisible();
  await page.unroute(`**/api/v1/admin/templates/${id}/draft`);
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  // The reload above reset the library to closed; open a tool to get the drawer trigger.
  await page.getByRole('button', { name: 'Hình ảnh', exact: true }).click();
  await page
    .getByRole('button', { name: 'Thư viện công cụ', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Thư viện công cụ' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Thư viện công cụ', exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  const current = await admin(`/admin/templates/${id}`);
  expect(current.body.draftDocument.schemaVersion).toBe(3);
  const document = createBlankDocument();
  const nodeId = randomUUID();
  const text = primitiveNode('Text');
  if ('text' in text.props.content)
    text.props.content.text = 'Thiệp thử nghiệm 500';
  document.nodes[nodeId] = text;
  document.nodes.ROOT.nodes.push(nodeId);
  document.nodes.ROOT.props.canvas.height = 1000;
  const albumId = randomUUID(),
    formId = randomUUID();
  document.nodes[albumId] = {
    ...text,
    type: { resolvedName: 'Album' },
    displayName: 'Album',
    props: {
      ...text.props,
      box: { x: 30, y: 130, width: 440, height: 340, rotation: 0 },
      bindings: [],
      content: { label: 'Kỷ niệm', field: 'memories', assetIds: s.assets },
    },
  } as AdvancedNode;
  document.nodes[formId] = {
    ...text,
    type: { resolvedName: 'CustomForm' },
    displayName: 'CustomForm',
    props: {
      ...text.props,
      box: { x: 30, y: 510, width: 440, height: 300, rotation: 0 },
      bindings: [],
      content: {
        label: 'Phản hồi riêng',
        field: null,
        fields: [
          {
            id: 'name',
            label: 'Tên người gửi',
            type: 'text',
            required: true,
            options: [],
          },
        ],
      },
    },
  } as AdvancedNode;
  document.nodes.ROOT.nodes.push(albumId, formId);
  document.settings.title = 'Published500';
  document.settings.envelope = true;
  document.settings.particles = 'petals';
  document.nodeOptions[nodeId] = { entrance: 'fade', continuous: 'float' };
  document.settings.toolbar.wishes = true;
  document.settings.toolbar.likes = true;
  const saved = await admin(`/admin/templates/${id}/draft`, 'PATCH', {
    expectedVersion: current.body.editVersion,
    document,
    sampleData: { schemaVersion: 1 },
  });
  expect(saved.status).toBe(200);
  const released = await publish(
    admin,
    `/admin/templates/${id}/publish`,
    saved.body.editVersion,
  );
  expect(released.error).toBeNull();
  expect(released.status).toBe('SUCCEEDED');
  const customerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const guest = await customerContext.newPage();
    const customerToken = await login(guest, s.customer);
    const customer = api(guest.request, customerToken);
    const created = await customer('/invitations', 'POST', {
      templateId: id,
      designRevisionId: released.result.revisionId,
    });
    expect(created.status).toBe(201);
    const uploaded = await guest.request.post(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/assets`,
      {
        headers: { Authorization: `Bearer ${customerToken}` },
        multipart: {
          name: 'Kỷ niệm riêng',
          kind: 'IMAGE',
          file: {
            name: 'memory.jpg',
            mimeType: 'image/jpeg',
            buffer: readFileSync(resolve('public/branding/couple-one.jpg')),
          },
        },
      },
    );
    expect(uploaded.status()).toBe(201);
    const customerImage = (await uploaded.json()).id as string;
    const personalized = await customer(
      `/invitations/${created.body.id}/draft`,
      'PATCH',
      {
        expectedVersion: created.body.editVersion,
        weddingData: {
          schemaVersion: 2,
          fields: { memories: { assetIds: [customerImage] } },
        },
      },
    );
    expect(personalized.status, JSON.stringify(personalized.body)).toBe(200);
    const published = await publish(
      customer,
      `/invitations/${created.body.id}/publish`,
      personalized.body.editVersion,
    );
    expect(published.error).toBeNull();
    expect(published.status).toBe('SUCCEEDED');
    const detail = await customer(`/invitations/${created.body.id}`);
    const url = new URL(detail.body.publicUrl, page.url()).href;
    await guest.goto(url);
    await expect(
      guest.getByRole('button', { name: 'Mở thiệp', exact: true }),
    ).toBeVisible();
    await expect(guest.locator('[inert]')).toHaveCount(1);
    await guest.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
    for (const width of [320, 375, 390, 500, 1440]) {
      await guest.setViewportSize({ width, height: 900 });
      await expect
        .poll(
          async () =>
            (await guest.locator('[data-invitation-root]').boundingBox())
              ?.width,
        )
        .toBe(Math.min(width, 500));
      expect(
        await guest.evaluate(
          () => window.document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        guest.getByRole('button', { name: 'Mở thiệp', exact: true }),
      ).toHaveCount(0);
    }
    await expect(guest).toHaveTitle('Published500');
    await expect(
      guest.getByRole('img', { name: 'Kỷ niệm 1', exact: true }),
    ).toBeVisible();
    await guest
      .getByLabel('Tên người gửi *', { exact: true })
      .fill('Câu trả lời riêng');
    await guest
      .getByRole('button', { name: 'Gửi phản hồi', exact: true })
      .click();
    await expect(
      guest.getByText('Đã ghi nhận phản hồi.', { exact: true }),
    ).toBeVisible();
    const answers = await customer(
      `/invitations/${created.body.id}/form-responses`,
    );
    expect(answers.body.items).toHaveLength(1);
    expect(
      (await admin(`/invitations/${created.body.id}/form-responses`)).status,
    ).toBe(403);
    await guest
      .getByRole('button', { name: 'Tạm dừng hiệu ứng', exact: true })
      .click();
    await expect(guest.locator('[data-motion-paused]')).toHaveAttribute(
      'data-motion-paused',
      'true',
    );
    await guest.emulateMedia({ reducedMotion: 'reduce' });
    await expect(
      guest.locator('[data-continuous="float"] > div').first(),
    ).toHaveCSS('animation-name', 'none');
    await guest.getByRole('button', { name: 'Yêu thích', exact: true }).click();
    await expect(
      guest.getByRole('button', { name: 'Yêu thích', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await guest.getByRole('button', { name: 'Yêu thích', exact: true }).click();
    await expect(
      guest.getByRole('button', { name: 'Yêu thích', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await guest.getByRole('button', { name: 'Lời chúc', exact: true }).click();
    await guest.getByLabel('Họ tên', { exact: true }).fill('Khách thử nghiệm');
    await guest
      .getByRole('textbox', { name: 'Lời chúc', exact: true })
      .fill('Chúc hai bạn hạnh phúc');
    await guest
      .getByRole('button', { name: 'Gửi lời chúc', exact: true })
      .click();
    await expect(
      guest.getByRole('status').filter({ hasText: 'đang chờ duyệt' }),
    ).toBeVisible();
    const pending = await customer(`/invitations/${created.body.id}/wishes`);
    expect(pending.body.items).toHaveLength(1);
    const slug = detail.body.publicUrl.split('/').at(-1);
    const visible = await guest.request.get(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/public/invitations/${slug}/wishes`,
    );
    expect((await visible.json()).items).toHaveLength(0);
    const moderated = await customer(
      `/invitations/${created.body.id}/wishes/${pending.body.items[0].id}`,
      'PATCH',
      { status: 'APPROVED' },
    );
    expect(moderated.status).toBe(200);
    await guest.getByRole('button', { name: 'Đóng', exact: true }).click();
    await guest.getByRole('button', { name: 'Lời chúc', exact: true }).click();
    await expect(
      guest.getByText('Chúc hai bạn hạnh phúc', { exact: true }),
    ).toBeVisible();
  } finally {
    await customerContext.close();
  }
});

test('Phase 11 controls persist and the element menu supports keyboard navigation', async ({
  page,
}) => {
  test.setTimeout(120000);
  const s = seed();
  const admin = api(page.request, await login(page, s.admin));
  await page.goto('/admin/templates/new');
  await page
    .getByLabel('Tên mẫu', { exact: true })
    .fill(`Phase11 ${randomUUID()}`);
  await page.getByRole('button', { name: 'Tạo mẫu', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]+\/edit$/);
  const id = new URL(page.url()).pathname.split('/').at(-2)!;
  await page.getByRole('button', { name: 'Văn bản', exact: true }).click();
  const text = page.locator('[data-editor-node]').first();
  await text.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Menu phần tử' });
  await expect(menu.getByRole('menuitem', { name: /Sao chép/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /Cắt/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(text).toHaveAttribute('data-selected', 'true');
  await expect(text).toBeFocused();
  await page.keyboard.press('Control+x');
  await expect(page.locator('[data-editor-node]')).toHaveCount(0);
  await page.keyboard.press('Control+v');
  await expect(page.locator('[data-editor-node]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Tiện ích', exact: true }).click();
  const library = page.getByRole('complementary', { name: 'Thư viện công cụ' });
  await library.getByRole('button', { name: 'Lịch', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Kiểu lịch', exact: true })
    .selectOption('filled');
  await library.getByRole('button', { name: 'Đếm ngược', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Hướng hiển thị', exact: true })
    .selectOption('vertical');
  await page
    .getByRole('spinbutton', { name: 'Khoảng cách (px)', exact: true })
    .fill('0');
  await page
    .getByRole('spinbutton', { name: 'Khoảng cách (px)', exact: true })
    .press('Tab');
  await expect(
    page.getByRole('spinbutton', { name: 'Khoảng cách (px)', exact: true }),
  ).toHaveValue('0');
  await library.getByRole('button', { name: 'Nút gọi', exact: true }).click();
  await page.getByLabel('Hiển thị biểu tượng điện thoại').uncheck();
  await library.getByRole('button', { name: 'Nhắc lịch', exact: true }).click();
  await page.getByLabel('Mô tả sự kiện').fill('Hẹn gặp cả nhà');
  await page.getByLabel('Mô tả sự kiện').press('Tab');
  await page.getByLabel('Sự kiện cả ngày').check();
  await library
    .getByRole('button', { name: 'Xác nhận tham dự', exact: true })
    .click();
  await page
    .getByLabel('Nhãn trường tên', { exact: true })
    .fill('Tên khách mời');
  await page.getByLabel('Nhãn trường tên', { exact: true }).press('Tab');
  await page
    .getByLabel('Nội dung nút gửi', { exact: true })
    .fill('Gửi lời đáp');
  await page.getByLabel('Nội dung nút gửi', { exact: true }).press('Tab');
  await library
    .getByRole('button', { name: 'Carousel ảnh', exact: true })
    .click();
  await page.getByLabel('Hiệu ứng chuyển ảnh').selectOption('fade');
  await page.getByLabel('Tự động chạy (khách có thể tạm dừng)').check();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã lưu' }),
  ).toBeVisible();
  const saved = (await admin(`/admin/templates/${id}`)).body
    .draftDocument as EditorDocument;
  const contents = saved.nodes.ROOT.nodes.map((nodeId) => {
    const n = saved.nodes[nodeId] as AdvancedNode;
    return { type: n.type.resolvedName, content: n.props.content };
  });
  expect(contents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'Calendar',
        content: expect.objectContaining({ variant: 'filled' }),
      }),
      expect.objectContaining({
        type: 'Countdown',
        content: expect.objectContaining({ layout: 'vertical', gap: 0 }),
      }),
      expect.objectContaining({
        type: 'Contact',
        content: expect.objectContaining({ showIcon: false }),
      }),
      expect.objectContaining({
        type: 'Reminder',
        content: expect.objectContaining({
          description: 'Hẹn gặp cả nhà',
          allDay: true,
        }),
      }),
      expect.objectContaining({
        type: 'RSVP',
        content: expect.objectContaining({
          nameLabel: 'Tên khách mời',
          submitLabel: 'Gửi lời đáp',
        }),
      }),
      expect.objectContaining({
        type: 'Carousel',
        content: expect.objectContaining({
          transition: 'fade',
          autoplay: true,
        }),
      }),
    ]),
  );
  await page.reload();
  await expect(page.locator('[data-editor-node]')).toHaveCount(7);
  await expect(
    page.getByText('Có bản khôi phục chưa lưu.', { exact: true }),
  ).toHaveCount(0);
});
