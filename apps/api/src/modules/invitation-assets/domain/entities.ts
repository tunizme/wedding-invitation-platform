import { EntitySchema } from 'typeorm';

export type AssetScope = 'TEMPLATE' | 'CUSTOMER' | 'SYSTEM_THUMBNAIL';
export type AssetKind =
  'IMAGE' | 'DECORATION' | 'BACKGROUND' | 'THUMBNAIL' | 'AUDIO';
export interface Asset {
  id: string;
  scope: AssetScope;
  owner_user_id: string | null;
  uploaded_by: string;
  assistance_invitation_id: string | null;
  name: string;
  kind: AssetKind;
  object_key: string;
  mime_type: 'image/webp' | 'image/png' | 'audio/mpeg';
  duration_ms?: number | null;
  category?: string | null;
  attribution?: Record<string, unknown> | null;
  byte_size: number;
  width: number;
  height: number;
  sha256: string;
  status: 'READY' | 'DELETING' | 'DELETED';
  created_at: Date;
  deleted_at: Date | null;
}
export const AssetEntity = new EntitySchema<Asset>({
  name: 'InvitationAsset',
  tableName: 'assets',
  columns: {
    id: { type: 'uuid', primary: true },
    scope: { type: 'varchar', length: 20 },
    owner_user_id: { type: 'uuid', nullable: true },
    uploaded_by: { type: 'uuid' },
    assistance_invitation_id: { type: 'uuid', nullable: true },
    name: { type: 'varchar', length: 120 },
    kind: { type: 'varchar', length: 12 },
    object_key: { type: 'varchar', length: 256 },
    mime_type: { type: 'varchar', length: 20 },
    byte_size: { type: 'integer' },
    duration_ms: { type: 'integer', nullable: true },
    category: { type: 'varchar', length: 64, nullable: true },
    attribution: { type: 'jsonb', nullable: true },
    width: { type: 'integer' },
    height: { type: 'integer' },
    sha256: { type: 'char', length: 64 },
    status: { type: 'varchar', length: 10 },
    created_at: { type: 'timestamptz' },
    deleted_at: { type: 'timestamptz', nullable: true },
  },
});
export interface AssetStorageWrite {
  id: string;
  object_key: string;
  lease_token: string;
  status: 'WRITING' | 'COMMITTED' | 'ABANDONED';
  deadline_at: Date;
  created_at: Date;
  cleaned_at: Date | null;
  asset_id: string | null;
  job_id: string | null;
  job_lease_token: string | null;
}
export const AssetStorageWriteEntity = new EntitySchema<AssetStorageWrite>({
  name: 'AssetStorageWrite',
  tableName: 'asset_storage_writes',
  columns: {
    id: { type: 'uuid', primary: true },
    object_key: { type: 'varchar', length: 256 },
    lease_token: { type: 'uuid' },
    status: { type: 'varchar', length: 10 },
    deadline_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz' },
    cleaned_at: { type: 'timestamptz', nullable: true },
    asset_id: { type: 'uuid', nullable: true },
    job_id: { type: 'uuid', nullable: true },
    job_lease_token: { type: 'uuid', nullable: true },
  },
});
export const invitationAssetEntities = [AssetEntity, AssetStorageWriteEntity];
