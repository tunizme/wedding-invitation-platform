import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { createHmac, randomUUID } from 'node:crypto';
import {
  INVITATION_BUILDER_CONFIG,
  type InvitationBuilderEnvironment,
} from '../../config/invitation-builder.environment';
import { BuilderProblemException } from '../../common/errors/public-problem.exception';
import {
  closedObject,
  resourceId,
  listLimit,
  newestCursor,
  encodeNewestCursor,
  queryString,
} from '../invitation-builder/http/input';
import { canonicalHash } from '../invitation-builder/domain/validation-helpers';
import type {
  CustomField,
  ResolvedAdvanced,
} from '../invitation-builder/domain/editor-document';
import type { Invitation } from '../invitations/domain/entities';
import type { AuthenticatedPrincipal } from '../identity-access/authorization/principal';
import {
  requireOwnedInvitation,
  requireAssistedInvitation,
} from '../invitations/authorization/invitation.policy';
import { rsvpSourceHash } from '../invitation-rsvp/application/rsvp-rate-limit';
import { RateLimitExceeded } from '../identity-access/infrastructure/rate-limit.service';

type ResponseRow = {
  id: string;
  invitation_id: string;
  request_hash: string;
  created_at: Date;
  name: string;
  message: string;
  status: string;
  node_id?: string;
  answers?: Record<string, unknown>;
  definition?: CustomField[];
  public_version?: number;
  cursor_created_at: string;
};
export function checkAnswers(
  fields: CustomField[],
  input: unknown,
): Record<string, unknown> {
  const answers = closedObject(
    input,
    fields.map((f) => f.id),
  );
  for (const f of fields) {
    const v = answers[f.id];
    if (
      f.required &&
      (v === undefined || v === '' || (Array.isArray(v) && !v.length))
    )
      throw new UnprocessableEntityException();
    if (v === undefined || v === '') continue;
    if (f.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v))
        throw new UnprocessableEntityException();
    } else if (f.type === 'multiselect') {
      if (
        !Array.isArray(v) ||
        v.length > 30 ||
        new Set(v).size !== v.length ||
        v.some((x) => typeof x !== 'string' || !f.options.includes(x))
      )
        throw new UnprocessableEntityException();
    } else if (
      typeof v !== 'string' ||
      [...v].length > 1000 ||
      (f.type === 'select' && !f.options.includes(v)) ||
      (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ||
      (f.type === 'tel' && !/^[+0-9 ()-]{1,30}$/.test(v)) ||
      (f.type === 'date' &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          !Number.isFinite(Date.parse(v)) ||
          new Date(v).toISOString().slice(0, 10) !== v))
    )
      throw new UnprocessableEntityException();
  }
  return answers;
}
const receipt = (row: ResponseRow) => ({
  receiptId: row.id,
  acceptedAt: new Date(row.created_at).toISOString(),
});
@Injectable()
export class InteractionsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(INVITATION_BUILDER_CONFIG)
    private readonly config: InvitationBuilderEnvironment,
  ) {}
  private async published(
    manager: EntityManager,
    slug: string,
    lock = false,
  ): Promise<Invitation> {
    resourceId(slug);
    const rows: Invitation[] = await manager.query(
      `SELECT * FROM invitations WHERE public_slug=$1${lock ? ' FOR UPDATE' : ''}`,
      [slug],
    );
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }
  private available(
    invitation: Invitation,
    kind: 'wishes' | 'likes' | 'form',
    nodeId?: string,
  ): ResolvedAdvanced | undefined {
    const scene = invitation.published_scene;
    if (
      invitation.status !== 'PUBLISHED' ||
      !scene ||
      scene.schemaVersion !== 3
    )
      throw new NotFoundException();
    if (kind === 'form') {
      const node = scene.elements.find(
        (e) => e.id === nodeId && e.type === 'CustomForm',
      );
      if (!node) throw new NotFoundException();
      return node as ResolvedAdvanced;
    }
    if (!scene.settings.toolbar[kind]) throw new NotFoundException();
    return undefined;
  }
  private async rate(
    manager: EntityManager,
    invitation: string,
    kind: string,
    address: string | undefined,
  ) {
    const source = rsvpSourceHash(this.config.rateHmacKey, invitation, address);
    const rows: { retry_after: number }[] = await manager.query(
      `SELECT ceil(extract(epoch FROM(min(created_at)+interval '10 minutes'-clock_timestamp())))::integer AS retry_after FROM invitation_interaction_rate WHERE invitation_id=$1 AND kind=$2 AND source_hash=$3 AND created_at>clock_timestamp()-interval '10 minutes' HAVING count(*)>=5`,
      [invitation, kind, source],
    );
    if (rows[0]) throw new RateLimitExceeded(Math.max(1, rows[0].retry_after));
    await manager.query(
      'INSERT INTO invitation_interaction_rate(invitation_id,kind,source_hash) VALUES($1,$2,$3)',
      [invitation, kind, source],
    );
    return source;
  }
  async submit(
    slug: string,
    key: string,
    body: unknown,
    address: string | undefined,
    nodeId?: string,
  ) {
    resourceId(key);
    if (nodeId) resourceId(nodeId);
    const input = closedObject(
      body,
      nodeId ? ['answers'] : ['name', 'message'],
    );
    let name = '',
      message = '';
    if (!nodeId) {
      if (typeof input.name !== 'string' || typeof input.message !== 'string')
        throw new UnprocessableEntityException();
      name = input.name.trim();
      message = input.message.trim();
      if (
        !name ||
        [...name].length > 120 ||
        !message ||
        [...message].length > 1000
      )
        throw new UnprocessableEntityException();
    }
    if (
      nodeId &&
      (!input.answers ||
        typeof input.answers !== 'object' ||
        Array.isArray(input.answers))
    )
      throw new UnprocessableEntityException();
    const payload = nodeId
        ? { nodeId, answers: input.answers }
        : { name, message },
      hash = canonicalHash(payload),
      table = nodeId ? 'invitation_form_responses' : 'invitation_wishes';
    return this.db.transaction(async (manager) => {
      const invitation = await this.published(manager, slug, true);
      const existing: ResponseRow[] = await manager.query(
        `SELECT * FROM ${table} WHERE invitation_id=$1 AND request_key=$2`,
        [invitation.id, key],
      );
      if (existing[0]) {
        if (existing[0].request_hash.trim() !== hash)
          throw new BuilderProblemException(409, 'IDEMPOTENCY_CONFLICT');
        return { replayed: true, receipt: receipt(existing[0]) };
      }
      const node = this.available(
          invitation,
          nodeId ? 'form' : 'wishes',
          nodeId,
        ),
        answers = node
          ? checkAnswers(node.content.fields ?? [], input.answers)
          : undefined;
      const source = await this.rate(
        manager,
        invitation.id,
        nodeId ? 'form' : 'wish',
        address,
      );
      const rows: ResponseRow[] = node
        ? await manager.query(
            `INSERT INTO invitation_form_responses(id,invitation_id,node_id,public_version,definition,answers,request_key,request_hash,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              randomUUID(),
              invitation.id,
              nodeId,
              invitation.public_version,
              JSON.stringify(node.content.fields),
              JSON.stringify(answers),
              key,
              hash,
              source,
            ],
          )
        : await manager.query(
            `INSERT INTO invitation_wishes(id,invitation_id,request_key,request_hash,name,message,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [randomUUID(), invitation.id, key, hash, name, message, source],
          );
      return { replayed: false, receipt: receipt(rows[0]) };
    });
  }
  async wishes(slug: string, query: Record<string, unknown>) {
    const invitation = await this.published(this.db.manager, slug);
    this.available(invitation, 'wishes');
    return this.page(this.db.manager, invitation.id, query, false, false);
  }
  private async page(
    manager: EntityManager,
    id: string,
    query: Record<string, unknown>,
    forms: boolean,
    privateRead: boolean,
  ) {
    closedObject(
      query,
      forms ? ['limit', 'cursor', 'nodeId'] : ['limit', 'cursor'],
    );
    const limit = listLimit(query),
      cursor = newestCursor(queryString(query, 'cursor')),
      node = queryString(query, 'nodeId');
    if (node) resourceId(node);
    const table = forms ? 'invitation_form_responses' : 'invitation_wishes';
    const rows: ResponseRow[] = await manager.query(
      `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at FROM ${table} WHERE invitation_id=$1 ${privateRead || forms ? '' : "AND status='APPROVED'"} AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ${forms ? 'AND ($5::uuid IS NULL OR node_id=$5)' : ''} ORDER BY created_at DESC,id DESC LIMIT $4`,
      forms
        ? [
            id,
            cursor?.createdAt ?? null,
            cursor?.id ?? null,
            limit + 1,
            node ?? null,
          ]
        : [id, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map((row) =>
        forms
          ? {
              id: row.id,
              nodeId: row.node_id,
              publicVersion: row.public_version,
              fields: row.definition,
              answers: row.answers,
              createdAt: row.created_at.toISOString(),
            }
          : {
              id: row.id,
              name: row.name,
              message: row.message,
              ...(privateRead ? { status: row.status } : {}),
              createdAt: row.created_at.toISOString(),
            },
      ),
      nextCursor:
        rows.length > limit && last
          ? encodeNewestCursor(last.cursor_created_at, last.id)
          : null,
    };
  }
  async ownerList(
    actor: AuthenticatedPrincipal,
    id: string,
    query: Record<string, unknown>,
    forms = false,
    assisted = false,
  ) {
    return this.db.transaction(async (manager) => {
      if (assisted && !forms)
        await requireAssistedInvitation(manager, id, actor, false);
      else await requireOwnedInvitation(manager, id, actor);
      return this.page(manager, id, query, forms, true);
    });
  }
  async moderate(
    actor: AuthenticatedPrincipal,
    id: string,
    wishId: string,
    body: unknown,
    assisted = false,
  ) {
    resourceId(wishId);
    const input = closedObject(body, ['status']);
    if (!['APPROVED', 'HIDDEN'].includes(String(input.status)))
      throw new UnprocessableEntityException();
    return this.db.transaction(async (manager) => {
      if (assisted) await requireAssistedInvitation(manager, id, actor);
      else await requireOwnedInvitation(manager, id, actor, true);
      const rows: ResponseRow[] = await manager.query(
        'SELECT * FROM invitation_wishes WHERE id=$1 AND invitation_id=$2 FOR UPDATE',
        [wishId, id],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException();
      if (row.status !== input.status) {
        await manager.query(
          'UPDATE invitation_wishes SET status=$2 WHERE id=$1',
          [wishId, input.status],
        );
        await manager.query(
          'INSERT INTO invitation_moderation_events(id,invitation_id,wish_id,actor_id,previous_status,new_status) VALUES($1,$2,$3,$4,$5,$6)',
          [randomUUID(), id, wishId, actor.userId, row.status, input.status],
        );
      }
      return { id: wishId, status: input.status };
    });
  }
  async likes(
    slug: string,
    browser: string | undefined,
    set?: boolean,
    address?: string,
  ) {
    if (browser) resourceId(browser);
    if (set !== undefined && !browser) throw new UnprocessableEntityException();
    return this.db.transaction(async (manager) => {
      const invitation = await this.published(manager, slug, set !== undefined);
      this.available(invitation, 'likes');
      const hash = browser
        ? createHmac('sha256', this.config.rateHmacKey)
            .update(JSON.stringify([invitation.id, browser]))
            .digest()
        : null;
      const current: { present: boolean }[] = hash
        ? await manager.query(
            'SELECT EXISTS(SELECT 1 FROM invitation_likes WHERE invitation_id=$1 AND browser_hash=$2) AS present',
            [invitation.id, hash],
          )
        : [{ present: false }];
      if (set !== undefined && set !== current[0].present) {
        await this.rate(manager, invitation.id, 'like', address);
        if (set)
          await manager.query(
            'INSERT INTO invitation_likes(invitation_id,browser_hash) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [invitation.id, hash],
          );
        else
          await manager.query(
            'DELETE FROM invitation_likes WHERE invitation_id=$1 AND browser_hash=$2',
            [invitation.id, hash],
          );
      }
      const rows: { count: string }[] = await manager.query(
        'SELECT count(*)::text AS count FROM invitation_likes WHERE invitation_id=$1',
        [invitation.id],
      );
      return { count: Number(rows[0].count), liked: set ?? current[0].present };
    });
  }
  async cleanup() {
    await this.db.query(
      "DELETE FROM invitation_interaction_rate WHERE ctid IN (SELECT ctid FROM invitation_interaction_rate WHERE created_at<clock_timestamp()-interval '24 hours' LIMIT 5000)",
    );
    await this.db.query(
      "UPDATE invitation_wishes SET source_hash=NULL WHERE id IN (SELECT id FROM invitation_wishes WHERE source_hash IS NOT NULL AND created_at<clock_timestamp()-interval '24 hours' LIMIT 5000)",
    );
    await this.db.query(
      "UPDATE invitation_form_responses SET source_hash=NULL WHERE id IN (SELECT id FROM invitation_form_responses WHERE source_hash IS NOT NULL AND created_at<clock_timestamp()-interval '24 hours' LIMIT 5000)",
    );
  }
}
