import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Explicit image deletion is the sole exception to retained snapshot immutability. */
export class CascadeImageDeletion20261014000100 implements MigrationInterface {
  name = 'CascadeImageDeletion20261014000100';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE asset_deletion_legacy_functions(name text PRIMARY KEY, definition text NOT NULL);
      INSERT INTO asset_deletion_legacy_functions
        SELECT proname,pg_get_functiondef(oid) FROM pg_proc
        WHERE pronamespace=current_schema()::regnamespace
          AND proname IN ('builder_revision_immutable','builder_invitation_identity_immutable');
      ALTER TABLE template_design_revisions ALTER COLUMN thumbnail_asset_id DROP NOT NULL;

      CREATE FUNCTION builder_remove_asset(value jsonb, asset text) RETURNS jsonb
      LANGUAGE plpgsql IMMUTABLE STRICT AS $$
      DECLARE result jsonb; item jsonb; cleaned jsonb; key text; node_id text;
      BEGIN
        IF jsonb_typeof(value)='array' THEN
          result := '[]'::jsonb;
          FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
            IF COALESCE(item->>'type',item#>>'{type,resolvedName}') IN ('Image','Decoration')
              AND COALESCE(item#>>'{content,assetId}',item#>>'{props,content,assetId}')=asset THEN CONTINUE; END IF;
            result := result || jsonb_build_array(builder_remove_asset(item,asset));
          END LOOP;
          RETURN result;
        END IF;
        IF jsonb_typeof(value)<>'object' THEN RETURN value; END IF;
        IF value->>'kind'='asset' AND value->>'assetId'=asset THEN
          RETURN '{"kind":"solid","color":"#FFFFFFFF"}'::jsonb;
        END IF;
        result := '{}'::jsonb;
        FOR key,item IN SELECT * FROM jsonb_each(value) LOOP
          IF key IN ('photo','fallback') AND item=to_jsonb(asset)
            AND (key='photo' OR value->>'target'='assetId') THEN CONTINUE;
          ELSIF key IN ('assetId','posterId','audioId','shareImageId') AND item=to_jsonb(asset) THEN
            cleaned := 'null'::jsonb;
          ELSIF key='assetIds' AND jsonb_typeof(item)='array' THEN
            SELECT COALESCE(jsonb_agg(v ORDER BY n),'[]'::jsonb) INTO cleaned
              FROM jsonb_array_elements(item) WITH ORDINALITY AS a(v,n) WHERE v<>to_jsonb(asset);
          ELSIF key='nodes' AND jsonb_typeof(item)='object' THEN
            SELECT COALESCE(jsonb_object_agg(k,builder_remove_asset(v,asset)),'{}'::jsonb) INTO cleaned
              FROM jsonb_each(item) AS a(k,v)
              WHERE NOT (COALESCE(v#>>'{type,resolvedName}','') IN ('Image','Decoration')
                AND (COALESCE(v#>>'{props,content,assetId}','')=asset OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(COALESCE(v#>'{props,bindings}','[]')) b
                  WHERE b->>'target'='assetId' AND b->>'fallback'=asset)));
          ELSE cleaned := builder_remove_asset(item,asset);
          END IF;
          result := result || jsonb_build_object(key,cleaned);
        END LOOP;
        IF jsonb_typeof(result->'nodes')='object' AND result#>'{nodes,ROOT}' IS NOT NULL THEN
          SELECT COALESCE(jsonb_agg(v ORDER BY n),'[]'::jsonb) INTO cleaned
            FROM jsonb_array_elements(result#>'{nodes,ROOT,nodes}') WITH ORDINALITY AS a(v,n)
            WHERE (result->'nodes') ? (v#>>'{}');
          result := jsonb_set(result,'{nodes,ROOT,nodes}',cleaned);
        END IF;
        IF jsonb_typeof(result->'nodeOptions')='object' THEN
          cleaned := '{}'::jsonb;
          FOR node_id,item IN SELECT * FROM jsonb_each(result->'nodeOptions') LOOP
            IF jsonb_typeof(result->'nodes')='object' THEN
              IF NOT (result->'nodes') ? node_id THEN CONTINUE; END IF;
              IF item#>>'{action,kind}'='scroll' AND NOT (result->'nodes') ? (item#>>'{action,value}') THEN
                item := item-'action';
              END IF;
            ELSIF jsonb_typeof(result->'elements')='array' THEN
              IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'elements') e WHERE e->>'id'=node_id) THEN CONTINUE; END IF;
              IF item#>>'{action,kind}'='scroll' AND NOT EXISTS(
                SELECT 1 FROM jsonb_array_elements(result->'elements') e WHERE e->>'id'=item#>>'{action,value}') THEN
                item := item-'action';
              END IF;
            END IF;
            cleaned := cleaned || jsonb_build_object(node_id,item);
          END LOOP;
          result := jsonb_set(result,'{nodeOptions}',cleaned);
        END IF;
        RETURN result;
      END $$;

      CREATE FUNCTION builder_asset_ids(value jsonb) RETURNS uuid[]
      LANGUAGE plpgsql IMMUTABLE STRICT AS $$
      DECLARE ids uuid[] := '{}'; key text; item jsonb;
      BEGIN
        IF jsonb_typeof(value)='array' THEN
          FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP ids := ids || builder_asset_ids(item); END LOOP;
        ELSIF jsonb_typeof(value)='object' THEN
          FOR key,item IN SELECT * FROM jsonb_each(value) LOOP
            IF (key IN ('assetId','posterId','audioId','shareImageId','photo')
                OR (key='fallback' AND value->>'target'='assetId')) AND jsonb_typeof(item)='string'
                AND (item#>>'{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
              ids := array_append(ids,(item#>>'{}')::uuid);
            ELSIF key='assetIds' AND jsonb_typeof(item)='array' THEN
              ids := ids || ARRAY(SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(item) v);
            ELSE ids := ids || builder_asset_ids(item);
            END IF;
          END LOOP;
        END IF;
        RETURN ARRAY(SELECT DISTINCT id FROM unnest(ids) id ORDER BY id);
      END $$;

      CREATE FUNCTION builder_deleting_asset() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT id::text FROM assets WHERE id::text=current_setting('builder.deleting_asset',true)
          AND status='DELETING' AND kind IN ('IMAGE','DECORATION','BACKGROUND')
      $$;
      CREATE OR REPLACE FUNCTION builder_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE asset text := builder_deleting_asset();
      BEGIN
        IF asset IS NOT NULL THEN
          IF TG_TABLE_NAME='template_revision_asset_refs' AND TG_OP='DELETE' THEN
            IF NOT EXISTS (
              SELECT 1 FROM template_design_revisions r WHERE r.id=OLD.revision_id
                AND OLD.asset_id=ANY(builder_asset_ids(r.document)||builder_asset_ids(r.sample_data))) THEN RETURN OLD; END IF;
          ELSIF TG_TABLE_NAME='template_design_revisions' AND TG_OP='UPDATE' THEN
            IF (to_jsonb(NEW)-ARRAY['document','sample_data','document_hash','thumbnail_asset_id'])=
               (to_jsonb(OLD)-ARRAY['document','sample_data','document_hash','thumbnail_asset_id'])
              AND NEW.document=builder_remove_asset(OLD.document,asset)
              AND NEW.sample_data=builder_remove_asset(OLD.sample_data,asset)
              AND NEW.thumbnail_asset_id IS NULL THEN RETURN NEW; END IF;
          END IF;
        END IF;
        RAISE EXCEPTION 'Template design revisions are immutable' USING ERRCODE='23514';
      END $$;
      CREATE OR REPLACE FUNCTION builder_invitation_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE asset text := builder_deleting_asset();
      BEGIN
        IF (NEW.id,NEW.owner_user_id,NEW.design_revision_id) IS DISTINCT FROM (OLD.id,OLD.owner_user_id,OLD.design_revision_id)
          OR (OLD.public_slug IS NOT NULL AND NEW.public_slug IS DISTINCT FROM OLD.public_slug) THEN
          RAISE EXCEPTION 'Invitation identity is immutable' USING ERRCODE='23514';
        END IF;
        IF (NEW.published_wedding_data,NEW.published_scene,NEW.published_has_visible_rsvp) IS DISTINCT FROM
          (OLD.published_wedding_data,OLD.published_scene,OLD.published_has_visible_rsvp)
          AND NOT (NEW.public_version=OLD.public_version+1 AND (NEW.status='PUBLISHED' OR (
            asset IS NOT NULL AND NEW.status=OLD.status AND NEW.published_has_visible_rsvp=OLD.published_has_visible_rsvp
            AND NEW.published_wedding_data=builder_remove_asset(OLD.published_wedding_data,asset)
            AND NEW.published_scene=builder_remove_asset(OLD.published_scene,asset)))) THEN
          RAISE EXCEPTION 'Public snapshot requires a new publication' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const rows = (await runner.query(
      'SELECT EXISTS(SELECT 1 FROM template_design_revisions WHERE thumbnail_asset_id IS NULL) AS present',
    )) as { present: boolean }[];
    if (rows[0].present)
      throw new Error(
        'Republish redacted template revisions before downgrading.',
      );
    const functions = (await runner.query(
      'SELECT definition FROM asset_deletion_legacy_functions ORDER BY name',
    )) as { definition: string }[];
    for (const fn of functions)
      await runner.query(
        fn.definition.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION'),
      );
    await runner.query(`
      DROP FUNCTION builder_deleting_asset(),builder_asset_ids(jsonb),builder_remove_asset(jsonb,text);
      DROP TABLE asset_deletion_legacy_functions;
      ALTER TABLE template_design_revisions ALTER COLUMN thumbnail_asset_id SET NOT NULL;
    `);
  }
}
