import { isAdvanced, type CanvasNode } from './editor-document';
import type { ElementNode, SupportedTemplateDesign } from './types';

export type FormField = {
  id: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'date-time'
    | 'venue'
    | 'asset'
    | 'bank'
    | 'timeline'
    | 'album'
    | 'audio'
    | 'video'
    | 'phone';
  essential: boolean;
  requiresEventKey?: boolean;
  auxiliary?: boolean;
};
export const BINDING_CATALOG: Record<string, FormField> = {
  'bride.name': {
    id: 'bride.name',
    label: 'Tên cô dâu',
    type: 'text',
    essential: true,
  },
  'groom.name': {
    id: 'groom.name',
    label: 'Tên chú rể',
    type: 'text',
    essential: true,
  },
  'bride.photo': {
    id: 'bride.photo',
    label: 'Ảnh cô dâu',
    type: 'asset',
    essential: true,
  },
  'groom.photo': {
    id: 'groom.photo',
    label: 'Ảnh chú rể',
    type: 'asset',
    essential: true,
  },
  'couple.photo': {
    id: 'couple.photo',
    label: 'Ảnh đôi',
    type: 'asset',
    essential: true,
  },
  'parents.bride.fatherName': {
    id: 'parents.bride.fatherName',
    label: 'Bố cô dâu',
    type: 'text',
    essential: true,
  },
  'parents.bride.motherName': {
    id: 'parents.bride.motherName',
    label: 'Mẹ cô dâu',
    type: 'text',
    essential: true,
  },
  'parents.groom.fatherName': {
    id: 'parents.groom.fatherName',
    label: 'Bố chú rể',
    type: 'text',
    essential: true,
  },
  'parents.groom.motherName': {
    id: 'parents.groom.motherName',
    label: 'Mẹ chú rể',
    type: 'text',
    essential: true,
  },
  story: {
    id: 'story',
    label: 'Câu chuyện tình yêu',
    type: 'textarea',
    essential: true,
  },
  'wedding.date': {
    id: 'wedding.date',
    label: 'Ngày cưới',
    type: 'date-time',
    essential: true,
    requiresEventKey: true,
  },
  'wedding.time': {
    id: 'wedding.time',
    label: 'Giờ cưới',
    type: 'date-time',
    essential: true,
    requiresEventKey: true,
  },
  'venue.name': {
    id: 'venue.name',
    label: 'Tên địa điểm',
    type: 'text',
    essential: true,
    requiresEventKey: true,
  },
  'venue.address': {
    id: 'venue.address',
    label: 'Địa chỉ',
    type: 'text',
    essential: true,
    requiresEventKey: true,
  },
  'wedding.event': {
    id: 'wedding.event',
    label: 'Ngày giờ sự kiện',
    type: 'date-time',
    essential: true,
    requiresEventKey: true,
  },
  venue: {
    id: 'venue',
    label: 'Địa điểm tổ chức',
    type: 'venue',
    essential: true,
    requiresEventKey: true,
  },
  bank: {
    id: 'bank',
    label: 'Thông tin mừng cưới',
    type: 'bank',
    essential: true,
  },
  timeline: {
    id: 'timeline',
    label: 'Dòng thời gian',
    type: 'timeline',
    essential: true,
  },
};
export const EVENT_KEYS = [
  'ceremony',
  'reception',
  'engagement',
  'afterParty',
] as const;

export function formFieldsForDesign(
  document: SupportedTemplateDesign | import('./types').TemplateDesign,
) {
  const fields = new Map<
    string,
    FormField & { required: boolean; eventKey?: string }
  >();
  const nodes = document.nodes.ROOT.nodes.map((id) => {
    const node = document.nodes[id] as ElementNode;
    return { ...node, bindings: node.props.bindings };
  });
  for (const node of nodes) {
    if (!node || node.hidden) continue;
    for (const binding of node.bindings) {
      const field = BINDING_CATALOG[binding.source];
      if (!field) continue;
      const eventKey =
        field.requiresEventKey && 'eventKey' in binding
          ? binding.eventKey
          : undefined;
      const key = `${field.id}:${eventKey ?? ''}`;
      const previous = fields.get(key);
      fields.set(key, {
        ...field,
        eventKey,
        required:
          Boolean(field.essential && !node.custom.optional) ||
          Boolean(previous?.required),
      });
      if (binding.source === 'bank')
        fields.set('bank.message:', {
          ...BINDING_CATALOG['bank'],
          id: 'bank.message',
          label: 'Nội dung chuyển khoản',
          type: 'text',
          essential: false,
          requiresEventKey: false,
          auxiliary: true,
          required: false,
        });
    }
  }
  if (document.schemaVersion === 3) {
    for (const id of document.nodes.ROOT.nodes) {
      const node = document.nodes[id] as CanvasNode;
      if (node.hidden || !isAdvanced(node)) continue;
      const content = node.props.content;
      if (content.field) {
        const type =
          node.type.resolvedName === 'Album' ||
          node.type.resolvedName === 'Carousel'
            ? 'album'
            : node.type.resolvedName === 'YouTube'
              ? 'video'
              : 'phone';
        fields.set('fields.' + content.field, {
          id: 'fields.' + content.field,
          label: content.label,
          type,
          essential: true,
          required: !node.custom.optional,
        });
      }
      if (node.type.resolvedName === 'Reminder')
        fields.set('wedding.event:' + content.eventKey, {
          ...BINDING_CATALOG['wedding.event'],
          required: !node.custom.optional,
          eventKey: content.eventKey,
        });
    }
    if (document.settings.audio.field)
      fields.set('fields.' + document.settings.audio.field, {
        id: 'fields.' + document.settings.audio.field,
        label: 'Nhạc nền',
        type: 'audio',
        essential: false,
        required: false,
      });
  }
  if (
    'nodeOptions' in document &&
    Object.values(document.nodeOptions).some(
      (option) => option.action?.kind === 'gift',
    )
  )
    fields.set('bank:', { ...BINDING_CATALOG.bank, required: false });
  return [...fields.values()];
}
