import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ManagedInvitations20261014000300 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE invitations
      ADD COLUMN editing_mode varchar(20) NOT NULL DEFAULT 'FORM_ONLY' CHECK(editing_mode IN ('FORM_ONLY','SERVICE_MANAGED')),
      ADD COLUMN draft_document jsonb CHECK(draft_document IS NULL OR (jsonb_typeof(draft_document)='object' AND builder_json_bytes(draft_document)<=1048576)),
      ADD COLUMN title varchar(200) NOT NULL DEFAULT '',
      ADD COLUMN paid_at timestamptz,
      ADD COLUMN paid_by uuid REFERENCES users(id),
      ADD COLUMN payment_note varchar(1000) NOT NULL DEFAULT '',
      ADD CONSTRAINT managed_document_required CHECK(editing_mode<>'SERVICE_MANAGED' OR draft_document IS NOT NULL),
      ADD CONSTRAINT payment_confirmation_pair CHECK((paid_at IS NULL)=(paid_by IS NULL))`);
    await q.query(`CREATE TABLE invitation_guests (
      id uuid PRIMARY KEY, invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
      name varchar(120) NOT NULL, group_name varchar(120) NOT NULL DEFAULT '',
      token uuid NOT NULL UNIQUE, revoked_at timestamptz,
      first_opened_at timestamptz, last_opened_at timestamptz, open_count integer NOT NULL DEFAULT 0,
      attendance varchar(12) CHECK(attendance IN ('ATTENDING','DECLINED')), party_size integer,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )`);
    await q.query(
      'CREATE INDEX invitation_guests_owner_idx ON invitation_guests(invitation_id,created_at,id)',
    );
    await q.query(`CREATE TABLE invitation_guest_opens (
      guest_id uuid NOT NULL REFERENCES invitation_guests(id) ON DELETE CASCADE,
      event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(guest_id,event_id)
    )`);
    await q.query(`CREATE TABLE invitation_guest_imports (
      invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
      request_key uuid NOT NULL, payload_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(invitation_id,request_key)
    )`);
    await q.query(
      'ALTER TABLE rsvp_responses ADD COLUMN guest_id uuid REFERENCES invitation_guests(id) ON DELETE SET NULL',
    );
    await q.query(
      `ALTER TABLE users ADD COLUMN invited_by uuid REFERENCES users(id), ADD COLUMN invitation_pending boolean NOT NULL DEFAULT false`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE users DROP COLUMN invitation_pending, DROP COLUMN invited_by',
    );
    await q.query('ALTER TABLE rsvp_responses DROP COLUMN guest_id');
    await q.query(
      'DROP TABLE invitation_guest_imports, invitation_guest_opens, invitation_guests',
    );
    await q.query(`ALTER TABLE invitations DROP CONSTRAINT payment_confirmation_pair, DROP CONSTRAINT managed_document_required,
      DROP COLUMN editing_mode, DROP COLUMN draft_document, DROP COLUMN title, DROP COLUMN paid_at, DROP COLUMN paid_by, DROP COLUMN payment_note`);
  }
}
