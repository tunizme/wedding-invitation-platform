import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import { transaction } from './transactions';

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

  private async clearTerminalCiphertext(
    manager: EntityManager,
  ): Promise<Record<string, number>> {
    const batch = this.config.retention.batchSize;
    const oauth = await manager.query<CountRow[]>(
      `WITH candidates AS (
         SELECT ctid FROM oauth_transactions
         WHERE status IN ('CONSUMED','FAILED','EXPIRED')
           AND (pkce_verifier_ciphertext IS NOT NULL OR encryption_key_version IS NOT NULL)
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE oauth_transactions target
         SET pkce_verifier_ciphertext=NULL,encryption_key_version=NULL
         FROM candidates WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch],
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

  private async terminalizeExpired(manager: EntityManager): Promise<{
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
         WHERE status IN ('PENDING_EMAIL','PENDING_VERIFICATION')
           AND expires_at < now()
         ORDER BY ctid LIMIT $1 FOR UPDATE SKIP LOCKED
       ), changed AS (
         UPDATE pending_social_onboardings target
         SET status='EXPIRED',updated_at=target.expires_at
         FROM candidates WHERE target.ctid=candidates.ctid RETURNING 1
       ) SELECT count(*)::integer AS count FROM changed`,
      [batch],
    );
    const oauth = await manager.query<TerminalizedRow[]>(
      `WITH candidates AS (
         SELECT ctid,
                (pkce_verifier_ciphertext IS NOT NULL OR encryption_key_version IS NOT NULL) AS had_ciphertext
         FROM oauth_transactions
         WHERE (status='PENDING' AND expires_at < now())
            OR (status='PROCESSING' AND expires_at < now()
                AND claimed_at IS NOT NULL
                AND claimed_at < now()-interval '1 minute')
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
      [batch],
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

  async runOnce(): Promise<RetentionRunMetrics> {
    const started = performance.now();
    try {
      const result = await transaction(this.db, async (manager) => {
        const r = this.config.retention;
        const expired = await this.terminalizeExpired(manager);
        const ciphertextCleared = await this.clearTerminalCiphertext(manager);
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
          `((status IN ('EXPIRED','CANCELLED') AND expires_at < now()-($2 * interval '1 day'))
             OR (status='COMPLETED' AND completed_at < now()-($3 * interval '1 day')))
           AND NOT EXISTS (SELECT 1 FROM auth_challenges c WHERE c.social_onboarding_id=pending_social_onboardings.id)`,
          [r.onboardingExpiredDays, r.onboardingCompletedDays],
        );

        const sessions = await manager.query<{ id: string }[]>(
          `SELECT id FROM auth_sessions
           WHERE GREATEST(absolute_expires_at,COALESCE(revoked_at,absolute_expires_at))
                 < now()-($2 * interval '1 day')
           ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
          [r.batchSize, r.sessionDays],
        );
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
          `status IN ('CONSUMED','FAILED','EXPIRED')
           AND COALESCE(consumed_at,claimed_at,expires_at) < now()-($2 * interval '1 hour')`,
          [r.oauthHours],
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
          terminalized: expired.terminalized,
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
