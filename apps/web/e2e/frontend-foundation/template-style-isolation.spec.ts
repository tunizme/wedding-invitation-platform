import { test, expect, seed, login, capture } from './helpers';

async function sceneStyle(page: import('@playwright/test').Page) {
  return authoredStyles(page);
}

test('platform typography does not change published scene geometry or palette', async ({
  page,
}) => {
  await page.goto(`/i/${seed().publicSlug}`);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  const before = await sceneStyle(page);
  expect((await capture(page)).ready).toBe(true);
  expect(await authoredStyles(page)).toEqual(before);
  await login(page, seed().adminA);
  await page.goto(`/i/${seed().publicSlug}`);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  expect(await sceneStyle(page)).toEqual(before);
});

async function authoredStyles(
  page: import('@playwright/test').Page,
  editor = false,
) {
  const results = [];
  for (const element of seed().scene.elements) {
    const frame = page
      .locator(
        `[${editor ? 'data-element-id' : 'data-rendered-element'}="${element.id}"]`,
      )
      .first();
    await expect(frame).toBeVisible();
    const actual = await frame.evaluate((node) => {
      const text = node.querySelector('[data-measure-content]')!;
      const outer = getComputedStyle(node),
        style = getComputedStyle(text);
      return {
        width: outer.width,
        height: outer.height,
        transform: outer.transform,
        font: style.fontFamily,
        weight: style.fontWeight,
        color: style.color,
        size: style.fontSize,
        text: text.textContent,
      };
    });
    expect(actual.width).toBe(`${element.box.width}px`);
    expect(actual.height).toBe(`${element.box.height}px`);
    expect(actual.transform).toBe(
      `matrix(1, 0, 0, 1, ${element.box.x}, ${element.box.y})`,
    );
    expect(actual.font).toContain('Invitation Noto Sans v1');
    expect(actual.weight).toBe('400');
    expect(actual.size).toBe('18px');
    expect(actual.color).toBe('rgb(0, 0, 0)');
    results.push(actual);
  }
  expect(results.length).toBeGreaterThan(0);
  await expect(page.getByTestId('workarea').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  return results;
}

test('authenticated Admin canvas and preview retain the pinned authored scene', async ({
  page,
}) => {
  const f = seed();
  await login(page, f.adminA);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/admin/templates/${f.templateA}`) &&
      r.request().method() === 'GET',
  );
  await page.goto(`/admin/templates/${f.templateA}/edit`);
  const body = await (await response).json();
  expect(body.draftDocument).toEqual(f.design);
  expect(body.publishedRevisionId).toBe(f.designRevisionId);
  await authoredStyles(page, true);
  await expect(
    page.getByRole('button', { name: 'Thêm văn bản', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Xem trước', exact: true }).click();
  const preview = await authoredStyles(page);
  expect((await capture(page)).ready).toBe(true);
  expect(await authoredStyles(page)).toEqual(preview);
});

test('Customer data entry exposes no Admin authoring controls and keeps the pinned document', async ({
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
  expect(body.designRevisionId).toBe(f.designRevisionId);
  await expect(
    page.getByRole('button', {
      name: /Thêm văn bản|Thư viện tài sản|Thêm hình dạng/,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/Cỡ chữ|Liên kết văn bản|Màu nền/)).toHaveCount(
    0,
  );
  await expect(page.getByLabel('Tên cô dâu', { exact: true })).toBeVisible();
});
