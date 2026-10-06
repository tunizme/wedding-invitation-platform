import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InvitationPublicationJobs20261001000200 implements MigrationInterface {
  name = 'InvitationPublicationJobs20261001000200';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE publication_jobs (
        id uuid PRIMARY KEY,template_id uuid REFERENCES invitation_templates(id) ON DELETE RESTRICT,
        invitation_id uuid REFERENCES invitations(id) ON DELETE RESTRICT,
        requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,request_key uuid NOT NULL,
        request_hash char(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),expected_edit_version integer NOT NULL CHECK(expected_edit_version>0),
        candidate_document jsonb CHECK(candidate_document IS NULL OR (jsonb_typeof(candidate_document)='object' AND candidate_document @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(candidate_document)<=1048576)),
        candidate_data jsonb CHECK(candidate_data IS NULL OR (jsonb_typeof(candidate_data)='object' AND candidate_data @> '{"schemaVersion":1}'::jsonb AND builder_json_bytes(candidate_data)<=262144)),
        candidate_hash char(64) NOT NULL CHECK(candidate_hash ~ '^[a-f0-9]{64}$'),
        status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','SUCCEEDED','FAILED')),
        attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2),lease_owner uuid,lease_expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL,completed_at timestamptz,
        result_revision_id uuid,result_public_version integer CHECK(result_public_version>0),
        error_code varchar(40),issues jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(issues)='array' AND jsonb_array_length(issues)<=100),staged_thumbnail_key varchar(256),
        UNIQUE(requested_by,request_key),CHECK((template_id IS NULL)<>(invitation_id IS NULL)),
        CHECK(deadline_at=created_at+interval '90 seconds'),
        CHECK((lease_owner IS NULL)=(lease_expires_at IS NULL)),
        CHECK((status='RUNNING')=(lease_owner IS NOT NULL)),
        CHECK(lease_expires_at IS NULL OR lease_expires_at<=deadline_at),
        CHECK(status<>'RUNNING' OR attempts>0),
        CHECK((status IN ('PENDING','RUNNING') AND candidate_document IS NOT NULL AND candidate_data IS NOT NULL AND completed_at IS NULL)
          OR (status IN ('SUCCEEDED','FAILED') AND candidate_document IS NULL AND candidate_data IS NULL AND completed_at IS NOT NULL AND staged_thumbnail_key IS NULL)),
        CHECK((status='FAILED')=(error_code IS NOT NULL)),
        CHECK((status<>'SUCCEEDED' AND result_revision_id IS NULL AND result_public_version IS NULL)
          OR (status='SUCCEEDED' AND attempts>0 AND ((template_id IS NOT NULL AND result_revision_id IS NOT NULL AND result_public_version IS NULL)
            OR (invitation_id IS NOT NULL AND result_public_version IS NOT NULL AND result_revision_id IS NULL)))),
        FOREIGN KEY(template_id,result_revision_id) REFERENCES template_design_revisions(template_id,id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX one_template_publication ON publication_jobs(template_id) WHERE status IN ('PENDING','RUNNING');
      CREATE UNIQUE INDEX one_invitation_publication ON publication_jobs(invitation_id) WHERE status IN ('PENDING','RUNNING');
      CREATE INDEX publication_claim ON publication_jobs(status,created_at,id);
      CREATE INDEX publication_lease ON publication_jobs(lease_expires_at) WHERE status='RUNNING';
      CREATE INDEX publication_receipt_retention ON publication_jobs(completed_at) WHERE status IN ('SUCCEEDED','FAILED');
      CREATE INDEX publication_requester_list ON publication_jobs(requested_by,created_at DESC,id DESC);
      CREATE TABLE publication_job_asset_refs (
        job_id uuid NOT NULL REFERENCES publication_jobs(id) ON DELETE RESTRICT,
        asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,PRIMARY KEY(job_id,asset_id)
      );
      CREATE INDEX publication_assets_reverse ON publication_job_asset_refs(asset_id);
      ALTER TABLE asset_storage_writes ADD CONSTRAINT storage_write_job_fk FOREIGN KEY(job_id) REFERENCES publication_jobs(id) ON DELETE SET NULL;
      CREATE FUNCTION builder_job_candidate_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.id,NEW.template_id,NEW.invitation_id,NEW.requested_by,NEW.request_key,NEW.request_hash,NEW.expected_edit_version,NEW.candidate_hash,NEW.created_at,NEW.deadline_at)
          IS DISTINCT FROM (OLD.id,OLD.template_id,OLD.invitation_id,OLD.requested_by,OLD.request_key,OLD.request_hash,OLD.expected_edit_version,OLD.candidate_hash,OLD.created_at,OLD.deadline_at) THEN
          RAISE EXCEPTION 'Publication request identity is immutable' USING ERRCODE='23514';
        END IF;
        IF (NEW.candidate_document,NEW.candidate_data) IS DISTINCT FROM (OLD.candidate_document,OLD.candidate_data)
          AND NOT (NEW.status IN ('SUCCEEDED','FAILED') AND NEW.candidate_document IS NULL AND NEW.candidate_data IS NULL) THEN
          RAISE EXCEPTION 'Publication candidate is immutable' USING ERRCODE='23514';
        END IF;
        IF OLD.status IN ('SUCCEEDED','FAILED') THEN
          RAISE EXCEPTION 'Publication receipt is immutable' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER publication_candidate_immutable BEFORE UPDATE ON publication_jobs FOR EACH ROW EXECUTE FUNCTION builder_job_candidate_immutable();
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE asset_storage_writes DROP CONSTRAINT storage_write_job_fk;
      DROP TRIGGER publication_candidate_immutable ON publication_jobs;
      DROP FUNCTION builder_job_candidate_immutable();
      DROP TABLE publication_job_asset_refs;
      DROP TABLE publication_jobs;
    `);
  }
}
