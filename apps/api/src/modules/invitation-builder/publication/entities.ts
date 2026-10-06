import { EntitySchema } from 'typeorm';
import type {
  TemplateDesign,
  ValidationIssue,
  WeddingData,
} from '../domain/document.types';

export interface PublicationJob {
  id: string;
  template_id: string | null;
  invitation_id: string | null;
  requested_by: string;
  request_key: string;
  request_hash: string;
  expected_edit_version: number;
  candidate_document: TemplateDesign | null;
  candidate_data: WeddingData | null;
  candidate_hash: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  created_at: Date;
  deadline_at: Date;
  completed_at: Date | null;
  result_revision_id: string | null;
  result_public_version: number | null;
  error_code: string | null;
  issues: ValidationIssue[];
  staged_thumbnail_key: string | null;
}
export const PublicationJobEntity = new EntitySchema<PublicationJob>({
  name: 'PublicationJob',
  tableName: 'publication_jobs',
  columns: {
    id: { type: 'uuid', primary: true },
    template_id: { type: 'uuid', nullable: true },
    invitation_id: { type: 'uuid', nullable: true },
    requested_by: { type: 'uuid' },
    request_key: { type: 'uuid' },
    request_hash: { type: 'char', length: 64 },
    expected_edit_version: { type: 'integer' },
    candidate_document: { type: 'jsonb', nullable: true },
    candidate_data: { type: 'jsonb', nullable: true },
    candidate_hash: { type: 'char', length: 64 },
    status: { type: 'varchar', length: 10 },
    attempts: { type: 'integer' },
    lease_owner: { type: 'uuid', nullable: true },
    lease_expires_at: { type: 'timestamptz', nullable: true },
    created_at: { type: 'timestamptz' },
    deadline_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz', nullable: true },
    result_revision_id: { type: 'uuid', nullable: true },
    result_public_version: { type: 'integer', nullable: true },
    error_code: { type: 'varchar', length: 40, nullable: true },
    issues: { type: 'jsonb' },
    staged_thumbnail_key: { type: 'varchar', length: 256, nullable: true },
  },
});
export const PublicationJobAssetRefEntity = new EntitySchema<{
  job_id: string;
  asset_id: string;
}>({
  name: 'PublicationJobAssetRef',
  tableName: 'publication_job_asset_refs',
  columns: {
    job_id: { type: 'uuid', primary: true },
    asset_id: { type: 'uuid', primary: true },
  },
});
export const publicationEntities = [
  PublicationJobEntity,
  PublicationJobAssetRefEntity,
];
