import type { EntityManager } from 'typeorm';
import { AuthTransitionProblemException } from '../../../common/errors/public-problem.exception';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type { AuthCookieName } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import {
  lockCookieGroup,
  lockCookieNames,
} from '../infrastructure/transactions';

export interface PresentedCookie {
  name: string;
  /** Undefined when duplicated/undecodable: counts as present, never acknowledges. */
  value?: string;
  bytes: number;
}

/**
 * 006 finite delivery capacity (contracts/browser-state.md §2).
 *
 * N(G) = names observed present ∪ names with an unresolved set emission.
 * - A set emission is acknowledged only by a request presenting the exact
 *   emitted value (digest compare). Nothing is released by TTL, terminal
 *   intent, abort or status probe.
 * - A name is released only when it is acknowledged and later observed absent.
 * - Clears are not accounted (they can only reduce browser state and names are
 *   never reused).
 * All writes run inside the caller's transaction and take L∞ locks last.
 */
export class CookieLedgerService {
  constructor(
    private readonly config: IdentityEnvironment,
    private readonly crypto: CredentialCrypto,
  ) {}

  /** Read cleanup targets under the caller's L0 locks, before any L-infinity lock. */
  async cleanupTargets(
    manager: EntityManager,
    groupIds: readonly string[],
    requestContextId?: string,
  ): Promise<{ name: string; retireContextId: string | null }[]> {
    if (!requestContextId) return [];
    return manager.query<{ name: string; retireContextId: string | null }[]>(
      `SELECT n.name, CASE WHEN n.kind='BINDING' AND c.state<>'RETIRED' THEN c.id ELSE NULL END AS "retireContextId"
       FROM auth_cookie_names n
       LEFT JOIN auth_sessions s ON s.id=n.owner_session_id
       LEFT JOIN auth_contexts c ON c.id=n.owner_context_id
       JOIN auth_contexts requester ON requester.id=$2
       WHERE n.group_id=ANY($1::uuid[]) AND (
         (n.kind='SLOT' AND s.revoked_at IS NOT NULL AND NOT EXISTS
           (SELECT 1 FROM auth_contexts current WHERE current.current_session_id=s.id))
         OR (n.kind='BINDING' AND c.id<>requester.id
           AND c.confirmed_seq IS DISTINCT FROM
             (SELECT max(latest.confirmed_seq) FROM auth_contexts latest WHERE latest.group_id=requester.group_id)
           AND (c.state='RETIRED' OR (c.confirmed_seq<requester.confirmed_seq AND NOT EXISTS
             (SELECT 1 FROM auth_sessions live WHERE live.id=c.current_session_id
               AND live.revoked_at IS NULL AND live.absolute_expires_at>now()))))
       ) ORDER BY n.name`,
      [groupIds, requestContextId],
    );
  }

  async rows(
    manager: EntityManager,
    groupId: string,
  ): Promise<AuthCookieName[]> {
    return manager.query<AuthCookieName[]>(
      'SELECT * FROM auth_cookie_names WHERE group_id=$1 ORDER BY name',
      [groupId],
    );
  }

  /** Apply what the browser presented on an auth endpoint request. */
  async observe(
    manager: EntityManager,
    groupId: string,
    presented: readonly PresentedCookie[],
  ): Promise<void> {
    const byName = new Map(presented.map((cookie) => [cookie.name, cookie]));
    const existing = await this.rows(manager, groupId);
    await lockCookieNames(
      manager,
      groupId,
      existing.map((row) => row.name),
    );
    const now = new Date();
    for (const row of existing) {
      const cookie = byName.get(row.name);
      byName.delete(row.name);
      const acknowledged =
        row.unresolved_set &&
        cookie?.value !== undefined &&
        row.last_set_digest !== null &&
        this.crypto
          .emissionDigest(row.name, cookie.value)
          .equals(row.last_set_digest);
      const unresolved = row.unresolved_set && !acknowledged;
      if (!cookie && !unresolved) {
        await manager.query(
          'DELETE FROM auth_cookie_names WHERE group_id=$1 AND name=$2',
          [groupId, row.name],
        );
        continue;
      }
      await manager.query(
        `UPDATE auth_cookie_names
         SET unresolved_set=$3, observed_present=$4, observed_at=$5,
             bytes=GREATEST(bytes,$6)
         WHERE group_id=$1 AND name=$2`,
        [
          groupId,
          row.name,
          unresolved,
          Boolean(cookie),
          now,
          cookie?.bytes ?? 1,
        ],
      );
    }
    // Present protocol cookies the ledger does not know (e.g. late arrivals from
    // an earlier boundary event) are counted exactly as observed names.
    for (const cookie of byName.values()) {
      const kind = /wa_cb_/.test(cookie.name) ? 'BINDING' : 'SLOT';
      await manager.query(
        `INSERT INTO auth_cookie_names
         (group_id,name,kind,owner_context_id,owner_session_id,last_set_digest,unresolved_set,observed_present,observed_at,bytes)
         VALUES ($1,$2,$3,$4,$5,NULL,false,true,$6,$7)
         ON CONFLICT (group_id,name) DO NOTHING`,
        [
          groupId,
          cookie.name,
          kind,
          kind === 'BINDING'
            ? (/wa_cb_([0-9a-f-]{36})$/.exec(cookie.name)?.[1] ?? null)
            : null,
          null,
          now,
          Math.min(Math.max(cookie.bytes, 1), 4096),
        ],
      );
    }
  }

  async usage(
    manager: EntityManager,
    groupId: string,
  ): Promise<{ names: number; bytes: number }> {
    const [row] = await manager.query<{ names: string; bytes: string }[]>(
      `SELECT count(*)::text AS names, coalesce(sum(bytes),0)::text AS bytes
       FROM auth_cookie_names
       WHERE group_id=$1 AND (observed_present OR unresolved_set)`,
      [groupId],
    );
    return { names: Number(row.names), bytes: Number(row.bytes) };
  }

  /** Reject before dispatch/issuance when one more name would exceed the cap. */
  async assertRoom(
    manager: EntityManager,
    groupId: string,
    addBytes = 96,
  ): Promise<void> {
    await lockCookieGroup(manager, groupId);
    const usage = await this.usage(manager, groupId);
    if (
      usage.names + 1 > this.config.authContext.capNames ||
      usage.bytes + addBytes > this.config.authContext.capBytes
    )
      throw new AuthTransitionProblemException('CAPACITY_EXHAUSTED');
  }

  /** Record a set emission (new name or re-emission of an existing one). */
  async recordSet(
    manager: EntityManager,
    groupId: string,
    emission: {
      name: string;
      kind: 'BINDING' | 'SLOT';
      ownerContextId?: string;
      ownerSessionId?: string;
      value: string;
    },
  ): Promise<void> {
    await lockCookieNames(manager, groupId, [emission.name]);
    const bytes = Math.min(
      Buffer.byteLength(`${emission.name}=${emission.value}`),
      4096,
    );
    await manager.query(
      `INSERT INTO auth_cookie_names
       (group_id,name,kind,owner_context_id,owner_session_id,last_set_digest,unresolved_set,observed_present,bytes)
       VALUES ($1,$2,$3,$4,$5,$6,true,false,$7)
       ON CONFLICT (group_id,name) DO UPDATE
       SET last_set_digest=EXCLUDED.last_set_digest, unresolved_set=true,
           bytes=GREATEST(auth_cookie_names.bytes,EXCLUDED.bytes)`,
      [
        groupId,
        emission.name,
        emission.kind,
        emission.ownerContextId ?? null,
        emission.ownerSessionId ?? null,
        this.crypto.emissionDigest(emission.name, emission.value),
        bytes,
      ],
    );
  }

  /**
   * Move ledger rows of merged groups into the survivor (L∞). The context rows
   * were already re-pointed under L0 by AuthContextService.
   */
  async mergeRows(
    manager: EntityManager,
    survivor: string,
    merged: readonly string[],
  ): Promise<void> {
    const others = [...new Set(merged)].filter((id) => id !== survivor).sort();
    if (!others.length) return;
    for (const groupId of [survivor, ...others].sort())
      await lockCookieGroup(manager, groupId);
    // Names are unique per context/session, so rows never collide; keep the
    // more conservative state if they somehow do.
    await manager.query(
      `INSERT INTO auth_cookie_names
       (group_id,name,kind,owner_context_id,owner_session_id,last_set_digest,unresolved_set,observed_present,observed_at,bytes)
       SELECT $1,name,kind,owner_context_id,owner_session_id,last_set_digest,unresolved_set,observed_present,observed_at,bytes
       FROM auth_cookie_names WHERE group_id = ANY($2::uuid[])
       ON CONFLICT (group_id,name) DO UPDATE
       SET unresolved_set = auth_cookie_names.unresolved_set OR EXCLUDED.unresolved_set,
           observed_present = auth_cookie_names.observed_present OR EXCLUDED.observed_present`,
      [survivor, others],
    );
    await manager.query(
      'DELETE FROM auth_cookie_names WHERE group_id = ANY($1::uuid[])',
      [others],
    );
  }
}
