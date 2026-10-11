import { test, expect } from '@playwright/test';
import pilot from './fixtures/responsive-pilot.json';
import { resolveDesign } from '../../src/features/invitation-builder/document/resolve-design';
import type {
  TemplateDesignV2,
  WeddingData,
} from '../../src/features/invitation-builder/document/types';
const document = structuredClone(pilot) as TemplateDesignV2;
for (const section of Object.values(document.sections))
  section.flowNodeIds = section.flowNodeIds.filter(
    (id) => document.nodes[id].type !== 'Image',
  );
for (const [id, node] of Object.entries(document.nodes))
  if (node.type === 'Image') delete document.nodes[id];
for (const [id, section] of Object.entries(document.sections))
  if (!section.flowNodeIds.length && !section.artworkNodeIds.length) {
    delete document.sections[id];
    document.sectionOrder = document.sectionOrder.filter((sid) => sid !== id);
  }
const asOf = '2026-01-01T00:00:00.000Z';
const scene = resolveDesign(document, { schemaVersion: 1 } as WeddingData, {
  mode: 'capture',
  asOf,
}).scene;
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.responsiveHost));
  await page.evaluate(() =>
    window.responsiveHost.mount({ width: 390, mode: 'preview' }, 'capture'),
  );
  await page.waitForFunction(() => Boolean(window.invitationRendererV2));
});
test('strict dual protocol, both canonical layouts and full functional variants', async ({
  page,
}) => {
  expect(
    await page.evaluate(() => ({
      legacy: window.invitationRenderer?.version,
      v2: window.invitationRendererV2?.protocolVersion,
      pairs: window.invitationRendererV2?.supportedScenePairs,
    })),
  ).toEqual({
    legacy: 1,
    v2: 2,
    pairs: [
      [1, 1],
      [2, 2],
    ],
  });
  for (const width of [390, 900] as const) {
    await page.setViewportSize({ width, height: 780 });
    const report = await page.evaluate(
      async ({ scene, asOf, width }) =>
        window.invitationRendererV2!.render({
          protocolVersion: 2,
          candidateHash: 'a'.repeat(64),
          scene,
          context: { mode: 'capture', asOf, assetUrls: {} },
          states: 'publication-validation',
          containerWidth: width,
          scenePair: [2, 2],
          correlationId: '10000000-0000-4000-8000-000000000001',
        }),
      { scene, asOf, width },
    );
    expect(report.issues).toEqual([]);
    expect(report.ready).toBe(true);
    expect(report.rootRect.width).toBe(width);
    expect(report.rootRect.height).toBeGreaterThan(0);
    expect(report.captureRect).toEqual({ x: 0, y: 0, width, height: 520 });
    expect(await page.locator('[data-testid="capture-root"]').count()).toBe(1);
  }
});
test('rejects malformed identity, context and scene before rendering', async ({
  page,
}) => {
  const errors = await page.evaluate(
    async ({ scene, asOf }) => {
      const valid = {
        protocolVersion: 2,
        candidateHash: 'a'.repeat(64),
        scene,
        context: { mode: 'capture', asOf, assetUrls: {} },
        states: 'publication-validation',
        containerWidth: 390,
        scenePair: [2, 2],
        correlationId: '10000000-0000-4000-8000-000000000001',
      };
      const errors: string[] = [];
      for (const patch of [
        { protocolVersion: 1 },
        { unknown: true },
        { containerWidth: 768 },
        { scenePair: [1, 1] },
        { correlationId: 'bad' },
        { context: { ...valid.context, mode: 'public' } },
        { scene: { ...scene, unknown: true } },
      ])
        try {
          await window.invitationRendererV2!.render({
            ...valid,
            ...patch,
          } as never);
          errors.push('ACCEPTED');
        } catch (error) {
          errors.push((error as Error).message);
        }
      return errors;
    },
    { scene, asOf },
  );
  expect(errors).toEqual(Array(7).fill('RENDER_REQUEST_INVALID'));
});
test('legacy report1 remains exact and protocol2 supports pair1 only at390 with natural short root', async ({
  page,
}) => {
  const scene = {
    schemaVersion: 1 as const,
    rendererContractVersion: 1 as const,
    canvas: {
      width: 390 as const,
      height: 390,
      background: { kind: 'solid' as const, color: '#FFFFFFFF' },
    },
    elements: [],
  };
  const report = await page.evaluate(
    async ({ scene, asOf }) =>
      window.invitationRenderer!.render({
        candidateHash: 'a'.repeat(64),
        scene,
        context: { mode: 'capture', asOf, assetUrls: {} },
        states: 'publication-validation',
      }),
    { scene, asOf },
  );
  expect(Object.keys(report).sort()).toEqual(
    [
      'version',
      'candidateHash',
      'ready',
      'issues',
      'captureRect',
      'hasVisibleRsvp',
    ].sort(),
  );
  expect(report).toMatchObject({
    version: 1,
    ready: true,
    issues: [],
    captureRect: { x: 0, y: 0, width: 390, height: 520 },
  });
  const v2 = await page.evaluate(
    async ({ scene, asOf }) =>
      window.invitationRendererV2!.render({
        protocolVersion: 2,
        candidateHash: 'a'.repeat(64),
        scene,
        context: { mode: 'capture', asOf, assetUrls: {} },
        states: 'publication-validation',
        containerWidth: 390,
        scenePair: [1, 1],
        correlationId: '10000000-0000-4000-8000-000000000001',
      }),
    { scene, asOf },
  );
  expect(v2.rootRect).toEqual({ x: 0, y: 0, width: 390, height: 390 });
  expect(v2.captureRect.height).toBe(520);
  expect(v2.ready).toBe(true);
});
test('waits for delayed image decode and rejects simultaneous renders', async ({
  page,
}) => {
  const fullScene = resolveDesign(
    pilot as TemplateDesignV2,
    { schemaVersion: 1 },
    { mode: 'capture', asOf },
  ).scene;
  const ids = Object.values(
    (
      fullScene as import('../../src/features/invitation-builder/document/types').ResolvedSceneV2
    ).nodes,
  )
    .filter((node) => node.type === 'Image')
    .map((node) => (node.content as { assetId: string }).assetId);
  let release!: () => void;
  const hold = new Promise<void>((accept) => {
    release = accept;
  });
  await page.route('**/__render-assets/*', async (route) => {
    await hold;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="tan"/></svg>',
    });
  });
  const pending = page.evaluate(
    async ({ scene, asOf, ids }) => {
      const request = {
        protocolVersion: 2 as const,
        candidateHash: 'a'.repeat(64),
        scene,
        context: {
          mode: 'capture' as const,
          asOf,
          assetUrls: Object.fromEntries(
            ids.map((id) => [id, `/__render-assets/${id}`]),
          ),
        },
        states: 'publication-validation' as const,
        containerWidth: 390 as const,
        scenePair: [2, 2] as [2, 2],
        correlationId: '10000000-0000-4000-8000-000000000001',
      };
      const first = window.invitationRendererV2!.render(request);
      let simultaneous = '';
      try {
        await window.invitationRendererV2!.render(request);
      } catch (error) {
        simultaneous = (error as Error).message;
      }
      return { report: await first, simultaneous };
    },
    { scene: fullScene, asOf, ids },
  );
  await expect(page.locator('[data-testid="capture-root"] img')).toHaveCount(2);
  release();
  const result = await pending;
  expect(result.simultaneous).toBe('RENDER_BUSY');
  expect(result.report.ready).toBe(true);
  expect(result.report.issues).toEqual([]);
});
