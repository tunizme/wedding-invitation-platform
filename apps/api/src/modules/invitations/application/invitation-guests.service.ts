import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import {
  closedObject,
  resourceId,
  listLimit,
  newestCursor,
  queryString,
  encodeNewestCursor,
} from '../../invitation-builder/http/input';
import { canonicalHash } from '../../invitation-builder/domain/validation-helpers';
import { requireInvitationAccess } from '../authorization/invitation.policy';

export function guestInput(body: unknown) {
  const input = closedObject(body, ['name', 'group']);
  if (
    typeof input.name !== 'string' ||
    (input.group !== undefined && typeof input.group !== 'string')
  )
    throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
  const name = input.name.trim(),
    group = (input.group ?? '').trim();
  if (
    !name ||
    [...name].length > 120 ||
    [...group].length > 120 ||
    /[\0\uD800-\uDFFF]/u.test(name + group)
  )
    throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
  return { name, group };
}
type GuestRow = {
  id: string;
  name: string;
  group_name: string;
  token: string;
  revoked_at: Date | null;
  first_opened_at: Date | null;
  last_opened_at: Date | null;
  open_count: number;
  attendance: string | null;
  party_size: number | null;
  cursor_created_at: string;
};
@Injectable()
export class InvitationGuestsService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}
  async list(
    actor: AuthenticatedPrincipal,
    id: string,
    query: Record<string, unknown>,
  ) {
    closedObject(query, ['limit', 'cursor']);
    const limit = listLimit(query),
      cursor = newestCursor(queryString(query, 'cursor'));
    return this.db.transaction(async (manager) => {
      const invitation = await requireInvitationAccess(manager, id, actor);
      const rows: GuestRow[] = await manager.query(
        `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
        FROM invitation_guests WHERE invitation_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
        ORDER BY created_at DESC,id DESC LIMIT $4`,
        [id, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
      );
      const page = rows.slice(0, limit),
        last = page.at(-1);
      const [totals] = await manager.query<
        {
          guests: number;
          opened: number;
          attending: number;
          declined: number;
        }[]
      >(
        `SELECT count(*)::int AS guests,count(*) FILTER(WHERE open_count>0)::int AS opened,
        count(*) FILTER(WHERE attendance='ATTENDING')::int AS attending,count(*) FILTER(WHERE attendance='DECLINED')::int AS declined
        FROM invitation_guests WHERE invitation_id=$1`,
        [id],
      );
      return {
        totals,
        items: page.map((row) => ({
          id: row.id,
          name: row.name,
          group: row.group_name,
          publicUrl:
            invitation.public_slug && !row.revoked_at
              ? `/i/${invitation.public_slug}?g=${row.token}`
              : null,
          revoked: !!row.revoked_at,
          firstOpenedAt: row.first_opened_at,
          lastOpenedAt: row.last_opened_at,
          openCount: row.open_count,
          attendance: row.attendance,
          partySize: row.party_size,
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeNewestCursor(last.cursor_created_at, last.id)
            : null,
      };
    });
  }
  async import(
    actor: AuthenticatedPrincipal,
    id: string,
    key: string,
    body: unknown,
  ) {
    resourceId(key);
    const input = closedObject(body, ['guests']);
    if (
      !Array.isArray(input.guests) ||
      !input.guests.length ||
      input.guests.length > 1000
    )
      throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    const guests = input.guests.map(guestInput),
      hash = canonicalHash(guests);
    return this.db.transaction(async (manager) => {
      await requireInvitationAccess(manager, id, actor, true);
      const [prior] = await manager.query<{ payload_hash: string }[]>(
        'SELECT payload_hash FROM invitation_guest_imports WHERE invitation_id=$1 AND request_key=$2',
        [id, key],
      );
      if (prior) {
        if (prior.payload_hash !== hash)
          throw new BuilderProblemException(409, 'IDEMPOTENCY_CONFLICT');
        return { created: guests.length, replayed: true };
      }
      for (const guest of guests)
        await manager.query(
          'INSERT INTO invitation_guests(id,invitation_id,name,group_name,token) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), id, guest.name, guest.group, randomUUID()],
        );
      await manager.query(
        'INSERT INTO invitation_guest_imports(invitation_id,request_key,payload_hash) VALUES($1,$2,$3)',
        [id, key, hash],
      );
      return { created: guests.length, replayed: false };
    });
  }
  async change(
    actor: AuthenticatedPrincipal,
    id: string,
    guestId: string,
    action: 'rotate' | 'revoke',
  ) {
    resourceId(guestId);
    return this.db.transaction(async (manager) => {
      await requireInvitationAccess(manager, id, actor, true);
      const rows: { id: string }[] = await manager.query(
        `WITH changed AS (UPDATE invitation_guests SET token=$3,revoked_at=${action === 'revoke' ? 'clock_timestamp()' : 'NULL'},updated_at=clock_timestamp()
        WHERE id=$1 AND invitation_id=$2 RETURNING id) SELECT id FROM changed`,
        [guestId, id, randomUUID()],
      );
      if (!rows.length) throw new NotFoundException();
      return { id: guestId };
    });
  }
  async publicGuest(slug: string, token: string) {
    resourceId(slug);
    resourceId(token);
    const [guest] = await this.db.query<{ name: string }[]>(
      `SELECT g.name FROM invitation_guests g JOIN invitations i ON i.id=g.invitation_id
      WHERE i.public_slug=$1 AND i.status='PUBLISHED' AND g.token=$2 AND g.revoked_at IS NULL`,
      [slug, token],
    );
    if (!guest) throw new NotFoundException();
    return { name: guest.name };
  }
  async opened(slug: string, token: string, body: unknown) {
    resourceId(slug);
    resourceId(token);
    const input = closedObject(body, ['eventId']);
    resourceId(input.eventId as string);
    return this.db.transaction(async (manager) => {
      const [guest] = await manager.query<{ id: string }[]>(
        `SELECT g.id FROM invitation_guests g JOIN invitations i ON i.id=g.invitation_id
        WHERE i.public_slug=$1 AND i.status='PUBLISHED' AND g.token=$2 AND g.revoked_at IS NULL FOR UPDATE OF g`,
        [slug, token],
      );
      if (!guest) throw new NotFoundException();
      const inserted: { guest_id: string }[] = await manager.query(
        'INSERT INTO invitation_guest_opens(guest_id,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING guest_id',
        [guest.id, input.eventId],
      );
      if (inserted.length)
        await manager.query(
          `UPDATE invitation_guests SET first_opened_at=COALESCE(first_opened_at,clock_timestamp()),
        last_opened_at=clock_timestamp(),open_count=open_count+1 WHERE id=$1`,
          [guest.id],
        );
      return { recorded: !!inserted.length };
    });
  }
}
