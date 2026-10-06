import type { SerializedNodes } from '@craftjs/core';
import type { TemplateDesign } from '../document/types';
import { validateTemplateDesign } from '../document/schema';

export function checkedDesign(value: unknown): TemplateDesign {
  const result = validateTemplateDesign(value);
  if (!result.valid) throw new Error('Thiết kế không hợp lệ.');
  return result.value;
}
export function importDesign(document: TemplateDesign): SerializedNodes {
  const copy = structuredClone(checkedDesign(document));
  return {
    ...copy.nodes,
    ROOT: { ...copy.nodes.ROOT, parent: null },
  } as unknown as SerializedNodes;
}
export function exportDesign(nodes: SerializedNodes): TemplateDesign {
  const copy = structuredClone(nodes);
  const root = copy.ROOT as Partial<SerializedNodes[string]>;
  delete root.parent;
  return checkedDesign({ schemaVersion: 1, nodes: copy });
}
export function duplicateDesign(document: TemplateDesign): TemplateDesign {
  const copy = structuredClone(checkedDesign(document));
  const nodes: TemplateDesign['nodes'] = { ROOT: copy.nodes.ROOT };
  nodes.ROOT.nodes = copy.nodes.ROOT.nodes.map((id) => {
    const fresh = crypto.randomUUID();
    nodes[fresh] = copy.nodes[id];
    return fresh;
  });
  copy.nodes = nodes;
  return checkedDesign(copy);
}
