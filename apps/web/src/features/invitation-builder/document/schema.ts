import { validateEditorDocument } from './editor-document';
import type { SupportedTemplateDesign } from './types';
import { z } from 'zod';
import { rawDesignSchema } from './schema-definitions';
import {
  DOCUMENT_LIMITS,
  PROPERTY_MATRIX,
  type ElementNode,
  type TemplateDesign,
  type ValidationIssue,
  type ValidationResult,
} from './types';
import {
  eventIssues,
  issue,
  jsonWithinLimit,
  UUID_EXPRESSION,
} from './validation-helpers';

export function validatePrimitiveDocument(
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
  const parsed = rawDesignSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: parsed.error.issues
        .slice(0, 100)
        .map((error) =>
          issue(
            '/' + error.path.map(String).join('/'),
            'TYPE_OR_FIELD_INVALID',
          ),
        ),
    };
  const design = parsed.data as TemplateDesign;
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
    const borderPosition = appearance.border.position ?? 'all';
    const horizontalBorder =
      appearance.border.width *
      (borderPosition === 'all' || borderPosition === 'horizontal'
        ? 2
        : borderPosition === 'left' ||
            borderPosition === 'right' ||
            borderPosition.includes('-')
          ? 1
          : 0);
    const verticalBorder =
      appearance.border.width *
      (borderPosition === 'all' || borderPosition === 'vertical'
        ? 2
        : borderPosition === 'top' ||
            borderPosition === 'bottom' ||
            borderPosition.includes('-')
          ? 1
          : 0);
    if (
      padding &&
      (padding.left + padding.right + horizontalBorder >= box.width ||
        padding.top + padding.bottom + verticalBorder >= box.height)
    )
      errors.push(issue(path + '/appearance/padding', 'CONTENT_BOX_EMPTY'));
    if (
      kind === 'Shape' &&
      'primitive' in content &&
      (content.primitive === 'line' ||
        content.primitive === 'ellipse' ||
        content.primitive === 'triangle')
    ) {
      if (
        appearance.borderRadius !== undefined ||
        appearance.borderRadii !== undefined
      )
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

export const templateDesignSchema = z
  .unknown()
  .transform((input, context): TemplateDesign => {
    const result = validateTemplateDesign(input);
    if (result.valid) return result.value;
    for (const error of result.issues)
      context.addIssue({
        code: 'custom',
        message: error.code,
        path: error.path.split('/').filter(Boolean),
      });
    return z.NEVER;
  });

export function validateSupportedTemplateDesign(
  input: unknown,
): ValidationResult<SupportedTemplateDesign> {
  return validateEditorDocument(input);
}
// Internal primitive projection validation; never used to select a product editor.
export const validateTemplateDesign = validatePrimitiveDocument;
