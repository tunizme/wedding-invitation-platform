import { z } from 'zod';
import {
  COMPONENTS,
  PROPERTY_MATRIX,
  DOCUMENT_LIMITS,
  type TemplateDesignV2,
  type ValidationResult,
  type ValidationIssue,
  type ElementNode,
} from './types';
import { UUID_EXPRESSION, jsonWithinLimit, issue } from './validation-helpers';
import { validateTemplateDesignV1 } from './schema';
const integer = (min: number, max: number) =>
  z.number().int().min(min).max(max);
const uuid = z.string().regex(UUID_EXPRESSION);
const label = z
  .string()
  .refine((value) => value.trim().length > 0 && [...value].length <= 120);
const background = z.union([
  z.strictObject({
    kind: z.literal('solid'),
    color: z.string().regex(/^#[0-9a-fA-F]{8}$/),
  }),
  z.strictObject({
    kind: z.literal('asset'),
    assetId: uuid,
    fit: z.enum(['cover', 'contain']),
    positionX: z.number().min(0).max(1),
    positionY: z.number().min(0).max(1),
  }),
]);
const edges = z.strictObject({
  top: integer(0, 128),
  right: integer(0, 128),
  bottom: integer(0, 128),
  left: integer(0, 128),
});
const align = z.enum(['start', 'center', 'end']);
const typography = z.strictObject({
  fontSize: z.number().min(8).max(96).optional(),
  lineHeight: z.number().min(1).max(3).optional(),
  letterSpacing: z.number().min(-5).max(20).optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
});
const appearance = z.strictObject({
  padding: edges.partial().optional(),
  borderRadius: z.number().min(0).max(128).optional(),
});
const flow = z.strictObject({
  widthPercent: integer(1, 100),
  maxWidth: integer(1, 900).nullable(),
  align,
});
const artwork = z.strictObject({
  xPercent: z.number().min(-100).max(200),
  yPercent: z.number().min(-100).max(200),
  widthPercent: z.number().min(1).max(200),
  aspectRatio: z.number().min(0.1).max(10),
  rotation: z.number().min(-180).max(180),
});
const rule = z.strictObject({
  layout: z.enum(['stack', 'grid']),
  columns: z.union([z.literal(1), z.literal(2)]),
  contentPreset: z.enum(['full', 'information', 'story', 'form', 'custom']),
  customMaxWidth: integer(200, 900).nullable(),
  padding: edges,
  gap: integer(0, 128),
  minHeight: integer(0, 12000),
  align,
});
const desktop = rule
  .omit({ padding: true })
  .partial()
  .extend({ padding: edges.partial().optional() })
  .strict();
const common = {
  id: uuid,
  type: z.enum(COMPONENTS),
  content: z.unknown(),
  bindings: z.array(z.unknown()).max(1),
  appearance: z.unknown(),
  custom: z.strictObject({
    layerName: label,
    locked: z.boolean(),
    optional: z.boolean(),
  }),
  hidden: z.boolean(),
};
const leaf = z.discriminatedUnion('role', [
  z.strictObject({
    ...common,
    role: z.literal('flow'),
    mobile: z.strictObject({ layout: flow, typography, appearance }),
    desktop: z.strictObject({
      layout: flow.partial().optional(),
      typography: typography.optional(),
      appearance: appearance.optional(),
    }),
  }),
  z.strictObject({
    ...common,
    type: z.enum(['Image', 'Decoration', 'Shape']),
    role: z.literal('artwork'),
    mobile: z.strictObject({ layout: artwork }),
    desktop: z.strictObject({ layout: artwork.partial().optional() }),
  }),
]);
export const rawDesignV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  viewport: z.strictObject({
    mobileMaxWidth: z.literal(480),
    desktopMinWidth: z.literal(768),
    desktopMaxWidth: z.literal(900),
  }),
  background,
  sectionOrder: z.array(uuid).min(1).max(40),
  sections: z.record(
    uuid,
    z.strictObject({
      id: uuid,
      label,
      hidden: z.boolean(),
      background,
      flowNodeIds: z.array(uuid).max(200),
      artworkNodeIds: z.array(uuid).max(200),
      mobile: rule,
      desktop,
    }),
  ),
  nodes: z.record(uuid, leaf),
});

export function validateTemplateDesignV2(
  input: unknown,
): ValidationResult<TemplateDesignV2> {
  if (!jsonWithinLimit(input, DOCUMENT_LIMITS.bytes))
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: [issue('/', 'JSON_BOUNDS')],
    };
  const parsed = rawDesignV2Schema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: parsed.error.issues
        .slice(0, 100)
        .map((e) =>
          issue('/' + e.path.map(String).join('/'), 'TYPE_OR_FIELD_INVALID'),
        ),
    };
  return validateV2Semantics(parsed.data as TemplateDesignV2);
}
export function validateV2Semantics(
  design: TemplateDesignV2,
): ValidationResult<TemplateDesignV2> {
  const errors: ValidationIssue[] = [];
  const seen = new Set<string>();
  let widgets = 0;
  const add = (
    path: string,
    code: string,
    nodeId?: string,
    sectionId?: string,
  ) =>
    errors.push({
      path,
      code,
      ...(nodeId ? { nodeId } : {}),
      ...(sectionId ? { sectionId } : {}),
    });
  if (
    new Set(design.sectionOrder).size !== design.sectionOrder.length ||
    Object.keys(design.sections).length !== design.sectionOrder.length ||
    design.sectionOrder.some((id) => !Object.hasOwn(design.sections, id))
  )
    add('/sectionOrder', 'TREE_INVALID');
  if (Object.keys(design.nodes).length > 200) add('/nodes', 'NODE_LIMIT');
  for (const [sid, section] of Object.entries(design.sections)) {
    if (!section.label.trim() || [...section.label].length > 120)
      add('/sections/' + sid + '/label', 'STRING_LENGTH', undefined, sid);
    if (section.id !== sid || Object.hasOwn(design.nodes, sid))
      add('/sections/' + sid, 'ID_INVALID', undefined, sid);
    for (const [layout, r] of [
      ['mobile', section.mobile],
      ['desktop', { ...section.mobile, ...section.desktop }],
    ] as const) {
      if (
        (layout === 'mobile' && r.columns !== 1) ||
        (r.layout === 'stack' && r.columns !== 1) ||
        (r.contentPreset === 'custom'
          ? r.customMaxWidth === null
          : r.customMaxWidth !== null)
      )
        add(`/sections/${sid}/${layout}`, 'LAYOUT_INVALID', undefined, sid);
    }
    for (const role of ['flow', 'artwork'] as const)
      for (const id of section[
        role === 'flow' ? 'flowNodeIds' : 'artworkNodeIds'
      ]) {
        if (seen.has(id) || !design.nodes[id] || design.nodes[id].role !== role)
          add(`/sections/${sid}/${role}NodeIds`, 'TREE_INVALID', id, sid);
        seen.add(id);
      }
  }
  for (const [id, node] of Object.entries(design.nodes)) {
    if (
      !node.custom.layerName.trim() ||
      [...node.custom.layerName].length > 120
    )
      add('/nodes/' + id + '/custom/layerName', 'STRING_LENGTH', id);
    if (node.id !== id || !seen.has(id))
      add('/nodes/' + id, 'TREE_INVALID', id);
    if (!['Text', 'Image', 'Decoration', 'Shape'].includes(node.type))
      widgets++;
    const content = structuredClone(node.content) as unknown as Record<
      string,
      unknown
    >;
    if (node.type === 'Image' || node.type === 'Decoration') {
      if (
        typeof content.alt !== 'string' ||
        [...content.alt].length > 300 ||
        (node.role === 'flow' && node.type === 'Image'
          ? !content.alt.trim()
          : content.alt !== '')
      )
        add(`/nodes/${id}/content/alt`, 'ALT_INVALID', id);
      if (
        node.role === 'flow' &&
        (typeof content.aspectRatio !== 'number' ||
          !Number.isFinite(content.aspectRatio) ||
          content.aspectRatio < 0.1 ||
          content.aspectRatio > 10)
      )
        add(`/nodes/${id}/content/aspectRatio`, 'ASPECT_RATIO_INVALID', id);
      if (node.role === 'artwork' && Object.hasOwn(content, 'aspectRatio'))
        add(`/nodes/${id}/content/aspectRatio`, 'PROPERTY_NOT_APPLICABLE', id);
      delete content.alt;
      delete content.aspectRatio;
    }
    if (node.role === 'flow')
      for (const r of [node.mobile, node.desktop]) {
        const matrix = PROPERTY_MATRIX[node.type];
        if (
          (!matrix.textStyle && Object.keys(r.typography ?? {}).length) ||
          (!matrix.padding && r.appearance?.padding !== undefined) ||
          (!matrix.borderRadius && r.appearance?.borderRadius !== undefined)
        )
          add(`/nodes/${id}`, 'PROPERTY_NOT_APPLICABLE', id);
      }
    const legacyNode = {
      type: { resolvedName: node.type },
      isCanvas: false,
      displayName: node.type,
      custom: { ...node.custom, layerName: node.custom.layerName.slice(0, 80) },
      hidden: node.hidden,
      parent: 'ROOT',
      nodes: [],
      linkedNodes: {},
      props: {
        box: { x: 0, y: 0, width: 12000, height: 12000, rotation: 0 },
        appearance: node.appearance,
        content,
        bindings: node.bindings,
      },
    } as ElementNode;
    const legacy = validateTemplateDesignV1({
      schemaVersion: 1,
      nodes: {
        ROOT: {
          type: { resolvedName: 'InvitationCanvas' },
          isCanvas: true,
          displayName: 'InvitationCanvas',
          custom: {},
          hidden: false,
          linkedNodes: {},
          nodes: [id],
          props: {
            canvas: {
              width: 390,
              height: 12000,
              background: design.background,
            },
          },
        },
        [id]: legacyNode,
      },
    });
    if (!legacy.valid)
      for (const e of legacy.issues)
        add(e.path.replace('/props/', '/'), e.code, id);
  }
  if (widgets > 30) add('/nodes', 'WIDGET_LIMIT');
  return errors.length
    ? {
        valid: false,
        code: errors.some((e) => e.code.startsWith('BINDING'))
          ? 'BINDING_INVALID'
          : 'DOCUMENT_INVALID',
        issues: errors.slice(0, 100),
      }
    : { valid: true, value: design };
}
