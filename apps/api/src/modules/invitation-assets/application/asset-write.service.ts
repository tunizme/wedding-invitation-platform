import { requireAssistedInvitation } from '../../invitations/authorization/invitation.policy';
import { randomUUID, createHash } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { Asset, AssetStorageWrite } from '../domain/entities';
import {
  StorageUnavailableError,
  type AssetStore,
  type StorageContext,
} from '../domain/asset-store.port';

export type NewAssetMetadata = Pick<
  Asset,
  | 'scope'
  | 'owner_user_id'
  | 'uploaded_by'
  | 'assistance_invitation_id'
  | 'name'
  | 'kind'
  | 'width'
  | 'height'
> & {
  duration_ms?: number | null;
  category?: string | null;
  attribution?: Record<string, unknown> | null;
};
export interface PreparedAsset {
  intent: AssetStorageWrite;
  byteSize: number;
  sha256: string;
  mimeType: 'image/webp' | 'image/png' | 'audio/mpeg';
}

export class AssetWriteService {
  constructor(
    private readonly db: DataSource,
    private readonly store: AssetStore,
  ) {}
  async prepare(
    bytes: Buffer,
    mimeType: 'image/webp' | 'image/png' | 'audio/mpeg',
    context: StorageContext,
    job?: { id: string; leaseToken: string },
  ): Promise<PreparedAsset> {
    const id = randomUUID();
    const key = `${id}/${randomUUID()}.${mimeType === 'audio/mpeg' ? 'mp3' : mimeType === 'image/webp' ? 'webp' : 'png'}`;
    const token = randomUUID();
    if (context.signal?.aborted || context.deadline <= Date.now())
      throw new StorageUnavailableError();
    const rows: AssetStorageWrite[] = await this.db.query(
      `WITH clock AS (SELECT clock_timestamp() AS now)
      INSERT INTO asset_storage_writes(id,object_key,lease_token,deadline_at,created_at,job_id,job_lease_token)
      SELECT $1,$2,$3,LEAST(now+interval '30 seconds',$4::timestamptz),now,$5,$6 FROM clock RETURNING *`,
      [
        id,
        key,
        token,
        new Date(context.deadline),
        job?.id ?? null,
        job?.leaseToken ?? null,
      ],
    );
    const intent = rows[0];
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // No SQL transaction/row lock survives this network operation. An ambiguous
    // failure leaves a durable, unreferenceable intent for bounded cleanup.
    await this.store.put(key, bytes, mimeType, sha256, {
      ...context,
      deadline: Math.min(context.deadline, intent.deadline_at.getTime()),
    });
    return { intent, byteSize: bytes.length, sha256, mimeType };
  }
  /** Caller owns the transaction and any resource/user locks; intent is locked last. */
  async finalize(
    manager: EntityManager,
    prepared: PreparedAsset,
    metadata: NewAssetMetadata,
  ): Promise<Asset> {
    const { intent } = prepared;
    if (intent.job_id) {
      const jobs: {
        status: string;
        lease_owner: string;
        lease_expires_at: Date;
        deadline_at: Date;
      }[] = await manager.query(
        'SELECT status,lease_owner,lease_expires_at,deadline_at FROM publication_jobs WHERE id=$1 FOR UPDATE',
        [intent.job_id],
      );
      const clock: { now: Date }[] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const job = jobs[0];
      const now = clock[0].now;
      if (
        !job ||
        job.status !== 'RUNNING' ||
        job.lease_owner !== intent.job_lease_token ||
        job.lease_expires_at <= now ||
        job.deadline_at <= now
      )
        throw new StorageUnavailableError();
    }
    const id = randomUUID();
    const assets: Asset[] = await manager.query(
      `INSERT INTO assets(id,scope,owner_user_id,uploaded_by,assistance_invitation_id,name,kind,object_key,mime_type,byte_size,width,height,sha256,duration_ms,category,attribution)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb) RETURNING *`,
      [
        id,
        metadata.scope,
        metadata.owner_user_id,
        metadata.uploaded_by,
        metadata.assistance_invitation_id,
        metadata.name,
        metadata.kind,
        intent.object_key,
        prepared.mimeType,
        prepared.byteSize,
        metadata.width,
        metadata.height,
        prepared.sha256,
        metadata.duration_ms ?? null,
        metadata.category ?? null,
        metadata.attribution ? JSON.stringify(metadata.attribution) : null,
      ],
    );
    // Newly inserted asset lock precedes the intent lock. Failure rolls back both.
    await manager.query(
      'SELECT id FROM asset_storage_writes WHERE id=$1 FOR UPDATE',
      [intent.id],
    );
    if (intent.job_id) {
      const current: { id: string }[] = await manager.query(
        `SELECT id FROM publication_jobs
        WHERE id=$1 AND status='RUNNING' AND lease_owner=$2 AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp()`,
        [intent.job_id, intent.job_lease_token],
      );
      if (current.length !== 1) throw new StorageUnavailableError();
    }
    const committed: { id: string }[] = await manager.query(
      `WITH committed AS (UPDATE asset_storage_writes SET status='COMMITTED',asset_id=$3
      WHERE id=$1 AND lease_token=$2 AND status='WRITING' AND deadline_at>clock_timestamp() RETURNING id)
      SELECT id FROM committed`,
      [intent.id, intent.lease_token, id],
    );
    if (committed.length !== 1) throw new StorageUnavailableError();
    return assets[0];
  }
  async upload(
    bytes: Buffer,
    mimeType: 'image/webp' | 'image/png' | 'audio/mpeg',
    metadata: NewAssetMetadata,
    context: StorageContext,
  ): Promise<Asset> {
    const prepared = await this.prepare(bytes, mimeType, context);
    return this.db.transaction((manager) =>
      (async () => {
        if (metadata.assistance_invitation_id) {
          const invitation = await requireAssistedInvitation(
            manager,
            metadata.assistance_invitation_id,
            { userId: metadata.uploaded_by, role: 'ADMIN' } as never,
          );
          if (invitation.owner_user_id !== metadata.owner_user_id)
            throw new StorageUnavailableError();
        }
        return this.finalize(manager, prepared, metadata);
      })(),
    );
  }
}
