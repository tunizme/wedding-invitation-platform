import { createHash } from 'node:crypto';
import type { ValidationIssue } from './document.types';

export const UUID_EXPRESSION =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const safeFields = new Set(
  'schemaVersion nodes ROOT type resolvedName isCanvas props displayName custom hidden parent linkedNodes canvas width height background kind color assetId fit positionX positionY box x y rotation appearance opacity border style borderRadius shadow offsetX offsetY blur spread padding top right bottom left content text textStyle fontId fontSize fontWeight italic underline letterSpacing lineHeight textAlign textTransform primitive fill accentColor label endedLabel title closedLabel successLabel bindings target source eventKey fallback layerName locked optional bride groom couple name photo parents fatherName motherName story events ceremony reception engagement afterParty datetime timeZone venue address latitude longitude bank bin account recipientName message timeline id description dateLabel'.split(
    ' ',
  ),
);

export function safePath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return (
    '/' +
    parts
      .map((part) =>
        safeFields.has(part) ||
        UUID_EXPRESSION.test(part) ||
        /^\d{1,3}$/.test(part)
          ? part
          : 'field',
      )
      .join('/')
  );
}
export function issue(path: string, code: string): ValidationIssue {
  const nodeId = path.split('/')[2];
  return {
    path: safePath(path),
    code,
    ...(nodeId && UUID_EXPRESSION.test(nodeId) ? { nodeId } : {}),
  };
}
export function jsonWithinLimit(value: unknown, limit: number): boolean {
  const seen = new Set<object>();
  const visit = (entry: unknown, depth: number): boolean => {
    if (depth > 32) return false;
    if (
      entry === null ||
      typeof entry === 'string' ||
      typeof entry === 'boolean'
    )
      return true;
    if (typeof entry === 'number') return Number.isFinite(entry);
    if (typeof entry !== 'object' || seen.has(entry)) return false;
    if (
      !Array.isArray(entry) &&
      ![Object.prototype, null].includes(
        Object.getPrototypeOf(entry) as object | null,
      )
    )
      return false;
    seen.add(entry);
    const valid = Object.entries(entry).every(
      ([key, item]) =>
        !['__proto__', 'prototype', 'constructor'].includes(key) &&
        visit(item, depth + 1),
    );
    seen.delete(entry);
    return valid;
  };
  try {
    return (
      visit(value, 0) &&
      Buffer.byteLength(JSON.stringify(value), 'utf8') <= limit
    );
  } catch {
    return false;
  }
}
export function normalizeWedding(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) return value.map(normalizeWedding);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeWedding(item)]),
    );
  return value;
}
export function canonicalJson(value: unknown): string {
  if (!jsonWithinLimit(value, Number.POSITIVE_INFINITY))
    throw new Error('Canonical JSON requires finite JSON values.');
  const sort = (entry: unknown): unknown =>
    Array.isArray(entry)
      ? entry.map(sort)
      : entry && typeof entry === 'object'
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [
                key,
                sort((entry as Record<string, unknown>)[key]),
              ]),
          )
        : entry;
  return JSON.stringify(sort(value));
}
export function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function eventIssues(
  value: { datetime?: string; timeZone?: string },
  path: string,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const date = value.datetime;
  let zoneValid = true;
  if (value.timeZone) {
    try {
      if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value.timeZone))
        throw new Error('IANA timezone required');
      new Intl.DateTimeFormat('en-US', { timeZone: value.timeZone }).format(0);
    } catch {
      zoneValid = false;
      errors.push(issue(path + '/timeZone', 'TIME_ZONE_INVALID'));
    }
  }
  if (!date) return errors;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      date,
    );
  const invalid = () => [
    ...errors,
    issue(path + '/datetime', 'DATETIME_INVALID'),
  ];
  if (!match) return invalid();
  const [, year, month, day, hour, minute, seconds = '0', , offset] = match;
  const local = new Date(
    Date.UTC(+year, +month - 1, +day, +hour, +minute, +seconds),
  );
  if (
    +year < 1900 ||
    +year > 2100 ||
    local.getUTCFullYear() !== +year ||
    local.getUTCMonth() !== +month - 1 ||
    local.getUTCDate() !== +day ||
    +hour > 23 ||
    +minute > 59 ||
    +seconds > 59
  )
    return invalid();
  const offsetHour = offset === 'Z' ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === 'Z' ? 0 : Number(offset.slice(4, 6));
  if (
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  )
    return invalid();
  const instant = new Date(date);
  if (!Number.isFinite(instant.getTime())) return invalid();
  if (value.timeZone && zoneValid) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: value.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(instant)
        .map((part) => [part.type, part.value]),
    );
    if (
      +parts.year !== +year ||
      +parts.month !== +month ||
      +parts.day !== +day ||
      +parts.hour !== +hour ||
      +parts.minute !== +minute ||
      +parts.second !== +seconds
    )
      return invalid();
  }
  return errors;
}
