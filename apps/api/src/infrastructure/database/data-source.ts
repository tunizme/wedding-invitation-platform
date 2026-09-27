import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { identityEntities } from '../../modules/identity-access/domain/entities';

export function databaseOptions(
  databaseUrl = process.env.DATABASE_URL,
): DataSourceOptions {
  if (!databaseUrl) {
    throw new Error(
      'Invalid backend environment configuration: DATABASE_URL. Copy apps/api/.env.example to apps/api/.env and provide a valid value.',
    );
  }
  const testSchema = process.env.IAM_TEST_SCHEMA;
  if (
    testSchema &&
    (process.env.NODE_ENV !== 'test' ||
      !/^iam_test_[a-f0-9]{32}$/.test(testSchema))
  ) {
    throw new Error('IAM_TEST_SCHEMA is only allowed for isolated test runs.');
  }
  return {
    type: 'postgres',
    url: databaseUrl,
    ...(testSchema
      ? {
          schema: testSchema,
          extra: { options: `-c search_path=${testSchema}` },
        }
      : {}),
    synchronize: false,
    migrationsRun: false,
    entities: identityEntities,
    migrationsTableName: 'foundation_migrations',
    migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  };
}

const cliDatabaseUrl =
  process.env.DATABASE_URL ??
  (process.env.VITEST === 'true'
    ? 'postgresql://test:test@127.0.0.1:1/test'
    : undefined);

export default new DataSource(databaseOptions(cliDatabaseUrl));
