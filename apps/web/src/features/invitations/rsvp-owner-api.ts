'use client';
import {
  builderRequest,
  type ListPage,
} from '../invitation-builder/api/client';
import type { RsvpItem } from './rsvp-api';
import type { ScopedOptions } from './api';
export const listRsvps = (
  id: string,
  cursor?: string,
  options: ScopedOptions = {},
) =>
  builderRequest<ListPage<RsvpItem>>(
    `/invitations/${id}/rsvps${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
    options,
  );
export const setRsvpState = (
  id: string,
  expectedControlVersion: number,
  open: boolean,
  options: ScopedOptions = {},
) =>
  builderRequest<{ controlVersion: number; rsvpOpen: boolean }>(
    `/invitations/${id}/rsvp-state`,
    { ...options, method: 'PATCH', body: { expectedControlVersion, open } },
  );
