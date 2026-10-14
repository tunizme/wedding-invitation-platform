import {
  validateEditorDocument,
  type EditorDocument,
  type CanvasNode,
  type NodeOptions,
} from '../document/editor-document';
import type {
  Binding,
  Background,
  Box,
  ElementNode,
  Appearance,
} from '../document/types';
export type EditorCommand =
  | { type: 'box'; id: string; value: Partial<Box> }
  | { type: 'appearance'; id: string; value: Partial<Appearance> }
  | { type: 'content'; id: string; value: Record<string, unknown> }
  | { type: 'rename'; id: string; value: string }
  | { type: 'binding'; id: string; value: Binding[] }
  | { type: 'optional'; id: string; value: boolean }
  | { type: 'lock' | 'hide'; id: string; value: boolean }
  | { type: 'reorder'; id: string; index: number }
  | { type: 'delete' | 'duplicate'; id: string }
  | { type: 'add'; node: ElementNode }
  | { type: 'height'; value: number }
  | { type: 'canvas-background'; value: Background };

export type DocumentCommand =
  | Exclude<EditorCommand, { type: 'add' }>
  | { type: 'add'; node: CanvasNode }
  | { type: 'options'; id: string; value: NodeOptions }
  | { type: 'group' | 'ungroup'; ids: string[] }
  | {
      type: 'align';
      ids: string[];
      axis: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
    }
  | { type: 'distribute'; ids: string[]; axis: 'x' | 'y' }
  | {
      type: 'paste';
      nodes: CanvasNode[];
      options: NodeOptions[];
      sourceIds?: string[];
    }
  | { type: 'settings'; value: EditorDocument['settings'] }
  | { type: 'replace'; value: EditorDocument };
export interface DocumentHistory {
  past: EditorDocument[];
  present: EditorDocument;
  future: EditorDocument[];
}
export function checkedDocument(value: unknown): EditorDocument {
  const result = validateEditorDocument(value);
  if (!result.valid)
    throw new Error(
      'Thuộc tính không hợp lệ: ' + result.issues.map((i) => i.path).join(', '),
    );
  return result.value;
}
export function duplicateSelection(
  source: EditorDocument,
  ids: string[],
): { nodes: CanvasNode[]; options: NodeOptions[]; sourceIds: string[] } {
  return {
    sourceIds: ids,
    nodes: ids.map((id) => structuredClone(source.nodes[id] as CanvasNode)),
    options: ids.map((id) => structuredClone(source.nodeOptions[id] ?? {})),
  };
}
export function applyDocumentCommand(
  source: EditorDocument,
  c: DocumentCommand,
): EditorDocument {
  if (c.type === 'replace') return checkedDocument(c.value);
  const d = structuredClone(source),
    ordered = d.nodes.ROOT.nodes;
  const require = (id: string) => {
    const n = d.nodes[id];
    if (!n || n.isCanvas) throw new Error('Không tìm thấy phần tử');
    return n;
  };
  const unlocked = (ids: string[]) => {
    for (const id of ids)
      if (require(id).custom.locked)
        throw new Error('Mở khóa phần tử trước khi sửa');
  };
  if (c.type === 'settings') d.settings = structuredClone(c.value);
  else if (c.type === 'height') d.nodes.ROOT.props.canvas.height = c.value;
  else if (c.type === 'canvas-background')
    d.nodes.ROOT.props.canvas.background = c.value;
  else if (c.type === 'add') {
    d.nodes[crypto.randomUUID()] = structuredClone(c.node);
    d.nodes.ROOT.nodes.push(Object.keys(d.nodes).at(-1)!);
  } else if (c.type === 'paste') {
    const fresh = c.nodes.map(() => crypto.randomUUID()),
      groups = new Map<string, string>(),
      oldIds = Object.fromEntries(
        c.nodes.map((_, i) => [c.sourceIds?.[i] ?? String(i), fresh[i]]),
      );
    for (let i = 0; i < c.nodes.length; i++) {
      const n = structuredClone(c.nodes[i]);
      n.custom.locked = false;
      n.props.box.x += 12;
      n.props.box.y += 12;
      d.nodes[fresh[i]] = n;
      ordered.push(fresh[i]);
      const o = structuredClone(c.options[i] ?? {});
      if (o.groupId) {
        if (!groups.has(o.groupId)) groups.set(o.groupId, crypto.randomUUID());
        o.groupId = groups.get(o.groupId)!;
      }
      if (o.action?.kind === 'scroll') {
        const target = oldIds[o.action.value];
        if (target) o.action.value = target;
        else if (!Object.hasOwn(d.nodes, o.action.value)) delete o.action;
      }
      d.nodeOptions[fresh[i]] = o;
    }
  } else if (c.type === 'group' || c.type === 'ungroup') {
    unlocked(c.ids);
    const group = crypto.randomUUID();
    for (const id of c.ids) {
      d.nodeOptions[id] ??= {};
      if (c.type === 'group') d.nodeOptions[id].groupId = group;
      else delete d.nodeOptions[id].groupId;
    }
  } else if (c.type === 'align') {
    unlocked(c.ids);
    const boxes = c.ids.map((id) => require(id).props.box),
      left = Math.min(...boxes.map((b) => b.x)),
      top = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(...boxes.map((b) => b.y + b.height));
    for (const b of boxes) {
      if (c.axis === 'left') b.x = left;
      if (c.axis === 'center') b.x = (left + right - b.width) / 2;
      if (c.axis === 'right') b.x = right - b.width;
      if (c.axis === 'top') b.y = top;
      if (c.axis === 'middle') b.y = (top + bottom - b.height) / 2;
      if (c.axis === 'bottom') b.y = bottom - b.height;
    }
  } else if (c.type === 'distribute') {
    unlocked(c.ids);
    if (c.ids.length < 3) throw new Error('Chọn ít nhất 3 phần tử');
    const a = c.axis,
      size = a === 'x' ? 'width' : 'height',
      boxes = c.ids
        .map((id) => require(id).props.box)
        .sort((x, y) => x[a] - y[a]),
      start = boxes[0][a],
      end = boxes.at(-1)![a] + boxes.at(-1)![size],
      gap =
        (end - start - boxes.reduce((sum, b) => sum + b[size], 0)) /
        (boxes.length - 1);
    let p = start;
    for (const b of boxes) {
      b[a] = p;
      p += b[size] + gap;
    }
  } else if ('id' in c) {
    const n = require(c.id);
    if (n.custom.locked && !(c.type === 'lock' && !c.value))
      throw new Error('Mở khóa phần tử trước khi sửa');
    switch (c.type) {
      case 'box': {
        const old = n.props.box;
        n.props.box = { ...old, ...c.value };
        const gid = d.nodeOptions[c.id]?.groupId;
        if (gid) {
          const members = ordered.filter(
            (id) => id !== c.id && d.nodeOptions[id]?.groupId === gid,
          );
          unlocked(members);
          const sx = n.props.box.width / old.width,
            sy = n.props.box.height / old.height,
            delta = n.props.box.rotation - old.rotation,
            radians = (delta * Math.PI) / 180,
            cos = Math.cos(radians),
            sin = Math.sin(radians),
            anchorX = n.props.box.x + n.props.box.width / 2,
            anchorY = n.props.box.y + n.props.box.height / 2;
          for (const id of members) {
            const b = require(id).props.box;
            const centerX = (b.x + b.width / 2 - old.x - old.width / 2) * sx,
              centerY = (b.y + b.height / 2 - old.y - old.height / 2) * sy;
            b.width *= sx;
            b.height *= sy;
            b.x = anchorX + centerX * cos - centerY * sin - b.width / 2;
            b.y = anchorY + centerX * sin + centerY * cos - b.height / 2;
            b.rotation =
              ((((b.rotation + delta + 180) % 360) + 360) % 360) - 180;
          }
        }
        break;
      }
      case 'appearance':
        n.props.appearance = { ...n.props.appearance, ...c.value };
        break;
      case 'content':
        n.props.content = {
          ...n.props.content,
          ...c.value,
        } as CanvasNode['props']['content'];
        break;
      case 'binding':
        n.props.bindings = c.value as typeof n.props.bindings;
        break;
      case 'options':
        d.nodeOptions[c.id] = c.value;
        break;
      case 'rename':
        n.custom.layerName = c.value.trim();
        break;
      case 'optional':
        n.custom.optional = c.value;
        break;
      case 'lock':
        n.custom.locked = c.value;
        break;
      case 'hide':
        n.hidden = c.value;
        break;
      case 'delete':
        delete d.nodes[c.id];
        delete d.nodeOptions[c.id];
        for (const option of Object.values(d.nodeOptions))
          if (option.action?.kind === 'scroll' && option.action.value === c.id)
            delete option.action;
        d.nodes.ROOT.nodes = ordered.filter((id) => id !== c.id);
        break;
      case 'duplicate':
        return applyDocumentCommand(d, {
          type: 'paste',
          ...duplicateSelection(d, [c.id]),
        });
      case 'reorder':
        if (c.index < 0 || c.index >= ordered.length)
          throw new Error('Thứ tự không hợp lệ');
        d.nodes.ROOT.nodes = ordered.filter((id) => id !== c.id);
        d.nodes.ROOT.nodes.splice(c.index, 0, c.id);
        break;
    }
  }
  return checkedDocument(d);
}
export function commitDocument(
  history: DocumentHistory,
  c: DocumentCommand,
): DocumentHistory {
  const next = applyDocumentCommand(history.present, c);
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return {
    past: [...history.past, history.present].slice(-100),
    present: next,
    future: [],
  };
}
export function undoDocument(h: DocumentHistory): DocumentHistory {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future].slice(0, 100),
      }
    : h;
}
export function redoDocument(h: DocumentHistory): DocumentHistory {
  return h.future.length
    ? {
        past: [...h.past, h.present].slice(-100),
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}

/** Geometry previews are committed as one history entry. */
export class GestureSession {
  private current: Box;
  private ended = false;
  private readonly initial: Box;
  constructor(initial: Box) {
    this.initial = { ...initial };
    this.current = { ...initial };
  }
  preview(value: Box): Box {
    if (this.ended) return { ...this.initial };
    this.current = { ...value };
    return { ...this.current };
  }
  commit(): Box | null {
    if (this.ended) return null;
    this.ended = true;
    if (
      Object.keys(this.initial).every(
        (key) =>
          this.initial[key as keyof Box] === this.current[key as keyof Box],
      )
    )
      return null;
    return { ...this.current };
  }
  cancel(): Box {
    this.ended = true;
    return { ...this.initial };
  }
}
