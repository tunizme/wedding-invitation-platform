import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UUID_EXPRESSION } from '../domain/validation-helpers';

export function resourceId(value: string): string {
  if (!UUID_EXPRESSION.test(value)) throw new BadRequestException();
  return value;
}

export function closedObject(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new UnprocessableEntityException();
  return value as Record<string, unknown>;
}

export function positiveVersion(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw new UnprocessableEntityException();
  return value;
}

export function queryString(
  query: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = query[key];
  if (value !== undefined && typeof value !== 'string')
    throw new UnprocessableEntityException();
  return value;
}

export function listLimit(query: Record<string, unknown>): number {
  const raw = queryString(query, 'limit');
  if (raw !== undefined && !/^(?:[1-9][0-9]?|100)$/.test(raw))
    throw new UnprocessableEntityException();
  return raw === undefined ? 20 : Number(raw);
}

export type NewestCursor = { createdAt: string; id: string };
export function newestCursor(
  raw: string | undefined,
): NewestCursor | undefined {
  if (raw === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(raw)) throw new Error();
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.toString('base64url') !== raw) throw new Error();
    const value = closedObject(JSON.parse(bytes.toString('utf8')) as unknown, [
      'createdAt',
      'id',
    ]);
    if (
      typeof value.createdAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value.createdAt) ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      new Date(value.createdAt).toISOString() !==
        value.createdAt.slice(0, 23) + 'Z' ||
      typeof value.id !== 'string' ||
      !UUID_EXPRESSION.test(value.id)
    )
      throw new Error();
    return { createdAt: value.createdAt, id: value.id };
  } catch {
    throw new UnprocessableEntityException();
  }
}
export function encodeNewestCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url');
}

export function documentVersion(value: unknown): 1 | 2 {
  if (value === undefined || value === 1) return 1;
  if (value === 2) return 2;
  throw new UnprocessableEntityException();
}
