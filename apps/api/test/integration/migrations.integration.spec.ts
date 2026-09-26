import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../src/infrastructure/database/data-source';

describe.sequential('migration lifecycle', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(databaseOptions());
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('applies the baseline and makes repeated runs idempotent', async () => {
    await dataSource.runMigrations();
    expect(await dataSource.showMigrations()).toBe(false);
    expect(await dataSource.runMigrations()).toHaveLength(0);
    const rows: unknown = await dataSource.query(
      `SELECT name FROM foundation_migrations WHERE name = 'InitialFoundation20260923000000'`,
    );
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('can revert and reapply the latest migration', async () => {
    await dataSource.undoLastMigration();
    expect(await dataSource.showMigrations()).toBe(true);
    await dataSource.runMigrations();
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('does not create business tables', async () => {
    const rawRows: unknown = await dataSource.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const rows = rawRows as Array<{ tablename: string }>;
    expect(rows.map((row) => row.tablename)).not.toEqual(
      expect.arrayContaining([
        'user',
        'invitation',
        'payment',
        'vnpay_transaction',
      ]),
    );
  });
});
