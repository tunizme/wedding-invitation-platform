import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AuthChallenge, User } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { lockSessions, lockUsers } from '../infrastructure/transactions';

export type LocalPurpose = 'LOCAL_EMAIL_VERIFICATION' | 'PASSWORD_RESET';
export class ChallengeService {
  constructor(private readonly crypto: CredentialCrypto) {}

  async identify(manager: EntityManager, proof: string) {
    const [challenge] = await manager.query<AuthChallenge[]>(
      'SELECT * FROM auth_challenges WHERE token_hash=$1',
      [this.crypto.proofDigest(proof)],
    );
    return challenge;
  }
  async enqueueLocalVerification(
    manager: EntityManager,
    userId: string,
    email: string,
  ): Promise<void> {
    await this.enqueue(manager, userId, email, 'LOCAL_EMAIL_VERIFICATION');
  }
  async enqueuePasswordReset(
    manager: EntityManager,
    userId: string,
    email: string,
  ): Promise<void> {
    await this.enqueue(manager, userId, email, 'PASSWORD_RESET');
  }
  async enqueueSocialVerification(
    manager: EntityManager,
    onboardingId: string,
    email: string,
    contextExpiresAt: Date,
  ): Promise<void> {
    const [{ generation }] = await manager.query<{ generation: string }[]>(
      `SELECT (COALESCE(MAX(generation),-1)+1)::text AS generation
       FROM auth_challenges WHERE social_onboarding_id=$1 AND purpose='SOCIAL_EMAIL_VERIFICATION'`,
      [onboardingId],
    );
    const challengeId = randomUUID();
    const outboxId = randomUUID();
    const proof = this.crypto.randomToken();
    const encrypted = this.crypto.encrypt(proof, `outbox:${outboxId}`);
    const expiresAt = new Date(
      Math.min(Date.now() + 1800_000, contextExpiresAt.getTime()),
    );
    await manager.query(
      `INSERT INTO auth_challenges
       (id,purpose,status,social_onboarding_id,email,token_hash,token_key_version,generation,created_at,expires_at)
       VALUES ($1,'SOCIAL_EMAIL_VERIFICATION','PENDING_DELIVERY',$2,$3,$4,$5,$6,now(),$7)`,
      [
        challengeId,
        onboardingId,
        email,
        this.crypto.proofDigest(proof),
        encrypted.keyVersion,
        generation,
        expiresAt,
      ],
    );
    await manager.query(
      `INSERT INTO email_outbox
       (id,challenge_id,template_key,recipient_email,payload_ciphertext,encryption_key_version,status,next_attempt_at,created_at,updated_at)
       VALUES ($1,$2,'social-verification-v1',$3,$4,$5,'PENDING',now(),now(),now())`,
      [
        outboxId,
        challengeId,
        email,
        encrypted.ciphertext,
        encrypted.keyVersion,
      ],
    );
  }
  private async enqueue(
    manager: EntityManager,
    userId: string,
    email: string,
    purpose: LocalPurpose,
  ) {
    await lockUsers(manager, [userId]);
    const [user] = await manager.query<User[]>(
      'SELECT * FROM users WHERE id=$1',
      [userId],
    );
    const [{ generation }] = await manager.query<{ generation: string }[]>(
      'SELECT (COALESCE(MAX(generation),-1)+1)::text AS generation FROM auth_challenges WHERE user_id=$1 AND purpose=$2',
      [userId, purpose],
    );
    const challengeId = randomUUID(),
      outboxId = randomUUID(),
      proof = this.crypto.randomToken();
    const encrypted = this.crypto.encrypt(proof, `outbox:${outboxId}`);
    const reset = purpose === 'PASSWORD_RESET';
    await manager.query(
      `INSERT INTO auth_challenges (id,purpose,status,user_id,email,token_hash,token_key_version,generation,credential_version_snapshot,created_at,expires_at)
       VALUES ($1,$2,'PENDING_DELIVERY',$3,$4,$5,$6,$7,$8,now(),now()+($9 * interval '1 second'))`,
      [
        challengeId,
        purpose,
        userId,
        email,
        this.crypto.proofDigest(proof),
        encrypted.keyVersion,
        generation,
        reset ? user.credential_version : null,
        reset ? 1800 : 86400,
      ],
    );
    await manager.query(
      `INSERT INTO email_outbox (id,challenge_id,template_key,recipient_email,payload_ciphertext,encryption_key_version,status,next_attempt_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'PENDING',now(),now(),now())`,
      [
        outboxId,
        challengeId,
        reset ? 'password-reset-v1' : 'local-verification-v1',
        email,
        encrypted.ciphertext,
        encrypted.keyVersion,
      ],
    );
  }

  // Caller owns one transaction. Lookups never replace rechecks under aggregate locks.
  async consume(
    manager: EntityManager,
    proof: string,
    purpose: LocalPurpose,
    update: (user: User) => Promise<void>,
  ) {
    const observed = await this.identify(manager, proof);
    if (!observed?.user_id || observed.purpose !== purpose)
      throw new BadRequestException();
    await lockUsers(manager, [observed.user_id]);
    if (purpose === 'PASSWORD_RESET')
      await lockSessions(manager, observed.user_id);
    const [user] = await manager.query<User[]>(
      'SELECT * FROM users WHERE id=$1',
      [observed.user_id],
    );
    const siblings = await manager.query<AuthChallenge[]>(
      'SELECT * FROM auth_challenges WHERE user_id=$1 AND purpose=$2 ORDER BY id FOR UPDATE',
      [observed.user_id, purpose],
    );
    const current = siblings.find((c) => c.id === observed.id);
    const [{ now }] = await manager.query<{ now: Date }[]>(
      'SELECT clock_timestamp() AS now',
    );
    if (
      !user ||
      user.login_method !== 'LOCAL' ||
      !current ||
      current.status !== 'ACTIVE' ||
      current.expires_at <= now ||
      current.email !== user.email ||
      (purpose === 'LOCAL_EMAIL_VERIFICATION'
        ? !!user.email_verified_at
        : !user.email_verified_at ||
          current.credential_version_snapshot !== user.credential_version)
    ) {
      throw new BadRequestException();
    }
    await update(user);
    await manager.query(
      "UPDATE auth_challenges SET status='CONSUMED',consumed_at=now() WHERE id=$1",
      [current.id],
    );
    await manager.query(
      "UPDATE auth_challenges SET status='REVOKED',revoked_at=now() WHERE user_id=$1 AND purpose=$2 AND id<>$3 AND status IN ('ACTIVE','PENDING_DELIVERY')",
      [user.id, purpose, current.id],
    );
  }
}
