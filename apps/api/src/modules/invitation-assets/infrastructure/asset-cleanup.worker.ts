import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ASSET_STORE, type AssetStore } from '../domain/asset-store.port';
import { AssetReferenceService } from '../application/asset-reference.service';
import type { Asset } from '../domain/entities';

@Injectable()
export class AssetCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ASSET_STORE) private readonly store: AssetStore,
    @Inject(AssetReferenceService) private readonly references: AssetReferenceService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' && process.env.BUILDER_ENABLE_PUBLICATION_WORKER !== 'true') return;
    this.timer = setInterval(() => { void this.runBatch(); }, 60_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async runBatch(): Promise<{ tombstones: number; writes: number }> {
    if (this.running) return { tombstones: 0, writes: 0 };
    this.running = true;
    try {
      const tombstones: Asset[] = await this.db.query(`SELECT * FROM assets WHERE status='DELETING' ORDER BY created_at,id LIMIT 100`);
      let deleted = 0;
      for (const asset of tombstones) {
        try {
          await this.references.finishDelete(asset, { deadline: Date.now() + 10_000 });
          deleted++;
        } catch { /* Keep the tombstone and retry on the next bounded pass. */ }
      }
      const abandoned: { id: string; object_key: string }[] = await this.db.transaction(async (manager) => {
        await manager.query(`WITH expired AS (
          SELECT id FROM asset_storage_writes WHERE status='WRITING' AND deadline_at<=clock_timestamp()
          ORDER BY deadline_at,id FOR UPDATE SKIP LOCKED LIMIT 100
        ) UPDATE asset_storage_writes writes SET status='ABANDONED',cleaned_at=clock_timestamp()
          FROM expired WHERE writes.id=expired.id`);
        return manager.query(`SELECT id,object_key FROM asset_storage_writes
          WHERE status='ABANDONED' AND cleaned_at<=clock_timestamp()-interval '1 hour'
          ORDER BY cleaned_at,id LIMIT 100`);
      });
      let cleaned = 0;
      for (const write of abandoned) {
        try {
          await this.store.delete(write.object_key, { deadline: Date.now() + 10_000 });
          await this.db.query(`UPDATE asset_storage_writes SET cleaned_at=clock_timestamp()
            WHERE id=$1 AND status='ABANDONED' AND object_key=$2`, [write.id, write.object_key]);
          cleaned++;
        } catch { /* The durable intent retains its immutable key for retry. */ }
      }
      return { tombstones: deleted, writes: cleaned };
    } finally { this.running = false; }
  }
}
