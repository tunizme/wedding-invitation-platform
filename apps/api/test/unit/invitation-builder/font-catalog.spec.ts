import { describe, expect, it } from 'vitest';
import {
  FONT_CATALOG,
  supportsFontFace,
} from '../../../src/modules/invitation-builder/domain/font-catalog';
import {
  createBlankDocument,
  validateEditorDocument,
} from '../../../src/modules/invitation-builder/domain/editor-document';

describe('API font catalog contract', () => {
  it('accepts every packaged face and rejects unsupported styles independently of the web', () => {
    const id = '00000000-0000-4000-8000-000000000002';
    for (const font of FONT_CATALOG)
      for (const weight of [400, 700] as const)
        for (const italic of [false, true]) {
          const blank = createBlankDocument();
          const value = {
            ...blank,
            nodes: {
              ROOT: { ...blank.nodes.ROOT, nodes: [id] },
              [id]: {
                type: { resolvedName: 'Text' },
                displayName: 'Text',
                isCanvas: false,
                parent: 'ROOT',
                hidden: false,
                nodes: [],
                linkedNodes: {},
                custom: {
                  layerName: 'Văn bản',
                  locked: false,
                  optional: false,
                },
                props: {
                  box: { x: 0, y: 0, width: 400, height: 80, rotation: 0 },
                  appearance: {
                    opacity: 1,
                    background: { kind: 'solid', color: '#FFFFFF00' },
                    padding: { top: 0, right: 0, bottom: 0, left: 0 },
                    border: { width: 0, style: 'solid', color: '#000000FF' },
                    shadow: null,
                    borderRadius: 0,
                  },
                  bindings: [],
                  content: {
                    text: 'Nguyễn Đặng Ánh Hằng',
                    textStyle: {
                      fontId: font.id,
                      fontSize: 24,
                      fontWeight: weight,
                      italic,
                      underline: false,
                      color: '#000000FF',
                      letterSpacing: 0,
                      lineHeight: 1.5,
                      textAlign: 'left',
                      textTransform: 'none',
                    },
                  },
                },
              },
            },
          };
          expect(
            validateEditorDocument(value).valid,
            `${font.id}:${weight}:${italic}`,
          ).toBe(supportsFontFace(font.id, weight, italic));
        }
  });
});
