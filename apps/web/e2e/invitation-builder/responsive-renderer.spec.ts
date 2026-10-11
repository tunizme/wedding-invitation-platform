import authored from '../../../../specs/007-responsive-invitation-layout/contracts/fixtures/pilot-v2.json';
import pilot from './fixtures/responsive-pilot.json';
import { test, expect } from '@playwright/test';
import {
  openResponsiveHost,
  resizeHost,
  mockRsvp,
} from './responsive-fixtures';

test('container threshold, intrinsic long content and grid order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openResponsiveHost(page, { width: 767, mode: 'preview' }, 'production');
  const root = page.locator('[data-invitation-root]');
  for (const [width, expected] of [
    [360, 360],
    [375, 375],
    [390, 390],
    [430, 430],
    [767, 480],
    [768, 768],
    [900, 900],
    [1024, 900],
    [1440, 900],
  ]) {
    await resizeHost(page, width);
    await expect
      .poll(async () => (await root.boundingBox())?.width)
      .toBeCloseTo(expected, 0);
    expect(
      await root.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }
  const photos = page.getByRole('img');
  expect((await photos.nth(0).boundingBox())!.y).toBeCloseTo(
    (await photos.nth(1).boundingBox())!.y,
    0,
  );
  await resizeHost(page, 390);
  expect((await photos.nth(1).boundingBox())!.y).toBeGreaterThan(
    (await photos.nth(0).boundingBox())!.y,
  );
  const before = (await root.boundingBox())!.height;
  await root.evaluate((el) => {
    const targets = [
      ...el.querySelectorAll<HTMLElement>('[data-measure-content], h3, button'),
    ];
    const sizes = targets.map((target) =>
      parseFloat(getComputedStyle(target).fontSize),
    );
    targets.forEach((target, index) => {
      target.style.fontSize = `${sizes[index] * 2}px`;
    });
  });
  expect(
    await root.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  expect((await root.boundingBox())!.height).toBeGreaterThan(before);
});
test('public RSVP retains focus and values across breakpoint without duplicate submission', async ({
  page,
}) => {
  const submissions = await mockRsvp(page);
  await openResponsiveHost(page, { width: 767, mode: 'public' }, 'production');
  const name = page.getByRole('textbox', { name: 'Tên khách mời' });
  await name.fill('Nguyễn Minh Anh');
  await name.focus();
  await resizeHost(page, 768);
  await expect(name).toHaveValue('Nguyễn Minh Anh');
  await expect(name).toBeFocused();
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cảm ơn');
  await resizeHost(page, 390);
  await expect(page.getByRole('status')).toContainText('Cảm ơn');
  expect(submissions).toHaveLength(1);
});

test('canonical readiness, zero-width opening, reduced motion and mobile host policy', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openResponsiveHost(page, { width: 0, mode: 'preview' }, 'production');
  await resizeHost(page, 900);
  await assertReady(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await resizeHost(page, 390);
  await assertReady(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openResponsiveHost(
    page,
    { width: 1440, mode: 'preview', popup: true },
    'production',
  );
  await expect
    .poll(
      async () =>
        (await page.locator('[data-invitation-root]').boundingBox())?.width,
    )
    .toBeCloseTo(390, 0);
  await assertReady(page);
});
for (const state of [
  'open',
  'validation-error',
  'submitting',
  'success',
  'closed',
] as const)
  test(`intrinsic RSVP ${state} is ready at390/900`, async ({ page }) => {
    await openResponsiveHost(
      page,
      { width: 390, mode: 'preview', validationState: { rsvp: state } },
      'production',
    );
    for (const width of [390, 900]) {
      await resizeHost(page, width);
      await assertReady(page);
      for (const target of await page
        .locator(
          '[data-role="flow"] input,[data-role="flow"] select,[data-role="flow"] button',
        )
        .all())
        expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
test('broken image fails readiness without dropping content', async ({
  page,
}) => {
  await openResponsiveHost(
    page,
    { width: 390, mode: 'preview', assetUrls: {} },
    'production',
  );
  const report = await page.evaluate(() => window.responsiveHost.measure());
  expect(report.ready).toBe(false);
  expect(report.issues[0].code).toBe('RENDER_ASSET_NOT_READY');
  await expect(
    page.getByText('Nguyễn Thị Minh Anh & Trần Quốc Bảo'),
  ).toBeVisible();
});

test('waits for delayed decoded images before reporting ready', async ({
  page,
}) => {
  let release: () => void = () => {};
  const held = new Promise<void>((accept) => {
    release = accept;
  });
  await page.route('**/fixtures/responsive-photo.svg', async (route) => {
    await held;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#dfc5ab"/></svg>',
    });
  });
  const url = '/fixtures/responsive-photo.svg';
  await openResponsiveHost(
    page,
    {
      width: 900,
      mode: 'preview',
      assetUrls: {
        '70000000-0000-4000-8000-000000000100': url,
        '70000000-0000-4000-8000-000000000101': url,
      },
    },
    'production',
  );
  const ready = page.evaluate(() => window.responsiveHost.measure());
  try {
    expect(
      await Promise.race([
        ready.then(() => true),
        new Promise((accept) => setTimeout(() => accept(false), 150)),
      ]),
    ).toBe(false);
  } finally {
    release();
  }
  expect(await ready).toEqual({ ready: true, issues: [] });
});

async function assertReady(page: import('@playwright/test').Page) {
  const report = await page.evaluate(() => window.responsiveHost.measure());
  const dimensions = report.issues.length
    ? await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-rendered-element="70000000-0000-4000-8000-000000000020"], [data-rendered-element="70000000-0000-4000-8000-000000000020"] [data-measure-content]',
          ),
        ].map((el) => ({
          bounds: el.getBoundingClientRect().toJSON(),
          scroll: [el.scrollWidth, el.scrollHeight],
          client: [el.clientWidth, el.clientHeight],
        })),
      )
    : [];
  expect(report, JSON.stringify(dimensions)).toEqual({
    ready: true,
    issues: [],
  });
}

test('artwork clips behind content and cannot intercept RSVP controls', async ({
  page,
}) => {
  const fixture = structuredClone(pilot);
  const id = '72000000-0000-4000-8000-000000000001';
  const sid = fixture.sectionOrder[3];
  const source = Object.values(fixture.nodes)[0];
  const appearance = structuredClone(source.appearance) as Record<
    string,
    unknown
  >;
  delete appearance.padding;
  (fixture.nodes as Record<string, unknown>)[id] = {
    id,
    type: 'Shape',
    role: 'artwork',
    content: { primitive: 'rectangle', fill: '#DFC5ABFF' },
    bindings: [],
    appearance,
    custom: { layerName: 'Nền trang trí', locked: false, optional: false },
    hidden: false,
    mobile: {
      layout: {
        xPercent: -100,
        yPercent: 0,
        widthPercent: 200,
        aspectRatio: 1,
        rotation: 0,
      },
    },
    desktop: {},
  };
  (fixture.sections as Record<string, { artworkNodeIds: string[] }>)[
    sid
  ].artworkNodeIds.push(id);
  await mockRsvp(page);
  await openResponsiveHost(
    page,
    { width: 390, mode: 'public', fixture },
    'production',
  );
  await assertReady(page);
  const artwork = page.locator(`[data-rendered-element="${id}"]`);
  await expect(artwork).toHaveAttribute('aria-hidden', 'true');
  await expect(artwork).toHaveCSS('pointer-events', 'none');
  await page
    .getByRole('textbox', { name: 'Tên khách mời' })
    .fill('Khách kiểm thử');
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cảm ơn');
});
for (const count of [0, 1, 8])
  test(`static image count ${count} keeps readable flow`, async ({ page }) => {
    const fixture = structuredClone(pilot);
    const sid = fixture.sectionOrder[2];
    const section = (
      fixture.sections as Record<string, { flowNodeIds: string[] }>
    )[sid];
    const node = (fixture.nodes as Record<string, unknown>)[
      section.flowNodeIds[0]
    ];
    for (const id of section.flowNodeIds)
      delete (fixture.nodes as Record<string, unknown>)[id];
    section.flowNodeIds = [];
    for (let i = 0; i < count; i++) {
      const id = `73000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      (fixture.nodes as Record<string, unknown>)[id] = {
        ...structuredClone(node as object),
        id,
      };
      section.flowNodeIds.push(id);
    }
    await openResponsiveHost(
      page,
      { width: 390, mode: 'preview', fixture },
      'production',
    );
    await assertReady(page);
    await resizeHost(page, 900);
    await assertReady(page);
    expect(await page.getByRole('img').count()).toBe(count);
  });

test('unavailable fonts fail closed', async ({ page }) => {
  await page.route('**/fonts/invitation-builder/*.woff2', (route) =>
    route.abort('failed'),
  );
  await openResponsiveHost(page, { width: 390, mode: 'preview' }, 'production');
  const report = await page.evaluate(() => window.responsiveHost.measure());
  expect(report.ready).toBe(false);
  expect(report.issues[0].code).toBe('FONT_UNAVAILABLE');
});
for (const countdown of ['worst-case', 'expired'] as const)
  test(`countdown ${countdown} remains intrinsic`, async ({ page }) => {
    const fixture = structuredClone(pilot);
    const id = '74000000-0000-4000-8000-000000000001';
    const sid = fixture.sectionOrder[1];
    const source = Object.values(fixture.nodes)[0];
    if (!('textStyle' in source.content))
      throw new Error('Expected text fixture');
    (fixture.nodes as Record<string, unknown>)[id] = {
      ...source,
      id,
      type: 'Countdown',
      content: {
        textStyle: source.content.textStyle,
        label: 'Đếm ngược đến ngày vui',
        endedLabel: 'Hôn lễ đã bắt đầu',
      },
      bindings: [
        {
          target: 'event',
          source: 'wedding.event',
          eventKey: 'ceremony',
          fallback: {
            datetime: '2027-01-01T10:00:00+07:00',
            timeZone: 'Asia/Ho_Chi_Minh',
          },
        },
      ],
    };
    (fixture.sections as Record<string, { flowNodeIds: string[] }>)[
      sid
    ].flowNodeIds.push(id);
    await openResponsiveHost(
      page,
      { width: 390, mode: 'preview', fixture, validationState: { countdown } },
      'production',
    );
    await assertReady(page);
    await resizeHost(page, 900);
    await assertReady(page);
  });

test('pending RSVP keeps one request across resize and rapid activation', async ({
  page,
}) => {
  const submissions = await mockRsvp(page);
  let release: () => void = () => {};
  const held = new Promise<void>((accept) => {
    release = accept;
  });
  let attempts = 0;
  await page.route('**/api/v1/public/invitations/*/rsvps', async (route) => {
    attempts++;
    await held;
    await route.fulfill({
      status: 201,
      json: {
        receiptId: '75000000-0000-4000-8000-000000000001',
        acceptedAt: '2026-10-11T00:00:00.000Z',
      },
    });
  });
  await openResponsiveHost(page, { width: 767, mode: 'public' }, 'production');
  await page
    .getByRole('textbox', { name: 'Tên khách mời' })
    .fill('Khách đang gửi');
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();
  await resizeHost(page, 900);
  expect(attempts).toBe(1);
  await expect(
    page.getByRole('textbox', { name: 'Tên khách mời' }),
  ).toHaveValue('Khách đang gửi');
  release();
  await expect(page.getByRole('status')).toContainText('Cảm ơn');
  expect(attempts).toBe(1);
  expect(submissions).toHaveLength(0);
});
test('guest validation errors survive breakpoint and clear after correction', async ({
  page,
}) => {
  const submissions = await mockRsvp(page);
  await openResponsiveHost(page, { width: 767, mode: 'public' }, 'production');
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  const error = page.getByText(
    'Tên cần 1–120 ký tự sau khi bỏ khoảng trắng ở hai đầu.',
  );
  await expect(error).toBeVisible();
  await resizeHost(page, 768);
  await expect(error).toBeVisible();
  expect(submissions).toHaveLength(0);
  await page
    .getByRole('textbox', { name: 'Tên khách mời' })
    .fill('Khách đã sửa');
  await expect(error).toHaveCount(0);
  await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cảm ơn');
  expect(submissions).toHaveLength(1);
});

test('mobile popup contains keyboard and retains RSVP focus while its outside host resizes', async ({
  page,
}) => {
  await mockRsvp(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openResponsiveHost(
    page,
    { width: 1440, mode: 'public', popup: true },
    'production',
  );
  const dialog = page.getByRole('dialog', { name: 'Xem trước mobile' });
  await expect(dialog).toBeVisible();
  const name = dialog.getByRole('textbox', { name: 'Tên khách mời' });
  await name.fill('Khách trong popup');
  await name.focus();
  await resizeHost(page, 768);
  await expect(name).toHaveValue('Khách trong popup');
  await expect(name).toBeFocused();
  expect(
    (await dialog.locator('[data-invitation-root]').boundingBox())!.width,
  ).toBeLessThanOrEqual(390);
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('actual Admin-authored pilot covers full width matrix and200 percent text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await openResponsiveHost(page, {
    width: 390,
    mode: 'preview',
    fixture: authored,
  });
  for (const width of [360, 375, 390, 430, 767, 768, 900, 1024, 1440]) {
    await resizeHost(page, width);
    const root = page.locator('[data-invitation-root]');
    await expect
      .poll(async () => (await root.boundingBox())?.width)
      .toBe(Math.min(width, width < 768 ? 480 : 900));
    expect(
      (await page.evaluate(() => window.responsiveHost.measure())).ready,
    ).toBe(true);
    expect(
      await root.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
  }
  await resizeHost(page, 390);
  await page.locator('[data-invitation-root]').evaluate((root) => {
    const sizes = [...root.querySelectorAll<HTMLElement>('*')].map(
      (element) => ({
        element,
        size: parseFloat(getComputedStyle(element).fontSize),
      }),
    );
    for (const { element, size } of sizes)
      element.style.fontSize = `${size * 2}px`;
  });
  expect(
    await page
      .locator('[data-invitation-root]')
      .evaluate((root) => root.scrollWidth <= root.clientWidth + 1),
  ).toBe(true);
});
