import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AssetObjectMissingError,
  StorageUnavailableError,
} from '../../../src/modules/invitation-assets/domain/asset-store.port';
import { AssetCleanupWorker } from '../../../src/modules/invitation-assets/infrastructure/asset-cleanup.worker';
import { PublicationCleanupWorker } from '../../../src/modules/invitation-builder/publication/publication-cleanup.worker';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { fixtureBytes } from '../../fixtures/invitation-builder/candidates';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;

describe.sequential('asset and receipt cleanup races', () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<Fixture['user']>>;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
  });
  afterAll(async () => {
    await f?.close();
  });

  it('retains a deleting tombstone after storage failure and retries its immutable key', async () => {
    const asset = await f.asset(admin.principal),
      remove = f.store.delete.bind(f.store);
    f.store.delete = () => Promise.reject(new StorageUnavailableError());
    try {
      await request(f.app.getHttpServer())
        .delete(`/api/v1/assets/${asset.id}`)
        .set(admin.headers)
        .expect(503);
    } finally {
      f.store.delete = remove;
    }
    const worker = f.app.get(AssetCleanupWorker);
    expect(await worker.runBatch()).toMatchObject({ tombstones: 1 });
    const rows = await f.db.query<{ status: string; deleted_at: Date }[]>(
      'SELECT status,deleted_at FROM assets WHERE id=$1',
      [asset.id],
    );
    expect(rows[0].status).toBe('DELETED');
    expect(rows[0].deleted_at).toBeTruthy();
  });

  it('keeps an abandoned object for its grace period, then retries deletion by the retained key', async () => {
    const bytes = await sharp(fixtureBytes()).webp().toBuffer();
    const prepared = await f.writer.prepare(bytes, 'image/webp', {
      deadline: Date.now() + 10000,
    });
    await f.db.query(
      `UPDATE asset_storage_writes SET status='ABANDONED',cleaned_at=clock_timestamp()-interval '2 hours' WHERE id=$1`,
      [prepared.intent.id],
    );
    const worker = f.app.get(AssetCleanupWorker);
    expect(await worker.runBatch()).toMatchObject({ writes: 1 });
    await expect(
      f.store.get(prepared.intent.object_key, bytes.length, {
        deadline: Date.now() + 5000,
      }),
    ).rejects.toBeInstanceOf(AssetObjectMissingError);
    const rows = await f.db.query<{ status: string; object_key: string }[]>(
      'SELECT status,object_key FROM asset_storage_writes WHERE id=$1',
      [prepared.intent.id],
    );
    expect(rows[0]).toMatchObject({
      status: 'ABANDONED',
      object_key: prepared.intent.object_key,
    });
  });

  it('expires old publication receipts in bounded batches after removing their asset refs', async () => {
    const template = await f.template(admin.principal),
      operation = await request(f.app.getHttpServer())
        .post(`/api/v1/admin/templates/${template.id}/publish`)
        .set(admin.headers)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 1 })
        .expect(202);
    const jobId = (operation.body as { id: string }).id,
      asset = await f.asset(admin.principal);
    await f.db.query(
      `UPDATE publication_jobs SET status='FAILED',error_code='RENDER_UNAVAILABLE',completed_at=clock_timestamp()-interval '25 hours',
      candidate_document=NULL,candidate_data=NULL WHERE id=$1`,
      [jobId],
    );
    await f.db.query(
      'INSERT INTO publication_job_asset_refs(job_id,asset_id) VALUES($1,$2)',
      [jobId, asset.id],
    );
    expect(await f.app.get(PublicationCleanupWorker).runBatch()).toBe(1);
    expect(
      await f.db.query('SELECT id FROM publication_jobs WHERE id=$1', [jobId]),
    ).toEqual([]);
    expect(
      await f.db.query(
        'SELECT job_id FROM publication_job_asset_refs WHERE job_id=$1',
        [jobId],
      ),
    ).toEqual([]);
  });

  it('serializes cover assignment with deletion so exactly one mutation wins', async () => {
    const asset = await f.asset(admin.principal),
      template = await f.template(admin.principal);
    const [assign, remove] = await Promise.all([
      request(f.app.getHttpServer())
        .patch(`/api/v1/admin/templates/${template.id}`)
        .set(admin.headers)
        .send({ expectedVersion: 1, coverAssetId: asset.id }),
      request(f.app.getHttpServer())
        .delete(`/api/v1/assets/${asset.id}`)
        .set(admin.headers),
    ]);
    const updated = await f.db.query<{ cover_asset_id: string | null }[]>(
      'SELECT cover_asset_id FROM invitation_templates WHERE id=$1',
      [template.id],
    );
    const stored = await f.db.query<{ status: string }[]>(
      'SELECT status FROM assets WHERE id=$1',
      [asset.id],
    );
    if (assign.status === 200) {
      expect(remove.status).toBe(409);
      expect(updated[0].cover_asset_id).toBe(asset.id);
      expect(stored[0].status).toBe('READY');
    } else {
      expect(assign.status).toBe(422);
      expect(remove.status).toBe(204);
      expect(updated[0].cover_asset_id).toBeNull();
      expect(stored[0].status).toBe('DELETED');
    }
  });

  it('keeps a successful object write unreachable when its SQL finalize rolls back', async () => {
    const bytes = await sharp(fixtureBytes()).webp().toBuffer();
    const prepared = await f.writer.prepare(bytes, 'image/webp', {
      deadline: Date.now() + 10000,
    });
    await expect(
      f.db.transaction(async (manager) => {
        await f.writer.finalize(manager, prepared, {
          scope: 'TEMPLATE',
          owner_user_id: admin.id,
          uploaded_by: admin.id,
          assistance_invitation_id: null,
          name: 'Rollback image',
          kind: 'IMAGE',
          width: 80,
          height: 60,
        });
        throw new Error('force SQL rollback');
      }),
    ).rejects.toThrow('force SQL rollback');
    expect(
      await f.db.query('SELECT id FROM assets WHERE object_key=$1', [
        prepared.intent.object_key,
      ]),
    ).toEqual([]);
    expect(
      await f.store.head(prepared.intent.object_key, {
        deadline: Date.now() + 5000,
      }),
    ).toBeTruthy();
    const intent = await f.db.query<{ status: string }[]>(
      'SELECT status FROM asset_storage_writes WHERE id=$1',
      [prepared.intent.id],
    );
    expect(intent[0].status).toBe('WRITING');
  });

  it('reclaims an ambiguous successful PutObject only after the abandoned-write grace', async () => {
    const bytes = await sharp(fixtureBytes()).webp().toBuffer();
    const original = f.store.put.bind(f.store);
    f.store.put = async (...args) => {
      await original(...args);
      throw new StorageUnavailableError();
    };
    try {
      await expect(
        f.writer.prepare(bytes, 'image/webp', { deadline: Date.now() + 3000 }),
      ).rejects.toBeInstanceOf(StorageUnavailableError);
    } finally {
      f.store.put = original;
    }
    const rows = await f.db.query<
      { id: string; object_key: string }[]
    >(`SELECT id,object_key FROM asset_storage_writes
      WHERE status='WRITING' ORDER BY created_at DESC,id DESC LIMIT 1`);
    const intent = rows[0];
    expect(intent).toBeTruthy();
    expect(
      await f.store.head(intent.object_key, { deadline: Date.now() + 5000 }),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 3100));
    const worker = f.app.get(AssetCleanupWorker);
    await worker.runBatch();
    expect(
      await f.store.head(intent.object_key, { deadline: Date.now() + 5000 }),
    ).toBeTruthy();
    await f.db.query(
      `UPDATE asset_storage_writes SET cleaned_at=clock_timestamp()-interval '2 hours' WHERE id=$1 AND status='ABANDONED'`,
      [intent.id],
    );
    expect(await worker.runBatch()).toMatchObject({ writes: 1 });
    await expect(
      f.store.get(intent.object_key, bytes.length, {
        deadline: Date.now() + 5000,
      }),
    ).rejects.toBeInstanceOf(AssetObjectMissingError);
  });
});
