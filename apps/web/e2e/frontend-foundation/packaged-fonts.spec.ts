import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, seed, capture } from './helpers';

const manifest = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'public/fonts/invitation-builder/manifest.json'),
    'utf8',
  ),
) as {
  faces: {
    family: string;
    weight: number;
    style: string;
    sources: { url: string; bytes: number; sha256: string }[];
  }[];
};

test('standalone serves all 16 pinned font files with exact bytes and MIME', async ({
  request,
}) => {
  expect(manifest.faces).toHaveLength(8);
  const sources = manifest.faces.flatMap((face) => face.sources);
  expect(sources).toHaveLength(16);
  for (const source of sources) {
    const response = await request.get(source.url);
    expect(response.ok(), source.url).toBeTruthy();
    expect(response.headers()['content-type'], source.url).toMatch(
      /font\/woff2/,
    );
    const bytes = await response.body();
    expect(bytes.byteLength, source.url).toBe(source.bytes);
    expect(createHash('sha256').update(bytes).digest('hex'), source.url).toBe(
      source.sha256,
    );
  }
});

test('Vietnamese and Latin faces load at each weight and style on public invitation', async ({
  page,
}) => {
  await page.goto(`/i/${seed().publicSlug}`);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  const loaded = await page.evaluate(async (faces) => {
    const results = await Promise.all(
      faces.map((face) =>
        document.fonts.load(
          `${face.style} ${face.weight} 16px "${face.family}"`,
          'Đám cưới ABC',
        ),
      ),
    );
    return faces.map(
      (face, index) =>
        results[index].length > 0 &&
        results[index].every(
          (loaded) =>
            loaded.status === 'loaded' &&
            loaded.family.replaceAll('"', '') === face.family &&
            loaded.weight === String(face.weight) &&
            loaded.style === face.style,
        ),
    );
  }, manifest.faces);
  expect(loaded).toEqual(manifest.faces.map(() => true));
});

test('blocked font does not replace the published scene', async ({ page }) => {
  await page.route('**/fonts/invitation-builder/*.woff2', (route) =>
    route.abort(),
  );
  const report = await capture(page);
  expect(report.ready).toBe(false);
  expect(report.issues.some((issue) => issue.code === 'FONT_UNAVAILABLE')).toBe(
    true,
  );
  await page.goto(`/i/${seed().publicSlug}`);
  await expect(page.getByTestId('public-workarea')).toBeVisible();
  await expect(page.getByText(/thiệp không khả dụng/i)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('public-workarea')).toBeVisible();
});

test('missing image fails actual capture readiness while the prior public version remains available', async ({
  page,
  request,
}) => {
  const f = seed();
  const url = `${process.env.FRONTEND_TEST_API_URL}/api/v1/public/invitations/${f.publicSlug}`;
  const before = await request.get(url);
  expect(before.ok()).toBe(true);
  const previous = await before.json();
  const asset = '00000000-0000-4000-8000-000000000001';
  const source = f.scene.elements[0];
  const scene = {
    ...f.scene,
    elements: [
      {
        ...source,
        type: 'Image' as const,
        content: {
          assetId: asset,
          fit: 'cover' as const,
          positionX: 0.5,
          positionY: 0.5,
        },
      },
    ],
  };
  const result = await capture(page, scene, {
    [asset]: new URL(
      '/unavailable-required-image.png',
      process.env.FRONTEND_TEST_WEB_URL,
    ).href,
  });
  expect(result.ready).toBe(false);
  expect(
    result.issues.some((issue) => issue.code === 'RENDER_ASSET_NOT_READY'),
  ).toBe(true);
  const after = await request.get(url);
  const current = await after.json();
  expect(current.publicVersion).toBe(previous.publicVersion);
  expect(current.scene).toEqual(previous.scene);
});

test('a nonexistent face cannot satisfy the font readiness assertion', async ({
  page,
}) => {
  await page.goto('/login');
  const evidence = await page.evaluate(async (source) => {
    const fallback = new FontFace(
      'Deliberate Loaded Fallback',
      `url(${source})`,
      { weight: '400', style: 'normal' },
    );
    await fallback.load();
    document.fonts.add(fallback);
    const faces = await document.fonts.load(
      '400 16px "Deliberately Missing Platform Face"',
      'Đặng ABC',
    );
    return {
      fallbackLoaded: fallback.status === 'loaded',
      primaryReady:
        faces.length > 0 && faces.every((face) => face.status === 'loaded'),
    };
  }, manifest.faces[0].sources[0].url);
  expect(evidence.fallbackLoaded).toBe(true);
  expect(evidence.primaryReady).toBe(false);
});

test('standalone loads four platform sans weights and the editorial face locally', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Đăng nhập' }),
  ).toBeVisible();
  const evidence = await page.evaluate(async () => {
    const main = document.querySelector('main');
    if (!main) throw new Error('Missing platform page');
    const style = getComputedStyle(main);
    const sans = style.fontFamily;
    const editorial = style
      .getPropertyValue('--font-platform-editorial')
      .trim();
    const checks: boolean[] = [];
    const family = (value: string) =>
      value.split(',')[0].trim().replaceAll(/['"]/g, '');
    for (const weight of [400, 500, 600, 700]) {
      const loaded = await document.fonts.load(
        `${weight} 16px "${family(sans)}"`,
        'Đám cưới Việt Nam ABC',
      );
      checks.push(
        loaded.length > 0 &&
          loaded.every(
            (face) =>
              face.status === 'loaded' &&
              family(face.family) === family(sans) &&
              face.weight === String(weight) &&
              face.style === 'normal',
          ),
      );
    }
    const editorialFaces = await document.fonts.load(
      `500 32px "${family(editorial)}"`,
      'Đám cưới Việt Nam ABC',
    );
    checks.push(
      editorialFaces.length > 0 &&
        editorialFaces.every(
          (face) =>
            face.status === 'loaded' &&
            family(face.family) === family(editorial) &&
            face.weight === '500' &&
            face.style === 'normal',
        ),
    );
    await document.fonts.ready;
    return {
      ready:
        checks.every(Boolean) &&
        [400, 500, 600, 700].every((weight) =>
          document.fonts.check(
            `${weight} 16px "${family(sans)}"`,
            'Đám cưới Việt Nam ABC',
          ),
        ) &&
        document.fonts.check(
          `500 32px "${family(editorial)}"`,
          'Đám cưới Việt Nam ABC',
        ),
      localFiles: performance
        .getEntriesByType('resource')
        .filter(
          (entry) =>
            entry.name.includes('/_next/static/media/') &&
            /\.(?:ttf|woff2)(?:\?|$)/.test(entry.name),
        )
        .map((entry) => entry.name),
    };
  });
  expect(evidence.ready).toBe(true);
  const platform = JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'src/ui/platform/fonts/manifest.json'),
      'utf8',
    ),
  ) as { files: { file: string; sha256: string; bytes: number }[] };
  const found = new Set<string>();
  for (const url of evidence.localFiles) {
    expect(new URL(url).origin).toBe(
      new URL(process.env.FRONTEND_TEST_WEB_URL!).origin,
    );
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    const hash = createHash('sha256').update(bytes).digest('hex');
    const source = platform.files.find((file) => file.sha256 === hash);
    if (source) {
      expect(bytes.length).toBe(source.bytes);
      found.add(source.file);
    }
  }
  expect([...found].sort()).toEqual(
    platform.files
      .filter((file) => file.file.endsWith('.ttf'))
      .map((file) => file.file)
      .sort(),
  );
});
