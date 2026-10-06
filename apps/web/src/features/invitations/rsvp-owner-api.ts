'use client';
import {
  builderRequest,
  type ListPage,
} from '../invitation-builder/api/client';
import type { RsvpItem } from './rsvp-api';
export const listRsvps = (id: string, cursor?: string) =>
  builderRequest<ListPage<RsvpItem>>(
    `/invitations/${id}/rsvps${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
  );
export const setRsvpState = (
  id: string,
  expectedControlVersion: number,
  open: boolean,
) =>
  builderRequest<{ controlVersion: number; rsvpOpen: boolean }>(
    `/invitations/${id}/rsvp-state`,
    { method: 'PATCH', body: { expectedControlVersion, open } },
  );
