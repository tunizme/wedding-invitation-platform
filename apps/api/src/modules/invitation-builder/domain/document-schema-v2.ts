import { definitions, UUID_PATTERN } from './document-schema';
import { COMPONENTS } from './document.types';
type Schema = Record<string, unknown>;
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
const partial = (schema: Schema): Schema => ({ ...schema, required: [] });
const choice = (values: readonly unknown[]): Schema => ({ enum: values });
const uuid: Schema = { type: 'string', pattern: UUID_PATTERN };
const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const label: Schema = { type: 'string', minLength: 1, maxLength: 120 };
const align = choice(['start', 'center', 'end']);
const edges = object(
  Object.fromEntries(
    ['top', 'right', 'bottom', 'left'].map((k) => [k, number(0, 128, true)]),
  ),
);
const typography = object(
  {
    fontSize: number(8, 96),
    lineHeight: number(1, 3),
    letterSpacing: number(-5, 20),
    textAlign: choice(['left', 'center', 'right', 'justify']),
  },
  [],
);
const appearance = object(
  { padding: partial(edges), borderRadius: number(0, 128) },
  [],
);
const flow = object({
  widthPercent: number(1, 100, true),
  maxWidth: { anyOf: [number(1, 900, true), { type: 'null' }] },
  align,
});
const artwork = object({
  xPercent: number(-100, 200),
  yPercent: number(-100, 200),
  widthPercent: number(1, 200),
  aspectRatio: number(0.1, 10),
  rotation: number(-180, 180),
});
const rule = object({
  layout: choice(['stack', 'grid']),
  columns: choice([1, 2]),
  contentPreset: choice(['full', 'information', 'story', 'form', 'custom']),
  customMaxWidth: { anyOf: [number(200, 900, true), { type: 'null' }] },
  padding: edges,
  gap: number(0, 128, true),
  minHeight: number(0, 12000, true),
  align,
});
const desktop = partial({
  ...rule,
  properties: {
    ...(rule.properties as Record<string, Schema>),
    padding: partial(edges),
  },
});
const ids: Schema = { type: 'array', maxItems: 200, items: uuid };
const leaf = (kind: string, role: 'flow' | 'artwork') => {
  const legacy = definitions[kind].properties as Record<string, Schema>;
  const props = legacy.props.properties as Record<string, Schema>;
  let content = structuredClone(props.content);
  if (['Image', 'Decoration'].includes(kind))
    content = object({
      ...(content.properties as Record<string, Schema>),
      alt: { type: 'string', maxLength: 300 },
      ...(role === 'flow' ? { aspectRatio: number(0.1, 10) } : {}),
    });
  return object({
    id: uuid,
    type: { const: kind },
    content,
    bindings: props.bindings,
    appearance: props.appearance,
    custom: object({
      layerName: label,
      locked: { type: 'boolean' },
      optional: { type: 'boolean' },
    }),
    hidden: { type: 'boolean' },
    role: { const: role },
    mobile:
      role === 'flow'
        ? object({ layout: flow, typography, appearance })
        : object({ layout: artwork }),
    desktop:
      role === 'flow'
        ? object({ layout: partial(flow), typography, appearance }, [])
        : object({ layout: partial(artwork) }, []),
  });
};
export const designV2Schema = {
  ...object({
    schemaVersion: { const: 2 },
    viewport: object({
      mobileMaxWidth: { const: 480 },
      desktopMinWidth: { const: 768 },
      desktopMaxWidth: { const: 900 },
    }),
    background: ref('background'),
    sectionOrder: { type: 'array', minItems: 1, maxItems: 40, items: uuid },
    sections: {
      type: 'object',
      patternProperties: {
        [UUID_PATTERN]: object({
          id: uuid,
          label,
          hidden: { type: 'boolean' },
          background: ref('background'),
          flowNodeIds: ids,
          artworkNodeIds: ids,
          mobile: rule,
          desktop,
        }),
      },
      additionalProperties: false,
    },
    nodes: {
      type: 'object',
      patternProperties: {
        [UUID_PATTERN]: {
          oneOf: [
            ...COMPONENTS.map((k) => leaf(k, 'flow')),
            ...['Image', 'Decoration', 'Shape'].map((k) => leaf(k, 'artwork')),
          ],
        },
      },
      additionalProperties: false,
    },
  }),
  $defs: definitions,
};
