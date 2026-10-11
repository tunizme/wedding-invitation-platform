import type {
  ComponentName,
  ElementNode,
  SupportedTemplateDesign,
} from './document.types';

export type BindingField = {
  id: string;
  label: string;
  valueType: 'string' | 'asset' | 'event' | 'venue' | 'bank' | 'timeline';
  essential: boolean;
  auxiliary?: boolean;
  requiresEventKey?: boolean;
};

export const BINDING_CATALOG: Record<string, BindingField> = {
  'bride.name': {
    id: 'bride.name',
    label: 'Tên cô dâu',
    valueType: 'string',
    essential: true,
  },
  'groom.name': {
    id: 'groom.name',
    label: 'Tên chú rể',
    valueType: 'string',
    essential: true,
  },
  'bride.photo': {
    id: 'bride.photo',
    label: 'Ảnh cô dâu',
    valueType: 'asset',
    essential: true,
  },
  'groom.photo': {
    id: 'groom.photo',
    label: 'Ảnh chú rể',
    valueType: 'asset',
    essential: true,
  },
  'couple.photo': {
    id: 'couple.photo',
    label: 'Ảnh đôi',
    valueType: 'asset',
    essential: true,
  },
  'parents.bride.fatherName': {
    id: 'parents.bride.fatherName',
    label: 'Bố cô dâu',
    valueType: 'string',
    essential: true,
  },
  'parents.bride.motherName': {
    id: 'parents.bride.motherName',
    label: 'Mẹ cô dâu',
    valueType: 'string',
    essential: true,
  },
  'parents.groom.fatherName': {
    id: 'parents.groom.fatherName',
    label: 'Bố chú rể',
    valueType: 'string',
    essential: true,
  },
  'parents.groom.motherName': {
    id: 'parents.groom.motherName',
    label: 'Mẹ chú rể',
    valueType: 'string',
    essential: true,
  },
  story: {
    id: 'story',
    label: 'Câu chuyện tình yêu',
    valueType: 'string',
    essential: true,
  },
  'wedding.date': {
    id: 'wedding.date',
    label: 'Ngày cưới',
    valueType: 'string',
    essential: true,
    requiresEventKey: true,
  },
  'wedding.time': {
    id: 'wedding.time',
    label: 'Giờ cưới',
    valueType: 'string',
    essential: true,
    requiresEventKey: true,
  },
  'venue.name': {
    id: 'venue.name',
    label: 'Tên địa điểm',
    valueType: 'string',
    essential: true,
    requiresEventKey: true,
  },
  'venue.address': {
    id: 'venue.address',
    label: 'Địa chỉ',
    valueType: 'string',
    essential: true,
    requiresEventKey: true,
  },
  'wedding.event': {
    id: 'wedding.event',
    label: 'Ngày giờ sự kiện',
    valueType: 'event',
    essential: true,
    requiresEventKey: true,
  },
  venue: {
    id: 'venue',
    label: 'Địa điểm tổ chức',
    valueType: 'venue',
    essential: true,
    requiresEventKey: true,
  },
  bank: {
    id: 'bank',
    label: 'Thông tin mừng cưới',
    valueType: 'bank',
    essential: true,
  },
  'bank.message': {
    id: 'bank.message',
    label: 'Nội dung chuyển khoản',
    valueType: 'string',
    essential: false,
    auxiliary: true,
  },
  timeline: {
    id: 'timeline',
    label: 'Dòng thời gian',
    valueType: 'timeline',
    essential: true,
  },
};

export const EVENT_KEYS = [
  'ceremony',
  'reception',
  'engagement',
  'afterParty',
] as const;

export function bindingFieldsFor(
  component: ComponentName,
  bindings: { source: string }[],
) {
  if (component === 'RSVP' || component === 'Shape') return [];
  return bindings.flatMap(({ source }) => {
    const field = BINDING_CATALOG[source];
    return field ? [field] : [];
  });
}

export function formFieldsForDesign(document: SupportedTemplateDesign) {
  const fields = new Map<
    string,
    BindingField & { required: boolean; eventKey?: string }
  >();
  const nodes =
    document.schemaVersion === 2
      ? document.sectionOrder
          .flatMap((id) =>
            document.sections[id].hidden
              ? []
              : [
                  ...document.sections[id].flowNodeIds,
                  ...document.sections[id].artworkNodeIds,
                ],
          )
          .map((id) => document.nodes[id])
      : document.nodes.ROOT.nodes.map((id) => {
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
          Boolean(field.essential && !node.custom?.optional) ||
          Boolean(previous?.required),
      });
      if (binding.source === 'bank') {
        const message = BINDING_CATALOG['bank.message'];
        fields.set('bank.message:', {
          ...message,
          requiresEventKey: undefined,
          required: false,
        });
      }
    }
  }
  return [...fields.values()].map((field) => ({
    ...field,
    type:
      field.id === 'story'
        ? 'textarea'
        : ['wedding.date', 'wedding.time', 'wedding.event'].includes(field.id)
          ? 'date-time'
          : field.valueType === 'string'
            ? 'text'
            : field.valueType,
  }));
}
