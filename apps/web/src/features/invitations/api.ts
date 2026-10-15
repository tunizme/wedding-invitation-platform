'use client';
import {
  builderRequest,
  BuilderApiError,
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
  title?: string;
  editingMode?: 'FORM_ONLY' | 'SERVICE_MANAGED';
  paidAt?: string | null;
  paymentNote?: string;
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
export const getInvitation = (
  id: string,
  options: ScopedOptions & { assisted?: boolean } = {},
) =>
  builderRequest<InvitationDetail>(
    `/${options.assisted ? 'admin/' : ''}invitations/${id}`,
    options,
  );
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

export type TemplateRevision = {
  id: string;
  revisionId: string;
  document: SupportedTemplateDesign;
  sampleData: WeddingData;
  formFields: InvitationDetail['formFields'];
};
export const getTemplateRevision = (
  id: string,
  revisionId: string,
  options: ScopedOptions = {},
) =>
  builderRequest<TemplateRevision>(
    `/templates/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revisionId)}`,
    options,
  );

/** The catalog has no item endpoint. Walk real cursors with a single bounded deadline. */
export async function findTemplateChoice(
  id: string,
  options: ScopedOptions = {},
) {
  const signal = AbortSignal.any([
    AbortSignal.timeout(15000),
    ...(options.signal ? [options.signal] : []),
    ...(options.scope ? [options.scope.signal] : []),
  ]);
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    options.scope?.assertActive();
    if (signal.aborted) throw new BuilderApiError(0, 'REQUEST_CANCELLED');
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const page = await listTemplateChoices(params.toString(), {
      ...options,
      signal,
    });
    options.scope?.assertActive();
    const choice = page.items.find((item) => item.id === id);
    if (choice) return choice;
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor))
      throw new BuilderApiError(0, 'CATALOG_CURSOR_INVALID');
    if (cursor) seen.add(cursor);
  } while (cursor);
  throw new BuilderApiError(404, 'TEMPLATE_UNAVAILABLE');
}
