import type { Locator, Page } from '@playwright/test';
import { test, expect, seed, login } from './helpers';
import {
  activateByKeyboard,
  prepareKeyboard,
  typeByKeyboard,
} from './keyboard';

/*
 * US4 / T049 — native <dialog> behavior of the Admin media library, in real
 * Chromium, Firefox and WebKit. JSDOM cannot prove focus containment, the inert
 * background or the top layer, so these cases are the only evidence for them.
 * They need the owned API/web stack and a browser harness; they are registered
 * in scripts/frontend-cases.json and are NOT RUN where no such harness exists.
 */
const TRIGGERS = ['Thêm hình ảnh', 'Thêm trang trí', 'Chọn nền'] as const;
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const library = (page: Page) =>
  page.getByRole('dialog', { name: 'Thư viện ảnh' });
const workspace = (page: Page) =>
  page.getByRole('group', { name: 'Vùng soạn mẫu' });
const trigger = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

async function openEditor(page: Page) {
  const f = seed();
  await login(page, f.adminA);
  await page.goto(`/admin/templates/${f.templateA}/edit`);
  // Below 768px the editor shows one task panel at a time.
  const components = page.getByRole('button', {
    name: 'Thành phần & lớp',
    exact: true,
  });
  await expect(components.or(trigger(page, 'Thêm văn bản'))).toBeVisible();
  if (await components.isVisible()) await components.click();
  await expect(trigger(page, 'Thêm văn bản')).toBeVisible();
}
async function open(page: Page, name: string) {
  await trigger(page, name).click();
  await expect(library(page)).toBeVisible();
}
const isModal = (dialog: Locator) =>
  dialog.evaluate((node) => (node as HTMLDialogElement).matches(':modal'));
const asset = (name: string, id = crypto.randomUUID()) => ({
  id,
  name,
  kind: 'IMAGE',
  mimeType: 'image/png',
  byteSize: pixel.length,
  width: 1,
  height: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  previewUrl: `/api/v1/assets/${id}/content`,
});
/** Serve preview bytes for mocked assets so no request fails noisily. */
async function stubPreviews(page: Page) {
  await page.route('**/assets/*/content', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: pixel }),
  );
}

test('media library opens as a native modal from every entry and returns focus on Close and Escape', async ({
  page,
}) => {
  await openEditor(page);
  for (const name of TRIGGERS) {
    await open(page, name);
    expect(await isModal(library(page))).toBe(true);
    await expect(page.getByLabel('Tìm ảnh', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Đóng thư viện' }).click();
    await expect(library(page)).toHaveCount(0);
    await expect(trigger(page, name)).toBeFocused();
    await open(page, name);
    await page.keyboard.press('Escape');
    await expect(library(page)).toHaveCount(0);
    await expect(trigger(page, name)).toBeFocused();
  }
  // Cover image entry lives inside the metadata disclosure.
  await page.getByText('Thông tin mẫu', { exact: true }).click();
  await open(page, 'Chọn ảnh bìa');
  expect(await isModal(library(page))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(trigger(page, 'Chọn ảnh bìa')).toBeFocused();
});

test('media library keeps Tab inside the dialog and blocks background interaction', async ({
  page,
}) => {
  await openEditor(page);
  await open(page, 'Thêm hình ảnh');
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press(step % 2 ? 'Tab' : 'Shift+Tab');
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('dialog[open]') !== null,
      ),
    ).toBe(true);
  }
  // A click on the background control never reaches it while the modal is open.
  await expect(
    trigger(page, 'Thêm văn bản').click({ trial: true, timeout: 1000 }),
  ).rejects.toThrow();
  await expect(library(page)).toBeVisible();
});

test('media library select applies the asset, closes once and restores focus or the workspace fallback', async ({
  page,
}) => {
  await openEditor(page);
  await open(page, 'Thêm hình ảnh');
  const choose = library(page).getByRole('button', {
    name: /^Chọn /,
    exact: false,
  });
  await expect(choose.first()).toBeVisible();
  await choose.first().click();
  await expect(library(page)).toHaveCount(0);
  // This trigger survives selection; the separate disclosure case proves
  // fallback when a trigger is no longer focusable.
  await expect(trigger(page, 'Thêm hình ảnh')).toBeFocused();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('media library falls back to the workspace when the trigger is no longer focusable', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByText('Thông tin mẫu', { exact: true }).click();
  await open(page, 'Chọn ảnh bìa');
  // Collapse the disclosure holding the trigger while the dialog is open.
  await page.evaluate(() =>
    document.querySelector('details')?.removeAttribute('open'),
  );
  await page.keyboard.press('Escape');
  await expect(library(page)).toHaveCount(0);
  await expect(workspace(page)).toBeFocused();
});

for (const width of [360, 375, 390, 430, 768, 1440]) {
  test(`media library is a right Drawer from 768px and a full-screen Sheet below it at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await openEditor(page);
    await open(page, 'Thêm hình ảnh');
    const box = (await library(page).boundingBox())!;
    if (width >= 768) {
      expect(box.width).toBeCloseTo(Math.min(720, width - 48), 0);
      expect(box.x + box.width).toBeCloseTo(width, 0);
    } else {
      expect(box.x).toBeCloseTo(0, 0);
      expect(box.width).toBeCloseTo(width, 0);
    }
    expect(box.y).toBeCloseTo(0, 0);
    expect(box.height).toBeCloseTo(800, 0);
    await expect(
      page.getByRole('button', { name: 'Đóng thư viện' }),
    ).toBeInViewport();
    await expect(
      page.getByRole('heading', { name: 'Thư viện ảnh' }),
    ).toBeInViewport();
    expect(
      // Admin canvas sizing is outside005; measure the active modal chrome.
      await library(page).evaluate(
        (node) => node.scrollWidth <= node.clientWidth + 1,
      ),
    ).toBe(true);
    // The body scrolls independently, so Close stays reachable.
    const bodyScrolls = await library(page).evaluate((node) => {
      const body = node.querySelector('div > div:last-child') as HTMLElement;
      return getComputedStyle(body).overflowY === 'auto';
    });
    expect(bodyScrolls).toBe(true);
  });
}

test('media library completes open search select close by keyboard at 200% text with reduced motion', async ({
  page,
}) => {
  await prepareKeyboard(page, 390);
  await openEditor(page);
  await activateByKeyboard(page, trigger(page, 'Thêm hình ảnh'));
  await expect(library(page)).toBeVisible();
  await typeByKeyboard(
    page,
    page.getByLabel('Tìm ảnh', { exact: true }),
    'Ảnh kiểm thử',
  );
  const first = library(page)
    .getByRole('button', { name: /^Chọn / })
    .first();
  await activateByKeyboard(page, first);
  await expect(library(page)).toHaveCount(0);
});

test('media library sends authorized query filter mine and cursor requests and recovers from errors', async ({
  page,
}) => {
  await openEditor(page);
  await stubPreviews(page);
  const urls: string[] = [];
  let failMore = true;
  await page.route('**/admin/template-assets?*', async (route) => {
    const url = new URL(route.request().url());
    urls.push(url.search);
    const cursor = url.searchParams.get('cursor');
    if (cursor && failMore) {
      failMore = false;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"code":"UNAVAILABLE"}',
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [asset(cursor ? 'Ảnh trang hai' : 'Ảnh trang một')],
        nextCursor: cursor ? null : 'next-page',
      }),
    });
  });
  await open(page, 'Thêm hình ảnh');
  await expect(
    page.getByRole('button', { name: 'Chọn Ảnh trang một' }),
  ).toBeVisible();
  await page.getByLabel('Tìm ảnh', { exact: true }).fill('cưới');
  await page.getByLabel('Lọc loại ảnh').selectOption('IMAGE');
  await page.getByLabel('Chỉ ảnh tôi tải lên').check();
  await expect
    .poll(() => urls.at(-1) ?? '')
    .toMatch(/q=c.*kind=IMAGE.*mine=true|kind=IMAGE.*mine=true.*q=c/s);
  await page.getByRole('button', { name: 'Tải thêm ảnh' }).click();
  await expect(library(page).getByRole('alert')).toContainText(
    'Không thể tải trang ảnh tiếp theo.',
  );
  await expect(
    page.getByRole('button', { name: 'Chọn Ảnh trang một' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tải thêm ảnh' }).click();
  await expect(
    page.getByRole('button', { name: 'Chọn Ảnh trang hai' }),
  ).toBeVisible();
  expect(urls.some((search) => search.includes('cursor=next-page'))).toBe(true);
});

test('media library upload failure keeps the dialog open and a retry selects the asset', async ({
  page,
}) => {
  await openEditor(page);
  await open(page, 'Thêm hình ảnh');
  let first = true;
  await page.route('**/admin/template-assets', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (first) {
      first = false;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"code":"UNAVAILABLE"}',
      });
    }
    return route.continue();
  });
  await page.getByLabel('File ảnh tải lên').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: pixel,
  });
  await page.getByRole('button', { name: 'Tải ảnh lên và chọn' }).click();
  await expect(library(page).getByRole('alert')).toBeVisible();
  await expect(library(page)).toBeVisible();
  await page.getByRole('button', { name: 'Tải ảnh lên và chọn' }).click();
  await expect(library(page)).toHaveCount(0);
});

test('media library suppresses a stale query response and an old owner selection', async ({
  page,
}) => {
  await openEditor(page);
  await stubPreviews(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let requests = 0;
  await page.route('**/admin/template-assets?*', async (route) => {
    const index = ++requests;
    if (index === 1) {
      await gate;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [asset('Ảnh cũ')], nextCursor: null }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [asset('Ảnh mới')], nextCursor: null }),
    });
  });
  await open(page, 'Thêm hình ảnh');
  await page.getByLabel('Tìm ảnh', { exact: true }).fill('mới');
  await expect(
    page.getByRole('button', { name: 'Chọn Ảnh mới' }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Chọn Ảnh cũ' })).toHaveCount(
    0,
  );
  // Another Admin admitted in the same browser profile ends the old owner's work.
  const peer = await page.context().newPage();
  await login(peer, seed().adminB);
  await expect(library(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Chọn Ảnh mới' })).toHaveCount(
    0,
  );
});

test('Customer editor exposes no Admin library or authoring controls and saves only WeddingData', async ({
  page,
}) => {
  const f = seed();
  await login(page, f.customerA);
  const detail = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/invitations/${f.invitationA}`) &&
      r.request().method() === 'GET',
  );
  await page.goto(`/invitations/${f.invitationA}/edit`);
  const body = await (await detail).json();
  expect(body.document).toEqual(f.design);
  await expect(page.getByLabel('Tên cô dâu')).toBeVisible();
  for (const name of [
    'Thêm hình ảnh',
    'Thêm trang trí',
    'Chọn nền',
    'Chọn ảnh bìa',
    'Thay ảnh',
    'Thêm văn bản',
  ])
    await expect(trigger(page, name)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('group', { name: 'Liên kết dữ liệu' }),
  ).toHaveCount(0);
  const save = page.waitForRequest(
    (r) =>
      r.method() === 'PATCH' &&
      r.url().endsWith(`/invitations/${f.invitationA}/draft`),
  );
  await page.getByLabel('Tên cô dâu').fill('Mai');
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();
  const payload = (await save).postDataJSON() as Record<string, unknown>;
  expect(Object.keys(payload).sort()).toEqual([
    'expectedVersion',
    'weddingData',
  ]);
});
