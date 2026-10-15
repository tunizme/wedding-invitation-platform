import { describe, expect, it } from 'vitest';
import { approvedRenderFontPath } from '../../../src/modules/invitation-builder/publication/chromium-renderer';
import { FONT_CATALOG } from '../../../src/modules/invitation-builder/domain/font-catalog';
describe('trusted capture font allowlist', () => {
  it('allows only packaged catalog faces, including Vietnamese full fonts', () => {
    for (const font of FONT_CATALOG)
      for (const face of font.faces)
        for (const subset of font.id.startsWith('noto-')
          ? ['vietnamese', 'latin']
          : ['full'])
          expect(
            approvedRenderFontPath(
              `/fonts/invitation-builder/${font.id}-${subset}-${face.weight}-${face.style}.woff2`,
            ),
          ).toBe(true);
    for (const path of [
      '/fonts/invitation-builder/evil.woff2',
      '/fonts/invitation-builder/allura-v1-full-700-normal.woff2',
      '/fonts/invitation-builder/../secret',
      '/fonts/invitation-builder/inter-v1-full-400-normal.woff2?x=1',
    ])
      expect(approvedRenderFontPath(path)).toBe(false);
  });
});
