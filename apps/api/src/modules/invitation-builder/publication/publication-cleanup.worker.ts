import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PublicationCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' && process.env.BUILDER_ENABLE_PUBLICATION_WORKER !== 'true') return;
    this.timer = setInterval(() => { void this.runBatch(); }, 60_000);
    this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async runBatch(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.db.transaction(async (manager) => {
        const expired: { id: string }[] = await manager.query(`SELECT id FROM publication_jobs
          WHERE status IN ('SUCCEEDED','FAILED') AND completed_at<=clock_timestamp()-interval '24 hours'
          ORDER BY completed_at,id FOR UPDATE SKIP LOCKED LIMIT 100`);
        const ids = expired.map((row) => row.id);
        if (!ids.length) return 0;
        await manager.query('DELETE FROM publication_job_asset_refs WHERE job_id=ANY($1::uuid[])', [ids]);
        const deleted: { id: string }[] = await manager.query(`WITH removed AS (
          DELETE FROM publication_jobs WHERE id=ANY($1::uuid[]) AND status IN ('SUCCEEDED','FAILED') RETURNING id
        ) SELECT id FROM removed`, [ids]);
        return deleted.length;
      });
    } finally { this.running = false; }
  }
}
