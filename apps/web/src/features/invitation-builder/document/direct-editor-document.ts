import {
  resolveEditorDocument,
  isAdvanced,
  type EditorDocument,
  type CanvasNode,
} from './editor-document';
import type { WeddingData } from './types';
/** Materialize legacy form bindings into authored content when an admin edits a design. */
export function directEditorDocument(
  document: EditorDocument,
  data: WeddingData,
): EditorDocument {
  const next = structuredClone(document),
    probe = structuredClone(document);
  for (const id of probe.nodes.ROOT.nodes)
    (probe.nodes[id] as CanvasNode).hidden = false;
  const resolved = resolveEditorDocument(probe, data, {
      mode: 'preview',
      asOf: '2026-01-01T00:00:00Z',
    }),
    elements = new Map(
      resolved.scene.elements.map((element) => [element.id, element]),
    );
  const targets: Record<string, string> = {
    Text: 'text',
    Image: 'assetId',
    Decoration: 'assetId',
    Calendar: 'event',
    Countdown: 'event',
    Map: 'venue',
    QRBank: 'bank',
    Timeline: 'entries',
  };
  for (const id of next.nodes.ROOT.nodes) {
    const node = next.nodes[id] as CanvasNode,
      element = elements.get(id);
    if (isAdvanced(node)) {
      if (element && 'field' in element.content) {
        const keys =
          node.type.resolvedName === 'YouTube'
            ? ['videoId', 'posterId']
            : node.type.resolvedName === 'Contact'
              ? ['phone']
              : node.type.resolvedName === 'Reminder'
                ? ['event']
                : ['assetIds'];
        for (const key of keys)
          if (key in element.content)
            Object.assign(node.props.content, {
              [key]: (element.content as unknown as Record<string, unknown>)[
                key
              ],
            });
      }
      node.props.content.field = null;
    } else {
      const key = targets[node.type.resolvedName];
      if (node.props.bindings.length && element && key in element.content)
        Object.assign(node.props.content, {
          [key]: (element.content as unknown as Record<string, unknown>)[key],
        });
      if (
        ['Calendar', 'Countdown', 'Map', 'QRBank', 'Timeline'].includes(
          node.type.resolvedName,
        ) &&
        !(key in node.props.content)
      )
        Object.assign(node.props.content, {
          [key]: key === 'entries' ? [] : {},
        });
      node.props.bindings = [];
    }
  }
  next.settings.audio = {
    ...next.settings.audio,
    assetId: resolved.scene.settings.audio.assetId,
    field: null,
  };
  next.nodeOptions = resolved.scene.nodeOptions;
  return next;
}
