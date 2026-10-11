import { validateSupportedTemplateDesign } from '../document/schema';
import type { TemplateDesignV2, LeafV2, ElementNode } from '../document/types';
import { applySectionCommand, type SectionCommand } from './section-commands';
export function importSectionDesign(input: unknown): TemplateDesignV2 {
  const result = validateSupportedTemplateDesign(input);
  if (!result.valid)
    throw new Error(
      `${result.code}: ${result.issues.map((issue) => `${issue.code} ${issue.path}`).join('; ')}`,
    );
  if (result.value.schemaVersion !== 2) throw new Error('UNSUPPORTED_SCHEMA');
  return structuredClone(result.value);
}
export const exportSectionDesign = (source: TemplateDesignV2) =>
  importSectionDesign(source);
export function duplicateSectionDesign(
  source: TemplateDesignV2,
): TemplateDesignV2 {
  const document = importSectionDesign(source);
  const sections = new Map(
    Object.keys(document.sections).map((id) => [id, crypto.randomUUID()]),
  );
  const nodes = new Map(
    Object.keys(document.nodes).map((id) => [id, crypto.randomUUID()]),
  );
  document.sectionOrder = document.sectionOrder.map((id) => sections.get(id)!);
  document.sections = Object.fromEntries(
    Object.entries(document.sections).map(([id, section]) => {
      const fresh = sections.get(id)!;
      return [
        fresh,
        {
          ...section,
          id: fresh,
          flowNodeIds: section.flowNodeIds.map((id) => nodes.get(id)!),
          artworkNodeIds: section.artworkNodeIds.map((id) => nodes.get(id)!),
        },
      ];
    }),
  );
  document.nodes = Object.fromEntries(
    Object.entries(document.nodes).map(([id, node]) => {
      const fresh = nodes.get(id)!;
      return [fresh, { ...node, id: fresh }];
    }),
  );
  return importSectionDesign(document);
}
export type SectionHistory = {
  present: TemplateDesignV2;
  past: TemplateDesignV2[];
  future: TemplateDesignV2[];
};
export const createSectionHistory = (source: unknown): SectionHistory => ({
  present: importSectionDesign(source),
  past: [],
  future: [],
});
export function executeSectionHistory(
  history: SectionHistory,
  command: SectionCommand,
): SectionHistory {
  const next = applySectionCommand(history.present, command).document;
  return {
    present: next,
    past: [...history.past, history.present].slice(-100),
    future: [],
  };
}
export function undoSectionHistory(history: SectionHistory): SectionHistory {
  if (!history.past.length) return history;
  return {
    present: history.past.at(-1)!,
    past: history.past.slice(0, -1),
    future: [history.present, ...history.future].slice(0, 100),
  };
}
export function redoSectionHistory(history: SectionHistory): SectionHistory {
  if (!history.future.length) return history;
  return {
    present: history.future[0],
    past: [...history.past, history.present].slice(-100),
    future: history.future.slice(1),
  };
}
/** Content/binding adapter only. Geometry is never copied from the legacy canvas. */
export function leafAsLegacyNode(node: LeafV2): ElementNode {
  return {
    type: { resolvedName: node.type },
    isCanvas: false,
    displayName: node.type,
    custom: node.custom,
    hidden: node.hidden,
    parent: 'ROOT',
    nodes: [],
    linkedNodes: {},
    props: {
      box: { x: 0, y: 0, width: 390, height: 12000, rotation: 0 },
      appearance: node.appearance,
      content: node.content,
      bindings: node.bindings,
    },
  } as ElementNode;
}
