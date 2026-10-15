import { describe, it, expect } from 'vitest';
import {
  createBlankDocument,
  type CanvasNode,
} from '../../src/features/invitation-builder/document/editor-document';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';
import {
  applyDocumentCommand,
  duplicateSelection,
  commitDocument,
  nodesUsingAsset,
  undoDocument,
  redoDocument,
} from '../../src/features/invitation-builder/editor/editor-commands';
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
function fixture() {
  const d = createBlankDocument();
  d.nodes[a] = primitiveNode('Text');
  d.nodes[b] = primitiveNode('Text');
  d.nodes[a].props.box = { x: 20, y: 20, width: 300, height: 80, rotation: 0 };
  d.nodes[b].props.box = { x: 170, y: 20, width: 300, height: 80, rotation: 0 };
  d.nodes.ROOT.nodes = [a, b];
  d.nodeOptions[a] = { groupId: a, action: { kind: 'scroll', value: b } };
  d.nodeOptions[b] = { groupId: a };
  return d;
}
describe('500px editing preserves authored relationships', () => {
  it('copies groups with fresh identities and remaps internal scroll targets', () => {
    const source = fixture();
    const copied = applyDocumentCommand(source, {
      type: 'paste',
      ...duplicateSelection(source, [a, b]),
    });
    const [first, second] = copied.nodes.ROOT.nodes.slice(2);
    expect(copied.nodeOptions[first].action).toEqual({
      kind: 'scroll',
      value: second,
    });
    expect(copied.nodeOptions[first].groupId).toBe(
      copied.nodeOptions[second].groupId,
    );
    expect(copied.nodeOptions[first].groupId).not.toBe(a);
    expect(source.nodes.ROOT.nodes).toEqual([a, b]);
  });
  it('undoes the complete group edit and restores it with redo', () => {
    const source = fixture();
    const h = commitDocument(
      { past: [], present: source, future: [] },
      {
        type: 'box',
        id: a,
        value: { x: 40, y: 40, width: 320, height: 100, rotation: 0 },
      },
    );
    expect((h.present.nodes[b] as CanvasNode).props.box).not.toEqual(
      (source.nodes[b] as CanvasNode).props.box,
    );
    expect(undoDocument(h).present).toEqual(source);
    expect(redoDocument(undoDocument(h)).present).toEqual(h.present);
  });
  it('rotates a group around the edited member and normalizes member angles', () => {
    const d = fixture();
    const result = applyDocumentCommand(d, {
      type: 'box',
      id: a,
      value: { rotation: 90 },
    });
    const member = result.nodes[b] as CanvasNode;
    expect(member.props.box.rotation).toBe(90);
    expect(member.props.box.x).toBeCloseTo(20);
    expect(member.props.box.y).toBeCloseTo(170);
    expect((d.nodes[b] as CanvasNode).props.box.y).toBe(20);
  });
  it('rejects edits to locked layers and removes dangling scroll actions on deletion', () => {
    const d = fixture();
    d.nodes[a].custom.locked = true;
    expect(() => applyDocumentCommand(d, { type: 'delete', id: a })).toThrow();
    const deleted = applyDocumentCommand(d, { type: 'delete', id: b });
    expect(deleted.nodeOptions[a].action).toBeUndefined();
  });
  it('turns text shadow off only by removing the key, not by writing undefined', () => {
    const d = fixture();
    const text = primitiveNode('Text').props.content;
    if (!('textStyle' in text)) throw new Error('Text expected');
    const base = text.textStyle;
    const on = applyDocumentCommand(d, {
      type: 'content',
      id: a,
      value: {
        textStyle: {
          ...base,
          textShadow: { offsetX: 0, offsetY: 0, blur: 5, color: '#00000066' },
        },
      },
    });
    expect(() =>
      applyDocumentCommand(on, {
        type: 'content',
        id: a,
        value: { textStyle: { ...base, textShadow: undefined } },
      }),
    ).toThrow();
    const off = applyDocumentCommand(on, {
      type: 'content',
      id: a,
      value: { textStyle: { ...base } },
    });
    expect(JSON.stringify(off.nodes[a])).not.toContain('textShadow');
  });
});

describe('library image deletion and crop confirmation', () => {
  const asset = '00000000-0000-4000-8000-0000000000aa';
  const c = '00000000-0000-4000-8000-000000000003';
  function withImages() {
    const d = fixture();
    d.nodes[c] = primitiveNode('Image', asset);
    d.nodes.ROOT.nodes.push(c);
    d.nodeOptions[a] = { action: { kind: 'scroll', value: c } };
    return d;
  }
  it('counts elements whose content uses the asset', () => {
    const d = withImages();
    expect(nodesUsingAsset(d, asset)).toEqual([c]);
    expect(nodesUsingAsset(d, '00000000-0000-4000-8000-0000000000bb')).toEqual(
      [],
    );
  });
  it('removes several elements in one undo step and clears scroll targets', () => {
    const d = withImages();
    const h = commitDocument(
      { past: [], present: d, future: [] },
      { type: 'delete-many', ids: [c, b] },
    );
    expect(h.present.nodes.ROOT.nodes).toEqual([a]);
    expect(h.present.nodeOptions[a].action).toBeUndefined();
    expect(undoDocument(h).present.nodes.ROOT.nodes).toEqual([a, b, c]);
  });
  it('stores crop options and the new frame height together', () => {
    const d = withImages();
    const h = commitDocument(
      { past: [], present: d, future: [] },
      {
        type: 'crop',
        id: c,
        options: {
          crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.8 },
          cropAspect: '1:1',
          mask: 'dome',
        },
        box: { height: 240 },
      },
    );
    expect(h.present.nodeOptions[c].mask).toBe('dome');
    expect((h.present.nodes[c] as CanvasNode).props.box).toMatchObject({
      width: 240,
      height: 240,
    });
    expect(h.past).toHaveLength(1);
  });
});
