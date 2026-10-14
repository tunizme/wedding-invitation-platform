import type {
  ElementNode,
  RootNode,
  Box,
  Bank,
  Appearance,
  Background,
  TemplateDesign,
  WeddingData,
  ResolvedElement,
  ValidationResult,
  ValidationIssue,
  WeddingEvent,
} from './types';
import { DOCUMENT_LIMITS } from './types';
import { validatePrimitiveDocument } from './schema';
import { resolvePrimitiveDocument } from './resolve-design';
import { jsonWithinLimit, UUID_EXPRESSION } from './validation-helpers';

export const ADVANCED_KINDS = [
  'Album',
  'Carousel',
  'YouTube',
  'Contact',
  'Reminder',
  'GuestName',
  'CustomForm',
] as const;
export type AdvancedKind = (typeof ADVANCED_KINDS)[number];
export type NodeKind = ElementNode['type']['resolvedName'] | AdvancedKind;
export interface CustomField {
  id: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'email'
    | 'tel'
    | 'number'
    | 'date'
    | 'select'
    | 'multiselect';
  required: boolean;
  options: string[];
}
export interface AdvancedContent {
  label: string;
  field: string | null;
  assetIds?: string[];
  videoId?: string;
  posterId?: string | null;
  phone?: string;
  eventKey?: 'ceremony' | 'reception' | 'engagement' | 'afterParty';
  fields?: CustomField[];
  // Contact button styling and reminder details (all optional).
  showIcon?: boolean;
  buttonColor?: string;
  textColor?: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  // Carousel presentation (all optional; manual navigation when absent).
  transition?: 'zoom' | 'switch' | 'overlap' | 'fade';
  durationSec?: number;
  delaySec?: number;
  autoplay?: boolean;
}
export interface AdvancedNode {
  type: { resolvedName: AdvancedKind };
  isCanvas: false;
  props: {
    box: Box;
    appearance: Appearance;
    content: AdvancedContent;
    bindings: [];
  };
  displayName: AdvancedKind;
  custom: { layerName: string; locked: boolean; optional: boolean };
  hidden: boolean;
  parent: 'ROOT';
  nodes: [];
  linkedNodes: Record<string, never>;
}
export type CanvasNode = ElementNode | AdvancedNode;
export type CanvasRoot = Omit<RootNode, 'props'> & {
  props: { canvas: { width: 500; height: number; background: Background } };
};
export interface NodeOptions {
  groupId?: string;
  flipX?: boolean;
  flipY?: boolean;
  mask?: 'none' | 'circle' | 'arch' | 'heart';
  crop?: { x: number; y: number; width: number; height: number };
  entrance?:
    | 'none'
    | 'fade'
    | 'slide'
    | 'slide-down'
    | 'slide-left'
    | 'slide-right'
    | 'scale'
    | 'scale-out'
    | 'rotate'
    | 'bounce'
    | 'flip';
  entranceEnabled?: boolean;
  entranceDuration?: number;
  entranceDelay?: number;
  entranceEasing?: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear';
  continuous?:
    | 'none'
    | 'float'
    | 'pulse'
    | 'bounce'
    | 'blink'
    | 'spin'
    | 'shake'
    | 'swing'
    | 'wiggle';
  continuousDuration?: number;
  continuousDelay?: number;
  action?: { kind: 'link' | 'scroll' | 'gift'; value: string };
  giftAccounts?: Bank[];
  giftTitle?: string;
}
export interface EditorSettings {
  locale: 'vi' | 'en';
  title: string;
  description: string;
  shareImageId: string | null;
  audio: {
    assetId: string | null;
    field: string | null;
    volume: number;
    loop: boolean;
    trimStartMs?: number;
    trimEndMs?: number;
    iconStyle?: number;
    iconColor?: string;
  };
  envelope: boolean;
  particles: 'none' | 'petals' | 'hearts';
  autoScroll: number;
  toolbar: { wishes: boolean; likes: boolean; gift: boolean; share: boolean };
  gradient: { from: string; to: string; angle: number } | null;
  // Whole-page entrance preset; an element's own entrance always wins.
  pageAnimation?:
    | 'none'
    | 'fade-all'
    | 'slide-all'
    | 'scale-all'
    | 'flip-all'
    | 'slide-mix'
    | 'fade-mix';
}
export interface EditorDocument {
  schemaVersion: 3;
  nodes: { ROOT: CanvasRoot } & Record<string, CanvasNode | CanvasRoot>;
  nodeOptions: Record<string, NodeOptions>;
  settings: EditorSettings;
}
export interface ResolvedAdvanced {
  id: string;
  type: AdvancedKind;
  box: Box;
  appearance: Appearance;
  content: AdvancedContent & { event?: WeddingEvent };
}
export interface EditorScene {
  schemaVersion: 3;
  rendererContractVersion: 3;
  canvas: CanvasRoot['props']['canvas'];
  elements: (ResolvedElement | ResolvedAdvanced)[];
  nodeOptions: Record<string, NodeOptions>;
  settings: EditorSettings;
}
export interface ContentFieldValue {
  text?: string;
  assetIds?: string[];
  audioId?: string | null;
  videoId?: string;
  posterId?: string | null;
  phone?: string;
}
export function defaultEditorSettings(): EditorSettings {
  return {
    locale: 'vi',
    title: '',
    description: '',
    shareImageId: null,
    audio: { assetId: null, field: null, volume: 0.5, loop: true },
    envelope: false,
    particles: 'none',
    autoScroll: 0,
    toolbar: { wishes: false, likes: false, gift: false, share: true },
    gradient: null,
  };
}
export function createBlankDocument(): EditorDocument {
  return {
    schemaVersion: 3,
    nodes: {
      ROOT: {
        type: { resolvedName: 'InvitationCanvas' },
        isCanvas: true,
        displayName: 'InvitationCanvas',
        custom: {},
        hidden: false,
        nodes: [],
        linkedNodes: {},
        props: {
          canvas: {
            width: 500,
            height: 2000,
            background: { kind: 'solid', color: '#FFFFFFFF' },
          },
        },
      },
    },
    nodeOptions: {},
    settings: defaultEditorSettings(),
  };
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (
  v: unknown,
  allowed: string[],
  required: string[] = allowed,
): v is Record<string, unknown> =>
  object(v) &&
  Object.keys(v).every((k) => allowed.includes(k)) &&
  required.every((k) => Object.hasOwn(v, k));
const str = (v: unknown, max: number, min = 0): v is string =>
  typeof v === 'string' && [...v].length <= max && [...v].length >= min;
const num = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && UUID_EXPRESSION.test(v);
const nullableId = (v: unknown) => v === null || uuid(v);
const color = (v: unknown) =>
  typeof v === 'string' && /^#[0-9a-f]{8}$/i.test(v);
export function isAdvanced(node: CanvasNode): node is AdvancedNode {
  return (ADVANCED_KINDS as readonly string[]).includes(node.type.resolvedName);
}
export function validCustomFields(value: unknown): value is CustomField[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    new Set(value.map((v) => (object(v) ? v.id : undefined))).size ===
      value.length &&
    value.every(
      (v) =>
        keys(v, ['id', 'label', 'type', 'required', 'options']) &&
        str(v.id, 60, 1) &&
        /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v.id) &&
        str(v.label, 120, 1) &&
        [
          'text',
          'textarea',
          'email',
          'tel',
          'number',
          'date',
          'select',
          'multiselect',
        ].includes(String(v.type)) &&
        typeof v.required === 'boolean' &&
        Array.isArray(v.options) &&
        v.options.length <= 30 &&
        new Set(v.options).size === v.options.length &&
        v.options.every((x) => str(x, 120, 1)) &&
        (!['select', 'multiselect'].includes(String(v.type)) ||
          v.options.length > 0),
    )
  );
}
export function validContentFields(
  value: unknown,
): value is Record<string, ContentFieldValue> {
  return (
    object(value) &&
    Object.keys(value).length <= 100 &&
    Object.entries(value).every(
      ([id, v]) =>
        /^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(id) &&
        keys(
          v,
          ['text', 'assetIds', 'audioId', 'videoId', 'posterId', 'phone'],
          [],
        ) &&
        (v.text === undefined || str(v.text, 5000)) &&
        (v.assetIds === undefined ||
          (Array.isArray(v.assetIds) &&
            v.assetIds.length <= 50 &&
            v.assetIds.every(uuid))) &&
        (v.audioId === undefined || nullableId(v.audioId)) &&
        (v.posterId === undefined || nullableId(v.posterId)) &&
        (v.videoId === undefined ||
          v.videoId === '' ||
          (typeof v.videoId === 'string' &&
            /^[a-zA-Z0-9_-]{11}$/.test(v.videoId))) &&
        (v.phone === undefined ||
          (str(v.phone, 30) && /^[+0-9 ()-]*$/.test(v.phone))),
    )
  );
}
function validSettings(v: unknown): v is EditorSettings {
  return (
    keys(
      v,
      [
        'locale',
        'title',
        'description',
        'shareImageId',
        'audio',
        'envelope',
        'particles',
        'autoScroll',
        'toolbar',
        'gradient',
        'pageAnimation',
      ],
      [
        'locale',
        'title',
        'description',
        'shareImageId',
        'audio',
        'envelope',
        'particles',
        'autoScroll',
        'toolbar',
        'gradient',
      ],
    ) &&
    (v.pageAnimation === undefined ||
      (typeof v.pageAnimation === 'string' &&
        [
          'none',
          'fade-all',
          'slide-all',
          'scale-all',
          'flip-all',
          'slide-mix',
          'fade-mix',
        ].includes(v.pageAnimation))) &&
    ['vi', 'en'].includes(String(v.locale)) &&
    str(v.title, 120) &&
    str(v.description, 500) &&
    nullableId(v.shareImageId) &&
    keys(
      v.audio,
      [
        'assetId',
        'field',
        'volume',
        'loop',
        'trimStartMs',
        'trimEndMs',
        'iconStyle',
        'iconColor',
      ],
      ['assetId', 'field', 'volume', 'loop'],
    ) &&
    (v.audio.trimStartMs === undefined ||
      (Number.isInteger(v.audio.trimStartMs) &&
        num(v.audio.trimStartMs, 0, 600000))) &&
    (v.audio.trimEndMs === undefined ||
      (Number.isInteger(v.audio.trimEndMs) &&
        num(v.audio.trimEndMs, 1, 600000) &&
        (v.audio.trimStartMs === undefined ||
          (v.audio.trimEndMs as number) > (v.audio.trimStartMs as number)))) &&
    (v.audio.iconStyle === undefined ||
      (Number.isInteger(v.audio.iconStyle) && num(v.audio.iconStyle, 0, 5))) &&
    (v.audio.iconColor === undefined ||
      (typeof v.audio.iconColor === 'string' &&
        /^#[0-9A-Fa-f]{8}$/.test(v.audio.iconColor))) &&
    nullableId(v.audio.assetId) &&
    (v.audio.field === null ||
      (str(v.audio.field, 60, 1) &&
        /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v.audio.field))) &&
    num(v.audio.volume, 0, 1) &&
    typeof v.audio.loop === 'boolean' &&
    typeof v.envelope === 'boolean' &&
    ['none', 'petals', 'hearts'].includes(String(v.particles)) &&
    num(v.autoScroll, 0, 100) &&
    keys(v.toolbar, ['wishes', 'likes', 'gift', 'share']) &&
    Object.values(v.toolbar).every((x) => typeof x === 'boolean') &&
    (v.gradient === null ||
      (keys(v.gradient, ['from', 'to', 'angle']) &&
        color(v.gradient.from) &&
        color(v.gradient.to) &&
        num(v.gradient.angle, 0, 360)))
  );
}
function validOptions(v: unknown): v is NodeOptions {
  return (
    keys(
      v,
      [
        'groupId',
        'flipX',
        'flipY',
        'mask',
        'crop',
        'entrance',
        'entranceEnabled',
        'entranceDuration',
        'entranceDelay',
        'entranceEasing',
        'continuous',
        'continuousDuration',
        'continuousDelay',
        'action',
        'giftAccounts',
        'giftTitle',
      ],
      [],
    ) &&
    (v.groupId === undefined || uuid(v.groupId)) &&
    (v.flipX === undefined || typeof v.flipX === 'boolean') &&
    (v.flipY === undefined || typeof v.flipY === 'boolean') &&
    (v.mask === undefined ||
      ['none', 'circle', 'arch', 'heart'].includes(
        typeof v.mask === 'string' ? v.mask : '',
      )) &&
    (v.entrance === undefined ||
      [
        'none',
        'fade',
        'slide',
        'slide-down',
        'slide-left',
        'slide-right',
        'scale',
        'scale-out',
        'rotate',
        'bounce',
        'flip',
      ].includes(typeof v.entrance === 'string' ? v.entrance : '')) &&
    (v.continuous === undefined ||
      [
        'none',
        'float',
        'pulse',
        'bounce',
        'blink',
        'spin',
        'shake',
        'swing',
        'wiggle',
      ].includes(typeof v.continuous === 'string' ? v.continuous : '')) &&
    (v.entranceEnabled === undefined ||
      typeof v.entranceEnabled === 'boolean') &&
    (v.entranceDuration === undefined || num(v.entranceDuration, 0.1, 5)) &&
    (v.entranceDelay === undefined || num(v.entranceDelay, 0, 3)) &&
    (v.entranceEasing === undefined ||
      ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'].includes(
        typeof v.entranceEasing === 'string' ? v.entranceEasing : '',
      )) &&
    (v.continuousDuration === undefined ||
      num(v.continuousDuration, 0.5, 10)) &&
    (v.continuousDelay === undefined || num(v.continuousDelay, 0, 5)) &&
    (v.crop === undefined ||
      (keys(v.crop, ['x', 'y', 'width', 'height']) &&
        num(v.crop.x, 0, 1) &&
        num(v.crop.y, 0, 1) &&
        num(v.crop.width, 0.01, 1) &&
        num(v.crop.height, 0.01, 1) &&
        Number(v.crop.x) + Number(v.crop.width) <= 1.000001 &&
        Number(v.crop.y) + Number(v.crop.height) <= 1.000001)) &&
    (v.giftTitle === undefined || str(v.giftTitle, 120)) &&
    (v.giftAccounts === undefined ||
      (Array.isArray(v.giftAccounts) &&
        v.giftAccounts.length <= 2 &&
        v.giftAccounts.every(
          (bank) =>
            keys(bank, ['bin', 'account', 'recipientName', 'message'], []) &&
            (bank.bin === undefined || str(bank.bin, 6)) &&
            (bank.account === undefined || str(bank.account, 34)) &&
            (bank.recipientName === undefined ||
              str(bank.recipientName, 120)) &&
            (bank.message === undefined || str(bank.message, 300)),
        ))) &&
    (v.action === undefined ||
      (keys(v.action, ['kind', 'value']) &&
        str(v.action.value, 2048) &&
        ((['gift'].includes(String(v.action.kind)) && v.action.value === '') ||
          (v.action.kind === 'scroll' && uuid(v.action.value)) ||
          (v.action.kind === 'link' &&
            (v.action.value === '' ||
              (/^(https?:\/\/|tel:|mailto:)/i.test(v.action.value) &&
                ![...v.action.value].some((c) => c.charCodeAt(0) <= 32)))))))
  );
}
function validAdvancedContent(
  kind: AdvancedKind,
  c: unknown,
): c is AdvancedContent {
  const extras: Record<AdvancedKind, string[]> = {
    Album: ['assetIds'],
    Carousel: ['assetIds'],
    YouTube: ['videoId', 'posterId'],
    Contact: ['phone'],
    Reminder: ['eventKey'],
    GuestName: [],
    CustomForm: ['fields'],
  };
  const optionalExtras: Partial<Record<AdvancedKind, string[]>> = {
    Carousel: ['transition', 'durationSec', 'delaySec', 'autoplay'],
    Contact: ['showIcon', 'buttonColor', 'textColor'],
    Reminder: ['description', 'location', 'allDay'],
  };
  const optional = optionalExtras[kind] ?? [];
  if (
    !keys(
      c,
      ['label', 'field', ...extras[kind], ...optional],
      ['label', 'field', ...extras[kind]],
    ) ||
    !str(c.label, 120) ||
    (c.field !== null &&
      (!str(c.field, 60, 1) || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(c.field)))
  )
    return false;
  if (kind === 'Carousel') {
    const typed = c;
    if (
      (typed.transition !== undefined &&
        (typeof typed.transition !== 'string' ||
          !['zoom', 'switch', 'overlap', 'fade'].includes(typed.transition))) ||
      (typed.durationSec !== undefined && !num(typed.durationSec, 0.2, 10)) ||
      (typed.delaySec !== undefined && !num(typed.delaySec, 0, 10)) ||
      (typed.autoplay !== undefined && typeof typed.autoplay !== 'boolean')
    )
      return false;
  }
  if (kind === 'Album' || kind === 'Carousel')
    return (
      Array.isArray(c.assetIds) &&
      c.assetIds.length <= 50 &&
      c.assetIds.every(uuid)
    );
  if (kind === 'YouTube')
    return (
      (c.videoId === '' ||
        (typeof c.videoId === 'string' &&
          /^[a-zA-Z0-9_-]{11}$/.test(c.videoId))) &&
      nullableId(c.posterId)
    );
  const hex = (v: unknown) =>
    v === undefined || (typeof v === 'string' && /^#[0-9A-Fa-f]{8}$/.test(v));
  if (kind === 'Contact')
    return (
      str(c.phone, 30) &&
      /^[+0-9 ()-]*$/.test(c.phone) &&
      (c.showIcon === undefined || typeof c.showIcon === 'boolean') &&
      hex(c.buttonColor) &&
      hex(c.textColor)
    );
  if (kind === 'Reminder')
    return (
      ['ceremony', 'reception', 'engagement', 'afterParty'].includes(
        String(c.eventKey),
      ) &&
      (c.description === undefined || str(c.description, 500)) &&
      (c.location === undefined || str(c.location, 200)) &&
      (c.allDay === undefined || typeof c.allDay === 'boolean')
    );
  if (kind === 'CustomForm')
    return validCustomFields(c.fields) && c.field === null;
  return c.field === null;
}
export function validateEditorDocument(
  input: unknown,
): ValidationResult<EditorDocument> {
  const invalid = (
    issues: ValidationIssue[],
  ): ValidationResult<EditorDocument> => ({
    valid: false,
    code: 'DOCUMENT_INVALID',
    issues: issues.slice(0, 100),
  });
  if (
    !jsonWithinLimit(input, DOCUMENT_LIMITS.bytes) ||
    !keys(input, ['schemaVersion', 'nodes', 'nodeOptions', 'settings']) ||
    input.schemaVersion !== 3 ||
    !object(input.nodes) ||
    !object(input.nodeOptions) ||
    !validSettings(input.settings)
  )
    return invalid([{ path: '/', code: 'TYPE_OR_FIELD_INVALID' }]);
  const root = input.nodes.ROOT;
  if (
    !object(root) ||
    !keys(root.props, ['canvas']) ||
    !keys(root.props.canvas, ['width', 'height', 'background']) ||
    root.props.canvas.width !== 500 ||
    !num(root.props.canvas.height, 500, 16000) ||
    !Number.isInteger(root.props.canvas.height)
  )
    return invalid([
      { path: '/nodes/ROOT/props/canvas', code: 'CANVAS_INVALID' },
    ]);
  const projection = structuredClone(input) as unknown as EditorDocument;
  const old: TemplateDesign = {
    schemaVersion: 1,
    nodes: {
      ROOT: {
        ...projection.nodes.ROOT,
        props: {
          canvas: {
            ...projection.nodes.ROOT.props.canvas,
            width: 390,
            height: 12000,
          },
        },
      },
    },
  };
  const issues: ValidationIssue[] = [];
  let widgets = 0;
  for (const [id, raw] of Object.entries(input.nodes)) {
    if (id === 'ROOT') continue;
    if (
      !uuid(id) ||
      !object(raw) ||
      !object(raw.type) ||
      !object(raw.props) ||
      !keys(raw.props.box, ['x', 'y', 'width', 'height', 'rotation']) ||
      !num(raw.props.box.x, -16000, 16000) ||
      !num(raw.props.box.y, -16000, 16000) ||
      !num(raw.props.box.width, 1, 16000) ||
      !num(raw.props.box.height, 1, 16000) ||
      !num(raw.props.box.rotation, -180, 179.999999)
    ) {
      issues.push({
        path: `/nodes/${id}`,
        nodeId: id,
        code: 'GEOMETRY_INVALID',
      });
      continue;
    }
    // Validate editor-document length ceilings in the legacy coordinate scale, leaving the authored input intact.
    const projectedProps = projection.nodes[id].props as unknown as Record<
      string,
      unknown
    >;
    const ratio = 500 / 390;
    const appearance = projectedProps.appearance;
    if (object(appearance)) {
      if (
        object(appearance.border) &&
        typeof appearance.border.width === 'number'
      )
        appearance.border.width /= ratio;
      if (typeof appearance.borderRadius === 'number')
        appearance.borderRadius /= ratio;
      if (object(appearance.borderRadii))
        for (const [corner, value] of Object.entries(appearance.borderRadii))
          if (typeof value === 'number')
            appearance.borderRadii[corner] = value / ratio;
      for (const [key, lengths] of [
        ['padding', ['top', 'right', 'bottom', 'left']],
        ['shadow', ['offsetX', 'offsetY', 'blur', 'spread']],
      ] as const) {
        const style = appearance[key];
        if (object(style))
          for (const length of lengths)
            if (typeof style[length] === 'number') style[length] /= ratio;
      }
    }
    const content = projectedProps.content;
    if (object(content) && object(content.textStyle)) {
      const style = content.textStyle;
      if (typeof style.fontSize === 'number') {
        if (style.fontSize < 8)
          issues.push({
            path: `/nodes/${id}/props/content/textStyle/fontSize`,
            nodeId: id,
            code: 'TYPE_OR_FIELD_INVALID',
          });
        style.fontSize = Math.max(8, style.fontSize / ratio);
      }
      if (typeof style.letterSpacing === 'number') style.letterSpacing /= ratio;
    }
    const node = projection.nodes[id] as CanvasNode;
    if (
      !['Text', 'Image', 'Decoration', 'Shape'].includes(node.type.resolvedName)
    )
      widgets++;
    const box = { x: 0, y: 0, width: 1000, height: 1000, rotation: 0 };
    if (isAdvanced(node)) {
      if (
        !validAdvancedContent(node.type.resolvedName, node.props.content) ||
        !keys(raw, [
          'type',
          'isCanvas',
          'props',
          'displayName',
          'custom',
          'hidden',
          'parent',
          'nodes',
          'linkedNodes',
        ]) ||
        !keys(raw.props, ['box', 'appearance', 'content', 'bindings']) ||
        !Array.isArray(node.props.bindings) ||
        node.props.bindings.length ||
        node.displayName !== node.type.resolvedName
      ) {
        issues.push({
          path: `/nodes/${id}/props/content`,
          nodeId: id,
          code: 'TYPE_OR_FIELD_INVALID',
        });
        continue;
      }
      old.nodes[id] = {
        ...node,
        type: { resolvedName: 'Text' },
        displayName: 'Text',
        props: {
          ...node.props,
          box,
          content: {
            text: 'widget',
            textStyle: {
              fontId: 'noto-sans-v1',
              fontSize: 18,
              fontWeight: 400,
              italic: false,
              underline: false,
              color: '#29251FFF',
              letterSpacing: 0,
              lineHeight: 1.5,
              textAlign: 'left',
              textTransform: 'none',
            },
          },
        },
      } as ElementNode;
    } else
      old.nodes[id] = { ...node, props: { ...node.props, box } } as ElementNode;
  }
  if (widgets > 30) issues.push({ path: '/nodes', code: 'WIDGET_LIMIT' });
  for (const [id, opt] of Object.entries(input.nodeOptions))
    if (
      !uuid(id) ||
      !Object.hasOwn(input.nodes, id) ||
      !validOptions(opt) ||
      (object(opt) &&
        object(opt.action) &&
        opt.action.kind === 'scroll' &&
        !Object.hasOwn(input.nodes, String(opt.action.value)))
    )
      issues.push({
        path: `/nodeOptions/${id}`,
        nodeId: id,
        code: 'OPTION_INVALID',
      });
  const legacy = validatePrimitiveDocument(old);
  if (!legacy.valid) issues.push(...legacy.issues);
  return issues.length
    ? invalid(issues)
    : {
        valid: true,
        value: structuredClone(input) as unknown as EditorDocument,
      };
}
export function scalePrimitiveDocument(source: TemplateDesign): EditorDocument {
  const check = validatePrimitiveDocument(source);
  if (!check.valid) throw new Error('DOCUMENT_INVALID');
  const value = createBlankDocument(),
    ratio = 500 / 390;
  value.nodes = structuredClone(
    source.nodes,
  ) as unknown as EditorDocument['nodes'];
  value.nodes.ROOT.props.canvas.width = 500;
  value.nodes.ROOT.props.canvas.height = Math.max(
    500,
    Math.round(source.nodes.ROOT.props.canvas.height * ratio),
  );
  for (const id of value.nodes.ROOT.nodes) {
    const node = value.nodes[id] as ElementNode;
    for (const k of ['x', 'y', 'width', 'height'] as const)
      node.props.box[k] *= ratio;
    node.props.appearance.border.width *= ratio;
    if (node.props.appearance.borderRadius !== undefined)
      node.props.appearance.borderRadius *= ratio;
    if (node.props.appearance.borderRadii)
      for (const corner of Object.keys(
        node.props.appearance.borderRadii,
      ) as (keyof NonNullable<typeof node.props.appearance.borderRadii>)[])
        node.props.appearance.borderRadii[corner] *= ratio;
    if (node.props.appearance.padding)
      for (const k of ['top', 'right', 'bottom', 'left'] as const)
        node.props.appearance.padding[k] *= ratio;
    if (node.props.appearance.shadow)
      for (const k of ['offsetX', 'offsetY', 'blur', 'spread'] as const)
        node.props.appearance.shadow[k] *= ratio;
    if ('textStyle' in node.props.content) {
      node.props.content.textStyle.fontSize *= ratio;
      node.props.content.textStyle.letterSpacing *= ratio;
    }
  }
  const checked = validateEditorDocument(value);
  if (!checked.valid)
    throw new Error(
      'Conversion needs manual adjustment: ' +
        checked.issues.map((x) => x.path).join(', '),
    );
  return value;
}
export function documentAssetIds(design: EditorDocument): string[] {
  const ids = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (v) ids.add(v);
  };
  const bg = (v: Background | undefined) => {
    if (v?.kind === 'asset') add(v.assetId);
  };
  bg(design.nodes.ROOT.props.canvas.background);
  add(design.settings.audio.assetId);
  add(design.settings.shareImageId);
  for (const id of design.nodes.ROOT.nodes) {
    const n = design.nodes[id] as CanvasNode;
    bg(n.props.appearance.background);
    if (isAdvanced(n)) {
      for (const a of n.props.content.assetIds ?? []) add(a);
      add(n.props.content.posterId);
    } else {
      if ('assetId' in n.props.content) add(n.props.content.assetId);
      for (const b of n.props.bindings)
        if (b.target === 'assetId') add(b.fallback);
    }
  }
  return [...ids].sort();
}
export function contentFieldAssetIds(
  fields: Record<string, ContentFieldValue> | undefined,
): string[] {
  return [
    ...new Set(
      Object.values(fields ?? {}).flatMap((f) =>
        [...(f.assetIds ?? []), f.audioId, f.posterId].filter(
          (x): x is string => !!x,
        ),
      ),
    ),
  ].sort();
}
export function resolveEditorDocument(
  document: EditorDocument,
  data: WeddingData,
  options: Parameters<typeof resolvePrimitiveDocument>[2],
) {
  const old: TemplateDesign = {
    schemaVersion: 1,
    nodes: {
      ROOT: {
        ...document.nodes.ROOT,
        props: { canvas: { ...document.nodes.ROOT.props.canvas, width: 390 } },
      },
    },
  };
  for (const id of document.nodes.ROOT.nodes) {
    const n = document.nodes[id] as CanvasNode;
    if (!isAdvanced(n)) old.nodes[id] = structuredClone(n);
  }
  old.nodes.ROOT.nodes = old.nodes.ROOT.nodes.filter((id) =>
    Object.hasOwn(old.nodes, id),
  );
  const result = resolvePrimitiveDocument(
      old,
      { ...data, schemaVersion: 1 },
      options,
    ),
    elements = new Map<string, ResolvedElement | ResolvedAdvanced>(
      result.scene.elements.map((e) => [e.id, e]),
    );
  const assets = new Set(result.visibleAssetIds),
    issues = [...result.issues];
  for (const id of document.nodes.ROOT.nodes) {
    const node = document.nodes[id] as CanvasNode;
    if (!isAdvanced(node) || node.hidden) continue;
    const content = structuredClone(node.props.content),
      field = content.field ? data.fields?.[content.field] : undefined;
    if (field) {
      if (
        node.type.resolvedName === 'Album' ||
        node.type.resolvedName === 'Carousel'
      )
        content.assetIds = field.assetIds ?? [];
      if (node.type.resolvedName === 'YouTube') {
        content.videoId = field.videoId ?? '';
        content.posterId = field.posterId ?? null;
      }
      if (node.type.resolvedName === 'Contact')
        content.phone = field.phone ?? '';
    }
    const missing =
      (['Album', 'Carousel'].includes(node.type.resolvedName) &&
        !content.assetIds?.length) ||
      (node.type.resolvedName === 'YouTube' && !content.videoId) ||
      (node.type.resolvedName === 'Contact' && !content.phone) ||
      (node.type.resolvedName === 'Reminder' &&
        !data.events?.[content.eventKey ?? 'ceremony']?.datetime);
    if (missing) {
      if (!node.custom.optional)
        issues.push({
          nodeId: id,
          path: `/nodes/${id}/props/content`,
          code: 'BINDING_REQUIRED',
        });
      continue;
    }
    if (node.type.resolvedName === 'Reminder')
      (content as AdvancedContent & { event?: WeddingEvent }).event =
        data.events?.[content.eventKey ?? 'ceremony'];
    for (const a of content.assetIds ?? []) assets.add(a);
    if (content.posterId) assets.add(content.posterId);
    if (node.props.appearance.background?.kind === 'asset')
      assets.add(node.props.appearance.background.assetId);
    elements.set(id, {
      id,
      type: node.type.resolvedName,
      box: structuredClone(node.props.box),
      appearance: structuredClone(node.props.appearance),
      content,
    });
  }
  const settings = structuredClone(document.settings);
  if (settings.audio.field)
    settings.audio.assetId =
      data.fields?.[settings.audio.field]?.audioId ?? settings.audio.assetId;
  if (settings.audio.assetId) assets.add(settings.audio.assetId);
  if (settings.shareImageId) assets.add(settings.shareImageId);
  const nodeOptions = structuredClone(document.nodeOptions);
  if (data.bank?.bin || data.bank?.account || data.bank?.recipientName)
    for (const option of Object.values(nodeOptions))
      if (option.action?.kind === 'gift')
        option.giftAccounts = [
          structuredClone(data.bank),
          ...(option.giftAccounts?.slice(1) ?? []),
        ];
  const scene: EditorScene = {
    schemaVersion: 3,
    rendererContractVersion: 3,
    canvas: structuredClone(document.nodes.ROOT.props.canvas),
    elements: document.nodes.ROOT.nodes.flatMap((id) =>
      elements.has(id) ? [elements.get(id)!] : [],
    ),
    nodeOptions,
    settings,
  };
  return {
    scene,
    issues: issues.slice(0, 100),
    visibleAssetIds: [...assets].sort(),
    hasVisibleRsvp: result.hasVisibleRsvp,
  };
}
