import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
@Injectable()
export class RsvpRetentionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly logger = new Logger(RsvpRetentionWorker.name);
  constructor(@Inject(DataSource) private readonly db: DataSource) {}
  onApplicationBootstrap() {
    this.schedule(60000);
  }
  private schedule(delay = 3600000) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .then(() => {})
        .catch(() => {
          this.logger.warn('RSVP_RETENTION_FAILED');
        })
        .finally(() => {
          this.running = undefined;
          this.schedule();
        });
    }, delay);
    this.timer.unref();
  }
  async onApplicationShutdown() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
  async runOnce(): Promise<number> {
    return this.db.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout='5s'");
      const rows: { count: number }[] =
        await manager.query(`WITH batch AS (SELECT id FROM rsvp_responses WHERE source_hash IS NOT NULL AND created_at<clock_timestamp()-interval '24 hours'
 ORDER BY created_at,id LIMIT 500 FOR UPDATE SKIP LOCKED)
  , changed AS (UPDATE rsvp_responses r SET source_hash=NULL FROM batch WHERE r.id=batch.id RETURNING r.id) SELECT count(*)::int AS count FROM changed`);
      return rows[0].count;
    });
  }
}
