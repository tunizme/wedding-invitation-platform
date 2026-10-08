import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import type { DataSource, EntityManager } from 'typeorm';
import { OnboardingCannotCompleteException } from '../../../common/errors/public-problem.exception';
import { safeProfile } from '../auth/local-login.service';
import { SessionService } from '../auth/session.service';
import type { User, ExternalIdentity } from '../domain/entities';
import type { VerifiedProviderIdentity } from '../domain/provider-identity.port';
import { transaction } from '../infrastructure/transactions';
import { SocialOnboardingService } from '../oauth/social-onboarding.service';
import { OAuthTransactionService } from '../oauth/oauth-transaction.service';
import type { OAuthClaim } from '../oauth/oauth-transaction.service';
import type { Request } from 'express';
import type {
  AuthContextService,
  BoundContext,
} from '../context/auth-context.service';
import type { AuthIntentService } from '../context/auth-intent.service';

export type SocialIdentityResult =
  | {
      kind: 'session';
      session: Awaited<ReturnType<SessionService['issue']>>;
      user: ReturnType<typeof safeProfile>;
      contextRevision?: number;
    }
  | {
      kind: 'onboarding';
      onboarding: Awaited<ReturnType<SocialOnboardingService['begin']>>;
    };

export class ResolveSocialIdentityService {
  constructor(
    private readonly db: DataSource,
    private readonly sessions: SessionService,
    private readonly onboarding: SocialOnboardingService,
    private readonly oauthTransactions: OAuthTransactionService,
    private readonly contexts?: AuthContextService,
    private readonly intents?: AuthIntentService,
  ) {}

  async resolve(
    identity: VerifiedProviderIdentity,
  ): Promise<SocialIdentityResult> {
    this.validateIdentity(identity);
    return transaction(this.db, (manager) =>
      this.resolveInTransaction(manager, identity),
    );
  }

  async resolveClaimed(
    identity: VerifiedProviderIdentity,
    claimed: OAuthClaim | string,
    request?: Pick<Request, 'headers'> & { ip?: string },
  ): Promise<SocialIdentityResult> {
    this.validateIdentity(identity);
    // Retain the direct legacy service seam used by pre-cutover unit/integration
    // tests. Production callbacks always supply the claimed transaction record.
    if (typeof claimed === 'string') {
      return transaction(this.db, async (manager) => {
        const result = await this.resolveInTransaction(manager, identity);
        await this.oauthTransactions.complete(claimed, manager);
        return result;
      });
    }
    if (
      !request ||
      !claimed.contextId ||
      !claimed.intentId ||
      !this.contexts ||
      !this.intents
    )
      throw new UnauthorizedException();
    const contextId = claimed.contextId;
    const intentId = claimed.intentId;
    return transaction(this.db, async (manager) => {
      const authRequest = {
        ...request,
        headers: { ...request.headers, 'x-auth-context': contextId },
      };
      const bound = await this.contexts!.bind(manager, authRequest, contextId);
      await this.intents!.assertCurrent(manager, bound, intentId, 'OAUTH');
      const result = await this.resolveInTransaction(manager, identity, bound);
      await this.intents!.resolve(
        manager,
        intentId,
        'COMMITTED',
        result.kind === 'session'
          ? 'SESSION_ESTABLISHED'
          : 'ONBOARDING_REQUIRED',
      );
      // Complete the business row before L∞ ledger settlement (T099).
      await this.oauthTransactions.complete(claimed.id, manager);
      if (result.kind === 'session') {
        result.contextRevision = Number(bound.context.revision);
        await this.contexts!.settle(manager, bound, [
          {
            name: this.contexts!.slotCookieName(result.session.slotTag ?? ''),
            kind: 'SLOT',
            ownerContextId: bound.context.id,
            ownerSessionId: result.session.sessionId,
            value: result.session.refreshToken,
          },
        ]);
      }
      return result;
    });
  }

  private validateIdentity(identity: VerifiedProviderIdentity): void {
    if (
      !['GOOGLE', 'FACEBOOK'].includes(identity.provider) ||
      !identity.subject ||
      identity.subject.length > 255
    )
      throw new UnauthorizedException();
  }

  private async resolveInTransaction(
    manager: EntityManager,
    identity: VerifiedProviderIdentity,
    bound?: BoundContext,
  ): Promise<SocialIdentityResult> {
    await this.serializeSubject(manager, identity);
    const linked = await this.linkedUser(manager, identity, bound);
    if (linked)
      return this.issueExisting(manager, linked.identity, linked.user, bound);

    const email = identity.email?.trim().toLowerCase() ?? null;
    if (
      identity.emailVerified &&
      email &&
      email.length <= 254 &&
      isEmail(email)
    ) {
      try {
        const [emailOwner] = await manager.query<{ id: string }[]>(
          'SELECT id FROM users WHERE email=$1',
          [email],
        );
        if (emailOwner) throw new OnboardingCannotCompleteException();
        const [{ now }] = await manager.query<{ now: Date }[]>(
          'SELECT clock_timestamp() AS now',
        );
        const userId = randomUUID();
        await manager.query(
          `INSERT INTO users
           (id,email,password_hash,login_method,role,status,email_verified_at,display_name,avatar_url,created_at,updated_at)
           VALUES ($1,$2,NULL,$3,'CUSTOMER','ACTIVE',$4,$5,$6,$4,$4)`,
          [
            userId,
            email,
            identity.provider,
            now,
            identity.displayName?.trim().slice(0, 100) || null,
            identity.avatarUrl,
          ],
        );
        await manager.query(
          `INSERT INTO external_identities
           (id,user_id,provider,provider_subject,created_at,last_authenticated_at)
           VALUES ($1,$2,$3,$4,$5,$5)`,
          [randomUUID(), userId, identity.provider, identity.subject, now],
        );
        const session = await this.sessions.issue(
          manager,
          userId,
          bound ? { context: bound } : {},
        );
        const [user] = await manager.query<User[]>(
          'SELECT * FROM users WHERE id=$1',
          [userId],
        );
        return {
          kind: 'session' as const,
          session,
          user: safeProfile(user),
          ...(bound ? { contextRevision: Number(bound.context.revision) } : {}),
        };
      } catch (error) {
        if (
          error instanceof OnboardingCannotCompleteException ||
          (error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23505')
        )
          throw new OnboardingCannotCompleteException();
        throw error;
      }
    }

    const onboarding = await this.onboarding.beginInTransaction(
      manager,
      identity,
      undefined,
      bound?.context.id,
    );
    return { kind: 'onboarding', onboarding };
  }

  private async serializeSubject(
    manager: EntityManager,
    identity: VerifiedProviderIdentity,
  ): Promise<void> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`${identity.provider}:${identity.subject}`],
    );
  }

  private async linkedUser(
    manager: EntityManager,
    identity: VerifiedProviderIdentity,
    bound?: BoundContext,
  ): Promise<{ identity: ExternalIdentity; user: User } | undefined> {
    const [identityRow] = await manager.query<ExternalIdentity[]>(
      `SELECT * FROM external_identities
       WHERE provider=$1 AND provider_subject=$2 FOR UPDATE`,
      [identity.provider, identity.subject],
    );
    if (!identityRow) return undefined;
    await this.sessions.lockIssuanceUsers(manager, identityRow.user_id, bound);
    const [user] = await manager.query<User[]>(
      'SELECT * FROM users WHERE id=$1 FOR UPDATE',
      [identityRow.user_id],
    );
    if (!user) throw new UnauthorizedException();
    return { identity: identityRow, user };
  }

  private async issueExisting(
    manager: EntityManager,
    identity: ExternalIdentity,
    user: User,
    bound?: BoundContext,
  ): Promise<Extract<SocialIdentityResult, { kind: 'session' }>> {
    if (
      user.status !== 'ACTIVE' ||
      !user.email_verified_at ||
      user.login_method !== identity.provider
    )
      throw new UnauthorizedException();
    await manager.query(
      'UPDATE external_identities SET last_authenticated_at=now() WHERE id=$1',
      [identity.id],
    );
    const session = await this.sessions.issue(
      manager,
      user.id,
      bound ? { context: bound } : {},
    );
    return {
      kind: 'session',
      session,
      user: safeProfile(user),
      ...(bound ? { contextRevision: Number(bound.context.revision) } : {}),
    };
  }
}
