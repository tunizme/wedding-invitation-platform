import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import type { ResolvedScene } from '../../src/features/invitation-builder/document/types';

const style = {
  fontId: 'noto-sans-v1',
  fontSize: 18,
  fontWeight: 400,
  italic: false,
  underline: false,
  color: '#000000FF',
  letterSpacing: 0,
  lineHeight: 1.5,
  textAlign: 'left',
  textTransform: 'none',
};
const base = {
  schemaVersion: 1 as const,
  rendererContractVersion: 1 as const,
  canvas: {
    width: 390 as const,
    height: 780,
    background: { kind: 'solid' as const, color: '#FFFFFFFF' },
  },
};
function element(
  type: string,
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  },
  content: Record<string, unknown>,
  id: string,
) {
  return {
    id,
    type,
    box,
    appearance: {
      opacity: 1,
      border: { width: 0, color: '#000000FF', style: 'solid' as const },
      shadow: null,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    content,
  };
}
async function render(page: Page, elements: ReturnType<typeof element>[]) {
  await page.waitForFunction(() => Boolean(window.invitationRenderer));
  return page.evaluate(
    async ({ scene }) => {
      const renderer = window.invitationRenderer;
      if (!renderer) throw new Error('Renderer contract not ready');
      return renderer.render({
        candidateHash: 'a'.repeat(64),
        scene,
        context: {
          mode: 'capture',
          asOf: '2026-01-01T00:00:00Z',
          assetUrls: {},
        },
        states: 'publication-validation',
      });
    },
    { scene: { ...base, elements } as unknown as ResolvedScene },
  );
}

test('serves an empty, private-cache-free harness and verifies DOM readiness and widget capture states', async ({
  page,
  builderOrigin,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(builderOrigin)) outside.push(request.url());
  });
  const response = await page.goto(
    builderOrigin + '/internal/invitation-renderer',
  );
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  expect(response?.headers()['content-security-policy']).toContain(
    "frame-src 'none'",
  );
  await expect(page.getByTestId('capture-root')).toBeEmpty();
  const report = await render(page, [
    element(
      'Text',
      { x: 20, y: 20, width: 300, height: 80, rotation: 0 },
      { text: 'Tên cô dâu', textStyle: style },
      '00000000-0000-4000-8000-000000000001',
    ),
  ]);
  expect(report).toMatchObject({
    version: 1,
    candidateHash: 'a'.repeat(64),
    ready: true,
    captureRect: { x: 0, y: 0, width: 390, height: 520 },
  });
  const widgets = await render(page, [
    element(
      'Map',
      { x: 20, y: 20, width: 350, height: 320, rotation: 0 },
      {
        venue: {
          name: 'Nhà hàng',
          address: 'Địa chỉ',
          latitude: 10.7,
          longitude: 106.7,
        },
        label: 'Địa điểm',
        textStyle: style,
      },
      '00000000-0000-4000-8000-000000000002',
    ),
    element(
      'RSVP',
      { x: 20, y: 260, width: 350, height: 500, rotation: 0 },
      {
        title: 'Xác nhận',
        closedLabel: 'Đóng',
        successLabel: 'Cảm ơn',
        textStyle: style,
      },
      '00000000-0000-4000-8000-000000000003',
    ),
  ]);
  expect(widgets.ready).toBe(true);
  expect(widgets.hasVisibleRsvp).toBe(true);
  await expect(page.locator('[data-rendered-element] iframe')).toHaveCount(0);
  await expect(page.locator('[data-rendered-element] input')).toHaveCount(0);
  expect(outside).toEqual([]);
  const tooSmall = await render(page, [
    element(
      'RSVP',
      { x: 20, y: 20, width: 350, height: 220, rotation: 0 },
      {
        title: 'Xác nhận',
        closedLabel: 'Đóng',
        successLabel: 'Cảm ơn',
        textStyle: style,
      },
      '00000000-0000-4000-8000-000000000003',
    ),
  ]);
  expect(tooSmall.ready).toBe(false);
  expect(tooSmall.issues).toContainEqual(
    expect.objectContaining({
      nodeId: '00000000-0000-4000-8000-000000000003',
      code: 'CONTENT_OVERFLOW',
    }),
  );
});

test('measures actual text overflow and rotated canvas bounds with one-pixel tolerance', async ({
  page,
  builderOrigin,
}) => {
  await page.goto(builderOrigin + '/internal/invitation-renderer');
  const overflow = await render(page, [
    element(
      'Text',
      { x: 20, y: 20, width: 60, height: 22, rotation: 0 },
      {
        text: 'Thiệp cưới với nội dung tiếng Việt rất dài cần được kiểm tra tràn khung',
        textStyle: { ...style, fontSize: 24 },
      },
      '00000000-0000-4000-8000-000000000004',
    ),
  ]);
  expect(overflow.ready).toBe(false);
  expect(overflow.issues.map((issue) => issue.code)).toContain(
    'CONTENT_OVERFLOW',
  );
  const rotated = await render(page, [
    element(
      'Shape',
      { x: 0, y: 0, width: 100, height: 50, rotation: 90 },
      { primitive: 'rectangle', fill: '#AABBCCFF' },
      '00000000-0000-4000-8000-000000000005',
    ),
  ]);
  expect(rotated.ready).toBe(false);
  expect(rotated.issues.map((issue) => issue.code)).toContain(
    'CANVAS_OVERFLOW',
  );
});

test('reports a blocked bundled font as FONT_UNAVAILABLE', async ({
  page,
  builderOrigin,
}) => {
  await page.route('**/fonts/invitation-builder/*.woff2', (route) =>
    route.abort('failed'),
  );
  await page.goto(builderOrigin + '/internal/invitation-renderer');
  const report = await render(page, [
    element(
      'Text',
      { x: 20, y: 20, width: 300, height: 80, rotation: 0 },
      { text: 'Tên cô dâu', textStyle: style },
      '00000000-0000-4000-8000-000000000006',
    ),
  ]);
  expect(report.ready).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toContain(
    'FONT_UNAVAILABLE',
  );
});

test('requires every weight and italic font face in a mixed-font scene', async ({
  page,
  builderOrigin,
}) => {
  await page.route('**/fonts/invitation-builder/*-700-italic.woff2', (route) =>
    route.abort('failed'),
  );
  await page.goto(builderOrigin + '/internal/invitation-renderer');
  const report = await render(page, [
    element(
      'Text',
      { x: 20, y: 20, width: 300, height: 80, rotation: 0 },
      { text: 'Font thường tiếng Việt', textStyle: style },
      '00000000-0000-4000-8000-000000000007',
    ),
    element(
      'Text',
      { x: 20, y: 120, width: 300, height: 80, rotation: 0 },
      {
        text: 'Font đậm nghiêng tiếng Việt',
        textStyle: { ...style, fontWeight: 700, italic: true },
      },
      '00000000-0000-4000-8000-000000000008',
    ),
  ]);
  expect(report.ready).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toContain(
    'FONT_UNAVAILABLE',
  );
});

test('detects padding-only overflow at canonical scale and probes labels before restoring the frozen scene', async ({
  page,
  builderOrigin,
}) => {
  await page.goto(builderOrigin + '/internal/invitation-renderer');
  const text = element(
    'Text',
    { x: 40, y: 40, width: 240, height: 40, rotation: 12 },
    { text: 'Một dòng', textStyle: style },
    '00000000-0000-4000-8000-000000000011',
  );
  text.appearance.padding = { top: 8, right: 8, bottom: 8, left: 8 };
  for (const scale of [0.5, 1, 2]) {
    await page.getByTestId('capture-root').evaluate((root, scale) => {
      root.style.transform = `scale(${scale})`;
      root.style.transformOrigin = 'top left';
    }, scale);
    const report = await render(page, [text]);
    expect(report.issues).toContainEqual({
      nodeId: text.id,
      path: `/nodes/${text.id}/content`,
      code: 'CONTENT_OVERFLOW',
    });
  }
  await page.getByTestId('capture-root').evaluate((root) => {
    root.style.transform = '';
  });
  const rsvp = element(
    'RSVP',
    { x: 20, y: 20, width: 350, height: 160, rotation: 0 },
    {
      title: 'RSVP',
      closedLabel: 'Đóng',
      successLabel: 'Nhãn thành công '.repeat(100),
      textStyle: style,
    },
    '00000000-0000-4000-8000-000000000012',
  );
  const report = await render(page, [rsvp]);
  expect(report.ready).toBe(false);
  expect(report.issues.map((issue) => issue.code)).toContain(
    'CONTENT_OVERFLOW',
  );
  await expect(page.getByText('Đóng', { exact: true })).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  const countdown = element(
    'Countdown',
    { x: 20, y: 20, width: 350, height: 120, rotation: 0 },
    {
      event: {
        datetime: '2027-01-10T10:00:00+07:00',
        timeZone: 'Asia/Ho_Chi_Minh',
      },
      label: 'Đếm ngược',
      endedLabel: 'Nhãn hết hạn '.repeat(100),
      textStyle: style,
    },
    '00000000-0000-4000-8000-000000000013',
  );
  const countReport = await render(page, [countdown]);
  expect(countReport.ready).toBe(false);
  expect(countReport.issues.map((issue) => issue.code)).toContain(
    'CONTENT_OVERFLOW',
  );
  await expect(page.getByLabel('Ngày', { exact: true })).toBeVisible();
});

test.describe('production thumbnail geometry', () => {
  test.use({ deviceScaleFactor: 1, viewport: { width: 390, height: 780 } });
  test('captures canonical edge pixels at the real origin for short and long scenes', async ({
    page,
    builderOrigin,
  }) => {
    await page.goto(builderOrigin + '/internal/invitation-renderer');
    await page.waitForFunction(() => Boolean(window.invitationRenderer));
    for (const height of [390, 780]) {
      const edge = Math.min(height, 520);
      const shapes = [
        element(
          'Shape',
          { x: 0, y: 0, width: 12, height: 12, rotation: 0 },
          { primitive: 'rectangle', fill: '#FF0000FF' },
          '00000000-0000-4000-8000-000000000020',
        ),
        element(
          'Shape',
          { x: 378, y: edge - 12, width: 12, height: 12, rotation: 0 },
          { primitive: 'rectangle', fill: '#0000FFFF' },
          '00000000-0000-4000-8000-000000000021',
        ),
      ];
      const report = await page.evaluate(
        async (scene) =>
          window.invitationRenderer!.render({
            candidateHash: 'a'.repeat(64),
            scene,
            context: {
              mode: 'capture',
              asOf: '2026-01-01T00:00:00Z',
              assetUrls: {},
            },
            states: 'publication-validation',
          }),
        {
          ...base,
          canvas: {
            ...base.canvas,
            height,
            background: { kind: 'solid', color: '#11AA33FF' },
          },
          elements: shapes,
        } as unknown as ResolvedScene,
      );
      expect(report.ready).toBe(true);
      expect(report.captureRect).toEqual({
        x: 0,
        y: 0,
        width: 390,
        height: 520,
      });
      const rect = await page.getByTestId('capture-root').boundingBox();
      expect(rect).toMatchObject({ x: 0, y: 0, width: 390 });
      expect(rect!.height).toBeGreaterThanOrEqual(520);
      await expect
        .poll(async () => {
          const png = await page.screenshot({
            scale: 'device',
            clip: { x: 0, y: 0, width: 390, height: 520 },
          });
          return page.evaluate(
            async ({ encoded, edge }) => {
              const image = new Image();
              image.src = 'data:image/png;base64,' + encoded;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const ctx = canvas.getContext('2d')!;
              ctx.drawImage(image, 0, 0);
              return [
                [0, 0],
                [389, 0],
                [0, edge - 1],
                [389, edge - 1],
              ].map(([x, y]) => [
                ...ctx.getImageData(
                  Math.floor(((x + 0.5) * image.naturalWidth) / 390),
                  Math.floor(((y + 0.5) * image.naturalHeight) / 520),
                  1,
                  1,
                ).data,
              ]);
            },
            { encoded: png.toString('base64'), edge },
          );
        })
        .toEqual([
          [255, 0, 0, 255],
          [17, 170, 51, 255],
          [17, 170, 51, 255],
          [0, 0, 255, 255],
        ]);
    }
  });
});

test('measures combined RSVP feedback before restoring the frozen capture scene', async ({
  page,
  builderOrigin,
}) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  await page.goto(builderOrigin + '/internal/invitation-renderer');
  await page.getByTestId('capture-root').waitFor();
  await page.evaluate(() => {
    const records: {
      invalidFields: number;
      errorsFit: boolean;
      unavailable: boolean;
    }[] = [];
    Reflect.set(window, 'rsvpFieldFitRecords', records);
    Reflect.set(window, 'rsvpRequestFitRecords', []);
    const observer = new MutationObserver(() => {
      const frame = document.querySelector<HTMLElement>(
        '[data-rendered-element]',
      );
      if (!frame) return;
      const invalidFields = frame.querySelectorAll(
        '[aria-invalid="true"]',
      ).length;

      const bounds = frame.getBoundingClientRect();
      const errorsFit = [
        ...frame.querySelectorAll('[role="alert"], [role="status"]'),
      ].every((error) => {
        const rect = error.getBoundingClientRect();
        return (
          rect.bottom <= bounds.bottom + 1 && rect.right <= bounds.right + 1
        );
      });
      if (invalidFields !== 3) {
        if (
          frame.textContent?.includes('Bạn đã gửi nhiều lượt') &&
          frame.textContent?.includes('Hãy thử lại khi có kết nối')
        )
          Reflect.get(window, 'rsvpRequestFitRecords').push(errorsFit);
        return;
      }
      records.push({
        invalidFields,
        errorsFit,
        unavailable: !!frame
          .querySelector('[role="status"]')
          ?.textContent?.includes('Hãy thử lại khi có kết nối'),
      });
    });
    observer.observe(document.querySelector('[data-testid="capture-root"]')!, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    Reflect.set(window, 'rsvpFieldFitObserver', observer);
  });
  const rsvp = element(
    'RSVP',
    { x: 20, y: 20, width: 350, height: 500, rotation: 0 },
    {
      title: 'Xác nhận',
      closedLabel: 'Đóng',
      successLabel: 'Cảm ơn',
      textStyle: style,
    },
    '00000000-0000-4000-8000-000000000019',
  );
  const valid = await render(page, [rsvp]);
  expect(valid.ready).toBe(true);
  expect(
    await page.evaluate(() => Reflect.get(window, 'rsvpRequestFitRecords')),
  ).toContain(true);
  expect(
    await page.evaluate(() => Reflect.get(window, 'rsvpFieldFitRecords')),
  ).toContainEqual({ invalidFields: 3, errorsFit: true, unavailable: true });
  await page.evaluate(() => {
    Reflect.get(window, 'rsvpFieldFitRecords').length = 0;
  });
  const small = await render(page, [
    { ...rsvp, box: { ...rsvp.box, height: 420 } },
  ]);
  expect(small.issues).toContainEqual({
    nodeId: rsvp.id,
    path: `/nodes/${rsvp.id}/content`,
    code: 'CONTENT_OVERFLOW',
  });
  expect(
    await page.evaluate(() => Reflect.get(window, 'rsvpFieldFitRecords')),
  ).toContainEqual({ invalidFields: 3, errorsFit: false, unavailable: true });
  await expect(page.getByText('Đóng', { exact: true })).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  expect(posts).toEqual([]);
  await page.evaluate(() => {
    Reflect.get(window, 'rsvpFieldFitObserver').disconnect();
  });
});
