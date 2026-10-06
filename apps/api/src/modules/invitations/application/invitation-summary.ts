import type { Invitation } from '../domain/entities';

export const invitationSummary = (row: Invitation) => ({
  id: row.id,
  status: row.status,
  publicUrl: row.public_slug ? `/i/${row.public_slug}` : null,
  publicVersion: row.public_version,
  editVersion: row.edit_version,
  controlVersion: row.control_version,
  rsvpOpen: row.rsvp_open,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});
