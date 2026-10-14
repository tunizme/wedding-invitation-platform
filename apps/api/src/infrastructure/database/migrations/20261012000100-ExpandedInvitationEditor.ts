import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve original CHECK definitions so downgrade restores the precise prior schema. */
export class ExpandedInvitationEditor20261012000100 implements MigrationInterface {
  name = 'ExpandedInvitationEditor20261012000100';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE editor_legacy_constraints(table_name text NOT NULL,constraint_name text NOT NULL,definition text NOT NULL,PRIMARY KEY(table_name,constraint_name))`,
    );
    const replace = async (table: string, name: string, expression: string) => {
      await runner.query(
        `INSERT INTO editor_legacy_constraints SELECT $1,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname=$2`,
        [table, name],
      );
      await runner.query(
        `ALTER TABLE ${table} DROP CONSTRAINT ${name}, ADD CONSTRAINT ${name} CHECK(${expression})`,
      );
    };
    for (const [table, column, versions, bytes, nullable] of [
      ['invitation_templates', 'draft_document', '1,2,3', 1048576, false],
      ['template_design_revisions', 'document', '1,2,3', 1048576, false],
      ['publication_jobs', 'candidate_document', '1,2,3', 1048576, true],
      ['invitation_templates', 'draft_sample_data', '1,2', 262144, false],
      ['template_design_revisions', 'sample_data', '1,2', 262144, false],
      ['publication_jobs', 'candidate_data', '1,2', 262144, true],
      ['invitations', 'draft_wedding_data', '1,2', 262144, false],
      ['invitations', 'published_wedding_data', '1,2', 262144, true],
    ] as const) {
      const allowed = versions
        .split(',')
        .map((v) => `'${v}'`)
        .join(',');
      const check = `jsonb_typeof(${column})='object' AND jsonb_typeof(${column}->'schemaVersion')='number' AND COALESCE(${column}->>'schemaVersion','') IN (${allowed}) AND builder_json_bytes(${column})<=${bytes}${table === 'template_design_revisions' && column === 'document' ? " AND document @> jsonb_build_object('schemaVersion',schema_version)" : ''}`;
      await replace(
        table,
        `${table}_${column}_check`,
        nullable ? `${column} IS NULL OR (${check})` : check,
      );
    }
    await replace(
      'template_design_revisions',
      'template_design_revisions_schema_version_check',
      'schema_version IN (1,2,3)',
    );
    await replace(
      'template_design_revisions',
      'template_design_revisions_renderer_contract_version_check',
      'renderer_contract_version=schema_version AND renderer_contract_version IN (1,2,3)',
    );
    await replace(
      'invitations',
      'invitations_published_scene_check',
      `published_scene IS NULL OR (jsonb_typeof(published_scene)='object' AND jsonb_typeof(published_scene->'schemaVersion')='number' AND jsonb_typeof(published_scene->'rendererContractVersion')='number' AND COALESCE(published_scene->>'schemaVersion','') IN ('1','2','3') AND published_scene->>'schemaVersion'=COALESCE(published_scene->>'rendererContractVersion',''))`,
    );
    await runner.query(`ALTER TABLE assets ADD COLUMN duration_ms integer`);
    await replace(
      'assets',
      'assets_kind_check',
      `kind IN ('IMAGE','DECORATION','BACKGROUND','THUMBNAIL','AUDIO')`,
    );
    await replace(
      'assets',
      'assets_mime_type_check',
      `mime_type IN ('image/webp','image/png','audio/mpeg')`,
    );
    await replace(
      'assets',
      'assets_width_check',
      `(kind='AUDIO' AND width=0) OR (kind<>'AUDIO' AND width>0)`,
    );
    await replace(
      'assets',
      'assets_height_check',
      `(kind='AUDIO' AND height=0) OR (kind<>'AUDIO' AND height>0)`,
    );
    for (const table of ['assets', 'asset_storage_writes'])
      await replace(
        table,
        `${table}_object_key_check`,
        String.raw`object_key ~ '^[a-z0-9-]+(/[a-z0-9-]+)*\.(webp|png|mp3)$'`,
      );
    const constraintValue: unknown = await runner.query(
      `SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='assets'::regclass AND contype='c'`,
    );
    const constraints = constraintValue as {
      conname: string;
      definition: string;
    }[];
    const pairing = constraints.find(
      (c) =>
        c.definition.includes('mime_type') &&
        c.definition.includes('THUMBNAIL'),
    );
    if (!pairing) throw new Error('Missing asset MIME-kind constraint');
    await replace(
      'assets',
      pairing.conname,
      `(kind='THUMBNAIL' AND mime_type='image/png') OR (kind='AUDIO' AND mime_type='audio/mpeg') OR (kind NOT IN ('THUMBNAIL','AUDIO') AND mime_type='image/webp')`,
    );
    await runner.query(
      `CREATE FUNCTION editor_audio_duration_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.duration_ms IS DISTINCT FROM OLD.duration_ms THEN RAISE EXCEPTION 'Audio duration is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE TRIGGER editor_audio_duration_immutable BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION editor_audio_duration_immutable()`,
    );
    await runner.query(
      `ALTER TABLE assets ADD CONSTRAINT assets_duration_check CHECK((kind='AUDIO' AND duration_ms IS NOT NULL AND duration_ms BETWEEN 1 AND 600000 AND byte_size<=20971520) OR (kind<>'AUDIO' AND duration_ms IS NULL))`,
    );
    await runner.query(`
      CREATE TABLE editor_presets(id uuid PRIMARY KEY,name varchar(120) NOT NULL,category varchar(64) NOT NULL,edit_version integer NOT NULL DEFAULT 1 CHECK(edit_version>0),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE TABLE editor_preset_revisions(id uuid PRIMARY KEY,preset_id uuid NOT NULL REFERENCES editor_presets(id) ON DELETE CASCADE,revision integer NOT NULL,document jsonb NOT NULL CHECK(document @> '{"schemaVersion":3}'::jsonb AND builder_json_bytes(document)<=1048576),UNIQUE(preset_id,revision));
      CREATE TABLE editor_preset_asset_refs(revision_id uuid NOT NULL REFERENCES editor_preset_revisions(id) ON DELETE CASCADE,asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,PRIMARY KEY(revision_id,asset_id));
      CREATE TABLE invitation_wishes(id uuid PRIMARY KEY,invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,request_key uuid NOT NULL,request_hash char(64) NOT NULL,name varchar(120) NOT NULL,message varchar(1000) NOT NULL,status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','HIDDEN')),source_hash bytea,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(invitation_id,request_key));
      CREATE INDEX invitation_wishes_page ON invitation_wishes(invitation_id,created_at DESC,id DESC);
      CREATE TABLE invitation_likes(invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,browser_hash bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(invitation_id,browser_hash));
      CREATE TABLE invitation_form_responses(id uuid PRIMARY KEY,invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,node_id uuid NOT NULL,public_version integer NOT NULL,definition jsonb NOT NULL,answers jsonb NOT NULL CHECK(builder_json_bytes(answers)<=16384),request_key uuid NOT NULL,request_hash char(64) NOT NULL,source_hash bytea,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(invitation_id,request_key));
      CREATE INDEX invitation_form_page ON invitation_form_responses(invitation_id,created_at DESC,id DESC);
      CREATE TABLE invitation_interaction_rate(invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,kind varchar(12) NOT NULL,source_hash bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
      CREATE INDEX invitation_interaction_rate_lookup ON invitation_interaction_rate(invitation_id,kind,source_hash,created_at);
      CREATE TABLE invitation_moderation_events(id uuid PRIMARY KEY,invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,wish_id uuid NOT NULL REFERENCES invitation_wishes(id) ON DELETE CASCADE,actor_id uuid NOT NULL REFERENCES users(id),previous_status varchar(10) NOT NULL,new_status varchar(10) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    const rowValue: unknown = await runner.query(`SELECT EXISTS(
      SELECT 1 FROM invitation_templates WHERE draft_document->>'schemaVersion'='3' OR draft_sample_data->>'schemaVersion'='2'
      UNION ALL SELECT 1 FROM template_design_revisions WHERE schema_version=3 OR sample_data->>'schemaVersion'='2'
      UNION ALL SELECT 1 FROM invitations WHERE published_scene->>'schemaVersion'='3' OR draft_wedding_data->>'schemaVersion'='2' OR published_wedding_data->>'schemaVersion'='2'
      UNION ALL SELECT 1 FROM publication_jobs WHERE candidate_document->>'schemaVersion'='3' OR candidate_data->>'schemaVersion'='2'
      UNION ALL SELECT 1 FROM assets WHERE kind='AUDIO'
      UNION ALL SELECT 1 FROM asset_storage_writes WHERE object_key LIKE '%.mp3'
      UNION ALL SELECT 1 FROM editor_presets
      UNION ALL SELECT 1 FROM invitation_wishes
      UNION ALL SELECT 1 FROM invitation_likes
      UNION ALL SELECT 1 FROM invitation_form_responses
    ) AS present`);
    const rows = rowValue as { present: boolean }[];
    if (rows[0].present)
      throw new Error(
        'Cannot downgrade expanded editor with retained editor-document/content2/media/interaction data. Keep compatible readers.',
      );
    await runner.query(
      'DROP TABLE invitation_interaction_rate,invitation_moderation_events,invitation_form_responses,invitation_likes,invitation_wishes,editor_preset_asset_refs,editor_preset_revisions,editor_presets',
    );
    await runner.query(
      'DROP TRIGGER editor_audio_duration_immutable ON assets; DROP FUNCTION editor_audio_duration_immutable(); ALTER TABLE assets DROP CONSTRAINT assets_duration_check, DROP COLUMN duration_ms',
    );
    const constraintValue: unknown = await runner.query(
      'SELECT * FROM editor_legacy_constraints ORDER BY table_name,constraint_name',
    );
    const constraints = constraintValue as {
      table_name: string;
      constraint_name: string;
      definition: string;
    }[];
    for (const c of constraints)
      await runner.query(
        `ALTER TABLE ${c.table_name} DROP CONSTRAINT ${c.constraint_name}, ADD CONSTRAINT ${c.constraint_name} ${c.definition}`,
      );
    await runner.query('DROP TABLE editor_legacy_constraints');
  }
}
