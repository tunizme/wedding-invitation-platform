import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';

export function databaseOptions(
  databaseUrl = process.env.DATABASE_URL,
): DataSourceOptions {
  if (!databaseUrl) {
    throw new Error(
      'Invalid backend environment configuration: DATABASE_URL. Copy apps/api/.env.example to apps/api/.env and provide a valid value.',
    );
  }
  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    migrationsRun: false,
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
