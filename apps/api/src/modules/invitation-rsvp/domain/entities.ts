import { EntitySchema } from 'typeorm';
export interface RsvpResponse {
  id: string;
  invitation_id: string;
  request_key: string;
  payload_hash: string;
  name: string;
  attendance: 'ATTENDING' | 'DECLINED';
  party_size: number;
  message: string;
  source_hash: Buffer | null;
  created_at: Date;
}
export const RsvpResponseEntity = new EntitySchema<RsvpResponse>({
  name: 'RsvpResponse',
  tableName: 'rsvp_responses',
  columns: {
    id: { type: 'uuid', primary: true },
    invitation_id: { type: 'uuid' },
    request_key: { type: 'uuid' },
    payload_hash: { type: 'varchar', length: 64 },
    name: { type: 'varchar', length: 120 },
    attendance: { type: 'varchar', length: 9 },
    party_size: { type: 'integer' },
    message: { type: 'text' },
    source_hash: { type: 'bytea', nullable: true },
    created_at: { type: 'timestamptz' },
  },
});
export const rsvpEntities = [RsvpResponseEntity];
