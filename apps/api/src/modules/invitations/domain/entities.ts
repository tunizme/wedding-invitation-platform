import { EntitySchema } from 'typeorm';
import type { PublicationStatus } from '../../invitation-builder/domain/entities';
import type {
  SupportedResolvedScene,
  WeddingData,
  SupportedTemplateDesign,
} from '../../invitation-builder/domain/document.types';

export interface Invitation {
  id: string;
  owner_user_id: string;
  design_revision_id: string;
  draft_wedding_data: WeddingData;
  editing_mode?: 'FORM_ONLY' | 'SERVICE_MANAGED';
  draft_document?: SupportedTemplateDesign | null;
  title?: string;
  paid_at?: Date | null;
  paid_by?: string | null;
  payment_note?: string;
  published_wedding_data: WeddingData | null;
  published_scene: SupportedResolvedScene | null;
  status: PublicationStatus;
  public_slug: string | null;
  public_version: number;
  published_has_visible_rsvp: boolean;
  edit_version: number;
  rsvp_open: boolean;
  control_version: number;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
}
export const InvitationEntity = new EntitySchema<Invitation>({
  name: 'Invitation',
  tableName: 'invitations',
  columns: {
    id: { type: 'uuid', primary: true },
    owner_user_id: { type: 'uuid' },
    design_revision_id: { type: 'uuid' },
    draft_wedding_data: { type: 'jsonb' },
    editing_mode: { type: 'varchar', length: 20, default: 'FORM_ONLY' },
    draft_document: { type: 'jsonb', nullable: true },
    title: { type: 'varchar', length: 200, default: '' },
    paid_at: { type: 'timestamptz', nullable: true },
    paid_by: { type: 'uuid', nullable: true },
    payment_note: { type: 'varchar', length: 1000, default: '' },
    published_wedding_data: { type: 'jsonb', nullable: true },
    published_scene: { type: 'jsonb', nullable: true },
    status: { type: 'varchar', length: 12 },
    public_slug: { type: 'uuid', nullable: true },
    public_version: { type: 'integer' },
    published_has_visible_rsvp: { type: 'boolean' },
    edit_version: { type: 'integer' },
    rsvp_open: { type: 'boolean' },
    control_version: { type: 'integer' },
    created_by: { type: 'uuid' },
    updated_by: { type: 'uuid' },
    created_at: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz' },
    published_at: { type: 'timestamptz', nullable: true },
  },
});
export const InvitationAssetRefEntity = new EntitySchema<{
  invitation_id: string;
  slot: 'DRAFT' | 'PUBLISHED';
  asset_id: string;
}>({
  name: 'InvitationAssetRef',
  tableName: 'invitation_asset_refs',
  columns: {
    invitation_id: { type: 'uuid', primary: true },
    slot: { type: 'varchar', length: 10, primary: true },
    asset_id: { type: 'uuid', primary: true },
  },
});
export const invitationEntities = [InvitationEntity, InvitationAssetRefEntity];
