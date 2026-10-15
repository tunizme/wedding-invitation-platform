import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CascadeAudioDeletion20261014000200 implements MigrationInterface {
  name = 'CascadeAudioDeletion20261014000200';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE OR REPLACE FUNCTION builder_deleting_asset() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT id::text FROM assets WHERE id::text=current_setting('builder.deleting_asset',true)
        AND status='DELETING' AND kind IN ('IMAGE','DECORATION','BACKGROUND','AUDIO')
    $$`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE OR REPLACE FUNCTION builder_deleting_asset() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT id::text FROM assets WHERE id::text=current_setting('builder.deleting_asset',true)
        AND status='DELETING' AND kind IN ('IMAGE','DECORATION','BACKGROUND')
    $$`);
  }
}
