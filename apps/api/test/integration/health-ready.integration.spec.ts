import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthService } from '../../src/health/health.service';
import { databaseOptions } from '../../src/infrastructure/database/data-source';

describe('backend readiness', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(databaseOptions());
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('reports ready with a real PostgreSQL connection', async () => {
    const health = new HealthService(
      dataSource,
      new ConfigService({ DATABASE_HEALTH_TIMEOUT_MS: 1000 }),
    );
    await expect(health.readiness()).resolves.toMatchObject({
      status: 'ready',
      checks: { database: 'up' },
    });
  });

  it('returns a sanitized not-ready result when PostgreSQL is unavailable', async () => {
    const unavailable = {
      query: () => Promise.reject(new Error('secret connection details')),
    };
    const health = new HealthService(
      unavailable as unknown as DataSource,
      new ConfigService({ DATABASE_HEALTH_TIMEOUT_MS: 50 }),
    );
    const result = await health.readiness();
    expect(result).toMatchObject({
      status: 'not_ready',
      checks: { database: 'down' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret|connection|password|postgresql:/i,
    );
  });
});
