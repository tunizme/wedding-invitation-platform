import type {
  Binding,
  Background,
  Box,
  ElementNode,
  TemplateDesign,
  Appearance,
} from '../document/types';
import { checkedDesign } from './craft-adapter';

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

export function applyCommand(
  source: TemplateDesign,
  command: EditorCommand,
): { document: TemplateDesign; selectedId?: string } {
  const document = structuredClone(source);
  let selectedId: string | undefined;
  if (command.type === 'height')
    document.nodes.ROOT.props.canvas.height = command.value;
  else if (command.type === 'canvas-background')
    document.nodes.ROOT.props.canvas.background = structuredClone(command.value);
  else if (command.type === 'add') {
    selectedId = crypto.randomUUID();
    document.nodes[selectedId] = structuredClone(command.node);
    document.nodes.ROOT.nodes.push(selectedId);
  } else {
    const node = document.nodes[command.id];
    if (!node || node.isCanvas) throw new Error('Không tìm thấy phần tử.');
    if (node.custom.locked && !(command.type === 'lock' && !command.value))
      throw new Error('Mở khóa phần tử trước khi chỉnh sửa.');
    selectedId = command.id;
    switch (command.type) {
      case 'box':
        node.props.box = {
          ...node.props.box,
          ...Object.fromEntries(
            Object.entries(command.value).map(([key, value]) => [
              key,
              Math.round(value * 100) / 100,
            ]),
          ),
        };
        break;
      case 'appearance':
        node.props.appearance = { ...node.props.appearance, ...command.value };
        break;
      case 'content':
        node.props.content = { ...node.props.content, ...command.value };
        if (
          node.type.resolvedName === 'Shape' &&
          'primitive' in command.value
        ) {
          if (command.value.primitive === 'rectangle')
            node.props.appearance.borderRadius ??= 0;
          else delete node.props.appearance.borderRadius;
        }
        break;
      case 'rename':
        node.custom.layerName = command.value.trim();
        break;
      case 'binding':
        node.props.bindings = structuredClone(command.value);
        break;
      case 'optional':
        node.custom.optional = command.value;
        break;
      case 'lock':
        node.custom.locked = command.value;
        break;
      case 'hide':
        node.hidden = command.value;
        break;
      case 'delete':
        delete document.nodes[command.id];
        document.nodes.ROOT.nodes = document.nodes.ROOT.nodes.filter(
          (id) => id !== command.id,
        );
        selectedId = undefined;
        break;
      case 'duplicate': {
        selectedId = crypto.randomUUID();
        document.nodes[selectedId] = structuredClone(node);
        document.nodes.ROOT.nodes.splice(
          document.nodes.ROOT.nodes.indexOf(command.id) + 1,
          0,
          selectedId,
        );
        break;
      }
      case 'reorder': {
        if (
          !Number.isInteger(command.index) ||
          command.index < 0 ||
          command.index >= document.nodes.ROOT.nodes.length
        )
          throw new Error('Thứ tự không hợp lệ.');
        const order = document.nodes.ROOT.nodes.filter(
          (id) => id !== command.id,
        );
        order.splice(command.index, 0, command.id);
        document.nodes.ROOT.nodes = order;
        break;
      }
    }
  }
  return { document: checkedDesign(document), selectedId };
}

/** Transient geometry never enters Craft history until one successful commit. */
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
