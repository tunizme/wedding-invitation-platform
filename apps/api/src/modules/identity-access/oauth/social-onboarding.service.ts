import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type { PendingSocialOnboarding } from '../domain/entities';
import type { VerifiedProviderIdentity } from '../domain/provider-identity.port';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { transaction } from '../infrastructure/transactions';
import { ChallengeService } from '../verification/challenge.service';

export interface OnboardingStart {
  id: string;
  binding: string;
  expiresAt: Date;
}

export class SocialOnboardingService {
  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
    private readonly crypto: CredentialCrypto,
    private readonly challenges?: ChallengeService,
  ) {}

  private parse(binding: string) {
    const match =
      /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i.exec(
        binding,
      );
    return match ? { id: match[1], secret: match[2] } : undefined;
  }

  bindingMatches(context: PendingSocialOnboarding, binding: string): boolean {
    const parsed = this.parse(binding);
    if (!parsed || parsed.id !== context.id) return false;
    const actual = this.crypto.proofDigest(parsed.secret);
    return (
      actual.length === context.binding_hash.length &&
      timingSafeEqual(actual, context.binding_hash)
    );
  }

  async begin(
    identity: VerifiedProviderIdentity,
    observedContextId?: string,
  ): Promise<OnboardingStart> {
    this.validateIdentity(identity);
    try {
      return await transaction(this.db, (manager) =>
        this.beginInTransaction(manager, identity, observedContextId),
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        (error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505')
      )
        throw new ConflictException();
      throw error;
    }
  }

  async beginInTransaction(
    manager: EntityManager,
    identity: VerifiedProviderIdentity,
    observedContextId?: string,
  ): Promise<OnboardingStart> {
    this.validateIdentity(identity);
    const [linked] = await manager.query<{ user_id: string }[]>(
      'SELECT user_id FROM external_identities WHERE provider=$1 AND provider_subject=$2',
      [identity.provider, identity.subject],
    );
    if (linked) throw new ConflictException();
    const [observed] = await manager.query<PendingSocialOnboarding[]>(
      `SELECT * FROM pending_social_onboardings
       WHERE provider=$1 AND provider_subject=$2 AND status IN ('PENDING_EMAIL','PENDING_VERIFICATION')
       FOR UPDATE`,
      [identity.provider, identity.subject],
    );
    if (observedContextId && observed?.id !== observedContextId)
      throw new ConflictException();
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const seed = randomBytes(32);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.ttl.onboarding * 1000,
    );
    if (observed) {
      await manager.query(
        `SELECT id FROM auth_challenges WHERE social_onboarding_id=$1 ORDER BY id FOR UPDATE`,
        [observed.id],
      );
      await manager.query(
        `UPDATE pending_social_onboardings
         SET status=$2,updated_at=now() WHERE id=$1`,
        [observed.id, observed.expires_at <= now ? 'EXPIRED' : 'CANCELLED'],
      );
      await manager.query(
        `UPDATE auth_challenges SET status='REVOKED',revoked_at=now()
         WHERE social_onboarding_id=$1 AND status IN ('ACTIVE','PENDING_DELIVERY')`,
        [observed.id],
      );
    }
    await manager.query(
      `INSERT INTO pending_social_onboardings
       (id,provider,provider_subject,email_candidate,display_name,avatar_url,binding_hash,csrf_seed,csrf_key_version,status,expires_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [
        id,
        identity.provider,
        identity.subject,
        identity.email?.trim().toLowerCase() ?? null,
        identity.displayName?.trim().slice(0, 100) || null,
        identity.avatarUrl,
        this.crypto.proofDigest(secret),
        seed,
        this.config.keyVersion,
        identity.email ? 'PENDING_VERIFICATION' : 'PENDING_EMAIL',
        expiresAt,
        now,
      ],
    );
    return { id, binding: `${id}.${secret}`, expiresAt };
  }

  private validateIdentity(identity: VerifiedProviderIdentity): void {
    if (
      !['GOOGLE', 'FACEBOOK'].includes(identity.provider) ||
      !identity.subject ||
      identity.subject.length > 255
    )
      throw new UnauthorizedException();
  }

  async resolve(binding: string): Promise<PendingSocialOnboarding> {
    const parsed = this.parse(binding);
    if (!parsed) throw new UnauthorizedException();
    const [context] = await this.db.query<PendingSocialOnboarding[]>(
      'SELECT * FROM pending_social_onboardings WHERE id=$1',
      [parsed.id],
    );
    if (
      !context ||
      !this.bindingMatches(context, binding) ||
      !['PENDING_EMAIL', 'PENDING_VERIFICATION'].includes(context.status) ||
      context.expires_at <= new Date()
    )
      throw new UnauthorizedException();
    return context;
  }

  async submitEmail(binding: string, email: string): Promise<void> {
    const observed = await this.resolve(binding);
    if (!this.challenges) throw new Error('CHALLENGE_SERVICE_REQUIRED');
    await transaction(this.db, async (manager) => {
      const context = await this.lockEligible(manager, observed.id, binding);
      await manager.query(
        `SELECT id FROM auth_challenges WHERE social_onboarding_id=$1 ORDER BY id FOR UPDATE`,
        [context.id],
      );
      if (context.email_candidate !== email)
        await manager.query(
          `UPDATE auth_challenges SET status='REVOKED',revoked_at=now()
           WHERE social_onboarding_id=$1 AND status IN ('ACTIVE','PENDING_DELIVERY')`,
          [context.id],
        );
      await manager.query(
        "UPDATE pending_social_onboardings SET email_candidate=$2,status='PENDING_VERIFICATION',updated_at=now() WHERE id=$1",
        [context.id, email],
      );
      await this.challenges!.enqueueSocialVerification(
        manager,
        context.id,
        email,
        context.expires_at,
      );
    });
  }

  async resend(binding: string): Promise<void> {
    const context = await this.resolve(binding);
    if (context.status !== 'PENDING_VERIFICATION' || !context.email_candidate)
      return;
    await this.submitEmail(binding, context.email_candidate);
  }

  async lockEligible(
    manager: EntityManager,
    id: string,
    binding: string,
  ): Promise<PendingSocialOnboarding> {
    const [context] = await manager.query<PendingSocialOnboarding[]>(
      'SELECT * FROM pending_social_onboardings WHERE id=$1 FOR UPDATE',
      [id],
    );
    const [{ now }] = await manager.query<{ now: Date }[]>(
      'SELECT clock_timestamp() AS now',
    );
    if (
      !context ||
      !this.bindingMatches(context, binding) ||
      !['PENDING_EMAIL', 'PENDING_VERIFICATION'].includes(context.status) ||
      context.expires_at <= now
    )
      throw new UnauthorizedException();
    return context;
  }
}
