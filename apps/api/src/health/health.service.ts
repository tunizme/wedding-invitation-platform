import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  checks: { database: 'up' | 'down' };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  liveness() {
    return {
      status: 'ok' as const,
      component: 'backend' as const,
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessResult> {
    const timeoutMs = this.config.get<number>(
      'DATABASE_HEALTH_TIMEOUT_MS',
      1000,
    );
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('database health timeout')),
            timeoutMs,
          );
        }),
      ]);
      return {
        status: 'ready',
        checks: { database: 'up' },
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: 'not_ready',
        checks: { database: 'down' },
        timestamp: new Date().toISOString(),
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
