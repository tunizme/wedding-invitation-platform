/** Wire contract v1. This app owns its copy; never import another app's runtime. */
export const DOCUMENT_LIMITS = {
  bytes: 1_048_576,
  weddingBytes: 262_144,
  elements: 200,
  widgets: 30,
  width: 390,
  minimumHeight: 390,
  maximumHeight: 12_000,
} as const;
export const COMPONENTS = [
  'Text',
  'Image',
  'Decoration',
  'Shape',
  'Calendar',
  'Countdown',
  'Map',
  'RSVP',
  'QRBank',
  'Timeline',
] as const;
export type ComponentName = (typeof COMPONENTS)[number];
export const EVENT_KEYS = [
  'ceremony',
  'reception',
  'engagement',
  'afterParty',
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];
export type UUID = string;
export type HexRGBA = string;
export type Background =
  | { kind: 'solid'; color: HexRGBA }
  | {
      kind: 'asset';
      assetId: UUID;
      fit: 'cover' | 'contain';
      positionX: number;
      positionY: number;
    };
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface Border {
  width: number;
  color: HexRGBA;
  style: 'solid' | 'dashed' | 'dotted';
}
export interface Shadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: HexRGBA;
}
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface TextStyle {
  fontId: 'noto-sans-v1' | 'noto-serif-v1';
  fontSize: number;
  fontWeight: 400 | 700;
  italic: boolean;
  underline: boolean;
  color: HexRGBA;
  letterSpacing: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}
export interface Appearance {
  opacity: number;
  border: Border;
  shadow: Shadow | null;
  background?: Background;
  borderRadius?: number;
  padding?: Padding;
}
export interface Venue {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}
export interface WeddingEvent {
  datetime?: string;
  timeZone?: string;
  venue?: Venue;
}
export interface Bank {
  bin?: string;
  account?: string;
  recipientName?: string;
  message?: string;
}
export interface TimelineEntry {
  id: UUID;
  title: string;
  description?: string;
  dateLabel?: string;
}
export interface WeddingData {
  schemaVersion: 1;
  bride?: { name?: string; photo?: UUID };
  groom?: { name?: string; photo?: UUID };
  couple?: { photo?: UUID };
  parents?: {
    bride?: { fatherName?: string; motherName?: string };
    groom?: { fatherName?: string; motherName?: string };
  };
  story?: string;
  events?: Partial<Record<EventKey, WeddingEvent>>;
  timeline?: TimelineEntry[];
  bank?: Bank;
}
export type StringSource =
  | 'bride.name'
  | 'groom.name'
  | 'parents.bride.fatherName'
  | 'parents.bride.motherName'
  | 'parents.groom.fatherName'
  | 'parents.groom.motherName'
  | 'story';
export type EventStringSource =
  'wedding.date' | 'wedding.time' | 'venue.name' | 'venue.address';
export type ImageSource = 'bride.photo' | 'groom.photo' | 'couple.photo';
export type Binding =
  | { target: 'text'; source: StringSource; fallback?: string }
  | {
      target: 'text';
      source: EventStringSource;
      eventKey: EventKey;
      fallback?: string;
    }
  | { target: 'assetId'; source: ImageSource; fallback?: UUID }
  | {
      target: 'event';
      source: 'wedding.event';
      eventKey: EventKey;
      fallback?: WeddingEvent;
    }
  | { target: 'venue'; source: 'venue'; eventKey: EventKey; fallback?: Venue }
  | { target: 'bank'; source: 'bank'; fallback?: Bank }
  | { target: 'entries'; source: 'timeline'; fallback?: TimelineEntry[] };
export interface ContentByKind {
  Text: { text: string; textStyle: TextStyle };
  Image: {
    assetId: UUID | null;
    fit: 'cover' | 'contain';
    positionX: number;
    positionY: number;
  };
  Decoration: ContentByKind['Image'];
  Shape: { primitive: 'rectangle' | 'ellipse' | 'line'; fill: HexRGBA };
  Calendar: { textStyle: TextStyle; accentColor: HexRGBA };
  Countdown: { textStyle: TextStyle; label: string; endedLabel: string };
  Map: { textStyle: TextStyle; label: string };
  RSVP: {
    textStyle: TextStyle;
    title: string;
    closedLabel: string;
    successLabel: string;
  };
  QRBank: { textStyle: TextStyle; label: string };
  Timeline: { textStyle: TextStyle; accentColor: HexRGBA };
}
export interface ElementProps<K extends ComponentName = ComponentName> {
  box: Box;
  appearance: Appearance;
  content: ContentByKind[K];
  bindings: Binding[];
}
export type ElementNode = {
  [K in ComponentName]: {
    type: { resolvedName: K };
    isCanvas: false;
    props: ElementProps<K>;
    displayName: K;
    custom: { layerName: string; locked: boolean; optional: boolean };
    hidden: boolean;
    parent: 'ROOT';
    nodes: [];
    linkedNodes: Record<string, never>;
  };
}[ComponentName];
export interface Canvas {
  width: 390;
  height: number;
  background: Background;
}
export interface RootNode {
  type: { resolvedName: 'InvitationCanvas' };
  isCanvas: true;
  props: { canvas: Canvas };
  displayName: 'InvitationCanvas';
  custom: Record<string, never>;
  hidden: false;
  nodes: UUID[];
  linkedNodes: Record<string, never>;
}
export interface TemplateDesign {
  schemaVersion: 1;
  nodes: { ROOT: RootNode } & Record<string, ElementNode | RootNode>;
}
export type ResolvedContentByKind = Omit<
  ContentByKind,
  'Calendar' | 'Countdown' | 'Map' | 'Timeline' | 'QRBank'
> & {
  Calendar: ContentByKind['Calendar'] & {
    event: Required<Pick<WeddingEvent, 'datetime' | 'timeZone'>>;
  };
  Countdown: ContentByKind['Countdown'] & {
    event: Required<Pick<WeddingEvent, 'datetime' | 'timeZone'>>;
  };
  Map: ContentByKind['Map'] & { venue: Required<Venue> };
  Timeline: ContentByKind['Timeline'] & { entries: TimelineEntry[] };
  QRBank: ContentByKind['QRBank'] & {
    bank: Required<Pick<Bank, 'bin' | 'account' | 'recipientName'>> &
      Pick<Bank, 'message'>;
    qrPayload: string;
  };
};
export type ResolvedElement = {
  [K in ComponentName]: {
    id: UUID;
    type: K;
    box: Box;
    appearance: Appearance;
    content: ResolvedContentByKind[K];
  };
}[ComponentName];
export interface ResolvedScene {
  schemaVersion: 1;
  rendererContractVersion: 1;
  canvas: Canvas;
  elements: ResolvedElement[];
}
export interface RenderContext {
  mode: 'editor' | 'preview' | 'capture' | 'public';
  asOf: string;
  invitation?: { slug: UUID; publicVersion: number; rsvpOpen: boolean };
  assetUrls: Record<UUID, string>;
  /** Harness-only variants; never persisted in a scene or document. */
  validationState?: {
    rsvp?:
      | 'open'
      | 'error'
      | 'validation-error'
      | 'submitting'
      | 'success'
      | 'closed';
    rsvpUnavailable?: boolean;
    rsvpRateLimited?: boolean;
    countdown?: 'worst-case' | 'expired';
  };
}
export interface ValidationIssue {
  path: string;
  code: string;
  nodeId?: UUID;
}
export type ValidationResult<T> =
  | { valid: true; value: T }
  | {
      valid: false;
      code: 'DOCUMENT_INVALID' | 'UNSUPPORTED_SCHEMA' | 'BINDING_INVALID';
      issues: ValidationIssue[];
    };

export const PROPERTY_MATRIX = {
  Text: {
    background: true,
    padding: true,
    textStyle: true,
    borderRadius: true,
  },
  Image: {
    background: false,
    padding: false,
    textStyle: false,
    borderRadius: true,
  },
  Decoration: {
    background: false,
    padding: false,
    textStyle: false,
    borderRadius: true,
  },
  Shape: {
    background: true,
    padding: false,
    textStyle: false,
    borderRadius: true,
  },
  Calendar: {
    background: true,
    padding: true,
    textStyle: true,
    borderRadius: true,
  },
  Countdown: {
    background: true,
    padding: true,
    textStyle: true,
    borderRadius: true,
  },
  Map: { background: true, padding: true, textStyle: true, borderRadius: true },
  RSVP: {
    background: true,
    padding: true,
    textStyle: true,
    borderRadius: true,
  },
  QRBank: {
    background: true,
    padding: true,
    textStyle: true,
    borderRadius: true,
  },
  Timeline: {
    background: true,
    padding: true,
    textStyle: true,
    borderRadius: true,
  },
} as const;
