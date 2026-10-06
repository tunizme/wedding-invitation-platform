import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InvitationBuilderCore20261001000100 implements MigrationInterface {
  name = 'InvitationBuilderCore20261001000100';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE FUNCTION builder_json_bytes(value jsonb) RETURNS bigint
      LANGUAGE plpgsql IMMUTABLE STRICT AS $$
      DECLARE result bigint;
      BEGIN
        CASE jsonb_typeof(value)
          WHEN 'object' THEN
            SELECT 2 + COALESCE(sum(octet_length(to_jsonb(key)::text) + 1 + builder_json_bytes(item)),0)
              + GREATEST(count(*)-1,0) INTO result FROM jsonb_each(value) AS pairs(key,item);
          WHEN 'array' THEN
            SELECT 2 + COALESCE(sum(builder_json_bytes(item)),0) + GREATEST(count(*)-1,0)
              INTO result FROM jsonb_array_elements(value) AS items(item);
          ELSE result := octet_length(value::text);
        END CASE;
        RETURN result;
      END $$;
      CREATE FUNCTION builder_tags_valid(value jsonb) RETURNS boolean
      LANGUAGE plpgsql IMMUTABLE STRICT AS $$
      BEGIN
        IF jsonb_typeof(value) <> 'array' OR jsonb_array_length(value)>20 THEN RETURN false; END IF;
        RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(value) tag
          WHERE jsonb_typeof(tag)<>'string' OR char_length(tag #>> '{}') NOT BETWEEN 1 AND 32
          OR btrim(tag #>> '{}') <> (tag #>> '{}'))
          AND (SELECT count(*)=count(DISTINCT tag) FROM jsonb_array_elements(value) tag);
      END $$;
      CREATE TABLE assets (
        id uuid PRIMARY KEY, scope varchar(20) NOT NULL CHECK(scope IN ('TEMPLATE','CUSTOMER','SYSTEM_THUMBNAIL')),
        owner_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        assistance_invitation_id uuid, name varchar(120) NOT NULL CHECK(char_length(btrim(name))>0),
        kind varchar(12) NOT NULL CHECK(kind IN ('IMAGE','DECORATION','BACKGROUND','THUMBNAIL')),
        object_key varchar(256) NOT NULL UNIQUE CHECK(object_key ~ '^[a-z0-9-]+(/[a-z0-9-]+)*\\.(webp|png)$'),
        mime_type varchar(20) NOT NULL CHECK(mime_type IN ('image/webp','image/png')),
        byte_size integer NOT NULL CHECK(byte_size>0), width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
        sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
        status varchar(10) NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','DELETING','DELETED')),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(), deleted_at timestamptz,
        CHECK((scope='SYSTEM_THUMBNAIL')=(owner_user_id IS NULL)),
        CHECK((scope='SYSTEM_THUMBNAIL')=(kind='THUMBNAIL')),
        CHECK((kind='THUMBNAIL' AND mime_type='image/png') OR (kind<>'THUMBNAIL' AND mime_type='image/webp')),
        CHECK(assistance_invitation_id IS NULL OR scope='CUSTOMER'),
        CHECK((status='DELETED')=(deleted_at IS NOT NULL))
      );
      CREATE INDEX assets_owner_library ON assets(scope,owner_user_id,created_at DESC,id DESC);
      CREATE INDEX assets_deletion_retry ON assets(status,created_at) WHERE status='DELETING';
      CREATE TABLE invitation_templates (
        id uuid PRIMARY KEY,name varchar(120) NOT NULL CHECK(name=btrim(name) AND char_length(name)>0),
        category varchar(64) NOT NULL CHECK(category=btrim(category) AND char_length(category)>0),
        tags jsonb NOT NULL DEFAULT '[]' CHECK(builder_tags_valid(tags)),sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN -1000000 AND 1000000),
        cover_asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,
        status varchar(12) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','UNPUBLISHED')),
        draft_document jsonb NOT NULL CHECK(jsonb_typeof(draft_document)='object' AND draft_document @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(draft_document)<=1048576),
        draft_sample_data jsonb NOT NULL CHECK(jsonb_typeof(draft_sample_data)='object' AND draft_sample_data @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(draft_sample_data)<=262144),
        edit_version integer NOT NULL DEFAULT 1 CHECK(edit_version>0),published_revision_id uuid,
        created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CHECK((status='PUBLISHED')=(published_revision_id IS NOT NULL))
      );
      CREATE INDEX templates_catalog ON invitation_templates(status,sort_order,id);
      CREATE INDEX templates_cover_reference ON invitation_templates(cover_asset_id) WHERE cover_asset_id IS NOT NULL;
      CREATE TABLE template_design_revisions (
        id uuid PRIMARY KEY,template_id uuid NOT NULL REFERENCES invitation_templates(id) ON DELETE RESTRICT,
        revision_number integer NOT NULL CHECK(revision_number>0),schema_version integer NOT NULL CHECK(schema_version=1),
        document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND document @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(document)<=1048576),
        sample_data jsonb NOT NULL CHECK(jsonb_typeof(sample_data)='object' AND sample_data @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(sample_data)<=262144),
        document_hash char(64) NOT NULL CHECK(document_hash ~ '^[a-f0-9]{64}$'),renderer_contract_version integer NOT NULL CHECK(renderer_contract_version=1),
        thumbnail_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
        created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE(template_id,revision_number),UNIQUE(template_id,id)
      );
      CREATE INDEX revisions_thumbnail_reference ON template_design_revisions(thumbnail_asset_id);
      ALTER TABLE invitation_templates ADD CONSTRAINT template_current_revision_fk
        FOREIGN KEY(id,published_revision_id) REFERENCES template_design_revisions(template_id,id) ON DELETE RESTRICT;
      CREATE TABLE invitations (
        id uuid PRIMARY KEY,owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        design_revision_id uuid NOT NULL REFERENCES template_design_revisions(id) ON DELETE RESTRICT,
        draft_wedding_data jsonb NOT NULL CHECK(jsonb_typeof(draft_wedding_data)='object' AND draft_wedding_data @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(draft_wedding_data)<=262144),
        published_wedding_data jsonb CHECK(published_wedding_data IS NULL OR (jsonb_typeof(published_wedding_data)='object' AND published_wedding_data @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(published_wedding_data)<=262144)),
        published_scene jsonb CHECK(published_scene IS NULL OR (jsonb_typeof(published_scene)='object' AND published_scene @> '{"schemaVersion":1}'::jsonb AND published_scene @> '{"rendererContractVersion":1}'::jsonb)),
        status varchar(12) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','UNPUBLISHED')),public_slug uuid UNIQUE,
        public_version integer NOT NULL DEFAULT 0 CHECK(public_version>=0),published_has_visible_rsvp boolean NOT NULL DEFAULT false,
        edit_version integer NOT NULL DEFAULT 1 CHECK(edit_version>0),rsvp_open boolean NOT NULL DEFAULT true,control_version integer NOT NULL DEFAULT 1 CHECK(control_version>0),
        created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),published_at timestamptz,
        UNIQUE(id,owner_user_id),
        CHECK((status='DRAFT' AND public_slug IS NULL AND public_version=0 AND published_wedding_data IS NULL AND published_scene IS NULL AND published_at IS NULL AND NOT published_has_visible_rsvp)
          OR (status IN ('PUBLISHED','UNPUBLISHED') AND public_slug IS NOT NULL AND public_version>0 AND published_wedding_data IS NOT NULL AND published_scene IS NOT NULL AND published_at IS NOT NULL))
      );
      CREATE INDEX invitations_owner_list ON invitations(owner_user_id,created_at DESC,id DESC);
      ALTER TABLE assets ADD CONSTRAINT asset_assistance_owner_fk FOREIGN KEY(assistance_invitation_id,owner_user_id) REFERENCES invitations(id,owner_user_id) ON DELETE RESTRICT;
      CREATE TABLE asset_storage_writes (
        id uuid PRIMARY KEY,object_key varchar(256) NOT NULL UNIQUE CHECK(object_key ~ '^[a-z0-9-]+(/[a-z0-9-]+)*\\.(webp|png)$'),lease_token uuid NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'WRITING' CHECK(status IN ('WRITING','COMMITTED','ABANDONED')),
        deadline_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),cleaned_at timestamptz,
        asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,job_id uuid,job_lease_token uuid,
        CHECK(deadline_at>created_at AND deadline_at<=created_at+interval '30 seconds'),
        CHECK((status='COMMITTED')=(asset_id IS NOT NULL))
      );
      CREATE INDEX storage_writes_deadline ON asset_storage_writes(status,deadline_at);
      CREATE INDEX storage_writes_cleanup ON asset_storage_writes(cleaned_at NULLS FIRST,created_at) WHERE status='ABANDONED';
      CREATE TABLE template_draft_asset_refs (
        template_id uuid NOT NULL REFERENCES invitation_templates(id) ON DELETE RESTRICT,
        asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,PRIMARY KEY(template_id,asset_id)
      );
      CREATE TABLE template_revision_asset_refs (
        revision_id uuid NOT NULL REFERENCES template_design_revisions(id) ON DELETE RESTRICT,
        asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,PRIMARY KEY(revision_id,asset_id)
      );
      CREATE TABLE invitation_asset_refs (
        invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE RESTRICT,
        slot varchar(10) NOT NULL CHECK(slot IN ('DRAFT','PUBLISHED')),
        asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,PRIMARY KEY(invitation_id,slot,asset_id)
      );
      CREATE INDEX template_draft_assets_reverse ON template_draft_asset_refs(asset_id);
      CREATE INDEX template_revision_assets_reverse ON template_revision_asset_refs(asset_id);
      CREATE INDEX invitation_assets_reverse ON invitation_asset_refs(asset_id);
      CREATE FUNCTION builder_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Template design revisions are immutable' USING ERRCODE='23514'; END $$;
      CREATE TRIGGER template_revision_immutable BEFORE UPDATE OR DELETE ON template_design_revisions
        FOR EACH ROW EXECUTE FUNCTION builder_revision_immutable();
      CREATE TRIGGER template_revision_refs_immutable BEFORE UPDATE OR DELETE ON template_revision_asset_refs
        FOR EACH ROW EXECUTE FUNCTION builder_revision_immutable();
      CREATE FUNCTION builder_invitation_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.id,NEW.owner_user_id,NEW.design_revision_id) IS DISTINCT FROM (OLD.id,OLD.owner_user_id,OLD.design_revision_id)
          OR (OLD.public_slug IS NOT NULL AND NEW.public_slug IS DISTINCT FROM OLD.public_slug) THEN
          RAISE EXCEPTION 'Invitation identity is immutable' USING ERRCODE='23514';
        END IF;
        IF (NEW.published_wedding_data,NEW.published_scene,NEW.published_has_visible_rsvp) IS DISTINCT FROM
          (OLD.published_wedding_data,OLD.published_scene,OLD.published_has_visible_rsvp)
          AND (NEW.public_version<>OLD.public_version+1 OR NEW.status<>'PUBLISHED') THEN
          RAISE EXCEPTION 'Public snapshot requires a new publication' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER invitation_identity_immutable BEFORE UPDATE ON invitations
        FOR EACH ROW EXECUTE FUNCTION builder_invitation_identity_immutable();
      CREATE FUNCTION builder_asset_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.id,NEW.scope,NEW.owner_user_id,NEW.uploaded_by,NEW.assistance_invitation_id,NEW.object_key,NEW.sha256,NEW.byte_size,NEW.width,NEW.height,NEW.mime_type,NEW.kind)
          IS DISTINCT FROM (OLD.id,OLD.scope,OLD.owner_user_id,OLD.uploaded_by,OLD.assistance_invitation_id,OLD.object_key,OLD.sha256,OLD.byte_size,OLD.width,OLD.height,OLD.mime_type,OLD.kind) THEN
          RAISE EXCEPTION 'Asset identity is immutable' USING ERRCODE='23514';
        END IF;
        IF NOT (NEW.status=OLD.status OR (OLD.status='READY' AND NEW.status='DELETING') OR (OLD.status='DELETING' AND NEW.status='DELETED')) THEN
          RAISE EXCEPTION 'Asset status transition is invalid' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER asset_identity_immutable BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION builder_asset_identity_immutable();
      CREATE FUNCTION builder_storage_intent_fenced() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.id,NEW.object_key,NEW.lease_token,NEW.deadline_at,NEW.created_at,NEW.job_lease_token)
          IS DISTINCT FROM (OLD.id,OLD.object_key,OLD.lease_token,OLD.deadline_at,OLD.created_at,OLD.job_lease_token)
          OR (OLD.status<>'WRITING' AND (NEW.status,NEW.asset_id) IS DISTINCT FROM (OLD.status,OLD.asset_id)) THEN
          RAISE EXCEPTION 'Storage intent identity is immutable' USING ERRCODE='23514';
        END IF;
        IF OLD.status='WRITING' AND NEW.status='COMMITTED' AND NEW.deadline_at<=clock_timestamp() THEN
          RAISE EXCEPTION 'Storage intent deadline expired' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER storage_intent_fenced BEFORE UPDATE ON asset_storage_writes FOR EACH ROW EXECUTE FUNCTION builder_storage_intent_fenced();
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER storage_intent_fenced ON asset_storage_writes;
      DROP FUNCTION builder_storage_intent_fenced();
      DROP TRIGGER asset_identity_immutable ON assets;
      DROP TRIGGER invitation_identity_immutable ON invitations;
      DROP TRIGGER template_revision_immutable ON template_design_revisions;
      DROP TRIGGER template_revision_refs_immutable ON template_revision_asset_refs;
      DROP FUNCTION builder_asset_identity_immutable();
      DROP FUNCTION builder_invitation_identity_immutable();
      DROP FUNCTION builder_revision_immutable();
      DROP TABLE invitation_asset_refs,template_revision_asset_refs,template_draft_asset_refs,asset_storage_writes;
      ALTER TABLE assets DROP CONSTRAINT asset_assistance_owner_fk;
      DROP TABLE invitations;
      ALTER TABLE invitation_templates DROP CONSTRAINT template_current_revision_fk;
      DROP TABLE template_design_revisions;
      DROP TABLE invitation_templates;
      DROP TABLE assets;
      DROP FUNCTION builder_tags_valid(jsonb);
      DROP FUNCTION builder_json_bytes(jsonb);
    `);
  }
}
