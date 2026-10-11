import { validateTemplateDesignV2 } from './document-validator-v2';
import type { SupportedTemplateDesign } from './document.types';
import Ajv from 'ajv';
import { designSchema } from './document-schema';
import {
  DOCUMENT_LIMITS,
  PROPERTY_MATRIX,
  type ElementNode,
  type TemplateDesign,
  type ValidationIssue,
  type ValidationResult,
} from './document.types';
import {
  eventIssues,
  issue,
  jsonWithinLimit,
  UUID_EXPRESSION,
} from './validation-helpers';

const validate = new Ajv({
  allErrors: true,
  strict: true,
  strictNumbers: true,
}).compile<TemplateDesign>(designSchema);
export function validateTemplateDesignV1(
  input: unknown,
): ValidationResult<TemplateDesign> {
  if (!jsonWithinLimit(input, DOCUMENT_LIMITS.bytes))
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: [issue('/', 'JSON_BOUNDS')],
    };
  if (
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion !== 1
  )
    return {
      valid: false,
      code: 'UNSUPPORTED_SCHEMA',
      issues: [issue('/schemaVersion', 'UNSUPPORTED_SCHEMA')],
    };
  if (!validate(input))
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: (validate.errors ?? [])
        .slice(0, 100)
        .map((error) => issue(error.instancePath, 'TYPE_OR_FIELD_INVALID')),
    };
  const design = input;
  const errors: ValidationIssue[] = [];
  const ordered = design.nodes.ROOT.nodes;
  const ids = Object.keys(design.nodes).filter((id) => id !== 'ROOT');
  if (
    ids.length !== ordered.length ||
    ordered.some((id) => !Object.hasOwn(design.nodes, id))
  )
    errors.push(issue('/nodes/ROOT/nodes', 'TREE_INVALID'));
  let widgets = 0;
  for (const id of ids) {
    if (!UUID_EXPRESSION.test(id)) continue;
    const node = design.nodes[id] as ElementNode;
    const kind = node.type.resolvedName;
    if (!['Text', 'Image', 'Decoration', 'Shape'].includes(kind)) widgets++;
    const { box, appearance, bindings, content } = node.props;
    const path = `/nodes/${id}/props`;
    const padding = appearance.padding;
    if (
      padding &&
      (padding.left + padding.right + 2 * appearance.border.width >=
        box.width ||
        padding.top + padding.bottom + 2 * appearance.border.width >=
          box.height)
    )
      errors.push(issue(path + '/appearance/padding', 'CONTENT_BOX_EMPTY'));
    if (
      kind === 'Shape' &&
      'primitive' in content &&
      (content.primitive === 'line' || content.primitive === 'ellipse')
    ) {
      if (appearance.borderRadius !== undefined)
        errors.push(
          issue(path + '/appearance/borderRadius', 'PROPERTY_NOT_APPLICABLE'),
        );
    } else if (
      PROPERTY_MATRIX[kind].borderRadius &&
      appearance.borderRadius === undefined
    )
      errors.push(
        issue(path + '/appearance/borderRadius', 'PROPERTY_REQUIRED'),
      );
    if (
      ['Calendar', 'Countdown', 'Map', 'QRBank', 'Timeline'].includes(kind) &&
      bindings.length !== 1
    )
      errors.push(issue(path + '/bindings', 'BINDING_REQUIRED'));
    for (const binding of bindings) {
      if (binding.target === 'event' && binding.fallback)
        errors.push(
          ...eventIssues(binding.fallback, path + '/bindings/0/fallback'),
        );
      if (
        binding.target === 'entries' &&
        binding.fallback &&
        new Set(binding.fallback.map((entry) => entry.id)).size !==
          binding.fallback.length
      )
        errors.push(issue(path + '/bindings/0/fallback', 'DUPLICATE_ID'));
    }
  }
  if (widgets > DOCUMENT_LIMITS.widgets)
    errors.push(issue('/nodes', 'WIDGET_LIMIT'));
  return errors.length
    ? {
        valid: false,
        code: errors.some((error) => error.code.startsWith('BINDING'))
          ? 'BINDING_INVALID'
          : 'DOCUMENT_INVALID',
        issues: errors.slice(0, 100),
      }
    : { valid: true, value: design };
}

export function validateSupportedTemplateDesign(
  input: unknown,
): ValidationResult<SupportedTemplateDesign> {
  return input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === 2
    ? validateTemplateDesignV2(input)
    : validateTemplateDesignV1(input);
}
// Legacy consumers keep their v1 type until the versioned readers are integrated.
export const validateTemplateDesign = validateTemplateDesignV1;
