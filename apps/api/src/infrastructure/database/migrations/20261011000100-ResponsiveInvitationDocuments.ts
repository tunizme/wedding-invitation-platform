import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ResponsiveInvitationDocuments20261011000100 implements MigrationInterface {
  name = 'ResponsiveInvitationDocuments20261011000100';
  private async constraints(runner: QueryRunner, responsive: boolean) {
    const version = (column: string) =>
      responsive
        ? `(${column} @> '{"schemaVersion":1}'::jsonb OR ${column} @> '{"schemaVersion":2}'::jsonb)`
        : `${column} @> '{"schemaVersion":1}'::jsonb`;
    await runner.query(`ALTER TABLE invitation_templates DROP CONSTRAINT invitation_templates_draft_document_check,
   ADD CONSTRAINT invitation_templates_draft_document_check CHECK(jsonb_typeof(draft_document)='object' AND ${version('draft_document')} AND builder_json_bytes(draft_document)<=1048576)`);
    await runner.query(`ALTER TABLE template_design_revisions
   DROP CONSTRAINT template_design_revisions_schema_version_check,
   DROP CONSTRAINT template_design_revisions_document_check,
   DROP CONSTRAINT template_design_revisions_renderer_contract_version_check,
   ADD CONSTRAINT template_design_revisions_schema_version_check CHECK(schema_version ${responsive ? 'IN (1,2)' : '=1'}),
   ADD CONSTRAINT template_design_revisions_document_check CHECK(jsonb_typeof(document)='object' AND ${version('document')} AND document @> jsonb_build_object('schemaVersion',schema_version) AND builder_json_bytes(document)<=1048576),
   ADD CONSTRAINT template_design_revisions_renderer_contract_version_check CHECK(renderer_contract_version=schema_version AND renderer_contract_version ${responsive ? 'IN (1,2)' : '=1'})`);
    await runner.query(`ALTER TABLE publication_jobs DROP CONSTRAINT publication_jobs_candidate_document_check,
   ADD CONSTRAINT publication_jobs_candidate_document_check CHECK(candidate_document IS NULL OR (jsonb_typeof(candidate_document)='object' AND ${version('candidate_document')} AND builder_json_bytes(candidate_document)<=1048576))`);
    const pair = responsive
      ? `(published_scene @> '{"schemaVersion":1,"rendererContractVersion":1}'::jsonb OR published_scene @> '{"schemaVersion":2,"rendererContractVersion":2}'::jsonb)`
      : `published_scene @> '{"schemaVersion":1,"rendererContractVersion":1}'::jsonb`;
    await runner.query(`ALTER TABLE invitations DROP CONSTRAINT invitations_published_scene_check,
   ADD CONSTRAINT invitations_published_scene_check CHECK(published_scene IS NULL OR (jsonb_typeof(published_scene)='object' AND ${pair}))`);
  }
  async up(runner: QueryRunner): Promise<void> {
    await this.constraints(runner, true);
  }
  async down(runner: QueryRunner): Promise<void> {
    const rows: unknown = await runner.query(`SELECT EXISTS(
   SELECT 1 FROM invitation_templates WHERE draft_document @> '{"schemaVersion":2}'::jsonb
   UNION ALL SELECT 1 FROM template_design_revisions WHERE schema_version=2 OR renderer_contract_version=2 OR document @> '{"schemaVersion":2}'::jsonb
   UNION ALL SELECT 1 FROM publication_jobs WHERE candidate_document @> '{"schemaVersion":2}'::jsonb
   UNION ALL SELECT 1 FROM invitations WHERE published_scene @> '{"schemaVersion":2}'::jsonb
  ) AS present`);
    const row = (rows as { present: boolean }[])[0];
    if (row.present)
      throw new Error(
        'Cannot downgrade responsive documents while v2 rows exist. Keep compatible readers.',
      );
    await this.constraints(runner, false);
  }
}
