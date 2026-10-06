import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  TemplateDesign,
  ElementNode,
} from '../../src/features/invitation-builder/document/types';
import {
  importDesign,
  exportDesign,
  duplicateDesign,
} from '../../src/features/invitation-builder/editor/craft-adapter';
import {
  applyCommand,
  GestureSession,
} from '../../src/features/invitation-builder/editor/commands';
import { validateTemplateDesign } from '../../src/features/invitation-builder/document/schema';
import { primitiveNode } from '../../src/features/invitation-builder/editor/defaults';

const corpus = (file: string) =>
  JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../specs/004-invitation-builder/contracts/fixtures',
        file + '.json',
      ),
      'utf8',
    ),
  ) as TemplateDesign;

describe('canonical editor state and commands', () => {
  it('adds each supported primitive with applicable defaults', () => {
    for (const type of ['Text', 'Image', 'Decoration', 'Shape'] as const) {
      const result = applyCommand(corpus('blank'), {
        type: 'add',
        node: primitiveNode(type),
      });
      expect(validateTemplateDesign(result.document).valid).toBe(true);
      expect(result.document.nodes.ROOT.nodes).toHaveLength(1);
    }
  });
  it('maps Craft ROOT parent without changing canonical data or node IDs', () => {
    const document = corpus('all-elements'),
      before = JSON.stringify(document),
      craft = importDesign(document);
    expect(craft.ROOT.parent).toBeNull();
    expect(exportDesign(craft)).toEqual(document);
    expect(JSON.stringify(document)).toBe(before);
    expect(exportDesign(craft).nodes.ROOT).not.toHaveProperty('parent');
  });
  it('duplicates every node identity while retaining assets, bindings and order', () => {
    const document = corpus('all-elements'),
      copy = duplicateDesign(document);
    expect(copy.nodes.ROOT.nodes).toHaveLength(
      document.nodes.ROOT.nodes.length,
    );
    expect(
      copy.nodes.ROOT.nodes.some((id) =>
        document.nodes.ROOT.nodes.includes(id),
      ),
    ).toBe(false);
    expect(validateTemplateDesign(copy).valid).toBe(true);
    expect(copy.nodes.ROOT.nodes.map((id) => copy.nodes[id])).toEqual(
      document.nodes.ROOT.nodes.map((id) => document.nodes[id]),
    );
  });
  it('keeps one layer order, preserves hidden nodes and prevents every locked mutation except unlock', () => {
    let document = corpus('all-elements');
    const id = document.nodes.ROOT.nodes[0];
    document = applyCommand(document, {
      type: 'hide',
      id,
      value: true,
    }).document;
    expect(document.nodes[id].hidden).toBe(true);
    expect(document.nodes.ROOT.nodes).toContain(id);
    document = applyCommand(document, {
      type: 'lock',
      id,
      value: true,
    }).document;
    for (const command of [
      { type: 'delete', id },
      { type: 'duplicate', id },
      { type: 'rename', id, value: 'Changed' },
      { type: 'hide', id, value: false },
      { type: 'reorder', id, index: 3 },
      { type: 'box', id, value: { x: 12 } },
    ] as const)
      expect(() => applyCommand(document, command)).toThrow();
    document = applyCommand(document, {
      type: 'lock',
      id,
      value: false,
    }).document;
    const moved = applyCommand(document, {
      type: 'reorder',
      id,
      index: document.nodes.ROOT.nodes.length - 1,
    }).document;
    expect(moved.nodes.ROOT.nodes.at(-1)).toBe(id);
    expect(moved.nodes[id]).toEqual(document.nodes[id]);
  });
  it('validates geometry/property applicability before committing and preserves the original on failure', () => {
    const document = corpus('all-elements'),
      id = document.nodes.ROOT.nodes[0],
      before = JSON.stringify(document);
    expect(() =>
      applyCommand(document, { type: 'box', id, value: { width: -1 } }),
    ).toThrow();
    expect(() =>
      applyCommand(document, { type: 'box', id, value: { x: Number.NaN } }),
    ).toThrow();
    expect(JSON.stringify(document)).toBe(before);
    const changed = applyCommand(document, {
      type: 'box',
      id,
      value: { x: 12.345, y: 16.789 },
    }).document;
    expect((changed.nodes[id] as ElementNode).props.box).toMatchObject({
      x: 12.35,
      y: 16.79,
    });
    expect(validateTemplateDesign(changed).valid).toBe(true);
  });
  it('keeps gesture previews out of persisted state, commits once and rolls back cancellation', () => {
    const document = corpus('all-elements'),
      id = document.nodes.ROOT.nodes[0],
      box = (document.nodes[id] as ElementNode).props.box;
    const gesture = new GestureSession(box);
    for (let x = 1; x <= 20; x++) gesture.preview({ ...box, x: box.x + x });
    expect((document.nodes[id] as ElementNode).props.box).toEqual(box);
    expect(gesture.commit()).toMatchObject({ x: box.x + 20 });
    expect(gesture.commit()).toBeNull();
    const cancelled = new GestureSession(box);
    cancelled.preview({ ...box, x: 200 });
    expect(cancelled.cancel()).toEqual(box);
    expect(cancelled.commit()).toBeNull();
    expect(new GestureSession(box).commit()).toBeNull();
  });
});
