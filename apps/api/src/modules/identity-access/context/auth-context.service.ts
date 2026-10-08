import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { DataSource, EntityManager } from 'typeorm';
import { AuthTransitionProblemException } from '../../../common/errors/public-problem.exception';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import { BrowserSecurityService } from '../auth/browser-security.service';
import type { AuthContext } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { lockContexts, transaction } from '../infrastructure/transactions';
import {
  CookieLedgerService,
  type PresentedCookie,
} from './cookie-ledger.service';

export type ContextRequest = Pick<Request, 'headers'> & { ip?: string };

/** A context locked (L0) for this transaction plus what the browser presented. */
export interface BoundContext {
  context: AuthContext;
  groupId: string;
  mergedGroups: string[];
  presented: PresentedCookie[];
}

/** Cookie the caller will write after commit; recorded in the ledger by settle(). */
export interface PlannedEmission {
  name: string;
  kind: 'BINDING' | 'SLOT';
  ownerContextId?: string;
  ownerSessionId?: string;
  value: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * 006 CSP-1 context authority (research R12 F1, F6).
 * Lock discipline: bind()/provision lock auth_contexts first (L0); settle()
 * performs every ledger write last (L∞). Callers place their 003 locks
 * (users → sessions → …) between the two.
 */
export class AuthContextService {
  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
    private readonly crypto: CredentialCrypto,
    private readonly browser: BrowserSecurityService,
    private readonly ledger: CookieLedgerService,
  ) {}

  slotCookieName(slotTag: string): string {
    return this.browser.slotCookieName(slotTag);
  }

  private presented(request: ContextRequest): {
    cookies: PresentedCookie[];
    bindings: { contextId: string; value?: string }[];
  } {
    const found = this.browser.protocolCookies(request);
    return {
      cookies: [...found.bindings, ...found.slots].map(
        ({ name, value, bytes }) => ({
          name,
          value,
          bytes,
        }),
      ),
      bindings: found.bindings
        .filter((binding) => UUID.test(binding.contextId))
        .map(({ contextId, value }) => ({ contextId, value })),
    };
  }

  private matches(row: AuthContext, value: string | undefined): boolean {
    if (value === undefined) return false;
    try {
      const digest = this.crypto.bindingDigest(value, row.binding_key_version);
      return (
        digest.length === row.binding_digest.length &&
        timingSafeEqual(digest, row.binding_digest)
      );
    } catch {
      return false;
    }
  }

  /**
   * Lock (L0) every context in the groups of verified co-presented bindings,
   * then re-point merged groups to the survivor (min id).
   */
  private async lockGroups(
    manager: EntityManager,
    bindings: { contextId: string; value?: string }[],
    extraContextIds: string[] = [],
  ): Promise<{
    rows: Map<string, AuthContext>;
    groupId?: string;
    merged: string[];
  }> {
    const ids = [
      ...new Set([...bindings.map((b) => b.contextId), ...extraContextIds]),
    ];
    const observed = ids.length
      ? await manager.query<AuthContext[]>(
          'SELECT * FROM auth_contexts WHERE id = ANY($1::uuid[])',
          [ids],
        )
      : [];
    const verified = observed.filter(
      (row) =>
        extraContextIds.includes(row.id) ||
        this.matches(row, bindings.find((b) => b.contextId === row.id)?.value),
    );
    const groups = [...new Set(verified.map((row) => row.group_id))];
    const members = groups.length
      ? await manager.query<{ id: string }[]>(
          'SELECT id FROM auth_contexts WHERE group_id = ANY($1::uuid[])',
          [groups],
        )
      : [];
    const lockedIds = new Set([
      ...members.map((m) => m.id),
      ...extraContextIds,
    ]);
    await lockContexts(manager, [...lockedIds]);
    const locked = ids.length
      ? await manager.query<AuthContext[]>(
          'SELECT * FROM auth_contexts WHERE id = ANY($1::uuid[])',
          [ids],
        )
      : [];
    const rows = new Map(locked.map((row) => [row.id, row]));
    const lockedGroups = [
      ...new Set(
        locked
          .filter((row) => verified.some((v) => v.id === row.id))
          .map((row) => row.group_id),
      ),
    ].sort();
    if (!lockedGroups.length) return { rows, merged: [] };
    // READ COMMITTED snapshots may have changed while L0 acquisition waited.
    // Every merge/join writer locks existing members before changing membership;
    // with the complete current set held, membership cannot change until commit.
    // Restart the whole transaction instead of adding L0 locks out of order.
    const currentMembers = await manager.query<{ id: string }[]>(
      'SELECT id FROM auth_contexts WHERE group_id = ANY($1::uuid[])',
      [lockedGroups],
    );
    if (currentMembers.some((member) => !lockedIds.has(member.id)))
      throw Object.assign(new Error('AUTH_CONTEXT_MEMBERSHIP_CHANGED'), {
        code: '40001',
      });
    const [survivor, ...others] = lockedGroups;
    if (others.length) {
      await manager.query(
        'UPDATE auth_contexts SET group_id=$1 WHERE group_id = ANY($2::uuid[])',
        [survivor, others],
      );
      for (const row of rows.values())
        if (others.includes(row.group_id)) row.group_id = survivor;
    }
    return { rows, groupId: survivor, merged: others };
  }

  /** Verify binding possession for `contextId` and lock it (L0). */
  async bind(
    manager: EntityManager,
    request: ContextRequest,
    contextId: string,
    options: { allowProvisional?: boolean; readOnly?: boolean } = {},
  ): Promise<BoundContext> {
    if (
      !UUID.test(contextId) ||
      request.headers['x-auth-context'] !== contextId
    )
      throw new AuthTransitionProblemException('BINDING_INVALID');
    const value = this.browser.readExactlyOne(
      request,
      this.browser.bindingCookieName(contextId),
    );
    if (!value) throw new AuthTransitionProblemException('BINDING_INVALID');
    const presented = this.presented(request);
    const own = presented.bindings.find((b) => b.contextId === contextId);
    if (!own || own.value !== value)
      throw new AuthTransitionProblemException('BINDING_INVALID');
    let rows: Map<string, AuthContext>;
    let groupId: string | undefined;
    let merged: string[];
    if (options.readOnly) {
      // Receipts authenticate their own context without mutating co-present
      // groups. A group merge requires ledger settlement in the same commit;
      // a read-only probe must neither merge nor acknowledge/release names.
      await lockContexts(manager, [contextId]);
      const locked = await manager.query<AuthContext[]>(
        'SELECT * FROM auth_contexts WHERE id=$1',
        [contextId],
      );
      rows = new Map(locked.map((row) => [row.id, row]));
      groupId = locked[0]?.group_id;
      merged = [];
    } else {
      ({ rows, groupId, merged } = await this.lockGroups(
        manager,
        presented.bindings,
      ));
    }
    const context = rows.get(contextId);
    if (!context || !this.matches(context, value) || !groupId)
      throw new AuthTransitionProblemException('BINDING_INVALID');
    if (
      context.state === 'RETIRED' ||
      (context.state === 'PROVISIONAL' && !options.allowProvisional)
    )
      throw new AuthTransitionProblemException('CONTEXT_UNAVAILABLE');
    const now = Date.now();
    if (
      !options.readOnly &&
      (!context.last_seen_at || now - context.last_seen_at.getTime() > 60_000)
    )
      await manager.query(
        'UPDATE auth_contexts SET last_seen_at=now() WHERE id=$1',
        [contextId],
      );
    return {
      context,
      groupId,
      mergedGroups: merged,
      presented: presented.cookies,
    };
  }

  /**
   * L∞ — must be the last step of the transaction: merge ledger rows, apply
   * what the browser presented, then check room for and record emissions.
   */
  async settle(
    manager: EntityManager,
    bound: Pick<BoundContext, 'groupId' | 'mergedGroups' | 'presented'> & {
      context?: AuthContext;
    },
    emissions: readonly PlannedEmission[] = [],
  ): Promise<string[]> {
    const cleanup = await this.ledger.cleanupTargets(
      manager,
      [bound.groupId, ...bound.mergedGroups],
      bound.context?.id,
    );
    const retire = cleanup
      .map((target) => target.retireContextId)
      .filter((id): id is string => id !== null);
    // These group context rows were already locked at L0. Retire before ledger locks
    // so a late clear can never delete a binding subsequently used for a new session.
    if (retire.length)
      await manager.query(
        "UPDATE auth_contexts SET state='RETIRED',retired_at=now() WHERE id=ANY($1::uuid[]) AND state<>'RETIRED'",
        [retire],
      );
    await this.ledger.mergeRows(manager, bound.groupId, bound.mergedGroups);
    await this.ledger.observe(manager, bound.groupId, bound.presented);
    const known = new Set(
      (await this.ledger.rows(manager, bound.groupId))
        .filter((row) => row.observed_present || row.unresolved_set)
        .map((row) => row.name),
    );
    for (const emission of emissions) {
      if (!known.has(emission.name)) {
        await this.ledger.assertRoom(
          manager,
          bound.groupId,
          Buffer.byteLength(`${emission.name}=${emission.value}`),
        );
        known.add(emission.name);
      }
      await this.ledger.recordSet(manager, bound.groupId, emission);
    }
    return cleanup.map((target) => target.name);
  }

  /** Room check without emitting (reserve-time rejection before dispatch). */
  async assertRoomForNewName(
    manager: EntityManager,
    bound: Pick<BoundContext, 'groupId' | 'mergedGroups' | 'presented'>,
  ): Promise<void> {
    await this.ledger.mergeRows(manager, bound.groupId, bound.mergedGroups);
    await this.ledger.observe(manager, bound.groupId, bound.presented);
    await this.ledger.assertRoom(manager, bound.groupId);
  }

  async provision(
    request: ContextRequest,
  ): Promise<{ contextId: string; secret: string }> {
    return transaction(this.db, async (manager) => {
      const presented = this.presented(request);
      const { groupId, merged } = await this.lockGroups(
        manager,
        presented.bindings,
      );
      const group = groupId ?? randomUUID();
      const contextId = randomUUID();
      const secret = this.crypto.randomToken();
      await manager.query(
        `INSERT INTO auth_contexts (id,binding_digest,binding_key_version,group_id,state,revision,created_at)
         VALUES ($1,$2,$3,$4,'PROVISIONAL',0,now())`,
        [
          contextId,
          this.crypto.bindingDigest(secret, this.config.keyVersion),
          this.config.keyVersion,
          group,
        ],
      );
      await this.settle(
        manager,
        { groupId: group, mergedGroups: merged, presented: presented.cookies },
        [
          {
            name: this.browser.bindingCookieName(contextId),
            kind: 'BINDING',
            ownerContextId: contextId,
            value: secret,
          },
        ],
      );
      return { contextId, secret };
    });
  }

  async confirm(
    request: ContextRequest,
    contextId: string,
  ): Promise<{
    contextId: string;
    revision: number;
    sessionTag: string | null;
    secret: string;
    cleanupNames: string[];
  }> {
    return transaction(this.db, async (manager) => {
      const bound = await this.bind(manager, request, contextId, {
        allowProvisional: true,
      });
      if (bound.context.state === 'PROVISIONAL')
        await manager.query(
          `UPDATE auth_contexts SET state='ACTIVE',confirmed_seq=nextval('auth_context_confirm_seq'),
           confirmed_at=now() WHERE id=$1`,
          [contextId],
        );
      const secret = this.browser.readExactlyOne(
        request,
        this.browser.bindingCookieName(contextId),
      ) as string;
      const sessionTag = await this.currentSessionTag(manager, bound.context);
      const cleanupNames = await this.settle(manager, bound, [
        {
          name: this.browser.bindingCookieName(contextId),
          kind: 'BINDING',
          ownerContextId: contextId,
          value: secret,
        },
      ]);
      return {
        contextId,
        revision: Number(bound.context.revision),
        sessionTag,
        secret,
        cleanupNames,
      };
    });
  }

  /** Slot tag of the context's live current session, else null (lazy retirement). */
  async currentSessionTag(
    manager: EntityManager,
    context: AuthContext,
  ): Promise<string | null> {
    if (!context.current_session_id) return null;
    const [row] = await manager.query<{ slot_tag: string | null }[]>(
      `SELECT slot_tag FROM auth_sessions
       WHERE id=$1 AND revoked_at IS NULL AND absolute_expires_at > now()`,
      [context.current_session_id],
    );
    return row?.slot_tag ?? null;
  }
}
