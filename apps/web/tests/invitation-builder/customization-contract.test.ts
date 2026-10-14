import { describe, expect, it } from 'vitest';
import {
  createBlankDocument,
  resolveEditorDocument,
  validateEditorDocument,
  type NodeOptions,
} from '../../src/features/invitation-builder/document/editor-document';
import { validateEditorDocument as validateApiDocument } from '../../../api/src/modules/invitation-builder/domain/editor-document';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import { frameStyle } from '../../src/features/invitation-builder/renderer/primitives';
import {
  hexToHsva,
  hsvaToHex,
} from '../../src/features/invitation-builder/editor/color-utils';
import { formFieldsForDesign } from '../../src/features/invitation-builder/document/binding-catalog';

const id = '00000000-0000-4000-8000-000000000001';
function fixture() {
  const document = createBlankDocument();
  const node = primitiveNode('Text');
  node.props.box.height = 200;
  document.nodes[id] = node;
  document.nodes.ROOT.nodes = [id];
  return { document, node };
}
describe('customization survives both editor and API validation', () => {
  it('preserves independent corners, paired border edges, large tracking, and unified shadows', () => {
    const { document, node } = fixture();
    node.props.appearance.border = {
      width: 4,
      color: '#12345680',
      style: 'double',
      position: 'top-left',
    };
    node.props.appearance.borderRadii = {
      topLeft: 12,
      topRight: 3,
      bottomLeft: 5,
      bottomRight: 8,
    };
    if (!('textStyle' in node.props.content)) throw new Error('Expected text');
    node.props.content.textStyle.letterSpacing = 100;
    node.props.content.textStyle.lineHeight = 0.5;
    node.props.content.textStyle.textShadow = {
      offsetX: -100,
      offsetY: 100,
      blur: 100,
      color: '#12345680',
    };
    for (const validate of [validateEditorDocument, validateApiDocument]) {
      const result = validate(JSON.parse(JSON.stringify(document)));
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toEqual(document);
    }
    expect(frameStyle(node.props.box, node.props.appearance, {})).toMatchObject(
      {
        borderTop: '4px double #12345680',
        borderLeft: '4px double #12345680',
        borderTopLeftRadius: 12,
        borderBottomRightRadius: 8,
      },
    );
  });
  it.each([
    'fade',
    'slide',
    'slide-down',
    'slide-left',
    'slide-right',
    'scale',
    'scale-out',
    'rotate',
    'bounce',
  ] as const)('persists %s with timing and easing', (entrance) => {
    const { document } = fixture();
    document.nodeOptions[id] = {
      entrance,
      entranceEnabled: true,
      entranceDuration: 1.6,
      entranceDelay: 0.5,
      entranceEasing: 'ease-out',
      continuous: 'wiggle',
      continuousDuration: 2.5,
      continuousDelay: 1,
    };
    expect(validateEditorDocument(document).valid).toBe(true);
    expect(validateApiDocument(document).valid).toBe(true);
  });
  it.each([
    { entranceDuration: 0 },
    { entranceDelay: -1 },
    { entranceEasing: 'script' },
    { continuousDuration: 0 },
    { continuousDelay: 6 },
    { giftAccounts: [{}, {}, {}] },
  ])('rejects invalid metadata %j in both layers', (invalid) => {
    const { document } = fixture();
    document.nodeOptions[id] = invalid as NodeOptions;
    expect(validateEditorDocument(document).valid).toBe(false);
    expect(validateApiDocument(document).valid).toBe(false);
  });
  it('keeps unfinished links saveable while rejecting executable protocols', () => {
    const { document } = fixture();
    document.nodeOptions[id] = { action: { kind: 'link', value: '' } };
    expect(validateEditorDocument(document).valid).toBe(true);
    expect(validateApiDocument(document).valid).toBe(true);
    document.nodeOptions[id].action!.value = 'javascript:alert(1)';
    expect(validateEditorDocument(document).valid).toBe(false);
    expect(validateApiDocument(document).valid).toBe(false);
  });
  it('uses the invitation owner bank information for a QR click action without changing the template', () => {
    const { document } = fixture();
    const original = {
      bin: '970436',
      account: '12345678',
      recipientName: 'TEMPLATE OWNER',
    };
    const bank = {
      bin: '970415',
      account: '87654321',
      recipientName: 'INVITATION OWNER',
    };
    document.nodeOptions[id] = {
      action: { kind: 'gift', value: '' },
      giftAccounts: [original],
      giftTitle: 'Mừng cưới',
    };
    const resolved = resolveEditorDocument(
      document,
      { schemaVersion: 1, bank },
      { mode: 'public', asOf: '2026-10-13T00:00:00Z' },
    );
    expect(resolved.scene.nodeOptions[id].giftAccounts).toEqual([bank]);
    expect(document.nodeOptions[id].giftAccounts).toEqual([original]);
    expect(
      formFieldsForDesign(document).some((field) => field.id === 'bank'),
    ).toBe(true);
  });
});
describe('RGBA picker precision', () => {
  it.each([
    '#00000000',
    '#FFFFFF80',
    '#FF0000FF',
    '#00FF00FF',
    '#0000FFFF',
    '#12345678',
    '#EC4899FF',
  ])('round-trips %s without losing alpha', (color) => {
    expect(hsvaToHex(hexToHsva(color))).toBe(color);
  });
});
