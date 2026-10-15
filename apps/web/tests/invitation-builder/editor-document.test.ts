import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import { describe, it, expect } from 'vitest';
import {
  createBlankDocument,
  validateEditorDocument,
  scalePrimitiveDocument,
  resolveEditorDocument,
} from '../../src/features/invitation-builder/document/editor-document';

describe('FR-014 text and shape additions', () => {
  const id = '00000000-0000-4000-8000-000000000002';
  const documentWith = (node: ReturnType<typeof primitiveNode>) => {
    const base = createBlankDocument();
    return {
      ...base,
      nodes: {
        ...base.nodes,
        [id]: node,
        ROOT: { ...base.nodes.ROOT, nodes: [id] },
      },
    };
  };
  it('accepts optional strikethrough and rejects non-boolean values', () => {
    const text = primitiveNode('Text');
    if (!('textStyle' in text.props.content)) throw new Error('not text');
    expect(validateEditorDocument(documentWith(text)).valid).toBe(true);
    text.props.content.textStyle.strike = true;
    expect(validateEditorDocument(documentWith(text)).valid).toBe(true);
    (text.props.content.textStyle as unknown as { strike: unknown }).strike =
      'yes';
    expect(validateEditorDocument(documentWith(text)).valid).toBe(false);
  });
  it('accepts per-edge borders and a separate text shadow, and rejects bad values', () => {
    const text = primitiveNode('Text');
    if (!('textStyle' in text.props.content)) throw new Error('not text');
    text.props.appearance.border = {
      ...text.props.appearance.border,
      position: 'vertical',
    };
    text.props.content.textStyle.textShadow = {
      offsetX: 1,
      offsetY: 2,
      blur: 3,
      color: '#00000066',
    };
    expect(validateEditorDocument(documentWith(text)).valid).toBe(true);
    (text.props.appearance.border as unknown as { position: string }).position =
      'diagonal';
    expect(validateEditorDocument(documentWith(text)).valid).toBe(false);
    text.props.appearance.border.position = 'all';
    text.props.content.textStyle.textShadow.blur = 999;
    expect(validateEditorDocument(documentWith(text)).valid).toBe(false);
  });
  it('accepts a triangle without border radius and rejects one with it', () => {
    const shape = primitiveNode('Shape');
    shape.props.content = { primitive: 'triangle', fill: '#B69A72FF' };
    delete shape.props.appearance.borderRadius;
    expect(validateEditorDocument(documentWith(shape)).valid).toBe(true);
    shape.props.appearance.borderRadius = 8;
    expect(validateEditorDocument(documentWith(shape)).valid).toBe(false);
  });
});

describe('500px document contract', () => {
  it('uses a separate strict500 contract without changing legacy', () => {
    const document = createBlankDocument();
    expect(document.nodes.ROOT.props.canvas.width).toBe(500);
    expect(validateEditorDocument(document).valid).toBe(true);
    expect(validateEditorDocument({ ...document, unknown: true }).valid).toBe(
      false,
    );
    document.nodes.ROOT.props.canvas.height = 16001;
    expect(validateEditorDocument(document).valid).toBe(false);
  });
  it('preserves scaled large typography and borders through repeated validation', () => {
    const legacy = {
      schemaVersion: 1 as const,
      nodes: {
        ROOT: {
          ...createBlankDocument().nodes.ROOT,
          props: {
            canvas: {
              width: 390 as const,
              height: 1000,
              background: { kind: 'solid' as const, color: '#FFFFFFFF' },
            },
          },
        },
      },
    };
    const text = primitiveNode('Text');
    if ('textStyle' in text.props.content)
      text.props.content.textStyle.fontSize = 160;
    const id = '00000000-0000-4000-8000-000000000001';
    const source = { ...legacy, nodes: { ...legacy.nodes, [id]: text } };
    source.nodes.ROOT.nodes = [id];
    const converted = scalePrimitiveDocument(source);
    const validated = validateEditorDocument(converted);
    expect(validated.valid).toBe(true);
    if (validated.valid) {
      expect(validated.value).toEqual(converted);
      expect(validateEditorDocument(validated.value)).toEqual(validated);
    }
  });
  it('rejects width-only legacy rewrites and unknown versions', () => {
    const document = createBlankDocument();
    expect(
      validateEditorDocument({ ...document, schemaVersion: 1 }).valid,
    ).toBe(false);
    expect(
      validateEditorDocument({
        ...document,
        nodes: {
          ...document.nodes,
          ROOT: {
            ...document.nodes.ROOT,
            props: {
              canvas: { ...document.nodes.ROOT.props.canvas, width: 390 },
            },
          },
        },
      }).valid,
    ).toBe(false);
  });
  it('converts a copy, retains source and resolves native geometry', () => {
    const source = {
      schemaVersion: 1 as const,
      nodes: {
        ROOT: {
          ...createBlankDocument().nodes.ROOT,
          props: {
            canvas: {
              width: 390 as const,
              height: 12000,
              background: { kind: 'solid' as const, color: '#FFFFFFFF' },
            },
          },
        },
      },
    };
    const next = scalePrimitiveDocument(source);
    expect(source.nodes.ROOT.props.canvas.width).toBe(390);
    expect(next.nodes.ROOT.props.canvas.height).toBe(
      Math.round((12000 * 500) / 390),
    );
    expect(validateEditorDocument(next).valid).toBe(true);
    expect(
      resolveEditorDocument(
        next,
        { schemaVersion: 1 },
        { mode: 'preview', asOf: '2026-01-01T00:00:00Z' },
      ).scene.canvas.width,
    ).toBe(500);
  });
});

describe('Cinelove image customization fields', () => {
  const id = '00000000-0000-4000-8000-000000000003';
  const withNode = (
    node: ReturnType<typeof primitiveNode>,
    options: Record<string, unknown> = {},
  ) => {
    const base = createBlankDocument();
    return {
      ...base,
      nodes: {
        ...base.nodes,
        [id]: node,
        ROOT: { ...base.nodes.ROOT, nodes: [id] },
      },
      nodeOptions: { [id]: options },
    };
  };
  it('keeps images without background or padding valid', () => {
    expect(validateEditorDocument(withNode(primitiveNode('Image'))).valid).toBe(
      true,
    );
  });
  it('accepts an image background and padding, and a decoration background only', () => {
    const image = primitiveNode('Image');
    image.props.appearance.background = { kind: 'solid', color: '#FF000080' };
    image.props.appearance.padding = {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    };
    expect(validateEditorDocument(withNode(image)).valid).toBe(true);
    const decoration = primitiveNode('Decoration');
    decoration.props.appearance.background = {
      kind: 'solid',
      color: '#FFFFFFFF',
    };
    expect(validateEditorDocument(withNode(decoration)).valid).toBe(true);
    decoration.props.appearance.padding = {
      top: 1,
      right: 1,
      bottom: 1,
      left: 1,
    };
    expect(validateEditorDocument(withNode(decoration)).valid).toBe(false);
  });
  it('accepts the 100px padding ceiling used by the panel', () => {
    const image = primitiveNode('Image');
    image.props.appearance.padding = {
      top: 100,
      right: 100,
      bottom: 100,
      left: 100,
    };
    expect(validateEditorDocument(withNode(image)).valid).toBe(true);
  });
  it('accepts legacy and new crop shapes with a crop aspect, and rejects unknown values', () => {
    const image = primitiveNode('Image');
    for (const mask of ['circle', 'arch', 'heart', 'dome', 'fade-bottom'])
      expect(
        validateEditorDocument(withNode(image, { mask, cropAspect: '16:9' }))
          .valid,
      ).toBe(true);
    expect(
      validateEditorDocument(withNode(image, { mask: 'blob' })).valid,
    ).toBe(false);
    expect(
      validateEditorDocument(withNode(image, { cropAspect: '5:4' })).valid,
    ).toBe(false);
  });
});
