import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Library taxonomy (FR-016): browsable category plus provenance for seeded open-licence media. */
export class AssetLibraryCategories20261013000100 implements MigrationInterface {
  name = 'AssetLibraryCategories20261013000100';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE assets
        ADD COLUMN category varchar(64),
        ADD COLUMN attribution jsonb,
        ADD CONSTRAINT assets_category_check CHECK(category IS NULL OR (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND scope='TEMPLATE')),
        ADD CONSTRAINT assets_attribution_check CHECK(attribution IS NULL OR (jsonb_typeof(attribution)='object' AND pg_column_size(attribution)<=4096))`,
    );
    await runner.query(
      `CREATE INDEX assets_library_category ON assets(kind,category,created_at DESC,id DESC) WHERE scope='TEMPLATE' AND status='READY'`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`DROP INDEX IF EXISTS assets_library_category`);
    await runner.query(
      `ALTER TABLE assets
        DROP CONSTRAINT IF EXISTS assets_attribution_check,
        DROP CONSTRAINT IF EXISTS assets_category_check,
        DROP COLUMN IF EXISTS attribution,
        DROP COLUMN IF EXISTS category`,
    );
  }
}
