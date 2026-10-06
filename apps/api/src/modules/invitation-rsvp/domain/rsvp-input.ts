import { UnprocessableEntityException } from '@nestjs/common';
import { closedObject } from '../../invitation-builder/http/input';
export interface RsvpPayload {
  name: string;
  attendance: 'ATTENDING' | 'DECLINED';
  partySize: number;
  message: string;
}
export function normalizeRsvp(body: unknown): RsvpPayload {
  const input = closedObject(body, [
    'name',
    'attendance',
    'partySize',
    'message',
  ]);
  if (
    typeof input.name !== 'string' ||
    (input.message !== undefined && typeof input.message !== 'string')
  )
    throw new UnprocessableEntityException();
  const name = input.name.trim(),
    message = (input.message ?? '').trim();
  if (
    [...name].length < 1 ||
    [...name].length > 120 ||
    [...message].length > 1000 ||
    !['ATTENDING', 'DECLINED'].includes(input.attendance as string) ||
    typeof input.partySize !== 'number' ||
    !Number.isInteger(input.partySize) ||
    (input.attendance === 'ATTENDING'
      ? input.partySize < 1 || input.partySize > 20
      : input.partySize !== 0)
  )
    throw new UnprocessableEntityException();
  // PostgreSQL text cannot represent NUL; reject it at the boundary.
  if (
    name.includes('\0') ||
    message.includes('\0') ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      name + message,
    )
  )
    throw new UnprocessableEntityException();
  return {
    name,
    attendance: input.attendance as RsvpPayload['attendance'],
    partySize: input.partySize,
    message,
  };
}
