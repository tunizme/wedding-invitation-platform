import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { AuthTransitionProblemException } from '../../../common/errors/public-problem.exception';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type { AuthIntent, AuthIntentKind } from '../domain/entities';
import {
  lockSessions,
  lockUsers,
  transaction,
} from '../infrastructure/transactions';
import {
  AuthContextService,
  type BoundContext,
  type ContextRequest,
} from './auth-context.service';

export interface ReserveInput {
  kind: AuthIntentKind;
  expectedRevision: number;
  expectedSessionTag?: string | null;
}

export interface ReservedIntent {
  intentId: string;
  kind: AuthIntentKind;
  revision: number;
  expiresAt: Date;
}

export interface IntentOutcome {
  authProtocol: 2;
  intentId: string;
  state: 'RESERVED' | 'COMMITTED' | 'SUPERSEDED' | 'FAILED' | 'EXPIRED';
  outcomeCode: string | null;
  contextRevision: number;
  currentSessionTag: string | null;
}

const ESTABLISHING: readonly AuthIntentKind[] = [
  'LOCAL_LOGIN',
  'OAUTH',
  'ONBOARDING_COMPLETE',
];

/**
 * 006 two-phase intents (research R12 F2, P01-b).
 * reserve(): expected-revision CAS under the context lock; accepting bumps the
 * revision and supersedes the previous RESERVED intent. assertCurrent(): every
 * execute/commit re-checks that the intent is still the context's current one
 * at the same revision and not expired.
 */
export class AuthIntentService {
  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
    private readonly contexts: AuthContextService,
  ) {}

  async reserve(
    request: ContextRequest,
    contextId: string,
    input: ReserveInput,
  ): Promise<ReservedIntent> {
    return transaction(this.db, async (manager) => {
      const bound = await this.contexts.bind(manager, request, contextId);
      const current = Number(bound.context.revision);
      if (current !== input.expectedRevision)
        throw new AuthTransitionProblemException('STALE_REVISION', current);
      let targetSessionId: string | null = null;
      if (input.kind === 'LOGOUT' && input.expectedSessionTag) {
        const [row] = await manager.query<{ id: string }[]>(
          'SELECT id FROM auth_sessions WHERE slot_tag=$1 AND context_id=$2',
          [input.expectedSessionTag, contextId],
        );
        targetSessionId = row?.id ?? null;
      }
      const revision = current + 1;
      const seconds =
        input.kind === 'OAUTH'
          ? this.config.authContext.oauthIntentSeconds
          : this.config.authContext.intentSeconds;
      const id = randomUUID();
      const [{ expires_at: expiresAt }] = await manager.query<
        { expires_at: Date }[]
      >(
        `INSERT INTO auth_intents (id,context_id,kind,revision,state,target_session_id,expires_at,created_at)
         VALUES ($1,$2,$3,$4,'RESERVED',$5,now() + make_interval(secs => $6),now())
         RETURNING expires_at`,
        [id, contextId, input.kind, revision, targetSessionId, seconds],
      );
      await manager.query(
        `UPDATE auth_intents SET state='SUPERSEDED',outcome_code='SUPERSEDED',resolved_at=now()
         WHERE context_id=$1 AND state='RESERVED' AND id<>$2`,
        [contextId, id],
      );
      await manager.query(
        'UPDATE auth_contexts SET revision=$2,current_intent_id=$3 WHERE id=$1',
        [contextId, revision, id],
      );
      // Reject session-establishing work before dispatch when no room remains.
      if (ESTABLISHING.includes(input.kind))
        await this.contexts.assertRoomForNewName(manager, bound);
      else await this.contexts.settle(manager, bound);
      return { intentId: id, kind: input.kind, revision, expiresAt };
    });
  }

  /** Read-only reconciliation receipt; it never emits or acknowledges cookies. */
  async outcome(
    request: ContextRequest,
    contextId: string,
    intentId: string,
  ): Promise<IntentOutcome> {
    return transaction(this.db, async (manager) => {
      const bound = await this.contexts.bind(manager, request, contextId, {
        readOnly: true,
      });
      const [intent] = await manager.query<
        {
          id: string;
          state: IntentOutcome['state'];
          outcome_code: string | null;
          expired: boolean;
        }[]
      >(
        `SELECT id,state,outcome_code,
                (state='RESERVED' AND expires_at <= now()) AS expired
         FROM auth_intents
         WHERE id=$1 AND context_id=$2 AND (
           (state='RESERVED' AND expires_at > now() - interval '24 hours')
           OR (state<>'RESERVED' AND resolved_at > now() - interval '24 hours')
         )`,
        [intentId, contextId],
      );
      if (!intent) throw new NotFoundException();
      const state = intent.expired ? 'EXPIRED' : intent.state;
      return {
        authProtocol: 2,
        intentId: intent.id,
        state,
        outcomeCode: intent.expired ? null : intent.outcome_code,
        contextRevision: Number(bound.context.revision),
        currentSessionTag: await this.contexts.currentSessionTag(
          manager,
          bound.context,
        ),
      };
    });
  }

  /** Execute-time authority check; context must be bound (L0) in this tx. */
  async assertCurrent(
    manager: EntityManager,
    bound: BoundContext,
    intentId: string,
    kind?: AuthIntentKind,
  ): Promise<AuthIntent> {
    const [intent] = await manager.query<AuthIntent[]>(
      'SELECT * FROM auth_intents WHERE id=$1 AND context_id=$2 FOR UPDATE',
      [intentId, bound.context.id],
    );
    const current =
      intent &&
      intent.state === 'RESERVED' &&
      bound.context.current_intent_id === intent.id &&
      String(bound.context.revision) === String(intent.revision) &&
      (!kind || intent.kind === kind);
    if (!current) throw new AuthTransitionProblemException('SUPERSEDED');
    const [{ expired }] = await manager.query<{ expired: boolean }[]>(
      'SELECT expires_at <= now() AS expired FROM auth_intents WHERE id=$1',
      [intentId],
    );
    // Expired intents stay RESERVED in storage until superseded or retained
    // cleanup; outcome lookup reports them as EXPIRED.
    if (expired) throw new AuthTransitionProblemException('SUPERSEDED');
    return intent;
  }

  /**
   * 006 F4: end the session captured by a reserved LOGOUT intent. Revokes only
   * that session; clears the context's current session only if it is that one.
   * `verifyCsrf` runs for a live captured session before revocation (003).
   * Returns the captured slot tag so the caller clears exactly that cookie.
   */
  async logoutCaptured(
    request: ContextRequest,
    contextId: string,
    intentId: string,
    verifyCsrf: (session: {
      id: string;
      csrf_seed: Buffer;
      csrf_key_version: number;
    }) => void,
  ): Promise<{ slotTag: string | null; cleanupNames: string[] }> {
    return transaction(this.db, async (manager) => {
      const bound = await this.contexts.bind(manager, request, contextId);
      const intent = await this.assertCurrent(
        manager,
        bound,
        intentId,
        'LOGOUT',
      );
      let slotTag: string | null = null;
      if (intent.target_session_id) {
        const [target] = await manager.query<
          {
            id: string;
            user_id: string;
            slot_tag: string | null;
            csrf_seed: Buffer;
            csrf_key_version: number;
            live: boolean;
          }[]
        >(
          `SELECT id,user_id,slot_tag,csrf_seed,csrf_key_version,
                  (revoked_at IS NULL AND absolute_expires_at > now()) AS live
           FROM auth_sessions WHERE id=$1`,
          [intent.target_session_id],
        );
        if (target) {
          slotTag = target.slot_tag;
          if (target.live) {
            verifyCsrf(target);
            await lockUsers(manager, [target.user_id]);
            await lockSessions(manager, target.user_id);
            await manager.query(
              `UPDATE auth_sessions SET revoked_at=now(),revocation_reason='LOGOUT'
               WHERE id=$1 AND revoked_at IS NULL`,
              [target.id],
            );
          }
        }
      }
      if (
        intent.target_session_id &&
        bound.context.current_session_id === intent.target_session_id
      )
        await manager.query(
          'UPDATE auth_contexts SET current_session_id=NULL WHERE id=$1',
          [contextId],
        );
      await this.resolve(manager, intentId, 'COMMITTED', 'SESSION_ENDED');
      const cleanupNames = await this.contexts.settle(manager, bound);
      return { slotTag, cleanupNames };
    });
  }

  async resolve(
    manager: EntityManager,
    intentId: string,
    state: 'COMMITTED' | 'FAILED',
    outcomeCode: string,
    targetSessionId?: string | null,
  ): Promise<void> {
    await manager.query(
      `UPDATE auth_intents SET state=$2,outcome_code=$3,resolved_at=now(),
       target_session_id=COALESCE($4,target_session_id) WHERE id=$1`,
      [intentId, state, outcomeCode, targetSessionId ?? null],
    );
    await manager.query(
      'UPDATE auth_contexts SET current_intent_id=NULL WHERE current_intent_id=$1',
      [intentId],
    );
  }
}
