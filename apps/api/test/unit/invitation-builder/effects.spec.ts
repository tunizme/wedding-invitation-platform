import { visibleSceneAssetIds } from '../../../src/modules/invitations/domain/visible-scene-assets';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBlankDocument,
  documentAssetIds,
  resolveEditorDocument,
  validateEditorDocument,
} from '../../../src/modules/invitation-builder/domain/editor-document';
import {
  OPENING_KINDS,
  defaultOpeningEffect,
  validOpeningEffect,
} from '../../../src/modules/invitation-builder/domain/effects';
describe('opening effect persistence contract', () => {
  it('keeps web and API effect contracts identical', () => {
    const root = resolve(__dirname, '../../../..');
    expect(
      readFileSync(
        resolve(
          root,
          'web/src/features/invitation-builder/document/effects.ts',
        ),
        'utf8',
      ),
    ).toBe(
      readFileSync(
        resolve(root, 'api/src/modules/invitation-builder/domain/effects.ts'),
        'utf8',
      ),
    );
  });
  it.each(OPENING_KINDS)(
    'accepts %s in document and all scene modes',
    (kind) => {
      const doc = createBlankDocument();
      doc.settings.openingEffect = defaultOpeningEffect(kind);
      expect(
        validateEditorDocument(JSON.parse(JSON.stringify(doc))).valid,
      ).toBe(true);
      for (const mode of ['capture', 'preview', 'public'] as const)
        expect(
          resolveEditorDocument(
            doc,
            { schemaVersion: 1 },
            { mode, asOf: '2026-10-15T00:00:00Z' },
          ).scene.settings.openingEffect,
        ).toEqual(doc.settings.openingEffect);
    },
  );
  it('includes private opening images in authorization and publication asset inventories', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const doc = createBlankDocument();
    const effect = defaultOpeningEffect('intro');
    if (effect.kind !== 'intro') throw Error();
    effect.images[0] = { assetId: id, preset: null };
    doc.settings.openingEffect = effect;
    expect(documentAssetIds(doc)).toEqual([id]);
    expect(
      resolveEditorDocument(
        doc,
        { schemaVersion: 1 },
        { mode: 'public', asOf: '2026-10-15T00:00:00Z' },
      ).visibleAssetIds,
    ).toEqual([id]);
  });
  it('exposes only committed opening image IDs in public byte delivery', () => {
    const doc = createBlankDocument();
    const effect = defaultOpeningEffect('photobooth');
    if (effect.kind !== 'photobooth') throw Error();
    const id = '00000000-0000-4000-8000-000000000001';
    effect.images[0] = { assetId: id, preset: null };
    doc.settings.openingEffect = effect;
    const scene = resolveEditorDocument(
      doc,
      { schemaVersion: 1 },
      { mode: 'public', asOf: '2026-10-15T00:00:00Z' },
    ).scene;
    expect(visibleSceneAssetIds(scene)).toEqual([id]);
    expect(
      visibleSceneAssetIds({
        ...scene,
        settings: { ...scene.settings, openingEffect: null },
      }),
    ).toEqual([]);
  });
  it('rejects arbitrary URLs, unsupported presets, conflicting image references and nonfinite durations', () => {
    const effect = defaultOpeningEffect('animated-image');
    expect(validOpeningEffect({ ...effect, duration: NaN })).toBe(false);
    expect(
      validOpeningEffect({
        ...effect,
        image: { assetId: 'https://example.test/a.png', preset: null },
      }),
    ).toBe(false);
    expect(
      validOpeningEffect({
        ...effect,
        image: {
          assetId: '00000000-0000-4000-8000-000000000001',
          preset: 'character-1',
        },
      }),
    ).toBe(false);
    expect(
      validOpeningEffect({
        ...effect,
        image: { assetId: null, preset: 'unknown' },
      }),
    ).toBe(false);
  });
  it('accepts old settings and all seven falling types', () => {
    for (const particles of [
      'none',
      'petals',
      'hearts',
      'snow',
      'flowers',
      'stars',
      'confetti',
      'butterflies',
      'mix',
    ] as const) {
      const doc = createBlankDocument();
      doc.settings.particles = particles;
      doc.settings.envelope = true;
      expect(validateEditorDocument(doc).valid).toBe(true);
    }
  });
});
