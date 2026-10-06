import type { MigrationInterface, QueryRunner } from 'typeorm';
export class InvitationRsvp20261001000300 implements MigrationInterface {
  name = 'InvitationRsvp20261001000300';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE rsvp_responses (
 id uuid PRIMARY KEY,invitation_id uuid NOT NULL REFERENCES invitations(id),request_key uuid NOT NULL,
 payload_hash varchar(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 name varchar(120) NOT NULL CHECK(char_length(name) BETWEEN 1 AND 120 AND char_length(btrim(name))>0),
 attendance varchar(9) NOT NULL CHECK(attendance IN ('ATTENDING','DECLINED')),party_size integer NOT NULL,
 message text NOT NULL DEFAULT '' CHECK(char_length(message)<=1000),source_hash bytea CHECK(source_hash IS NULL OR octet_length(source_hash)=32),
 created_at timestamptz NOT NULL,
 UNIQUE(invitation_id,request_key),CHECK((attendance='ATTENDING' AND party_size BETWEEN 1 AND 20) OR (attendance='DECLINED' AND party_size=0))
 )`);
    await r.query(
      'CREATE INDEX rsvp_owner_list ON rsvp_responses(invitation_id,created_at DESC,id DESC)',
    );
    await r.query(
      'CREATE INDEX rsvp_source_window ON rsvp_responses(invitation_id,source_hash,created_at) WHERE source_hash IS NOT NULL',
    );
    await r.query(
      'CREATE INDEX rsvp_source_retention ON rsvp_responses(created_at,id) WHERE source_hash IS NOT NULL',
    );
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query('DROP TABLE rsvp_responses');
  }
}
