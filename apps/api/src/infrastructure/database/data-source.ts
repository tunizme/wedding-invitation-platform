import { rsvpEntities } from '../../modules/invitation-rsvp/domain/entities';
import 'dotenv/config';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { identityEntities } from '../../modules/identity-access/domain/entities';
import { invitationBuilderEntities } from '../../modules/invitation-builder/domain/entities';
import { publicationEntities } from '../../modules/invitation-builder/publication/entities';
import { invitationEntities } from '../../modules/invitations/domain/entities';
import { invitationAssetEntities } from '../../modules/invitation-assets/domain/entities';

export function databaseOptions(
  databaseUrl = process.env.DATABASE_URL,
): DataSourceOptions {
  if (!databaseUrl) {
    throw new Error(
      'Invalid backend environment configuration: DATABASE_URL. Copy apps/api/.env.example to apps/api/.env and provide a valid value.',
    );
  }
  const iamSchema = process.env.IAM_TEST_SCHEMA;
  const builderSchema = process.env.BUILDER_TEST_SCHEMA;
  if (iamSchema && builderSchema) {
    throw new Error(
      'IAM_TEST_SCHEMA and BUILDER_TEST_SCHEMA are mutually exclusive.',
    );
  }
  if (
    iamSchema &&
    (process.env.NODE_ENV !== 'test' ||
      !/^iam_test_[a-f0-9]{32}$/.test(iamSchema))
  ) {
    throw new Error('IAM_TEST_SCHEMA is only allowed for isolated test runs.');
  }
  if (
    builderSchema &&
    (process.env.NODE_ENV !== 'test' ||
      !/^builder_test_[a-f0-9]{32}$/.test(builderSchema))
  ) {
    throw new Error(
      'BUILDER_TEST_SCHEMA is only allowed for isolated test runs.',
    );
  }
  const testSchema = iamSchema ?? builderSchema;
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
    entities: [
      ...identityEntities,
      ...invitationBuilderEntities,
      ...publicationEntities,
      ...invitationEntities,
      ...rsvpEntities,
      ...invitationAssetEntities,
    ],
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
