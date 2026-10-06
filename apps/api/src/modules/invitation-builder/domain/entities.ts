import { EntitySchema } from 'typeorm';
import type { TemplateDesign, WeddingData } from './document.types';

export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
export interface InvitationTemplate {
  id: string;
  name: string;
  category: string;
  tags: string[];
  sort_order: number;
  cover_asset_id: string | null;
  status: PublicationStatus;
  draft_document: TemplateDesign;
  draft_sample_data: WeddingData;
  edit_version: number;
  published_revision_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}
export const InvitationTemplateEntity = new EntitySchema<InvitationTemplate>({
  name: 'InvitationTemplate',
  tableName: 'invitation_templates',
  columns: {
    id: { type: 'uuid', primary: true },
    name: { type: 'varchar', length: 120 },
    category: { type: 'varchar', length: 64 },
    tags: { type: 'jsonb' },
    sort_order: { type: 'integer' },
    cover_asset_id: { type: 'uuid', nullable: true },
    status: { type: 'varchar', length: 12 },
    draft_document: { type: 'jsonb' },
    draft_sample_data: { type: 'jsonb' },
    edit_version: { type: 'integer' },
    published_revision_id: { type: 'uuid', nullable: true },
    created_by: { type: 'uuid' },
    created_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz' },
  },
});
export interface TemplateDesignRevision {
  id: string;
  template_id: string;
  revision_number: number;
  schema_version: 1;
  document: TemplateDesign;
  sample_data: WeddingData;
  document_hash: string;
  renderer_contract_version: 1;
  thumbnail_asset_id: string;
  created_by: string;
  created_at: Date;
}
export const TemplateDesignRevisionEntity =
  new EntitySchema<TemplateDesignRevision>({
    name: 'TemplateDesignRevision',
    tableName: 'template_design_revisions',
    columns: {
      id: { type: 'uuid', primary: true },
      template_id: { type: 'uuid' },
      revision_number: { type: 'integer' },
      schema_version: { type: 'integer' },
      document: { type: 'jsonb' },
      sample_data: { type: 'jsonb' },
      document_hash: { type: 'char', length: 64 },
      renderer_contract_version: { type: 'integer' },
      thumbnail_asset_id: { type: 'uuid' },
      created_by: { type: 'uuid' },
      created_at: { type: 'timestamptz' },
    },
  });
export const TemplateDraftAssetRefEntity = new EntitySchema<{
  template_id: string;
  asset_id: string;
}>({
  name: 'TemplateDraftAssetRef',
  tableName: 'template_draft_asset_refs',
  columns: {
    template_id: { type: 'uuid', primary: true },
    asset_id: { type: 'uuid', primary: true },
  },
});
export const TemplateRevisionAssetRefEntity = new EntitySchema<{
  revision_id: string;
  asset_id: string;
}>({
  name: 'TemplateRevisionAssetRef',
  tableName: 'template_revision_asset_refs',
  columns: {
    revision_id: { type: 'uuid', primary: true },
    asset_id: { type: 'uuid', primary: true },
  },
});
export const invitationBuilderEntities = [
  InvitationTemplateEntity,
  TemplateDesignRevisionEntity,
  TemplateDraftAssetRefEntity,
  TemplateRevisionAssetRefEntity,
];
