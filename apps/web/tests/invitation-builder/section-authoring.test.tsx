import { describe, it, expect } from 'vitest';
import pilot from '../../../../specs/007-responsive-invitation-layout/contracts/fixtures/valid-v2.json';
import {
  applySectionCommand,
  newSection,
  newLeaf,
} from '../../src/features/invitation-builder/editor/section-commands';
import {
  importSectionDesign,
  exportSectionDesign,
  createSectionHistory,
  executeSectionHistory,
  undoSectionHistory,
  redoSectionHistory,
  duplicateSectionDesign,
} from '../../src/features/invitation-builder/editor/section-adapter';
import type { TemplateDesignV2 } from '../../src/features/invitation-builder/document/types';
const design = () => structuredClone(pilot) as TemplateDesignV2;
describe('section authoring graph, typed overrides and history', () => {
  it('adds, reorders and removes sections/leaves while retaining all ownership invariants', () => {
    const initial = design(),
      section = newSection('Thêm');
    let current = applySectionCommand(initial, {
      type: 'section-add',
      section,
    }).document;
    const node = newLeaf('Text');
    current = applySectionCommand(current, {
      type: 'leaf-add',
      sectionId: section.id,
      node,
    }).document;
    current = applySectionCommand(current, {
      type: 'section-reorder',
      id: section.id,
      index: 0,
    }).document;
    expect(current.sectionOrder[0]).toBe(section.id);
    expect(current.sections[section.id].flowNodeIds).toContain(node.id);
    current = applySectionCommand(current, {
      type: 'section-delete',
      id: section.id,
    }).document;
    expect(current).toEqual(initial);
    expect(initial).toEqual(pilot);
  });
  it('round-trips mobile/desktop overrides, metadata and image semantics, and undo/redo preserves IDs', () => {
    const initial = design();
    const image = Object.values(initial.nodes).find(
      (node) => node.type === 'Image',
    )!;
    let history = createSectionHistory(initial);
    const replacement = {
      ...image,
      content: { ...image.content, alt: 'Ảnh đôi ý nghĩa', aspectRatio: 1.5 },
      custom: { ...image.custom, optional: true },
      desktop: {
        layout: { widthPercent: 80, maxWidth: 420, align: 'center' as const },
      },
    };
    history = executeSectionHistory(history, {
      type: 'leaf-update',
      id: image.id,
      node: replacement,
    });
    const saved = exportSectionDesign(history.present);
    expect(importSectionDesign(saved)).toEqual(history.present);
    expect(saved.nodes[image.id].custom.optional).toBe(true);
    const undo = undoSectionHistory(history);
    expect(undo.present).toEqual(initial);
    const redo = redoSectionHistory(undo);
    expect(redo.present).toEqual(saved);
    expect(redo.present.nodes[image.id].id).toBe(image.id);
  });
  it('remaps every section/node ID when duplicating without changing source snapshots or asset IDs', () => {
    const source = design(),
      copy = duplicateSectionDesign(source);
    expect(copy.sectionOrder.every((id) => !source.sections[id])).toBe(true);
    expect(Object.keys(copy.nodes).every((id) => !source.nodes[id])).toBe(true);
    copy.sectionOrder.forEach((id) => {
      expect(copy.sections[id].id).toBe(id);
      for (const child of [
        ...copy.sections[id].flowNodeIds,
        ...copy.sections[id].artworkNodeIds,
      ])
        expect(copy.nodes[child].id).toBe(child);
    });
    expect(
      Object.values(copy.nodes)
        .filter((n) => n.type === 'Image')
        .map((n) => n.content.assetId),
    ).toEqual(
      Object.values(source.nodes)
        .filter((n) => n.type === 'Image')
        .map((n) => n.content.assetId),
    );
    expect(source).toEqual(pilot);
  });
  it('rejects graph corruption, illegal artwork widgets/raw CSS and edits to locked leaves without losing history', () => {
    const source = design(),
      text = Object.values(source.nodes).find((node) => node.type === 'Text')!;
    expect(() =>
      applySectionCommand(source, {
        type: 'leaf-update',
        id: text.id,
        node: { ...text, id: '10000000-0000-4000-8000-000000000099' },
      }),
    ).toThrow();
    expect(() => importSectionDesign({ ...source, unknown: true })).toThrow();
    const locked = applySectionCommand(source, {
      type: 'leaf-update',
      id: text.id,
      node: { ...text, custom: { ...text.custom, locked: true } },
    }).document;
    expect(() =>
      applySectionCommand(locked, {
        type: 'leaf-update',
        id: text.id,
        node: { ...locked.nodes[text.id], hidden: true },
      }),
    ).toThrow();
    expect(() =>
      applySectionCommand(source, {
        type: 'leaf-update',
        id: text.id,
        node: { ...text, desktop: { layout: { widthPercent: 101 } } },
      }),
    ).toThrow();
  });
});
