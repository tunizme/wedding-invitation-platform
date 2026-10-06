import * as bankCatalog from './bank-catalog.json';
import {
  COMPONENTS,
  EVENT_KEYS,
  PROPERTY_MATRIX,
  type ComponentName,
} from './document.types';

type Schema = Record<string, unknown>;
export const UUID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const number = (minimum: number, maximum: number, integer = false): Schema => ({
  type: integer ? 'integer' : 'number',
  minimum,
  maximum,
});
const string = (maxLength: number, minLength = 0): Schema => ({
  type: 'string',
  minLength,
  maxLength,
});
const choice = (values: readonly (string | number)[]): Schema => ({
  enum: values,
});
const nullable = (schema: Schema): Schema => ({
  anyOf: [schema, { type: 'null' }],
});
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const bool: Schema = { type: 'boolean' };
const uuid: Schema = { type: 'string', pattern: UUID_PATTERN };
const color: Schema = { type: 'string', pattern: '^#[0-9A-Fa-f]{8}$' };
const position = number(0, 1);
export const STRING_SOURCES = [
  'bride.name',
  'groom.name',
  'parents.bride.fatherName',
  'parents.bride.motherName',
  'parents.groom.fatherName',
  'parents.groom.motherName',
  'story',
] as const;
export const EVENT_STRING_SOURCES = [
  'wedding.date',
  'wedding.time',
  'venue.name',
  'venue.address',
] as const;
export const IMAGE_SOURCES = [
  'bride.photo',
  'groom.photo',
  'couple.photo',
] as const;
export const definitions: Record<string, Schema> = {
  uuid,
  color,
  background: {
    oneOf: [
      object({ kind: { const: 'solid' }, color }),
      object({
        kind: { const: 'asset' },
        assetId: uuid,
        fit: choice(['cover', 'contain']),
        positionX: position,
        positionY: position,
      }),
    ],
  },
  border: object({
    width: number(0, 20),
    color,
    style: choice(['solid', 'dashed', 'dotted']),
  }),
  shadow: nullable(
    object({
      offsetX: number(-100, 100),
      offsetY: number(-100, 100),
      blur: number(0, 100),
      spread: number(-50, 50),
      color,
    }),
  ),
  padding: object({
    top: number(0, 100),
    right: number(0, 100),
    bottom: number(0, 100),
    left: number(0, 100),
  }),
  textStyle: object({
    fontId: choice(['noto-sans-v1', 'noto-serif-v1']),
    fontSize: number(8, 160),
    fontWeight: choice([400, 700]),
    italic: bool,
    underline: bool,
    color,
    letterSpacing: number(-5, 20),
    lineHeight: number(0.8, 3),
    textAlign: choice(['left', 'center', 'right', 'justify']),
    textTransform: choice(['none', 'uppercase', 'lowercase', 'capitalize']),
  }),
  box: object({
    x: number(-12000, 12000),
    y: number(-12000, 12000),
    width: number(1, 12000),
    height: number(1, 12000),
    rotation: { type: 'number', minimum: -180, exclusiveMaximum: 180 },
  }),
  venue: object(
    {
      name: string(120),
      address: string(500),
      latitude: number(-90, 90),
      longitude: number(-180, 180),
    },
    [],
  ),
  event: object(
    { datetime: string(40), timeZone: string(100), venue: ref('venue') },
    [],
  ),
  bank: object(
    {
      bin: choice(['', ...bankCatalog.banks.map((bank) => bank.bin)]),
      account: { type: 'string', pattern: '^(?:[0-9]{6,19})?$' },
      recipientName: { anyOf: [{ const: '' }, string(50, 5)] },
      message: { type: 'string', maxLength: 25, pattern: '^[A-Za-z0-9 ]*$' },
    },
    [],
  ),
  timelineEntry: object(
    {
      id: uuid,
      title: string(120, 1),
      description: string(500),
      dateLabel: string(80),
    },
    ['id', 'title'],
  ),
  timeline: { type: 'array', maxItems: 20, items: ref('timelineEntry') },
};

const binding = (
  target: string,
  source: readonly string[],
  fallback: Schema,
  event = false,
) =>
  object(
    {
      target: { const: target },
      source: choice(source),
      fallback,
      ...(event ? { eventKey: choice(EVENT_KEYS) } : {}),
    },
    event ? ['target', 'source', 'eventKey'] : ['target', 'source'],
  );
const textBindings = {
  oneOf: [
    binding('text', STRING_SOURCES, string(5000)),
    binding('text', EVENT_STRING_SOURCES, string(5000), true),
  ],
};
const bindings: Record<ComponentName, Schema> = {
  Text: textBindings,
  Image: binding('assetId', IMAGE_SOURCES, uuid),
  Decoration: binding('assetId', IMAGE_SOURCES, uuid),
  Shape: { not: {} },
  Calendar: binding('event', ['wedding.event'], ref('event'), true),
  Countdown: binding('event', ['wedding.event'], ref('event'), true),
  Map: binding('venue', ['venue'], ref('venue'), true),
  QRBank: binding('bank', ['bank'], ref('bank')),
  Timeline: binding('entries', ['timeline'], ref('timeline')),
  RSVP: { not: {} },
};
const textStyle = ref('textStyle');
const label = string(120);
const contents: Record<ComponentName, Schema> = {
  Text: object({ text: string(5000), textStyle }),
  Image: object({
    assetId: nullable(uuid),
    fit: choice(['cover', 'contain']),
    positionX: position,
    positionY: position,
  }),
  Decoration: object({
    assetId: nullable(uuid),
    fit: choice(['cover', 'contain']),
    positionX: position,
    positionY: position,
  }),
  Shape: object({
    primitive: choice(['rectangle', 'ellipse', 'line']),
    fill: color,
  }),
  Calendar: object({ textStyle, accentColor: color }),
  Countdown: object({ textStyle, label, endedLabel: label }),
  Map: object({ textStyle, label }),
  RSVP: object({
    textStyle,
    title: label,
    closedLabel: label,
    successLabel: label,
  }),
  QRBank: object({ textStyle, label }),
  Timeline: object({ textStyle, accentColor: color }),
};
const emptyObject = object({});
const emptyArray: Schema = { type: 'array', maxItems: 0 };
const common = { hidden: bool, nodes: emptyArray, linkedNodes: emptyObject };
for (const kind of COMPONENTS) {
  const matrix = PROPERTY_MATRIX[kind];
  const appearance = object(
    {
      opacity: position,
      border: ref('border'),
      shadow: ref('shadow'),
      borderRadius: number(0, 600),
      ...(matrix.background ? { background: ref('background') } : {}),
      ...(matrix.padding ? { padding: ref('padding') } : {}),
    },
    [
      'opacity',
      'border',
      'shadow',
      ...(matrix.background ? ['background'] : []),
      ...(matrix.padding ? ['padding'] : []),
    ],
  );
  definitions[kind] = object({
    ...common,
    type: object({ resolvedName: { const: kind } }),
    isCanvas: { const: false },
    displayName: { const: kind },
    parent: { const: 'ROOT' },
    custom: object({ layerName: string(80, 1), locked: bool, optional: bool }),
    props: object({
      box: ref('box'),
      appearance,
      content: contents[kind],
      bindings: { type: 'array', maxItems: 1, items: bindings[kind] },
    }),
  });
}
definitions.root = object({
  type: object({ resolvedName: { const: 'InvitationCanvas' } }),
  isCanvas: { const: true },
  displayName: { const: 'InvitationCanvas' },
  custom: emptyObject,
  hidden: { const: false },
  linkedNodes: emptyObject,
  nodes: { type: 'array', maxItems: 200, uniqueItems: true, items: uuid },
  props: object({
    canvas: object({
      width: { const: 390 },
      height: number(390, 12000, true),
      background: ref('background'),
    }),
  }),
});

export const designSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'nodes'],
  properties: {
    schemaVersion: { const: 1 },
    nodes: {
      type: 'object',
      required: ['ROOT'],
      maxProperties: 201,
      properties: { ROOT: ref('root') },
      patternProperties: {
        [UUID_PATTERN]: { oneOf: COMPONENTS.map((kind) => ref(kind)) },
      },
      additionalProperties: false,
    },
  },
  $defs: definitions,
};
export const weddingSchema = {
  ...object(
    {
      schemaVersion: { const: 1 },
      bride: object({ name: string(120), photo: uuid }, []),
      groom: object({ name: string(120), photo: uuid }, []),
      couple: object({ photo: uuid }, []),
      parents: object(
        {
          bride: object(
            { fatherName: string(120), motherName: string(120) },
            [],
          ),
          groom: object(
            { fatherName: string(120), motherName: string(120) },
            [],
          ),
        },
        [],
      ),
      story: string(5000),
      events: object(
        Object.fromEntries(EVENT_KEYS.map((key) => [key, ref('event')])),
        [],
      ),
      timeline: ref('timeline'),
      bank: ref('bank'),
    },
    ['schemaVersion'],
  ),
  $defs: definitions,
};
