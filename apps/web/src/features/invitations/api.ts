'use client';
import {
  builderRequest,
  type ListPage,
} from '../invitation-builder/api/client';
import type {
  SupportedTemplateDesign,
  WeddingData,
} from '../invitation-builder/document/types';
import type { FormField } from '../invitation-builder/document/binding-catalog';
import type { PublicationOperation } from '../invitation-builder/api/operations';
import type { OperationScope } from '../identity-access/session/operation-scope';

/** Optional captured owner scope: ties the request and its continuation to one owner. */
export type ScopedOptions = { scope?: OperationScope; signal?: AbortSignal };

export type TemplateChoice = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  coverUrl: string;
  publishedRevisionId: string;
};
export type InvitationSummary = {
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  publicUrl: string | null;
  publicVersion: number;
  editVersion: number;
  controlVersion: number;
  rsvpOpen: boolean;
  createdAt: string;
  updatedAt: string;
};
export type InvitationDetail = InvitationSummary & {
  ownerId: string;
  createdBy: string;
  templateId: string;
  designRevisionId: string;
  draftWeddingData: WeddingData;
  templateName: string;
  document: SupportedTemplateDesign;
  formFields: (FormField & { required: boolean; eventKey?: string })[];
};

export const listTemplateChoices = (query = '', options: ScopedOptions = {}) =>
  builderRequest<ListPage<TemplateChoice>>(
    '/templates' + (query ? '?' + query : ''),
    options,
  );
export const listInvitations = (query = '', options: ScopedOptions = {}) =>
  builderRequest<ListPage<InvitationSummary>>(
    '/invitations' + (query ? '?' + query : ''),
    options,
  );
export const getInvitation = (id: string, options: ScopedOptions = {}) =>
  builderRequest<InvitationDetail>(`/invitations/${id}`, options);
export const createInvitation = (
  templateId: string,
  designRevisionId: string,
  options: ScopedOptions = {},
) =>
  builderRequest<InvitationDetail>('/invitations', {
    ...options,
    method: 'POST',
    body: { templateId, designRevisionId },
  });
export const saveInvitation = (
  id: string,
  expectedVersion: number,
  weddingData: WeddingData,
  options: ScopedOptions = {},
) =>
  builderRequest<InvitationDetail>(`/invitations/${id}/draft`, {
    ...options,
    method: 'PATCH',
    body: { expectedVersion, weddingData },
  });
export const publishInvitation = (
  id: string,
  expectedVersion: number,
  key: string,
  options: ScopedOptions = {},
) =>
  builderRequest<PublicationOperation>(`/invitations/${id}/publish`, {
    ...options,
    method: 'POST',
    body: { expectedVersion },
    idempotencyKey: key,
  });
export const unpublishInvitation = (
  id: string,
  expectedVersion: number,
  options: ScopedOptions = {},
) =>
  builderRequest<InvitationSummary>(`/invitations/${id}/unpublish`, {
    ...options,
    method: 'POST',
    body: { expectedVersion },
  });
