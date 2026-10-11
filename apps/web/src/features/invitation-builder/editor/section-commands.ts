import type {
  ComponentName,
  InvitationSection,
  LeafV2,
  TemplateDesignV2,
} from '../document/types';
import { importSectionDesign } from './section-adapter';
import { primitiveNode, widgetNode } from './defaults';
export type SectionCommand =
  | { type: 'section-add'; section: InvitationSection }
  | { type: 'section-update'; id: string; section: InvitationSection }
  | { type: 'section-reorder'; id: string; index: number }
  | { type: 'section-delete'; id: string }
  | { type: 'leaf-add'; sectionId: string; node: LeafV2 }
  | { type: 'leaf-update'; id: string; node: LeafV2 }
  | { type: 'leaf-delete'; id: string }
  | { type: 'leaf-reorder'; id: string; index: number };
export function newSection(label = 'Section'): InvitationSection {
  return {
    id: crypto.randomUUID(),
    label,
    hidden: false,
    background: { kind: 'solid', color: '#FFFFFF00' },
    flowNodeIds: [],
    artworkNodeIds: [],
    mobile: {
      layout: 'stack',
      columns: 1,
      contentPreset: 'full',
      customMaxWidth: null,
      padding: { top: 24, right: 24, bottom: 24, left: 24 },
      gap: 16,
      minHeight: 0,
      align: 'center',
    },
    desktop: {},
  };
}
export function newLeaf(
  type: ComponentName,
  role: 'flow' | 'artwork' = 'flow',
  assetId?: string,
): LeafV2 {
  const legacy = ['Text', 'Image', 'Decoration', 'Shape'].includes(type)
    ? primitiveNode(type as 'Text' | 'Image' | 'Decoration' | 'Shape', assetId)
    : widgetNode(type as Parameters<typeof widgetNode>[0]);
  const node = {
    id: crypto.randomUUID(),
    type,
    content: {
      ...legacy.props.content,
      ...(['Image', 'Decoration'].includes(type)
        ? {
            alt: type === 'Image' ? 'Hình ảnh' : '',
            ...(role === 'flow' ? { aspectRatio: 4 / 3 } : {}),
          }
        : {}),
    },
    bindings: structuredClone(legacy.props.bindings),
    appearance: structuredClone(legacy.props.appearance),
    custom: structuredClone(legacy.custom),
    hidden: false,
    role,
    mobile:
      role === 'flow'
        ? {
            layout: { widthPercent: 100, maxWidth: null, align: 'start' },
            typography: {},
            appearance: {},
          }
        : {
            layout: {
              xPercent: 0,
              yPercent: 0,
              widthPercent: 20,
              aspectRatio: 1,
              rotation: 0,
            },
          },
    desktop: {},
  };
  return node as LeafV2;
}
function reorder(ids: string[], id: string, index: number) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= ids.length ||
    !ids.includes(id)
  )
    throw new Error('Thứ tự không hợp lệ');
  const next = ids.filter((value) => value !== id);
  next.splice(index, 0, id);
  return next;
}
export function applySectionCommand(
  source: TemplateDesignV2,
  command: SectionCommand,
): { document: TemplateDesignV2; selectedId?: string } {
  const document = structuredClone(source);
  let selectedId: string | undefined;
  if (command.type === 'section-add') {
    if (document.sections[command.section.id]) throw new Error('ID trùng');
    document.sections[command.section.id] = structuredClone(command.section);
    document.sectionOrder.push(command.section.id);
    selectedId = command.section.id;
  } else if (command.type === 'section-update') {
    const existing = document.sections[command.id];
    if (
      !existing ||
      command.section.id !== command.id ||
      JSON.stringify(existing.flowNodeIds) !==
        JSON.stringify(command.section.flowNodeIds) ||
      JSON.stringify(existing.artworkNodeIds) !==
        JSON.stringify(command.section.artworkNodeIds)
    )
      throw new Error('Section không hợp lệ');
    document.sections[command.id] = structuredClone(command.section);
    selectedId = command.id;
  } else if (command.type === 'section-reorder')
    document.sectionOrder = reorder(
      document.sectionOrder,
      command.id,
      command.index,
    );
  else if (command.type === 'section-delete') {
    const section = document.sections[command.id];
    if (!section) throw new Error('Không tìm thấy section');
    for (const id of [...section.flowNodeIds, ...section.artworkNodeIds]) {
      if (document.nodes[id].custom.locked)
        throw new Error('Mở khóa trước khi xóa');
      delete document.nodes[id];
    }
    delete document.sections[command.id];
    document.sectionOrder = document.sectionOrder.filter(
      (id) => id !== command.id,
    );
  } else if (command.type === 'leaf-add') {
    const section = document.sections[command.sectionId];
    if (!section || document.nodes[command.node.id])
      throw new Error('Phần tử không hợp lệ');
    document.nodes[command.node.id] = structuredClone(command.node);
    section[
      command.node.role === 'flow' ? 'flowNodeIds' : 'artworkNodeIds'
    ].push(command.node.id);
    selectedId = command.node.id;
  } else {
    const node = document.nodes[command.id];
    if (!node) throw new Error('Không tìm thấy phần tử');
    const unlockOnly =
      command.type === 'leaf-update' &&
      !command.node.custom.locked &&
      JSON.stringify({
        ...command.node,
        custom: { ...command.node.custom, locked: true },
      }) === JSON.stringify(node);
    if (node.custom.locked && !unlockOnly)
      throw new Error('Mở khóa phần tử trước khi chỉnh sửa');
    const section = Object.values(document.sections).find((section) =>
      [...section.flowNodeIds, ...section.artworkNodeIds].includes(command.id),
    )!;
    const list = node.role === 'flow' ? 'flowNodeIds' : 'artworkNodeIds';
    if (command.type === 'leaf-update') {
      if (
        command.node.id !== command.id ||
        command.node.type !== node.type ||
        command.node.role !== node.role
      )
        throw new Error('Identity không hợp lệ');
      document.nodes[command.id] = structuredClone(command.node);
      selectedId = command.id;
    } else if (command.type === 'leaf-delete') {
      section[list] = section[list].filter((id) => id !== command.id);
      delete document.nodes[command.id];
      selectedId = section.id;
    } else section[list] = reorder(section[list], command.id, command.index);
  }
  return { document: importSectionDesign(document), selectedId };
}
