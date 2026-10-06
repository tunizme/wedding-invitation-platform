import Ajv from 'ajv';
import { weddingSchema } from '../../invitation-builder/domain/document-schema';
import {
  DOCUMENT_LIMITS,
  type WeddingData,
  type ValidationResult,
  type ValidationIssue,
} from '../../invitation-builder/domain/document.types';
import {
  eventIssues,
  issue,
  jsonWithinLimit,
  normalizeWedding,
} from '../../invitation-builder/domain/validation-helpers';

const validate = new Ajv({
  allErrors: true,
  strict: true,
  strictNumbers: true,
}).compile<WeddingData>(weddingSchema);
export function validateWeddingData(
  input: unknown,
): ValidationResult<WeddingData> {
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
  if (!validate(normalized))
    return {
      valid: false,
      code: 'DOCUMENT_INVALID',
      issues: (validate.errors ?? [])
        .slice(0, 100)
        .map((error) => issue(error.instancePath, 'TYPE_OR_FIELD_INVALID')),
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
