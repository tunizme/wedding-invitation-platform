'use client';
import {
  builderRequest,
  type ListPage,
} from '../invitation-builder/api/client';
import type {
  TemplateDesign,
  WeddingData,
} from '../invitation-builder/document/types';
import type { FormField } from '../invitation-builder/document/binding-catalog';
import type { PublicationOperation } from '../invitation-builder/api/operations';

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
  document: TemplateDesign;
  formFields: (FormField & { required: boolean; eventKey?: string })[];
};

export const listTemplateChoices = (query = '') =>
  builderRequest<ListPage<TemplateChoice>>(
    '/templates' + (query ? '?' + query : ''),
  );
export const listInvitations = (query = '') =>
  builderRequest<ListPage<InvitationSummary>>(
    '/invitations' + (query ? '?' + query : ''),
  );
export const getInvitation = (id: string) =>
  builderRequest<InvitationDetail>(`/invitations/${id}`);
export const createInvitation = (
  templateId: string,
  designRevisionId: string,
) =>
  builderRequest<InvitationDetail>('/invitations', {
    method: 'POST',
    body: { templateId, designRevisionId },
  });
export const saveInvitation = (
  id: string,
  expectedVersion: number,
  weddingData: WeddingData,
) =>
  builderRequest<InvitationDetail>(`/invitations/${id}/draft`, {
    method: 'PATCH',
    body: { expectedVersion, weddingData },
  });
export const publishInvitation = (
  id: string,
  expectedVersion: number,
  key: string,
) =>
  builderRequest<PublicationOperation>(`/invitations/${id}/publish`, {
    method: 'POST',
    body: { expectedVersion },
    idempotencyKey: key,
  });
export const unpublishInvitation = (id: string, expectedVersion: number) =>
  builderRequest<InvitationSummary>(`/invitations/${id}/unpublish`, {
    method: 'POST',
    body: { expectedVersion },
  });
