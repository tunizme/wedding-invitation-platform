import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  INVITATION_BUILDER_CONFIG,
  type InvitationBuilderEnvironment,
} from '../../../config/invitation-builder.environment';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import { canonicalHash } from '../../invitation-builder/domain/validation-helpers';
import {
  closedObject,
  resourceId,
  listLimit,
  newestCursor,
  queryString,
  encodeNewestCursor,
} from '../../invitation-builder/http/input';
import {
  requireInvitationAccess,
  requireOwnedInvitation,
} from '../../invitations/authorization/invitation.policy';
import type { Invitation } from '../../invitations/domain/entities';
import type { RsvpResponse } from '../domain/entities';
import { normalizeRsvp } from '../domain/rsvp-input';
import { enforceRsvpRate, rsvpSourceHash } from './rsvp-rate-limit';
const receipt = (row: RsvpResponse) => ({
  receiptId: row.id,
  acceptedAt: new Date(row.created_at).toISOString(),
});
@Injectable()
export class RsvpService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(INVITATION_BUILDER_CONFIG)
    private readonly config: InvitationBuilderEnvironment,
  ) {}
  async submit(
    slug: string,
    key: string,
    body: unknown,
    address: string | undefined,
  ) {
    resourceId(slug);
    resourceId(key);
    const value = normalizeRsvp(body),
      hash = canonicalHash(value);
    return this.db.transaction((manager) =>
      this.accept(manager, slug, key, value, hash, address),
    );
  }
  private async accept(
    manager: EntityManager,
    slug: string,
    key: string,
    value: ReturnType<typeof normalizeRsvp>,
    hash: string,
    address: string | undefined,
  ) {
    const invitations: Invitation[] = await manager.query(
      'SELECT * FROM invitations WHERE public_slug=$1 FOR UPDATE',
      [slug],
    );
    const invitation = invitations[0];
    if (!invitation) throw new NotFoundException();
    const existing: RsvpResponse[] = await manager.query(
      'SELECT * FROM rsvp_responses WHERE invitation_id=$1 AND request_key=$2',
      [invitation.id, key],
    );
    if (existing[0]) {
      if (existing[0].payload_hash !== hash)
        throw new BuilderProblemException(409, 'IDEMPOTENCY_CONFLICT');
      return { replayed: true, receipt: receipt(existing[0]) };
    }
    if (invitation.status !== 'PUBLISHED') throw new NotFoundException();
    if (!invitation.rsvp_open || !invitation.published_has_visible_rsvp)
      throw new BuilderProblemException(409, 'RSVP_CLOSED');
    // Preserve PostgreSQL microseconds for both rolling-window comparison and INSERT.
    let guestId: string | null = null;
    if (value.guestToken) {
      const [guest] = await manager.query<{ id: string }[]>(
        'SELECT id FROM invitation_guests WHERE invitation_id=$1 AND token=$2 AND revoked_at IS NULL FOR UPDATE',
        [invitation.id, value.guestToken],
      );
      if (!guest) throw new NotFoundException();
      guestId = guest.id;
    }
    const clocks: { accepted_at: string }[] = await manager.query(
      `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS accepted_at`,
    );
    const acceptedAt = clocks[0].accepted_at,
      source = rsvpSourceHash(this.config.rateHmacKey, invitation.id, address);
    await enforceRsvpRate(manager, invitation.id, source, acceptedAt);
    const rows: RsvpResponse[] = await manager.query(
      `INSERT INTO rsvp_responses(id,invitation_id,request_key,payload_hash,name,attendance,party_size,message,source_hash,created_at,guest_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        randomUUID(),
        invitation.id,
        key,
        hash,
        value.name,
        value.attendance,
        value.partySize,
        value.message,
        source,
        acceptedAt,
        guestId,
      ],
    );
    if (guestId)
      await manager.query(
        'UPDATE invitation_guests SET attendance=$2,party_size=$3,updated_at=clock_timestamp() WHERE id=$1',
        [guestId, value.attendance, value.partySize],
      );
    return { replayed: false, receipt: receipt(rows[0]) };
  }
  async state(slug: string) {
    resourceId(slug);
    const rows: Invitation[] = await this.db.query(
      "SELECT * FROM invitations WHERE public_slug=$1 AND status='PUBLISHED'",
      [slug],
    );
    if (!rows[0]) throw new NotFoundException();
    return {
      open: rows[0].rsvp_open,
      available: rows[0].published_has_visible_rsvp,
    };
  }
  async list(
    actor: AuthenticatedPrincipal,
    id: string,
    query: Record<string, unknown>,
    assisted = false,
  ) {
    return this.db.transaction(async (manager) => {
      if (assisted) await requireInvitationAccess(manager, id, actor);
      else await requireOwnedInvitation(manager, id, actor);
      closedObject(query, ['limit', 'cursor']);
      const limit = listLimit(query),
        cursor = newestCursor(queryString(query, 'cursor'));
      const rows: (RsvpResponse & { cursor_created_at: string })[] =
        await manager.query(
          `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
 FROM rsvp_responses WHERE invitation_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
 ORDER BY created_at DESC,id DESC LIMIT $4`,
          [id, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
        );
      const page = rows.slice(0, limit),
        last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id,
          name: row.name,
          attendance: row.attendance,
          partySize: row.party_size,
          message: row.message,
          createdAt: new Date(row.created_at).toISOString(),
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeNewestCursor(last.cursor_created_at, last.id)
            : null,
      };
    });
  }
}
