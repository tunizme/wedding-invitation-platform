import Ajv from 'ajv';
import { designV2Schema } from './document-schema-v2';
import {
  PROPERTY_MATRIX,
  DOCUMENT_LIMITS,
  type TemplateDesignV2,
  type ValidationResult,
  type ValidationIssue,
  type ElementNode,
} from './document.types';
import { jsonWithinLimit, issue } from './validation-helpers';
import { validateTemplateDesignV1 } from './document.validator';
const check = new Ajv({
  allErrors: true,
  strict: true,
  strictNumbers: true,
}).compile<TemplateDesignV2>(designV2Schema);
export function validateTemplateDesignV2(
  input: unknown,
): ValidationResult<TemplateDesignV2> {
  if (!jsonWithinLimit(input, DOCUMENT_LIMITS.bytes))
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: [issue('/', 'JSON_BOUNDS')],
    };
  if (!check(input))
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: (check.errors ?? [])
        .slice(0, 100)
        .map((e) => issue(e.instancePath, 'TYPE_OR_FIELD_INVALID')),
    };
  return validateV2Semantics(input);
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
