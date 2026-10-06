import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RetainUnpublishedTemplateRevision20261004000100 implements MigrationInterface {
  name = 'RetainUnpublishedTemplateRevision20261004000100';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ DECLARE pointer_check record; BEGIN
        FOR pointer_check IN
          SELECT conname FROM pg_constraint
          WHERE conrelid='invitation_templates'::regclass AND contype='c'
            AND pg_get_constraintdef(oid) LIKE '%published_revision_id%'
        LOOP EXECUTE format('ALTER TABLE invitation_templates DROP CONSTRAINT %I', pointer_check.conname); END LOOP;
      END $$;
      UPDATE invitation_templates AS template SET published_revision_id=(
        SELECT revision.id FROM template_design_revisions AS revision
        WHERE revision.template_id=template.id
        ORDER BY revision.revision_number DESC, revision.id DESC LIMIT 1
      ) WHERE template.status='UNPUBLISHED';
      -- The old action allowed unpublishing a never-published draft. Those rows
      -- have no retained revision and are restored to their actual DRAFT state.
      UPDATE invitation_templates SET status='DRAFT'
        WHERE status='UNPUBLISHED' AND published_revision_id IS NULL;
      ALTER TABLE invitation_templates ADD CONSTRAINT template_retained_revision_check
        CHECK ((status='DRAFT')=(published_revision_id IS NULL));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invitation_templates DROP CONSTRAINT template_retained_revision_check;
      UPDATE invitation_templates SET published_revision_id=NULL WHERE status='UNPUBLISHED';
      ALTER TABLE invitation_templates ADD CONSTRAINT template_publication_pointer_check
        CHECK ((status='PUBLISHED')=(published_revision_id IS NOT NULL));
    `);
  }
}
