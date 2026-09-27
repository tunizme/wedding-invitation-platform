import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OnboardingCannotCompleteException } from '../../../common/errors/public-problem.exception';
import type { AuthChallenge, User } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { transaction } from '../infrastructure/transactions';
import { safeProfile } from '../auth/local-login.service';
import { SessionService } from '../auth/session.service';
import { SocialOnboardingService } from '../oauth/social-onboarding.service';

export class CompleteSocialOnboardingService {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
    private readonly sessions: SessionService,
    private readonly onboarding: SocialOnboardingService,
  ) {}

  async complete(binding: string, proof: string) {
    const observed = await this.onboarding.resolve(binding);
    const result = await transaction(this.db, async (manager) => {
      const context = await this.onboarding.lockEligible(
        manager,
        observed.id,
        binding,
      );
      const challenges = await manager.query<AuthChallenge[]>(
        `SELECT * FROM auth_challenges
         WHERE social_onboarding_id=$1 AND purpose='SOCIAL_EMAIL_VERIFICATION'
         ORDER BY id FOR UPDATE`,
        [context.id],
      );
      const challenge = challenges.find(
        (candidate) =>
          candidate.token_hash &&
          candidate.token_hash.equals(this.crypto.proofDigest(proof)),
      );
      const [{ now }] = await manager.query<{ now: Date }[]>(
        'SELECT clock_timestamp() AS now',
      );
      if (
        !context.email_candidate ||
        context.status !== 'PENDING_VERIFICATION' ||
        !challenge ||
        challenge.status !== 'ACTIVE' ||
        challenge.expires_at <= now ||
        challenge.email !== context.email_candidate
      )
        throw new BadRequestException();
      const [emailOwner] = await manager.query<{ id: string }[]>(
        'SELECT id FROM users WHERE email=$1',
        [context.email_candidate],
      );
      const [identityOwner] = await manager.query<{ id: string }[]>(
        'SELECT id FROM external_identities WHERE provider=$1 AND provider_subject=$2',
        [context.provider, context.provider_subject],
      );
      if (emailOwner || identityOwner)
        throw new OnboardingCannotCompleteException();
      const userId = randomUUID();
      try {
        await manager.query(
          `INSERT INTO users
           (id,email,password_hash,login_method,role,status,email_verified_at,display_name,avatar_url,created_at,updated_at)
           VALUES ($1,$2,NULL,$3,'CUSTOMER','ACTIVE',$4,$5,$6,$4,$4)`,
          [
            userId,
            context.email_candidate,
            context.provider,
            now,
            context.display_name,
            context.avatar_url,
          ],
        );
        await manager.query(
          `INSERT INTO external_identities
           (id,user_id,provider,provider_subject,created_at,last_authenticated_at)
           VALUES ($1,$2,$3,$4,$5,$5)`,
          [
            randomUUID(),
            userId,
            context.provider,
            context.provider_subject,
            now,
          ],
        );
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505'
        )
          throw new OnboardingCannotCompleteException();
        throw error;
      }
      const session = await this.sessions.issue(manager, userId);
      await manager.query(
        "UPDATE auth_challenges SET status='CONSUMED',consumed_at=$2 WHERE id=$1",
        [challenge.id, now],
      );
      await manager.query(
        `UPDATE auth_challenges SET status='REVOKED',revoked_at=$2
         WHERE social_onboarding_id=$1 AND id<>$3 AND status IN ('ACTIVE','PENDING_DELIVERY')`,
        [context.id, now, challenge.id],
      );
      await manager.query(
        `UPDATE pending_social_onboardings
         SET status='COMPLETED',completed_at=$2,completed_user_id=$3,updated_at=$2
         WHERE id=$1`,
        [context.id, now, userId],
      );
      const [user] = await manager.query<User[]>(
        'SELECT * FROM users WHERE id=$1',
        [userId],
      );
      return { session, user: safeProfile(user) };
    });
    return result;
  }
}
