import { builderRequest, type TemplateDetail } from './client';

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
    issues: { path: string; nodeId?: string; code: string }[];
  } | null;
};

export function enqueueTemplatePublication(
  templateId: string,
  expectedVersion: number,
  idempotencyKey: string,
) {
  return builderRequest<PublicationOperation>(
    `/admin/templates/${templateId}/publish`,
    {
      method: 'POST',
      body: { expectedVersion },
      idempotencyKey,
    },
  );
}

export function getPublicationOperation(id: string) {
  return builderRequest<PublicationOperation>(`/publication-operations/${id}`);
}

export function unpublishTemplate(templateId: string, expectedVersion: number) {
  return builderRequest<TemplateDetail>(
    `/admin/templates/${templateId}/unpublish`,
    { method: 'POST', body: { expectedVersion } },
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
