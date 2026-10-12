import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const invitationId = '50000000-0000-4000-8000-000000000001';
const templateId = '30000000-0000-4000-8000-000000000001';
const screenshotDir = resolve(
  import.meta.dirname,
  '../../..',
  'docs/frontend/prototype-screenshots',
);
async function screen(page: Page, route: string) {
  if (await page.getByRole('dialog').isVisible())
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  if (
    !(await page.getByRole('combobox', { name: 'Màn hình review' }).isVisible())
  )
    await page.getByRole('button', { name: 'Review thiết kế' }).click();
  await page
    .getByRole('combobox', { name: 'Màn hình review' })
    .selectOption(route);
  await expect(page).toHaveURL(new URL(`/#${route}`, page.url()).href);
  await expect(page.locator('main')).toBeVisible();
  if (route.startsWith('/template/'))
    await expect(page.getByRole('dialog')).toBeVisible();
}
async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator('img')
    .evaluateAll((images) =>
      Promise.all(
        images.map((image) =>
          (image as HTMLImageElement).decode().catch(() => undefined),
        ),
      ),
    );
}

test('fixtures validate against the current document and wedding contracts', async ({
  page,
}) => {
  await page.goto('/');
  const results = await page.evaluate(
    async (paths) => {
      const fixtures = await import(paths.fixtures);
      const responsive = await import(paths.responsive);
      const document = await import(paths.document);
      const wedding = await import(paths.wedding);
      return {
        wedding: wedding.validateWeddingData(fixtures.sampleData),
        designs: fixtures.templates.map((template: unknown) =>
          document.validateSupportedTemplateDesign(
            responsive.createPrototypeDesign(template),
          ),
        ),
      };
    },
    {
      fixtures: '/src/fixtures.ts',
      responsive: '/src/responsive-fixtures.ts',
      document: `/@fs/${resolve(import.meta.dirname, '../../web/src/features/invitation-builder/document/schema.ts')}`,
      wedding: `/@fs/${resolve(import.meta.dirname, '../../web/src/features/invitations/wedding-data.schema.ts')}`,
    },
  );
  expect(results.wedding.valid, JSON.stringify(results.wedding)).toBe(true);
  for (const result of results.designs)
    expect(result.valid, JSON.stringify(result)).toBe(true);
  await screen(page, `/template/${templateId}`);
  const measurements = await page.evaluate(
    async (paths) => {
      const fixtures = await import(paths.fixtures);
      const { resolveDesign } = await import(paths.resolver);
      const { measureReadyScene } = await import(paths.measure);
      const resolved = resolveDesign(
        (await import(paths.responsive)).createPrototypeDesign(
          fixtures.templates[0],
        ),
        fixtures.sampleData,
        {
          mode: 'preview',
          asOf: fixtures.AS_OF,
          assetUrls: fixtures.assetUrls,
        },
      );
      return measureReadyScene(
        document.querySelector('.live-preview'),
        resolved.scene,
      );
    },
    {
      fixtures: '/src/fixtures.ts',
      responsive: '/src/responsive-fixtures.ts',
      resolver: `/@fs/${resolve(import.meta.dirname, '../../web/src/features/invitation-builder/document/resolve-design.ts')}`,
      measure: `/@fs/${resolve(import.meta.dirname, '../../web/src/features/invitation-builder/renderer/measure.ts')}`,
    },
  );
  expect(measurements).toEqual([]);
});

test('anonymous discovery is guarded, and registration has generic confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Khám phá mẫu cưới', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Tạo tài khoản', exact: true })
    .click();
  await page.getByLabel('Email', { exact: true }).fill('anh@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('prototype-only');
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Nếu thông tin hợp lệ');
});

test('gallery filters and pagination lead to a shared live preview and invitation creation', async ({
  page,
}) => {
  await page.goto('/');
  await screen(page, '/templates');
  await expect(page.locator('.template-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Xem thêm mẫu' }).click();
  await expect(page.locator('.template-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Truyền thống', exact: true }).click();
  await expect(page.locator('.template-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Xem mẫu Lời thương màu đỏ' }).click();
  await expect(page.locator('[data-rendered-element]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Dùng mẫu này', exact: true }).click();
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
    'Ngọc Anh',
  );
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Thiết kế', exact: true }),
  ).toHaveCount(0);
});

for (const width of [360, 1440]) {
  test(`template popup preserves gallery state and keyboard focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await screen(page, '/templates');
    await page
      .getByRole('textbox', { name: 'Tìm mẫu thiệp' })
      .fill('Lời thương');
    const trigger = page.getByRole('button', {
      name: 'Xem mẫu Lời thương màu đỏ',
      exact: true,
    });
    await trigger.click();
    await expect(page).toHaveURL(/#\/templates$/);
    const popup = page.getByRole('dialog', {
      name: 'Lời thương màu đỏ',
      exact: true,
    });
    await expect(popup).toBeVisible();
    await expect(
      popup.getByRole('img', { name: 'Mã QR liên kết demo mẫu thiệp' }),
    ).toHaveAttribute(
      'data-demo-url',
      new URL('/#/demo/30000000-0000-4000-8000-000000000002', page.url()).href,
    );
    await expect(
      popup.getByRole('button', { name: 'Dùng mẫu này' }),
    ).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Xem demo' })).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      'hidden',
    );
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => !!document.activeElement?.closest('dialog')),
      ).toBe(true);
    }
    await popup
      .locator('.phone-screen')
      .evaluate((element) => (element.scrollTop = 400));
    expect(
      await popup
        .locator('.phone-screen')
        .evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);
    const bounds = await popup.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (width === 360) {
      await popup.evaluate(
        (element) => (element.scrollTop = element.scrollHeight),
      );
      const close = await popup
        .getByRole('button', { name: 'Đóng', exact: true })
        .boundingBox();
      expect(close!.y).toBeGreaterThanOrEqual(bounds!.y);
      expect(close!.y + close!.height).toBeLessThanOrEqual(
        bounds!.y + bounds!.height,
      );
    }
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(
      page.getByRole('textbox', { name: 'Tìm mẫu thiệp' }),
    ).toHaveValue('Lời thương');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await page
      .getByRole('button', { name: 'Lời thương màu đỏ', exact: true })
      .click();
    await expect(popup).toBeVisible();
    await popup.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await trigger.click();
    await page.mouse.click(2, 2);
    await expect(popup).toHaveCount(0);
  });
}

test('autosave preserves the public snapshot until republish, and guest RSVP uses only the mock adapter', async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:3300') &&
      !request.url().startsWith('data:') &&
      !request.url().startsWith('blob:')
    )
      external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await screen(page, `/editor/${invitationId}`);
  await page.getByLabel('Tên cô dâu', { exact: true }).fill('Hà Phương');
  await expect(page.locator('.save-status')).toContainText('Đã lưu', {
    timeout: 5000,
  });
  await screen(page, `/i/${invitationId}`);
  await expect(
    page.locator('[data-rendered-element]').filter({ hasText: /^Ngọc Anh$/ }),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-rendered-element]').filter({ hasText: /^Hà Phương$/ }),
  ).toHaveCount(0);
  await screen(page, `/editor/${invitationId}`);
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
    'Hà Phương',
  );
  await page.getByRole('button', { name: 'Xuất bản', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Xuất bản thành công');
  await page.getByRole('button', { name: 'Xem thiệp', exact: true }).click();
  await expect(
    page.locator('[data-rendered-element]').filter({ hasText: /^Hà Phương$/ }),
  ).toHaveCount(1);
  await page.getByLabel('Tên khách mời', { exact: true }).fill('Linh Test');
  await page.getByLabel('Lời nhắn', { exact: true }).fill('Hẹn gặp hai bạn!');
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Cảm ơn bạn.' }),
  ).toBeVisible();
  await screen(page, `/rsvps/${invitationId}`);
  await expect(page.getByRole('heading', { name: 'Linh Test' })).toBeVisible();
  await page.evaluate(() => {
    location.hash = '/rsvps/50000000-0000-4000-8000-000000000002';
  });
  await expect(
    page.getByRole('heading', { name: 'Chưa có lời hẹn nào' }),
  ).toBeVisible();
  await screen(page, `/rsvps/${invitationId}`);
  await page
    .getByRole('button', { name: 'Đóng nhận RSVP', exact: true })
    .click();
  await screen(page, `/i/${invitationId}`);
  await expect(
    page.getByRole('status').filter({ hasText: 'đóng nhận phản hồi' }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('media dialog contains focus, restores its trigger and blocks deleting referenced assets', async ({
  page,
}) => {
  await page.goto('/');
  await screen(page, `/editor/${invitationId}`);
  await page
    .locator('.customer-form-section summary')
    .filter({ hasText: 'Hình ảnh' })
    .click();
  const trigger = page.getByRole('button', {
    name: 'Chọn ảnh đôi',
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Ảnh của bạn' })).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('dialog')),
    ).toBe(true);
  }
  await page
    .getByRole('button', { name: 'Xóa ảnh', exact: true })
    .first()
    .click();
  await expect(page.getByRole('alert')).toContainText('Ảnh đang được dùng');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('mobile editor edits inline accordions and switches to a single mobile preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await screen(page, `/editor/${invitationId}`);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Tên cô dâu', { exact: true }).fill('Tên trên mobile');
  await expect(page.locator('.save-status')).toContainText('Đã lưu');
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.locator('.customer-preview-page')).toBeVisible();
  await expect(
    page
      .locator('[data-rendered-element]')
      .filter({ hasText: /^Tên trên mobile$/ }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
    'Tên trên mobile',
  );
  await page
    .locator('.customer-form-section summary')
    .filter({ hasText: 'Hình ảnh' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Chọn ảnh đôi', exact: true }),
  ).toBeVisible();
  const ids = await page
    .locator('input[id],textarea[id],select[id]')
    .evaluateAll((elements) => elements.map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
});

test('template detail offers mobile preview and a standalone opening/demo flow', async ({
  page,
}) => {
  await page.goto(`/#/demo/${templateId}`);
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập', exact: true }),
  ).toBeVisible();
  await screen(page, `/template/${templateId}`);
  await expect(
    page.getByRole('button', { name: 'Xem trên desktop' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Xem trên mobile' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('GỬI MỘT LỜI THƯƠNG', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem demo', exact: true }).click();
  await expect(page.locator('.demo-opening')).toBeVisible();
  await page.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await expect(page.locator('.demo-invitation')).toBeVisible();
  await expect(page.locator('[data-rendered-element]').first()).toBeVisible();
  await expect(page.locator('.navbar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem lại lời mời' }).click();
  await expect(page.locator('.demo-opening')).toBeVisible();
  await page.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await page.getByRole('button', { name: 'Dùng mẫu này', exact: true }).click();
  await expect(page.locator('.customer-form-stack')).toBeVisible();
});

test('save errors and conflicts keep entered content and offer recovery', async ({
  page,
}) => {
  await page.goto('/');
  await screen(page, `/editor/${invitationId}`);
  await page.getByRole('button', { name: 'Review thiết kế' }).click();
  await page
    .getByRole('combobox', { name: 'Trạng thái review' })
    .selectOption('conflict');
  await page.getByRole('button', { name: 'Review thiết kế' }).click();
  await page.getByLabel('Tên cô dâu', { exact: true }).fill('Nội dung cần giữ');
  await expect(page.locator('.save-status')).toContainText(
    'Xung đột phiên bản',
  );
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
    'Nội dung cần giữ',
  );
  await page.getByRole('button', { name: 'Kiểm tra lại và thử lưu' }).click();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.locator('.save-status')).toContainText('Đã lưu');
});

test('leaving an unsaved draft requires a choice and preserves the saved version', async ({
  page,
}) => {
  await page.goto('/');
  await screen(page, `/editor/${invitationId}`);
  await page.getByRole('button', { name: 'Review thiết kế' }).click();
  await page
    .getByRole('combobox', { name: 'Trạng thái review' })
    .selectOption('error');
  await page.getByRole('button', { name: 'Review thiết kế' }).click();
  await page.getByLabel('Tên cô dâu', { exact: true }).fill('Bản chưa lưu');
  await expect(page.locator('.save-status')).toContainText('Lưu thất bại');
  await page
    .getByRole('button', { name: 'Về thiệp của tôi', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Rời khi chưa lưu thay đổi?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ở lại chỉnh sửa' }).click();
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
    'Bản chưa lưu',
  );
  await page
    .getByRole('button', { name: 'Về thiệp của tôi', exact: true })
    .click();
  await page.getByRole('button', { name: 'Rời mà chưa lưu' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await screen(page, `/editor/${invitationId}`);
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toHaveValue(
    'Ngọc Anh',
  );
});

test('platform text, primary action and input boundary meet contrast thresholds', async ({
  page,
}) => {
  await page.goto('/');
  const pairs = await page.evaluate(() => {
    const app = getComputedStyle(document.querySelector('.app')!);
    const text = getComputedStyle(document.querySelector('.hero-copy h1')!);
    const muted = getComputedStyle(document.querySelector('.hero-note')!);
    const button = getComputedStyle(
      document.querySelector('.hero-copy button')!,
    );
    return [
      [text.color, app.backgroundColor],
      [muted.color, app.backgroundColor],
      [button.color, button.backgroundColor],
    ];
  });
  function ratio(a: string, b: string) {
    function luminance(color: string) {
      const channels = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    const light = luminance(a),
      dark = luminance(b);
    return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
  }
  for (const [text, background] of pairs)
    expect(ratio(text, background)).toBeGreaterThanOrEqual(4.5);
  await screen(page, '/login');
  const input = await page
    .getByLabel('Email', { exact: true })
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        border: style.borderTopColor,
        background: style.backgroundColor,
        width: style.borderTopWidth,
        height: element.getBoundingClientRect().height,
      };
    });
  expect(ratio(input.border, input.background)).toBeGreaterThanOrEqual(3);
  expect(input.width).toBe('1px');
  expect(input.height).toBeGreaterThanOrEqual(44);
});

test('admin creates and publishes a draft, while customer designs remain pinned', async ({
  page,
}) => {
  await page.goto('/');
  await screen(page, `/admin/editor/${templateId}`);
  await page.locator('.layer-list button').first().click();
  await page.getByLabel('Khoảng cách mobile', { exact: true }).fill('48');
  await page.getByRole('button', { name: 'Lưu mẫu', exact: true }).click();
  await screen(page, `/template/${templateId}`);
  await expect(page.locator('[data-section-content]').first()).toHaveCSS(
    'gap',
    '48px',
  );
  await screen(page, `/editor/${invitationId}`);
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.locator('[data-section-content]').first()).toHaveCSS(
    'gap',
    '16px',
  );
  await screen(page, '/admin/templates/new');
  await page.getByLabel('Tên mẫu', { exact: true }).fill('Mẫu review mới');
  await page.getByRole('button', { name: 'Tạo bản nháp' }).click();
  await expect(page.locator('.workspace-toolbar h1')).toHaveText(
    'Mẫu review mới',
  );
  await page.getByRole('button', { name: 'Xuất bản mẫu', exact: true }).click();
  await page
    .getByRole('button', { name: 'Xác nhận xuất bản', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Về quản lý mẫu', exact: true })
    .click();
  await expect(
    page
      .locator('.admin-template-list article')
      .filter({ hasText: 'Mẫu review mới' }),
  ).toContainText('Đã xuất bản');
});

for (const width of [360, 375, 390, 430, 768, 1440]) {
  test(`screens stay inside viewport at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const routes = [
      '/home',
      '/templates',
      `/template/${templateId}`,
      `/demo/${templateId}`,
      '/invitations',
      `/editor/${invitationId}`,
      `/rsvps/${invitationId}`,
      `/i/${invitationId}`,
      '/login',
      '/register',
      '/verify-email',
      '/forgot-password',
      '/reset-password',
      '/social-onboarding',
      '/oauth-result',
      '/overview',
      '/account',
      '/admin/customers',
      '/admin/templates',
      '/admin/templates/new',
      `/admin/editor/${templateId}`,
    ];
    for (const route of routes) {
      await screen(page, route);
      await ready(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `horizontal overflow: ${route} at ${width}`,
      ).toBe(true);
      await expect(page.locator('main h1')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });
}

test('reduced motion, large text and landscape preserve usable navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
    'BUTTON',
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '32px'));
  await screen(page, '/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test('capture desktop and mobile design review artifacts', async ({ page }) => {
  await mkdir(screenshotDir, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const [route, label, width] of [
    ['/home', 'home-desktop', 1440],
    ['/home', 'home-mobile', 375],
    ['/templates', 'gallery-desktop', 1440],
    [`/template/${templateId}`, 'detail-desktop', 1440],
    [`/template/${templateId}`, 'template-popup-mobile', 375],
    [`/template/${templateId}`, 'template-popup-mobile-actions', 375],
    [`/editor/${invitationId}`, 'editor-desktop', 1440],
    [`/editor/${invitationId}`, 'editor-mobile', 375],
    [`/demo/${templateId}`, 'demo-opening-desktop', 1440],
    [`/demo/${templateId}`, 'demo-opening-mobile', 375],
    [`/demo/${templateId}`, 'demo-invitation-mobile', 375],
    [`/demo/${templateId}`, 'demo-invitation-desktop', 1440],
    [`/i/${invitationId}`, 'guest-desktop', 1440],
    [`/admin/editor/${templateId}`, 'authoring-desktop', 1440],
    ['/login', 'auth-mobile', 375],
    ['/overview', 'account-overview-desktop', 1440],
    ['/overview', 'account-overview-mobile', 375],
    ['/account', 'account-profile-desktop', 1440],
    ['/overview', 'account-menu-desktop', 1440],
    ['/admin/templates', 'admin-desktop', 1440],
  ] as const) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 1000 });
    await screen(page, route);
    if (
      label.startsWith('demo-invitation') &&
      (await page.locator('.demo-opening').isVisible())
    )
      await page.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
    if (label === 'template-popup-mobile-actions')
      await page
        .getByRole('dialog')
        .evaluate((element) => (element.scrollTop = element.scrollHeight));
    if (label === 'account-menu-desktop')
      await page.locator('.account-disclosure summary').click();
    await ready(page);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({
      path: resolve(screenshotDir, `${label}.png`),
      fullPage:
        !label.startsWith('detail-') && !label.startsWith('template-popup'),
    });
  }
});

test('v2 demo responds to its host while popup and customer preview stay mobile', async ({
  page,
}) => {
  await page.goto('/');
  await screen(page, `/template/${templateId}`);
  const popup = page.getByRole('dialog');
  await expect(
    popup.getByText('Xác nhận tham dự', { exact: true }),
  ).toBeVisible();
  await expect(popup.locator('[data-invitation-host]')).toHaveAttribute(
    'data-host-policy',
    'mobile',
  );
  await expect(popup.locator('[data-section]').first()).toHaveAttribute(
    'data-layout',
    'mobile',
  );
  expect(
    await popup
      .locator('[data-invitation-root]')
      .evaluate((e) => e.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Xem demo', exact: true }).click();
  await page.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  const root = page.locator('[data-invitation-root]');
  for (const width of [1440, 767, 768, 390, 430, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    const desktop = width >= 768;
    await expect(page.locator('[data-section]').first()).toHaveAttribute(
      'data-layout',
      desktop ? 'desktop' : 'mobile',
    );
    await expect
      .poll(() => root.evaluate((e) => e.getBoundingClientRect().width))
      .toBe(desktop ? Math.min(width, 900) : Math.min(width, 480));
    const album = page.locator(
      '[data-section="60000000-0000-4000-8000-000000000006"] [data-section-content]',
    );
    const columns = await album.evaluate(
      (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length,
    );
    expect(columns).toBe(desktop ? 2 : 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screen(page, `/editor/${invitationId}`);
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  await expect(page.locator('[data-invitation-host]')).toHaveAttribute(
    'data-host-policy',
    'mobile',
  );
  await expect(page.locator('[data-section]').first()).toHaveAttribute(
    'data-layout',
    'mobile',
  );
});

test('v2 guest preserves RSVP state across desktop and mobile layouts; v1 stays compatible', async ({
  page,
}) => {
  await page.goto(`/#/i/${invitationId}`);
  await expect(page.locator('[data-invitation-root]')).toHaveCSS(
    'max-width',
    '900px',
  );
  const name = page.getByLabel('Tên khách mời', { exact: true });
  await name.fill('Khách giữ trạng thái');
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('[data-section]').first()).toHaveAttribute(
    'data-layout',
    'mobile',
  );
  await expect(name).toHaveValue('Khách giữ trạng thái');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('[data-section]').first()).toHaveAttribute(
    'data-layout',
    'desktop',
  );
  await expect(name).toHaveValue('Khách giữ trạng thái');
  await screen(page, `/template/${templateId}`);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.evaluate(() => {
    location.hash = '/template/30000000-0000-4000-8000-000000000004';
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Xem demo', exact: true }).click();
  await page.getByRole('button', { name: 'Mở thiệp', exact: true }).click();
  await expect(page.locator('[data-scene-version="2"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="workarea"]')).toHaveCSS(
    'width',
    '390px',
  );
});

test('account menu and personal workspace share profile, navigation and logout', async ({
  page,
}) => {
  await page.goto('/');
  await screen(page, '/overview');
  await expect(
    page.getByRole('heading', { name: 'Mọi lời mời, ở một nơi.' }),
  ).toBeVisible();
  await expect(page.locator('.account-stats article').first()).toContainText(
    '2',
  );
  const avatar = page.locator('.account-disclosure summary');
  await avatar.click();
  await expect(
    page.getByRole('navigation', { name: 'Menu tài khoản' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('navigation', { name: 'Menu tài khoản' }),
  ).toBeHidden();
  await expect(avatar).toBeFocused();
  await avatar.click();
  await page
    .locator('.account-dropdown')
    .getByRole('button', { name: 'Thông tin cá nhân', exact: true })
    .click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Anh & Quân');
  await page
    .getByRole('button', { name: 'Lưu thông tin', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Đã cập nhật hồ sơ' }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Khu vực tài khoản' })
    .getByRole('button', { name: 'Tổng quan', exact: true })
    .click();
  await expect(page.locator('.overview-welcome h2')).toHaveText('Anh & Quân');
  await avatar.click();
  await expect(page.locator('.account-menu-identity')).toContainText(
    'Anh & Quân',
  );
  await page.locator('.page-heading h1').click();
  await expect(
    page.getByRole('navigation', { name: 'Menu tài khoản' }),
  ).toBeHidden();
  await avatar.click();
  await page
    .locator('.account-dropdown')
    .getByRole('button', { name: 'Đăng xuất', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.locator('.account-disclosure')).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = '/overview';
  });
  await expect(
    page.getByRole('heading', { name: 'Đăng nhập', exact: true }),
  ).toBeVisible();
});
