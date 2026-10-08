import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Unknown late-arriving slot cookies are capacity records without a known owner. */
export class NullableUnknownSlotOwner20261007000200 implements MigrationInterface {
  name = 'NullableUnknownSlotOwner20261007000200';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      DO $$ DECLARE row record; BEGIN
        FOR row IN
          SELECT conname FROM pg_constraint
          WHERE conrelid='auth_cookie_names'::regclass AND contype='c'
            AND pg_get_constraintdef(oid) LIKE '%owner_session_id IS NOT NULL%'
        LOOP
          EXECUTE format('ALTER TABLE auth_cookie_names DROP CONSTRAINT %I', row.conname);
        END LOOP;
      END $$;
      ALTER TABLE auth_cookie_names ADD CONSTRAINT auth_cookie_names_owner_check
        CHECK ((kind='BINDING' AND owner_context_id IS NOT NULL AND owner_session_id IS NULL)
            OR kind='SLOT');
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const options = runner.connection.options;
    if (
      process.env.NODE_ENV !== 'test' ||
      !('schema' in options) ||
      typeof options.schema !== 'string' ||
      !/^iam_test_[a-f0-9]{32}$/.test(options.schema)
    )
      throw new Error(
        'Auth transition rollback requires an isolated disposable test schema.',
      );
    await runner.query(`
      DELETE FROM auth_cookie_names WHERE kind='SLOT' AND owner_session_id IS NULL;
      ALTER TABLE auth_cookie_names DROP CONSTRAINT auth_cookie_names_owner_check;
      ALTER TABLE auth_cookie_names ADD CONSTRAINT auth_cookie_names_owner_check
        CHECK ((kind='BINDING' AND owner_context_id IS NOT NULL AND owner_session_id IS NULL)
            OR (kind='SLOT' AND owner_session_id IS NOT NULL));
    `);
  }
}
