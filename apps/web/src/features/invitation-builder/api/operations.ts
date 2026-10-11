import { builderRequest, type TemplateDetail } from './client';
import type { OperationScope } from '../../identity-access/session/operation-scope';

/** Optional captured owner scope for the request and its continuation. */
type Scoped = { scope?: OperationScope };

export type PublicationOperation = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
  result: {
    resourceId: string;
    editVersion: number;
    revisionId?: string;
    publicVersion?: number;
  } | null;
  error: {
    code: string;
    issues: {
      path: string;
      nodeId?: string;
      sectionId?: string;
      layout?: 'mobile' | 'desktop';
      code: string;
    }[];
  } | null;
};

export function enqueueTemplatePublication(
  templateId: string,
  expectedVersion: number,
  idempotencyKey: string,
  options: Scoped = {},
) {
  return builderRequest<PublicationOperation>(
    `/admin/templates/${templateId}/publish`,
    {
      ...options,
      method: 'POST',
      body: { expectedVersion },
      idempotencyKey,
    },
  );
}

export function getPublicationOperation(id: string, options: Scoped = {}) {
  return builderRequest<PublicationOperation>(
    `/publication-operations/${id}`,
    options,
  );
}

export function unpublishTemplate(
  templateId: string,
  expectedVersion: number,
  options: Scoped = {},
) {
  return builderRequest<TemplateDetail>(
    `/admin/templates/${templateId}/unpublish`,
    { ...options, method: 'POST', body: { expectedVersion } },
  );
}

export type TemplateLifecycle = Pick<
  TemplateDetail,
  'status' | 'editVersion' | 'publishedRevisionId'
> &
  Partial<Pick<TemplateDetail, 'updatedAt' | 'coverUrl'>>;

export function publicationResult(
  operation: PublicationOperation,
  resourceId: string,
) {
  const result = operation.result;
  if (
    operation.status !== 'SUCCEEDED' ||
    !result ||
    result.resourceId !== resourceId ||
    !Number.isInteger(result.editVersion) ||
    result.editVersion < 1
  ) {
    throw new Error('Invalid publication result');
  }
  return result;
}
