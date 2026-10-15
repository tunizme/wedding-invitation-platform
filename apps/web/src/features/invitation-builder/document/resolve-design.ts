import { resolveEditorDocument } from './editor-document';
import type { SupportedTemplateDesign } from './types';
import type {
  Binding,
  ComponentName,
  ElementNode,
  ResolvedElement,
  ResolvedScene,
  TemplateDesign,
  WeddingData,
  WeddingEvent,
  Bank,
} from './types';
import { createBankQrPayload } from './qr-bank';
import { eventIssues, normalizeWedding } from './validation-helpers';

export type LocalResolution = {
  scene: ResolvedScene;
  issues: { path: string; code: string; nodeId?: string }[];
  visibleAssetIds: string[];
  hasVisibleRsvp: boolean;
};
type Options = {
  mode: 'editor' | 'preview' | 'capture' | 'public';
  asOf: string;
  invitation?: { slug: string; publicVersion: number; rsvpOpen: boolean };
};
const blank = (value: unknown) =>
  value == null ||
  (typeof value === 'string' && !value.trim()) ||
  (Array.isArray(value) && !value.length);
const obj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function eventTime(source: string, event?: WeddingEvent) {
  if (
    !event?.datetime ||
    !event.timeZone ||
    !Number.isFinite(Date.parse(event.datetime))
  )
    return undefined;
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: event.timeZone,
      ...(source === 'wedding.date'
        ? { day: '2-digit', month: '2-digit', year: 'numeric' }
        : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    }).format(new Date(event.datetime));
  } catch {
    return undefined;
  }
}
function sourceValue(data: WeddingData, binding: Binding): unknown {
  switch (binding.source) {
    case 'bride.name':
      return data.bride?.name;
    case 'groom.name':
      return data.groom?.name;
    case 'bride.photo':
      return data.bride?.photo;
    case 'groom.photo':
      return data.groom?.photo;
    case 'couple.photo':
      return data.couple?.photo;
    case 'parents.bride.fatherName':
      return data.parents?.bride?.fatherName;
    case 'parents.bride.motherName':
      return data.parents?.bride?.motherName;
    case 'parents.groom.fatherName':
      return data.parents?.groom?.fatherName;
    case 'parents.groom.motherName':
      return data.parents?.groom?.motherName;
    case 'story':
      return data.story;
    case 'bank':
      return data.bank;
    case 'timeline':
      return data.timeline;
    case 'wedding.event':
      return binding.eventKey ? data.events?.[binding.eventKey] : undefined;
    case 'venue':
      return binding.eventKey
        ? data.events?.[binding.eventKey]?.venue
        : undefined;
    case 'wedding.date':
    case 'wedding.time':
      return binding.eventKey
        ? eventTime(binding.source, data.events?.[binding.eventKey])
        : undefined;
    case 'venue.name':
    case 'venue.address':
      return binding.eventKey
        ? data.events?.[binding.eventKey]?.venue?.[
            binding.source.endsWith('name') ? 'name' : 'address'
          ]
        : undefined;
  }
}
function complete(value: unknown, source: Binding['source']) {
  if (blank(value)) return false;
  if (source === 'bank')
    return (
      obj(value) &&
      !blank(value.bin) &&
      !blank(value.account) &&
      !blank(value.recipientName)
    );
  if (source === 'venue')
    return (
      obj(value) &&
      !blank(value.name) &&
      !blank(value.address) &&
      typeof value.latitude === 'number' &&
      typeof value.longitude === 'number'
    );
  if (source === 'wedding.event')
    return (
      obj(value) &&
      typeof value.datetime === 'string' &&
      !blank(value.datetime) &&
      typeof value.timeZone === 'string' &&
      !blank(value.timeZone)
    );
  if (source === 'timeline') return Array.isArray(value) && value.length > 0;
  return typeof value === 'string';
}
function validateValue(value: unknown, binding: Binding): boolean {
  if (blank(value)) return true;
  if (binding.source === 'bank')
    return (
      obj(value) &&
      ['bin', 'account', 'recipientName', 'message'].every(
        (key) => value[key] === undefined || typeof value[key] === 'string',
      )
    );
  if (binding.source === 'venue')
    return (
      obj(value) &&
      Object.entries(value).every(([key, item]) =>
        ['name', 'address'].includes(key)
          ? item === undefined || typeof item === 'string'
          : ['latitude', 'longitude'].includes(key) &&
            (item === undefined || typeof item === 'number'),
      )
    );
  if (binding.source === 'timeline')
    return (
      Array.isArray(value) &&
      value.every((entry) => obj(entry) && typeof entry.title === 'string')
    );
  if (binding.source === 'wedding.event')
    return (
      obj(value) &&
      (value.datetime === undefined || typeof value.datetime === 'string') &&
      (value.timeZone === undefined || typeof value.timeZone === 'string')
    );
  return typeof value === 'string';
}
function bindContent(
  node: ElementNode,
  value: unknown,
): Record<string, unknown> {
  const content = structuredClone(node.props.content) as unknown as Record<
    string,
    unknown
  >;
  const binding = node.props.bindings[0];
  const kind = node.type.resolvedName;
  if (!binding) {
    if (kind === 'QRBank' && complete(content.bank, 'bank'))
      content.qrPayload = createBankQrPayload(
        content.bank as Required<
          Pick<Bank, 'bin' | 'account' | 'recipientName'>
        > &
          Pick<Bank, 'message'>,
      );
    return content;
  }
  if (kind === 'Text') content.text = value;
  else if (kind === 'Image' || kind === 'Decoration') content.assetId = value;
  else if (kind === 'Calendar' || kind === 'Countdown') content.event = value;
  else if (kind === 'Map') content.venue = value;
  else if (kind === 'Timeline') content.entries = value;
  else if (kind === 'QRBank') {
    content.bank = value;
    content.qrPayload = createBankQrPayload(
      value as Required<Pick<Bank, 'bin' | 'account' | 'recipientName'>> &
        Pick<Bank, 'message'>,
    );
  }
  return content;
}

export function resolvePrimitiveDocument(
  document: TemplateDesign,
  inputData: WeddingData,
  options: Options,
): LocalResolution {
  const data = normalizeWedding(inputData) as WeddingData;
  const issues: LocalResolution['issues'] = [],
    assets = new Set<string>(),
    elements: ResolvedElement[] = [];
  if (document.nodes.ROOT.props.canvas.background.kind === 'asset')
    assets.add(document.nodes.ROOT.props.canvas.background.assetId);
  for (const id of document.nodes.ROOT.nodes) {
    const node = document.nodes[id] as ElementNode;
    if (node.hidden) continue;
    const kind = node.type.resolvedName as ComponentName,
      binding = node.props.bindings[0];
    let value: unknown,
      missing = false;
    if (binding) {
      if (
        ['wedding.date', 'wedding.time'].includes(binding.source) &&
        'eventKey' in binding
      ) {
        const event = data.events?.[binding.eventKey];
        if (event && eventIssues(event, `/nodes/${id}/bindings/0`).length) {
          issues.push({
            path: `/nodes/${id}/bindings/0`,
            code: 'BINDING_TYPE',
            nodeId: id,
          });
          continue;
        }
      }
      value = sourceValue(data, binding);
      if (!validateValue(value, binding)) {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (
        binding.source === 'wedding.event' &&
        obj(value) &&
        eventIssues(
          {
            ...value,
            datetime: blank(value.datetime) ? undefined : value.datetime,
            timeZone: blank(value.timeZone) ? undefined : value.timeZone,
          } as WeddingEvent,
          `/nodes/${id}/bindings/0`,
        ).length
      ) {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (blank(value) || !complete(value, binding.source)) {
        if (
          !blank(binding.fallback) &&
          complete(binding.fallback, binding.source)
        )
          value = binding.fallback;
        else missing = true;
      }
    } else if (node.type.resolvedName === 'Text')
      value = (node.props as import('./types').ElementProps<'Text'>).content
        .text;
    else if (
      node.type.resolvedName === 'Image' ||
      node.type.resolvedName === 'Decoration'
    )
      value = (node.props as import('./types').ElementProps<'Image'>).content
        .assetId;
    else if (kind !== 'Shape' && kind !== 'RSVP') {
      const direct = node.props.content as unknown as Record<string, unknown>;
      if (kind === 'Calendar' || kind === 'Countdown') {
        value = direct.event;
        missing = !complete(value, 'wedding.event');
        if (
          !missing &&
          eventIssues(value as WeddingEvent, `/nodes/${id}/props/content/event`)
            .length
        ) {
          issues.push({
            path: `/nodes/${id}/props/content/event`,
            nodeId: id,
            code: 'BINDING_TYPE',
          });
          continue;
        }
      } else if (kind === 'Map') {
        value = direct.venue;
        missing =
          !obj(value) ||
          (blank(value.address) &&
            !(
              typeof value.latitude === 'number' &&
              typeof value.longitude === 'number'
            ));
      } else if (kind === 'QRBank') {
        value = direct.bank;
        missing = !complete(value, 'bank');
      } else if (kind === 'Timeline') {
        value = direct.entries;
        missing = !complete(value, 'timeline');
      } else missing = true;
    }
    if (kind === 'RSVP' && options.mode === 'public' && !options.invitation) {
      issues.push({
        path: `/nodes/${id}`,
        code: 'INVITATION_CONTEXT_REQUIRED',
        nodeId: id,
      });
      continue;
    }
    if (missing) {
      if (!node.custom.optional)
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_REQUIRED',
          nodeId: id,
        });
      continue;
    }
    try {
      const content = bindContent(node, value);
      if (
        (kind === 'Image' || kind === 'Decoration') &&
        typeof content.assetId === 'string'
      )
        assets.add(content.assetId);
      if (node.props.appearance.background?.kind === 'asset')
        assets.add(node.props.appearance.background.assetId);
      elements.push({
        id,
        type: kind,
        box: node.props.box,
        appearance: node.props.appearance,
        content,
      } as unknown as ResolvedElement);
    } catch {
      issues.push({
        path: `/nodes/${id}/bindings/0`,
        code: 'BINDING_TYPE',
        nodeId: id,
      });
    }
  }
  return {
    scene: {
      schemaVersion: 1,
      rendererContractVersion: 1,
      canvas: structuredClone(document.nodes.ROOT.props.canvas),
      elements,
    },
    issues: issues.slice(0, 100),
    visibleAssetIds: [...assets].sort(),
    hasVisibleRsvp: elements.some((element) => element.type === 'RSVP'),
  };
}

export function resolveDesign(
  document: SupportedTemplateDesign,
  inputData: WeddingData,
  options: Options,
) {
  if (document.schemaVersion !== 3) throw new Error('UNSUPPORTED_SCHEMA');
  return resolveEditorDocument(document, inputData, options);
}
