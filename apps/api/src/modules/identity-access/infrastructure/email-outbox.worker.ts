import { randomUUID } from 'node:crypto';
import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type {
  EmailOutbox,
  AuthChallenge,
  User,
  PendingSocialOnboarding,
} from '../domain/entities';
import { CredentialCrypto } from './credential-crypto';
import type { EmailSender } from './email-sender';
import { transaction } from './transactions';

export type ClaimedEmail = EmailOutbox & { lease_owner: string };
type DeliveryResult =
  | { accepted: true; messageId: string }
  | { accepted: false; terminal?: boolean };
export class EmailOutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly logger = new Logger(EmailOutboxWorker.name);
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
    private readonly sender: EmailSender,
    private readonly frontendOrigin: string,
  ) {}
  onApplicationBootstrap() {
    this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .catch(() => {
          this.logger.warn('EMAIL_OUTBOX_CYCLE_FAILED');
        })
        .finally(() => {
          this.running = undefined;
          this.schedule();
        });
    }, 1000);
    this.timer.unref();
  }
  async onApplicationShutdown() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
  async claim(): Promise<ClaimedEmail | undefined> {
    return transaction(this.db, async (manager) => {
      const [row] = await manager.query<EmailOutbox[]>(
        "SELECT * FROM email_outbox WHERE ((status IN ('PENDING','RETRYABLE_FAILURE') AND next_attempt_at<=now()) OR (status='PROCESSING' AND lease_expires_at<=now())) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      if (!row) return undefined;
      const lease = randomUUID();
      await manager.query(
        "UPDATE email_outbox SET status='PROCESSING',lease_owner=$2,lease_expires_at=now()+interval '30 seconds',attempt_count=attempt_count+1,updated_at=now() WHERE id=$1",
        [row.id, lease],
      );
      return {
        ...row,
        status: 'PROCESSING',
        lease_owner: lease,
        attempt_count: row.attempt_count + 1,
      };
    });
  }
  async finalize(
    claim: ClaimedEmail,
    result: DeliveryResult,
  ): Promise<boolean> {
    return transaction(this.db, async (manager) => {
      const [snapshot] = await manager.query<AuthChallenge[]>(
        'SELECT * FROM auth_challenges WHERE id=$1',
        [claim.challenge_id],
      );
      if (!snapshot) return false;
      let eligible = false;
      if (snapshot.user_id) {
        const [user] = await manager.query<User[]>(
          'SELECT * FROM users WHERE id=$1 FOR UPDATE',
          [snapshot.user_id],
        );
        eligible =
          !!user &&
          user.login_method === 'LOCAL' &&
          (snapshot.purpose === 'LOCAL_EMAIL_VERIFICATION'
            ? !user.email_verified_at
            : snapshot.purpose === 'PASSWORD_RESET' &&
              !!user.email_verified_at &&
              user.credential_version === snapshot.credential_version_snapshot);
      } else {
        const [context] = await manager.query<PendingSocialOnboarding[]>(
          'SELECT * FROM pending_social_onboardings WHERE id=$1 FOR UPDATE',
          [snapshot.social_onboarding_id],
        );
        eligible =
          !!context &&
          ['PENDING_EMAIL', 'PENDING_VERIFICATION'].includes(context.status) &&
          context.expires_at.getTime() > Date.now() &&
          snapshot.expires_at <= context.expires_at;
      }
      const siblings = await manager.query<AuthChallenge[]>(
        'SELECT * FROM auth_challenges WHERE purpose=$1 AND (user_id=$2 OR social_onboarding_id=$3) ORDER BY id FOR UPDATE',
        [snapshot.purpose, snapshot.user_id, snapshot.social_onboarding_id],
      );
      const challenge = siblings.find((c) => c.id === snapshot.id);
      const [outbox] = await manager.query<EmailOutbox[]>(
        'SELECT * FROM email_outbox WHERE id=$1 FOR UPDATE',
        [claim.id],
      );
      const [{ now }] = await manager.query<{ now: Date }[]>(
        'SELECT clock_timestamp() AS now',
      );
      if (
        !challenge ||
        !outbox ||
        outbox.status !== 'PROCESSING' ||
        outbox.lease_owner !== claim.lease_owner ||
        !outbox.lease_expires_at ||
        outbox.lease_expires_at <= now
      )
        return false;
      const terminal =
        !result.accepted && (result.terminal || outbox.attempt_count >= 5);
      if (result.accepted) {
        const newer = siblings.some(
          (c) =>
            BigInt(c.generation) > BigInt(challenge.generation) &&
            ['ACTIVE', 'CONSUMED'].includes(c.status),
        );
        if (challenge.status === 'PENDING_DELIVERY') {
          if (eligible && challenge.expires_at > now && !newer) {
            await manager.query(
              "UPDATE auth_challenges SET status='REVOKED',revoked_at=now() WHERE purpose=$1 AND (user_id=$2 OR social_onboarding_id=$3) AND generation<$4 AND status IN ('ACTIVE','PENDING_DELIVERY')",
              [
                challenge.purpose,
                challenge.user_id,
                challenge.social_onboarding_id,
                challenge.generation,
              ],
            );
            await manager.query(
              "UPDATE auth_challenges SET status='ACTIVE',activated_at=now() WHERE id=$1",
              [challenge.id],
            );
          } else
            await manager.query(
              "UPDATE auth_challenges SET status='REVOKED',revoked_at=now() WHERE id=$1",
              [challenge.id],
            );
        }
        await manager.query(
          "UPDATE email_outbox SET status='DELIVERED',payload_ciphertext=NULL,encryption_key_version=NULL,lease_owner=NULL,lease_expires_at=NULL,provider_message_id=$2,delivered_at=now(),updated_at=now(),last_error_code=NULL WHERE id=$1",
          [outbox.id, result.messageId.slice(0, 255)],
        );
      } else {
        if (terminal) {
          await manager.query(
            "UPDATE auth_challenges SET status='DELIVERY_FAILED',delivery_failed_at=now() WHERE id=$1 AND status='PENDING_DELIVERY'",
            [challenge.id],
          );
          await manager.query(
            "UPDATE email_outbox SET status='TERMINAL_FAILURE',payload_ciphertext=NULL,encryption_key_version=NULL,lease_owner=NULL,lease_expires_at=NULL,last_error_code='EMAIL_DELIVERY_FAILED',updated_at=now() WHERE id=$1",
            [outbox.id],
          );
        } else
          await manager.query(
            "UPDATE email_outbox SET status='RETRYABLE_FAILURE',lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=now()+($2 * interval '1 second'),last_error_code='EMAIL_DELIVERY_FAILED',updated_at=now() WHERE id=$1",
            [outbox.id, Math.min(900, 2 ** outbox.attempt_count * 5)],
          );
      }
      return true;
    });
  }
  async runOnce(): Promise<void> {
    // One item per cycle bounds network time and keeps every lease fresh.
    const item = await this.claim();
    if (!item) return;
    if (item.attempt_count > 5) {
      await this.finalize(item, { accepted: false, terminal: true });
      return;
    }
    let result: DeliveryResult;
    try {
      if (
        ![
          'local-verification-v1',
          'password-reset-v1',
          'social-verification-v1',
        ].includes(item.template_key) ||
        !item.payload_ciphertext ||
        !item.encryption_key_version
      )
        throw new Error();
      const proof = this.crypto.decrypt(
        {
          ciphertext: item.payload_ciphertext,
          keyVersion: item.encryption_key_version,
        },
        `outbox:${item.id}`,
      );
      const reset = item.template_key === 'password-reset-v1';
      const social = item.template_key === 'social-verification-v1';
      const messageId = await this.sender.send({
        purpose: reset
          ? 'PASSWORD_RESET'
          : social
            ? 'SOCIAL_EMAIL_VERIFICATION'
            : 'LOCAL_EMAIL_VERIFICATION',
        to: item.recipient_email,
        link: `${this.frontendOrigin}/${reset ? 'reset-password' : social ? 'social-onboarding' : 'verify-email'}#token=${encodeURIComponent(proof)}`,
        idempotencyKey: `${reset ? 'PASSWORD_RESET' : social ? 'SOCIAL_EMAIL_VERIFICATION' : 'LOCAL_EMAIL_VERIFICATION'}.${item.challenge_id}.${item.template_key}`,
      });
      result = { accepted: true, messageId };
    } catch {
      result = { accepted: false };
    }
    // A database failure here leaves the lease recoverable, never converts accepted delivery into failure.
    await this.finalize(item, result);
  }
}
