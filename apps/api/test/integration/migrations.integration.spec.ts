import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseOptions } from '../../src/infrastructure/database/data-source';

describe.sequential('migration lifecycle', () => {
  let dataSource: DataSource;
  let control: DataSource;
  let ownedSchema: string | undefined;

  beforeAll(async () => {
    const options = databaseOptions();
    // Rollback is intentionally allowed only in disposable IAM schemas. Give
    // this destructive lifecycle test its own schema, including under builder
    // checkpoints, so it never rewinds another suite's tables/migration ledger.
    if (
      process.env.NODE_ENV !== 'test' ||
      options.type !== 'postgres' ||
      typeof options.schema !== 'string' ||
      !/^(iam|builder)_test_[a-f0-9]{32}$/.test(options.schema)
    )
      throw new Error(
        'Migration lifecycle requires a runner-owned test schema.',
      );
    control = new DataSource(options);
    await control.initialize();
    const schema = `iam_test_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA "${schema}"`);
    ownedSchema = schema;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const isolated = databaseOptions(url.toString());
    if (isolated.type !== 'postgres') throw new Error('PostgreSQL required.');
    dataSource = new DataSource({
      ...isolated,
      schema,
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    try {
      if (dataSource?.isInitialized) await dataSource.destroy();
    } finally {
      if (control?.isInitialized) {
        try {
          if (ownedSchema)
            await control.query(`DROP SCHEMA "${ownedSchema}" CASCADE`);
        } finally {
          await control.destroy();
        }
      }
    }
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

  it('does not create out-of-scope payment tables', async () => {
    const rawRows: unknown = await dataSource.query(
      'SELECT tablename FROM pg_tables WHERE schemaname = current_schema()',
    );
    const rows = rawRows as Array<{ tablename: string }>;
    for (const forbidden of ['payment', 'payments', 'vnpay_transaction']) {
      expect(rows.map((row) => row.tablename)).not.toContain(forbidden);
    }
  });
});
