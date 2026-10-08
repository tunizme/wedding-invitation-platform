import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import { lockContexts, lockUsers, transaction } from './transactions';

export interface RetentionRunMetrics {
  durationMs: number;
  deleted: Readonly<Record<string, number>>;
  ciphertextCleared: Readonly<Record<string, number>>;
  terminalized: Readonly<Record<string, number>>;
  failure: boolean;
}

type CountRow = { count: string | number };
type TerminalizedRow = CountRow & {
  ciphertext_count: string | number;
};
type RetainedSessionCandidate = {
  id: string;
  user_id: string;
  context_id: string | null;
};
type RetentionAuthorities = {
  contextIds: string[];
  retireContextIds: string[];
  expiredIntentIds: string[];
  deleteIntentIds: string[];
  expiredOnboardingIds: string[];
  deleteOnboardingIds: string[];
  expiredOauthIds: string[];
  clearOauthIds: string[];
  deleteOauthIds: string[];
  sessionIds: string[];
  userIds: string[];
};

export class RetentionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RetentionWorker.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;

  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule(60_000);
  }

  private schedule(delayMs = 3_600_000): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .then((metrics) => {
          this.logger.log(
            JSON.stringify({ event: 'IAM_RETENTION', ...metrics }),
          );
        })
        .catch(() => {
          this.logger.warn('IAM_RETENTION_CYCLE_FAILED');
        })
        .finally(() => {
          this.running = undefined;
          this.schedule();
        });
    }, delayMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  private async boundedDelete(
    manager: EntityManager,
    table: string,
    predicate: string,
    parameters: unknown[],
  ): Promise<number> {
    const rows = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM ${table} WHERE ${predicate}
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), deleted AS (
         DELETE FROM ${table} target USING candidates
         WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM deleted`,
      [this.config.retention.batchSize, ...parameters],
    );
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Discover the bounded authorities retention may touch, then acquire L0
   * contexts before any lower relation is locked or changed. Account users are
   * locked later, immediately before their session candidates.
   * The returned session IDs are revalidated under row locks before deletion.
   */
  private async lockRetentionAuthorities(
    manager: EntityManager,
  ): Promise<RetentionAuthorities> {
    const batch = this.config.retention.batchSize;
    const r = this.config.retention;
    const contextIds = new Set<string>();
    const collect = (rows: Array<{ id: string | null }>) => {
      for (const row of rows) if (row.id) contextIds.add(row.id);
    };
    const ids = async (sql: string, parameters: unknown[] = []) =>
      manager.query<{ id: string }[]>(sql, parameters);
    const sessions = await manager.query<RetainedSessionCandidate[]>(
      `SELECT id,user_id,context_id FROM auth_sessions
       WHERE GREATEST(absolute_expires_at,COALESCE(revoked_at,absolute_expires_at))
             < now()-($2 * interval '1 day')
       ORDER BY id LIMIT $1`,
      [batch, r.sessionDays],
    );
    const retireContexts = await ids(
      `SELECT id FROM auth_contexts
       WHERE (state='PROVISIONAL' AND created_at < now()-interval '1 hour')
          OR (state='ACTIVE' AND COALESCE(last_seen_at,confirmed_at,created_at) < now()-interval '30 days')
       ORDER BY ctid LIMIT $1`,
      [batch],
    );
    collect(retireContexts);
    const expiredIntents = await ids(
      `SELECT id FROM auth_intents WHERE state='RESERVED' AND expires_at <= now()
       ORDER BY expires_at,id LIMIT $1`,
      [batch],
    );
    const expiredIntentOwners = await manager.query<{ id: string | null }[]>(
      'SELECT context_id AS id FROM auth_intents WHERE id=ANY($1::uuid[])',
      [expiredIntents.map(({ id }) => id)],
    );
    collect(expiredIntentOwners);
    const deletedIntents = await ids(
      `SELECT id FROM auth_intents
       WHERE (state IN ('COMMITTED','SUPERSEDED','FAILED','EXPIRED')
              AND resolved_at < now()-interval '24 hours')
          OR (state='RESERVED' AND expires_at < now()-interval '24 hours')
       ORDER BY ctid LIMIT $1`,
      [batch],
    );
    const deletedIntentOwners = await manager.query<{ id: string | null }[]>(
      'SELECT context_id AS id FROM auth_intents WHERE id=ANY($1::uuid[])',
      [deletedIntents.map(({ id }) => id)],
    );
    collect(deletedIntentOwners);
    collect(sessions.map(({ context_id }) => ({ id: context_id })));
    const expiredOnboardings = await ids(
      `SELECT id FROM pending_social_onboardings
       WHERE status IN ('PENDING_EMAIL','PENDING_VERIFICATION') AND expires_at < now()
       ORDER BY ctid LIMIT $1`,
      [batch],
    );
    const expiredOnboardingOwners = await manager.query<
      { id: string | null }[]
    >(
      'SELECT context_id AS id FROM pending_social_onboardings WHERE id=ANY($1::uuid[])',
      [expiredOnboardings.map(({ id }) => id)],
    );
    collect(expiredOnboardingOwners);
    const deletedOnboardings = await ids(
      `SELECT id FROM pending_social_onboardings
       WHERE ((status IN ('EXPIRED','CANCELLED','PENDING_EMAIL','PENDING_VERIFICATION') AND expires_at < now()-($2 * interval '1 day'))
              OR (status='COMPLETED' AND completed_at < now()-($3 * interval '1 day')))
       ORDER BY ctid LIMIT $1`,
      [batch, r.onboardingExpiredDays, r.onboardingCompletedDays],
    );
    const deletedOnboardingOwners = await manager.query<
      { id: string | null }[]
    >(
      'SELECT context_id AS id FROM pending_social_onboardings WHERE id=ANY($1::uuid[])',
      [deletedOnboardings.map(({ id }) => id)],
    );
    collect(deletedOnboardingOwners);
    const expiredOauth = await ids(
      `SELECT id FROM oauth_transactions
       WHERE (status='PENDING' AND expires_at < now())
          OR (status='PROCESSING' AND expires_at < now() AND claimed_at IS NOT NULL
              AND claimed_at < now()-interval '1 minute')
       ORDER BY ctid LIMIT $1`,
      [batch],
    );
    const clearOauth = await ids(
      `SELECT id FROM oauth_transactions
       WHERE status IN ('CONSUMED','FAILED','EXPIRED')
         AND (pkce_verifier_ciphertext IS NOT NULL OR encryption_key_version IS NOT NULL)
       ORDER BY ctid LIMIT $1`,
      [batch],
    );
    const deletedOauth = await ids(
      `SELECT id FROM oauth_transactions
       WHERE ((status IN ('CONSUMED','FAILED','EXPIRED'))
           OR (status='PENDING' AND expires_at < now())
           OR (status='PROCESSING' AND expires_at < now() AND claimed_at < now()-interval '1 minute'))
         AND COALESCE(consumed_at,claimed_at,expires_at) < now()-($2 * interval '1 hour')
       ORDER BY ctid LIMIT $1`,
      [batch, r.oauthHours],
    );
    const oauthOwners = await manager.query<{ id: string | null }[]>(
      `SELECT intent.context_id AS id FROM oauth_transactions oauth
       JOIN auth_intents intent ON intent.id=oauth.intent_id
       WHERE oauth.id=ANY($1::uuid[])`,
      [[...expiredOauth, ...clearOauth, ...deletedOauth].map(({ id }) => id)],
    );
    collect(oauthOwners);
    // Wait briefly for sorted L0 authorities; lower candidate rows remain
    // SKIP LOCKED. A busy context aborts this cycle instead of an unbounded wait.
    await manager.query("SET LOCAL lock_timeout = '3s'");
    await lockContexts(manager, [...contextIds]);

    const ownershipRows = await manager.query<
      { id: string; context_id: string | null }[]
    >(
      `SELECT id,context_id FROM pending_social_onboardings
       WHERE id=ANY($1::uuid[])
       UNION ALL
       SELECT oauth.id,intent.context_id FROM oauth_transactions oauth
       JOIN auth_intents intent ON intent.id=oauth.intent_id
       WHERE oauth.id=ANY($2::uuid[])
       UNION ALL
       SELECT id,context_id FROM auth_intents WHERE id=ANY($3::uuid[])`,
      [
        [...expiredOnboardings, ...deletedOnboardings].map(({ id }) => id),
        [...expiredOauth, ...clearOauth, ...deletedOauth].map(({ id }) => id),
        [...expiredIntents, ...deletedIntents].map(({ id }) => id),
      ],
    );
    if (
      ownershipRows.some(
        (row) => row.context_id && !contextIds.has(row.context_id),
      )
    ) {
      const retry = new Error(
        'Retention owner context changed during discovery',
      );
      Object.assign(retry, { code: '40001' });
      throw retry;
    }
    const sessionsNow = await manager.query<RetainedSessionCandidate[]>(
      'SELECT id,user_id,context_id FROM auth_sessions WHERE id=ANY($1::uuid[])',
      [sessions.map(({ id }) => id)],
    );
    const expectedSessions = new Map(sessions.map((row) => [row.id, row]));
    if (
      sessionsNow.some(
        (row) =>
          (row.context_id !== null && !contextIds.has(row.context_id)) ||
          expectedSessions.get(row.id)?.user_id !== row.user_id,
      )
    ) {
      const retry = new Error(
        'Retention session owner changed during discovery',
      );
      Object.assign(retry, { code: '40001' });
      throw retry;
    }

    return {
      contextIds: [...contextIds],
      retireContextIds: retireContexts.map(({ id }) => id),
      expiredIntentIds: expiredIntents.map(({ id }) => id),
      deleteIntentIds: deletedIntents.map(({ id }) => id),
      expiredOnboardingIds: expiredOnboardings.map(({ id }) => id),
      deleteOnboardingIds: deletedOnboardings.map(({ id }) => id),
      expiredOauthIds: expiredOauth.map(({ id }) => id),
      clearOauthIds: clearOauth.map(({ id }) => id),
      deleteOauthIds: deletedOauth.map(({ id }) => id),
      sessionIds: sessions.map(({ id }) => id),
      userIds: [...new Set(sessions.map(({ user_id }) => user_id))].sort(),
    };
  }

  private async clearTerminalCiphertext(
    manager: EntityManager,
    authorities: RetentionAuthorities,
  ): Promise<Record<string, number>> {
    const batch = this.config.retention.batchSize;
    const oauth = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM oauth_transactions
         WHERE id=ANY($2::uuid[])
           AND status IN ('CONSUMED','FAILED','EXPIRED')
           AND (pkce_verifier_ciphertext IS NOT NULL OR encryption_key_version IS NOT NULL)
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE oauth_transactions target
         SET pkce_verifier_ciphertext=NULL,encryption_key_version=NULL
         FROM candidates WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch, authorities.clearOauthIds],
    );
    const outbox = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM email_outbox
         WHERE status IN ('DELIVERED','TERMINAL_FAILURE')
           AND (payload_ciphertext IS NOT NULL OR encryption_key_version IS NOT NULL)
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE email_outbox target
         SET payload_ciphertext=NULL,encryption_key_version=NULL
         FROM candidates WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch],
    );
    return {
      oauthTransactions: Number(oauth[0]?.count ?? 0),
      emailOutbox: Number(outbox[0]?.count ?? 0),
    };
  }

  private async terminalizeExpired(
    manager: EntityManager,
    authorities: RetentionAuthorities,
  ): Promise<{
    terminalized: Record<string, number>;
    ciphertextCleared: Record<string, number>;
  }> {
    const batch = this.config.retention.batchSize;
    const outbox = await manager.query<TerminalizedRow[]>(
      `WITH candidates AS (
         SELECT o.ctid,c.expires_at,
                (o.payload_ciphertext IS NOT NULL OR o.encryption_key_version IS NOT NULL) AS had_ciphertext
         FROM email_outbox o
         JOIN auth_challenges c ON c.id=o.challenge_id
         WHERE c.status IN ('ACTIVE','PENDING_DELIVERY')
           AND c.expires_at < now()
           AND o.status IN ('PENDING','PROCESSING','RETRYABLE_FAILURE')
         ORDER BY o.ctid LIMIT $1 FOR UPDATE OF o SKIP LOCKED
       ), changed AS (
         UPDATE email_outbox target
         SET status='TERMINAL_FAILURE',payload_ciphertext=NULL,encryption_key_version=NULL,
             lease_owner=NULL,lease_expires_at=NULL,last_error_code='CHALLENGE_EXPIRED',
             updated_at=candidates.expires_at
         FROM candidates WHERE target.ctid=candidates.ctid
         RETURNING candidates.had_ciphertext
       ) SELECT count(*)::integer AS count,
                count(*) FILTER (WHERE had_ciphertext)::integer AS ciphertext_count
         FROM changed`,
      [batch],
    );
    const challenges = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM auth_challenges
         WHERE status IN ('ACTIVE','PENDING_DELIVERY')
           AND expires_at < now()
           AND NOT EXISTS (
             SELECT 1 FROM email_outbox o
             WHERE o.challenge_id=auth_challenges.id
               AND o.status IN ('PENDING','PROCESSING','RETRYABLE_FAILURE')
           )
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE auth_challenges target
         SET status='REVOKED',revoked_at=target.expires_at
         FROM candidates WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch],
    );
    const onboardings = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM pending_social_onboardings
         WHERE id=ANY($2::uuid[])
           AND status IN ('PENDING_EMAIL','PENDING_VERIFICATION')
           AND expires_at < now()
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE pending_social_onboardings target
         SET status='EXPIRED',updated_at=target.expires_at
         FROM candidates WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch, authorities.expiredOnboardingIds],
    );
    const oauth = await manager.query<TerminalizedRow[]>(
      `WITH candidates AS (
         SELECT ctid,
                (pkce_verifier_ciphertext IS NOT NULL OR encryption_key_version IS NOT NULL) AS had_ciphertext
         FROM oauth_transactions
         WHERE id=ANY($2::uuid[])
           AND ((status='PENDING' AND expires_at < now())
            OR (status='PROCESSING' AND expires_at < now()
                AND claimed_at IS NOT NULL
                AND claimed_at < now()-interval '1 minute'))
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE oauth_transactions target
         SET status='EXPIRED',failure_code='EXPIRED',
             pkce_verifier_ciphertext=NULL,encryption_key_version=NULL
         FROM candidates WHERE target.ctid=candidates.ctid
         RETURNING candidates.had_ciphertext
       ) SELECT count(*)::integer AS count,
                count(*) FILTER (WHERE had_ciphertext)::integer AS ciphertext_count
         FROM changed`,
      [batch, authorities.expiredOauthIds],
    );
    return {
      terminalized: {
        emailOutbox: Number(outbox[0]?.count ?? 0),
        authChallenges: Number(challenges[0]?.count ?? 0),
        pendingOnboardings: Number(onboardings[0]?.count ?? 0),
        oauthTransactions: Number(oauth[0]?.count ?? 0),
      },
      ciphertextCleared: {
        emailOutbox: Number(outbox[0]?.ciphertext_count ?? 0),
        oauthTransactions: Number(oauth[0]?.ciphertext_count ?? 0),
      },
    };
  }

  private async retainAuthTransition(
    manager: EntityManager,
    authorities: RetentionAuthorities,
  ): Promise<{
    contextsRetired: number;
    intentsExpired: number;
    intentsDeleted: number;
  }> {
    const batch = this.config.retention.batchSize;
    const contexts = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM auth_contexts
         WHERE id=ANY($2::uuid[])
           AND ((state='PROVISIONAL' AND created_at < now()-interval '1 hour')
             OR (state='ACTIVE' AND COALESCE(last_seen_at,confirmed_at,created_at) < now()-interval '30 days'))
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE auth_contexts target SET state='RETIRED',retired_at=now()
         FROM candidates WHERE target.ctid=candidates.ctid AND target.state<>'RETIRED'
         RETURNING 1
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch, authorities.retireContextIds],
    );
    const expired = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT i.ctid,i.id,i.context_id
         FROM auth_intents i JOIN auth_contexts c ON c.id=i.context_id
         WHERE i.id=ANY($2::uuid[])
           AND i.state='RESERVED' AND i.expires_at <= now()
         ORDER BY i.expires_at,i.id LIMIT $1 FOR UPDATE OF i SKIP LOCKED
       ), cleared AS (
         UPDATE auth_contexts context SET current_intent_id=NULL
         FROM candidates WHERE context.id=candidates.context_id
           AND context.current_intent_id=candidates.id
         RETURNING context.id
       ), changed AS (
         UPDATE auth_intents target
         SET state='EXPIRED',resolved_at=target.expires_at,outcome_code=NULL
         FROM candidates WHERE target.ctid=candidates.ctid RETURNING target.id
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch, authorities.expiredIntentIds],
    );
    const removed = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM auth_intents
         WHERE id=ANY($2::uuid[])
           AND state IN ('COMMITTED','SUPERSEDED','FAILED','EXPIRED')
           AND resolved_at < now()-interval '24 hours'
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), deleted AS (
         DELETE FROM auth_intents target USING candidates
         WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM deleted`,
      [batch, authorities.deleteIntentIds],
    );
    return {
      contextsRetired: Number(contexts[0]?.count ?? 0),
      intentsExpired: Number(expired[0]?.count ?? 0),
      intentsDeleted: Number(removed[0]?.count ?? 0),
    };
  }

  async runOnce(): Promise<RetentionRunMetrics> {
    const started = performance.now();
    try {
      const result = await transaction(this.db, async (manager) => {
        const r = this.config.retention;
        const retentionAuthorities =
          await this.lockRetentionAuthorities(manager);
        const expired = await this.terminalizeExpired(
          manager,
          retentionAuthorities,
        );
        const authTransition = await this.retainAuthTransition(
          manager,
          retentionAuthorities,
        );
        const ciphertextCleared = await this.clearTerminalCiphertext(
          manager,
          retentionAuthorities,
        );
        ciphertextCleared.oauthTransactions +=
          expired.ciphertextCleared.oauthTransactions;
        ciphertextCleared.emailOutbox += expired.ciphertextCleared.emailOutbox;
        const deleted: Record<string, number> = {};

        // Dependants are removed before their RESTRICT owners.
        deleted.emailOutbox = await this.boundedDelete(
          manager,
          'email_outbox',
          `status IN ('DELIVERED','TERMINAL_FAILURE')
           AND COALESCE(delivered_at,updated_at) < now()-($2 * interval '1 day')`,
          [r.outboxDays],
        );
        deleted.authChallenges = await this.boundedDelete(
          manager,
          'auth_challenges',
          `status IN ('CONSUMED','REVOKED','DELIVERY_FAILED')
           AND COALESCE(consumed_at,revoked_at,delivery_failed_at,expires_at)
               < now()-($2 * interval '1 day')
           AND NOT EXISTS (SELECT 1 FROM email_outbox o WHERE o.challenge_id=auth_challenges.id)`,
          [r.challengeDays],
        );
        deleted.pendingOnboardings = await this.boundedDelete(
          manager,
          'pending_social_onboardings',
          `id=ANY($2::uuid[]) AND
           ((status IN ('EXPIRED','CANCELLED') AND expires_at < now()-($3 * interval '1 day'))
             OR (status='COMPLETED' AND completed_at < now()-($4 * interval '1 day')))
           AND NOT EXISTS (SELECT 1 FROM auth_challenges c WHERE c.social_onboarding_id=pending_social_onboardings.id)`,
          [
            retentionAuthorities.deleteOnboardingIds,
            r.onboardingExpiredDays,
            r.onboardingCompletedDays,
          ],
        );

        // Existing onboarding/challenge paths acquire these relations before
        // account and session locks; preserve that order after the L0 context locks.
        await lockUsers(manager, retentionAuthorities.userIds);
        const sessions = retentionAuthorities.sessionIds.length
          ? await manager.query<{ id: string }[]>(
              `SELECT id FROM auth_sessions WHERE id=ANY($1::uuid[])
               AND GREATEST(absolute_expires_at,COALESCE(revoked_at,absolute_expires_at))
                   < now()-($2 * interval '1 day')
               ORDER BY id FOR UPDATE SKIP LOCKED`,
              [retentionAuthorities.sessionIds, r.sessionDays],
            )
          : [];
        const sessionIds = sessions.map(({ id }) => id);
        if (sessionIds.length) {
          const credentials = await manager.query<CountRow[]>(
            `WITH deleted AS (
               DELETE FROM refresh_credentials WHERE session_id=ANY($1::uuid[]) RETURNING 1
             ) SELECT count(*)::integer AS count FROM deleted`,
            [sessionIds],
          );
          deleted.refreshCredentials = Number(credentials[0]?.count ?? 0);
          const removedSessions = await manager.query<CountRow[]>(
            `WITH deleted AS (
               DELETE FROM auth_sessions WHERE id=ANY($1::uuid[]) RETURNING 1
             ) SELECT count(*)::integer AS count FROM deleted`,
            [sessionIds],
          );
          deleted.authSessions = Number(removedSessions[0]?.count ?? 0);
        } else {
          deleted.refreshCredentials = 0;
          deleted.authSessions = 0;
        }

        deleted.oauthTransactions = await this.boundedDelete(
          manager,
          'oauth_transactions',
          `id=ANY($2::uuid[]) AND status IN ('CONSUMED','FAILED','EXPIRED')
           AND COALESCE(consumed_at,claimed_at,expires_at) < now()-($3 * interval '1 hour')`,
          [retentionAuthorities.deleteOauthIds, r.oauthHours],
        );
        deleted.rateLimitBuckets = await this.boundedDelete(
          manager,
          'auth_rate_limit_buckets',
          `expires_at < now()-($2 * interval '1 hour')`,
          [r.rateBucketHours],
        );
        deleted.adminAuditEvents = await this.boundedDelete(
          manager,
          'admin_audit_events',
          `occurred_at < now()-($2 * interval '1 day')`,
          [r.auditDays],
        );
        return {
          deleted,
          ciphertextCleared,
          terminalized: {
            ...expired.terminalized,
            authContextsRetired: authTransition.contextsRetired,
            authIntentsExpired: authTransition.intentsExpired,
            authIntents: authTransition.intentsDeleted,
          },
        };
      });
      return {
        ...result,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
        failure: false,
      };
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'IAM_RETENTION',
          durationMs: Math.round((performance.now() - started) * 100) / 100,
          deleted: {},
          ciphertextCleared: {},
          terminalized: {},
          failure: true,
        }),
      );
      throw error;
    }
  }
}
