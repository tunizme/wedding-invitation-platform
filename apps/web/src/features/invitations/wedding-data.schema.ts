import { validContentFields } from '../invitation-builder/document/editor-document';
import { z } from 'zod';
import { rawWeddingSchema } from '../invitation-builder/document/schema-definitions';
import {
  DOCUMENT_LIMITS,
  type WeddingData,
  type ValidationResult,
  type ValidationIssue,
} from '../invitation-builder/document/types';
import {
  eventIssues,
  issue,
  jsonWithinLimit,
  normalizeWedding,
} from '../invitation-builder/document/validation-helpers';

export function validateWeddingData(
  input: unknown,
): ValidationResult<WeddingData> {
  if (
    input &&
    typeof input === 'object' &&
    'schemaVersion' in input &&
    input.schemaVersion === 2
  ) {
    if (
      !jsonWithinLimit(input, DOCUMENT_LIMITS.weddingBytes) ||
      !('fields' in input) ||
      !validContentFields(input.fields)
    )
      return {
        valid: false,
        code: 'DOCUMENT_INVALID',
        issues: [issue('/fields', 'TYPE_OR_FIELD_INVALID')],
      };
    const { fields, ...legacy } = input;
    const checked = validateWeddingData({ ...legacy, schemaVersion: 1 });
    return checked.valid
      ? {
          valid: true,
          value: {
            ...checked.value,
            schemaVersion: 2,
            fields: structuredClone(fields),
          },
        }
      : checked;
  }
  if (!jsonWithinLimit(input, DOCUMENT_LIMITS.weddingBytes))
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
  const normalized = normalizeWedding(input);
  const parsed = rawWeddingSchema.safeParse(normalized);
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
  const data = JSON.parse(JSON.stringify(normalized)) as WeddingData;
  const errors: ValidationIssue[] = [];
  for (const [key, event] of Object.entries(data.events ?? {}))
    errors.push(...eventIssues(event, `/events/${key}`));
  if (
    data.timeline &&
    new Set(data.timeline.map((entry) => entry.id)).size !==
      data.timeline.length
  )
    errors.push(issue('/timeline', 'DUPLICATE_ID'));
  return errors.length
    ? { valid: false, code: 'DOCUMENT_INVALID', issues: errors.slice(0, 100) }
    : { valid: true, value: JSON.parse(JSON.stringify(data)) as WeddingData };
}

export const weddingDataSchema = z
  .unknown()
  .transform((input, context): WeddingData => {
    const result = validateWeddingData(input);
    if (result.valid) return result.value;
    for (const error of result.issues)
      context.addIssue({
        code: 'custom',
        message: error.code,
        path: error.path.split('/').filter(Boolean),
      });
    return z.NEVER;
  });
