import { resolveDesignV2, type ResolutionV2 } from './resolve-design-v2';
import type {
  SupportedTemplateDesign,
  TemplateDesignV2,
} from './document.types';
import type {
  Binding,
  ElementNode,
  ResolvedElement,
  ResolvedScene,
  TemplateDesign,
  WeddingData,
  WeddingEvent,
  Venue,
  Bank,
  ValidationIssue,
} from './document.types';
import { createBankQrPayload } from './qr-bank';
import { eventIssues, normalizeWedding } from './validation-helpers';

type Options = {
  mode: 'editor' | 'preview' | 'capture' | 'public';
  asOf: string;
  invitation?: { slug: string; publicVersion: number; rsvpOpen: boolean };
  assetUrls?: Record<string, string>;
};
export type Resolution = {
  scene: ResolvedScene;
  issues: ValidationIssue[];
  visibleAssetIds: string[];
  hasVisibleRsvp: boolean;
};

const blank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function pick(data: WeddingData, binding: Binding): unknown {
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
    case 'wedding.date':
    case 'wedding.time':
    case 'venue.name':
    case 'venue.address':
    case 'wedding.event':
    case 'venue':
      if (!('eventKey' in binding)) return undefined;
      if (binding.source === 'wedding.event')
        return data.events?.[binding.eventKey];
      if (binding.source === 'venue')
        return data.events?.[binding.eventKey]?.venue;
      if (binding.source === 'venue.name' || binding.source === 'venue.address')
        return data.events?.[binding.eventKey]?.venue?.[
          binding.source.endsWith('name') ? 'name' : 'address'
        ];
      return eventString(binding.source, data.events?.[binding.eventKey]);
    case 'bank':
      return data.bank;
    case 'timeline':
      return data.timeline;
  }
}
function eventString(
  source: Binding['source'],
  event: WeddingEvent | undefined,
): string | undefined {
  if (!event?.datetime || !event.timeZone) return undefined;
  const instant = new Date(event.datetime);
  if (!Number.isFinite(instant.getTime())) return undefined;
  const options: Intl.DateTimeFormatOptions =
    source === 'wedding.date'
      ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      ...options,
      timeZone: event.timeZone,
    }).format(instant);
  } catch {
    return undefined;
  }
}
function validBank(value: unknown): value is Bank {
  return (
    object(value) &&
    (value.bin === undefined || typeof value.bin === 'string') &&
    (value.account === undefined || typeof value.account === 'string') &&
    (value.recipientName === undefined ||
      typeof value.recipientName === 'string') &&
    (value.message === undefined || typeof value.message === 'string')
  );
}
function validVenue(value: unknown): value is Venue {
  return (
    object(value) &&
    Object.entries(value).every(([key, v]) =>
      ['name', 'address'].includes(key)
        ? v === undefined || typeof v === 'string'
        : ['latitude', 'longitude'].includes(key)
          ? v === undefined || typeof v === 'number'
          : false,
    )
  );
}
function complete(value: unknown, source: Binding['source']): boolean {
  if (blank(value)) return false;
  if (source === 'bank')
    return (
      validBank(value) &&
      !blank(value.bin) &&
      !blank(value.account) &&
      !blank(value.recipientName)
    );
  if (source === 'venue')
    return (
      validVenue(value) &&
      !blank(value.name) &&
      !blank(value.address) &&
      typeof value.latitude === 'number' &&
      typeof value.longitude === 'number'
    );
  if (source === 'wedding.event')
    return (
      object(value) &&
      typeof value.datetime === 'string' &&
      !blank(value.datetime) &&
      typeof value.timeZone === 'string' &&
      !blank(value.timeZone)
    );
  if (source === 'timeline')
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => object(entry) && typeof entry.title === 'string')
    );
  return (
    typeof value === 'string' ||
    (source.endsWith('.photo') && typeof value === 'string')
  );
}
function mergeContent(
  node: ElementNode,
  value: unknown,
): Record<string, unknown> {
  const kind = node.type.resolvedName;
  const content = structuredClone(node.props.content) as unknown as Record<
    string,
    unknown
  >;
  const binding = node.props.bindings[0];
  if (!binding) return content;
  const resolved = value;
  if (kind === 'Text' && binding.target === 'text') content.text = resolved;
  else if (
    (kind === 'Image' || kind === 'Decoration') &&
    binding.target === 'assetId'
  )
    content.assetId = resolved;
  else if (
    (kind === 'Calendar' || kind === 'Countdown') &&
    binding.target === 'event'
  )
    content.event = value;
  else if (kind === 'Map' && binding.target === 'venue') content.venue = value;
  else if (kind === 'QRBank' && binding.target === 'bank') {
    content.bank = value;
    content.qrPayload = createBankQrPayload(
      value as Required<Pick<Bank, 'bin' | 'account' | 'recipientName'>> &
        Pick<Bank, 'message'>,
    );
  } else if (kind === 'Timeline' && binding.target === 'entries')
    content.entries = value;
  return content;
}

export function resolveDesignV1(
  document: TemplateDesign,
  inputData: WeddingData,
  options: Options,
): Resolution {
  const weddingData = normalizeWedding(inputData) as WeddingData;
  const issues: ValidationIssue[] = [],
    visibleAssetIds = new Set<string>();
  const elements: ResolvedElement[] = [];
  if (document.nodes.ROOT.props.canvas.background.kind === 'asset')
    visibleAssetIds.add(document.nodes.ROOT.props.canvas.background.assetId);
  for (const id of document.nodes.ROOT.nodes) {
    const node = document.nodes[id] as ElementNode;
    if (node.hidden) continue;
    const kind = node.type.resolvedName;
    const binding = node.props.bindings[0];
    let value: unknown;
    let missing = false;
    if (binding) {
      if (['wedding.date', 'wedding.time'].includes(binding.source)) {
        const key = 'eventKey' in binding ? binding.eventKey : undefined;
        const event = key ? weddingData.events?.[key] : undefined;
        if (event && eventIssues(event, `/nodes/${id}/bindings/0`).length) {
          issues.push({
            path: `/nodes/${id}/bindings/0`,
            code: 'BINDING_TYPE',
            nodeId: id,
          });
          continue;
        }
        value = eventString(binding.source, event);
      } else value = pick(weddingData, binding);
      const stringSource = [
        'bride.name',
        'groom.name',
        'parents.bride.fatherName',
        'parents.bride.motherName',
        'parents.groom.fatherName',
        'parents.groom.motherName',
        'story',
        'wedding.date',
        'wedding.time',
        'venue.name',
        'venue.address',
      ].includes(binding.source);
      if (!blank(value) && stringSource && typeof value !== 'string') {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (
        !blank(value) &&
        binding.target === 'assetId' &&
        typeof value !== 'string'
      ) {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (
        !blank(value) &&
        binding.source === 'wedding.event' &&
        (!object(value) ||
          (value.datetime !== undefined &&
            typeof value.datetime !== 'string') ||
          (value.timeZone !== undefined && typeof value.timeZone !== 'string'))
      ) {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (
        binding.source === 'wedding.event' &&
        object(value) &&
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
      if (!blank(value) && binding.source === 'bank' && !validBank(value)) {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (!blank(value) && binding.source === 'venue' && !validVenue(value)) {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (
        !blank(value) &&
        ['timeline'].includes(binding.source) &&
        !Array.isArray(value)
      ) {
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_TYPE',
          nodeId: id,
        });
        continue;
      }
      if (blank(value) || !complete(value, binding.source)) {
        const fallback = binding.fallback;
        if (!blank(fallback) && complete(fallback, binding.source))
          value = fallback;
        else missing = true;
      }
    } else if (node.type.resolvedName === 'Text')
      value = (node.props as import('./document.types').ElementProps<'Text'>)
        .content.text;
    else if (
      node.type.resolvedName === 'Image' ||
      node.type.resolvedName === 'Decoration'
    )
      value = (node.props as import('./document.types').ElementProps<'Image'>)
        .content.assetId;
    else if (kind === 'Shape') value = true;
    else if (kind === 'RSVP') {
      if (options.mode === 'public' && !options.invitation) {
        issues.push({
          path: `/nodes/${id}`,
          code: 'INVITATION_CONTEXT_REQUIRED',
          nodeId: id,
        });
        continue;
      }
    } else missing = true;
    if (missing) {
      if (!node.custom.optional)
        issues.push({
          path: `/nodes/${id}/bindings/0`,
          code: 'BINDING_REQUIRED',
          nodeId: id,
        });
      continue;
    }
    let content: Record<string, unknown>;
    try {
      content = mergeContent(node, value);
    } catch {
      issues.push({
        path: `/nodes/${id}/bindings/0`,
        code: 'BINDING_TYPE',
        nodeId: id,
      });
      continue;
    }
    if (
      (kind === 'Image' || kind === 'Decoration') &&
      typeof content.assetId === 'string'
    )
      visibleAssetIds.add(content.assetId);
    if (
      kind === 'QRBank' &&
      object(content.bank) &&
      typeof content.bank.message === 'string'
    ) {
      /* message is auxiliary */
    }
    if (node.props.appearance.background?.kind === 'asset')
      visibleAssetIds.add(node.props.appearance.background.assetId);
    elements.push({
      id,
      type: kind,
      box: node.props.box,
      appearance: node.props.appearance,
      content,
    } as unknown as ResolvedElement);
  }
  return {
    scene: {
      schemaVersion: 1,
      rendererContractVersion: 1,
      canvas: structuredClone(document.nodes.ROOT.props.canvas),
      elements,
    },
    issues: issues.slice(0, 100),
    visibleAssetIds: [...visibleAssetIds].sort(),
    hasVisibleRsvp: elements.some((element) => element.type === 'RSVP'),
  };
}

export function resolveDesign(
  document: TemplateDesign,
  inputData: WeddingData,
  options: Options,
): Resolution;
export function resolveDesign(
  document: TemplateDesignV2,
  inputData: WeddingData,
  options: Options,
): ResolutionV2;
export function resolveDesign(
  document: SupportedTemplateDesign,
  inputData: WeddingData,
  options: Options,
): Resolution | ResolutionV2;
export function resolveDesign(
  document: SupportedTemplateDesign,
  inputData: WeddingData,
  options: Options,
): Resolution | ResolutionV2 {
  if (document.schemaVersion === 2)
    return resolveDesignV2(document, inputData, options);
  if (document.schemaVersion === 1)
    return resolveDesignV1(document, inputData, options);
  throw new Error('UNSUPPORTED_SCHEMA');
}
