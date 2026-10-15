import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { identityEntities } from './domain/entities';
import { DataSource } from 'typeorm';
import { APP_GUARD } from '@nestjs/core';
import {
  IDENTITY_CONFIG,
  validateIdentityEnvironment,
  type IdentityEnvironment,
} from '../../config/identity-access.environment';
import { CredentialCrypto } from './infrastructure/credential-crypto';
import { AccessTokenService } from './auth/access-token.service';
import { SessionService } from './auth/session.service';
import { BrowserSecurityService } from './auth/browser-security.service';
import { RateLimitService } from './infrastructure/rate-limit.service';
import { AuthGuard } from './authorization/auth.guard';
import { RolesGuard } from './authorization/roles.guard';
import { ChallengeService } from './verification/challenge.service';
import { RegisterLocalService } from './application/register-local.service';
import { RegistrationController } from './auth/registration.controller';
import { EmailOutboxWorker } from './infrastructure/email-outbox.worker';
import { createEmailSender } from './infrastructure/email-sender';

import { LocalVerificationService } from './verification/local-verification.service';
import { PasswordResetService } from './verification/password-reset.service';
import { VerificationController } from './verification/verification.controller';
import { LocalLoginService } from './auth/local-login.service';
import { LoginController } from './auth/login.controller';
import { RefreshService } from './auth/refresh.service';
import { SessionController } from './auth/session.controller';
import { SocialOnboardingService } from './oauth/social-onboarding.service';
import { CompleteSocialOnboardingService } from './application/complete-social-onboarding.service';
import { SocialOnboardingController } from './oauth/social-onboarding.controller';
import { OwnershipPolicy } from './authorization/ownership.policy';
import { OAuthTransactionService } from './oauth/oauth-transaction.service';
import { GoogleAdapter } from './oauth/google.adapter';
import { FacebookAdapter } from './oauth/facebook.adapter';
import { ResolveSocialIdentityService } from './application/resolve-social-identity.service';
import { OAuthController } from './oauth/oauth.controller';
import { ProfileService } from './profile/profile.service';
import { ChangePasswordService } from './profile/change-password.service';
import { ProfileController } from './profile/profile.controller';
import { CustomerInvitationService } from './admin/customer-invitation.service';
import { CustomerController } from './admin/customer.controller';
import { CustomerQueryService } from './admin/customer-query.service';
import { CustomerStatusService } from './admin/customer-status.service';
import { RetentionWorker } from './infrastructure/retention.worker';
import { CookieLedgerService } from './context/cookie-ledger.service';
import { AuthContextService } from './context/auth-context.service';
import { AuthIntentService } from './context/auth-intent.service';
import { AuthContextController } from './context/auth-context.controller';

export { AuthGuard, Public } from './authorization/auth.guard';
export { Roles, RolesGuard } from './authorization/roles.guard';
export { OwnershipPolicy } from './authorization/ownership.policy';
export type {
  AuthenticatedPrincipal,
  UserRole,
} from './authorization/principal';

export { IDENTITY_CONFIG } from '../../config/identity-access.environment';

@Module({
  imports: [TypeOrmModule.forFeature(identityEntities)],
  controllers: [
    RegistrationController,
    VerificationController,
    LoginController,
    SessionController,
    SocialOnboardingController,
    OAuthController,
    ProfileController,
    CustomerController,
    AuthContextController,
  ],
  providers: [
    {
      provide: CustomerInvitationService,
      inject: [DataSource, CredentialCrypto, ChallengeService],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        challenges: ChallengeService,
      ) => new CustomerInvitationService(db, crypto, challenges),
    },
    {
      provide: CookieLedgerService,
      inject: [IDENTITY_CONFIG, CredentialCrypto],
      useFactory: (config: IdentityEnvironment, crypto: CredentialCrypto) =>
        new CookieLedgerService(config, crypto),
    },
    {
      provide: AuthContextService,
      inject: [
        DataSource,
        IDENTITY_CONFIG,
        CredentialCrypto,
        BrowserSecurityService,
        CookieLedgerService,
      ],
      useFactory: (
        db: DataSource,
        config: IdentityEnvironment,
        crypto: CredentialCrypto,
        browser: BrowserSecurityService,
        ledger: CookieLedgerService,
      ) => new AuthContextService(db, config, crypto, browser, ledger),
    },
    {
      provide: AuthIntentService,
      inject: [DataSource, IDENTITY_CONFIG, AuthContextService],
      useFactory: (
        db: DataSource,
        config: IdentityEnvironment,
        contexts: AuthContextService,
      ) => new AuthIntentService(db, config, contexts),
    },
    {
      provide: RetentionWorker,
      inject: [DataSource, IDENTITY_CONFIG],
      useFactory: (db: DataSource, config: IdentityEnvironment) =>
        new RetentionWorker(db, config),
    },
    {
      provide: CustomerQueryService,
      inject: [DataSource, IDENTITY_CONFIG],
      useFactory: (db: DataSource, config: IdentityEnvironment) =>
        new CustomerQueryService(db, config),
    },
    {
      provide: CustomerStatusService,
      inject: [DataSource],
      useFactory: (db: DataSource) => new CustomerStatusService(db),
    },
    {
      provide: ProfileService,
      inject: [DataSource],
      useFactory: (db: DataSource) => new ProfileService(db),
    },
    {
      provide: ChangePasswordService,
      inject: [DataSource, CredentialCrypto],
      useFactory: (db: DataSource, crypto: CredentialCrypto) =>
        new ChangePasswordService(db, crypto),
    },
    {
      provide: OAuthTransactionService,
      inject: [
        DataSource,
        IDENTITY_CONFIG,
        CredentialCrypto,
        AuthContextService,
        AuthIntentService,
      ],
      useFactory: (
        db: DataSource,
        config: IdentityEnvironment,
        crypto: CredentialCrypto,
        contexts: AuthContextService,
        intents: AuthIntentService,
      ) => new OAuthTransactionService(db, config, crypto, contexts, intents),
    },
    {
      provide: GoogleAdapter,
      inject: [IDENTITY_CONFIG],
      useFactory: (config: IdentityEnvironment) => new GoogleAdapter(config),
    },
    {
      provide: FacebookAdapter,
      inject: [IDENTITY_CONFIG],
      useFactory: (config: IdentityEnvironment) => new FacebookAdapter(config),
    },
    {
      provide: ResolveSocialIdentityService,
      inject: [
        DataSource,
        SessionService,
        SocialOnboardingService,
        OAuthTransactionService,
        AuthContextService,
        AuthIntentService,
      ],
      useFactory: (
        db: DataSource,
        sessions: SessionService,
        onboarding: SocialOnboardingService,
        oauthTransactions: OAuthTransactionService,
        contexts: AuthContextService,
        intents: AuthIntentService,
      ) =>
        new ResolveSocialIdentityService(
          db,
          sessions,
          onboarding,
          oauthTransactions,
          contexts,
          intents,
        ),
    },
    {
      provide: SocialOnboardingService,
      inject: [DataSource, IDENTITY_CONFIG, CredentialCrypto, ChallengeService],
      useFactory: (
        db: DataSource,
        config: IdentityEnvironment,
        crypto: CredentialCrypto,
        challenges: ChallengeService,
      ) => new SocialOnboardingService(db, config, crypto, challenges),
    },
    {
      provide: CompleteSocialOnboardingService,
      inject: [
        DataSource,
        CredentialCrypto,
        SessionService,
        SocialOnboardingService,
        AuthContextService,
        AuthIntentService,
      ],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        sessions: SessionService,
        onboarding: SocialOnboardingService,
        contexts: AuthContextService,
        intents: AuthIntentService,
      ) =>
        new CompleteSocialOnboardingService(
          db,
          crypto,
          sessions,
          onboarding,
          contexts,
          intents,
        ),
    },
    {
      provide: RefreshService,
      inject: [
        DataSource,
        IDENTITY_CONFIG,
        CredentialCrypto,
        AccessTokenService,
        AuthContextService,
        BrowserSecurityService,
      ],
      useFactory: (
        db: DataSource,
        config: IdentityEnvironment,
        crypto: CredentialCrypto,
        tokens: AccessTokenService,
        contexts: AuthContextService,
        browser: BrowserSecurityService,
      ) => new RefreshService(db, config, crypto, tokens, contexts, browser),
    },
    {
      provide: LocalLoginService,
      inject: [
        DataSource,
        CredentialCrypto,
        SessionService,
        AuthContextService,
        AuthIntentService,
        BrowserSecurityService,
      ],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        sessions: SessionService,
        contexts: AuthContextService,
        intents: AuthIntentService,
        browser: BrowserSecurityService,
      ) =>
        new LocalLoginService(db, crypto, sessions, contexts, intents, browser),
    },
    {
      provide: LocalVerificationService,
      inject: [DataSource, ChallengeService],
      useFactory: (db: DataSource, challenges: ChallengeService) =>
        new LocalVerificationService(db, challenges),
    },
    {
      provide: PasswordResetService,
      inject: [DataSource, CredentialCrypto, ChallengeService],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        challenges: ChallengeService,
      ) => new PasswordResetService(db, crypto, challenges),
    },
    {
      provide: ChallengeService,
      inject: [CredentialCrypto],
      useFactory: (crypto: CredentialCrypto) => new ChallengeService(crypto),
    },
    {
      provide: RegisterLocalService,
      inject: [DataSource, CredentialCrypto, ChallengeService],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        challenges: ChallengeService,
      ) => new RegisterLocalService(db, crypto, challenges),
    },
    {
      provide: EmailOutboxWorker,
      inject: [DataSource, CredentialCrypto, IDENTITY_CONFIG],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        config: IdentityEnvironment,
      ) =>
        new EmailOutboxWorker(
          db,
          crypto,
          createEmailSender(process.env),
          config.frontendOrigin,
        ),
    },
    {
      provide: IDENTITY_CONFIG,
      useFactory: () => validateIdentityEnvironment(process.env),
    },
    {
      provide: CredentialCrypto,
      inject: [IDENTITY_CONFIG],
      useFactory: (config: IdentityEnvironment) => new CredentialCrypto(config),
    },
    {
      provide: AccessTokenService,
      inject: [IDENTITY_CONFIG],
      useFactory: (config: IdentityEnvironment) =>
        new AccessTokenService(config),
    },
    {
      provide: BrowserSecurityService,
      inject: [IDENTITY_CONFIG],
      useFactory: (config: IdentityEnvironment) =>
        new BrowserSecurityService(config),
    },
    {
      provide: SessionService,
      inject: [IDENTITY_CONFIG, CredentialCrypto, AccessTokenService],
      useFactory: (
        config: IdentityEnvironment,
        crypto: CredentialCrypto,
        tokens: AccessTokenService,
      ) => new SessionService(config, crypto, tokens),
    },
    {
      provide: RateLimitService,
      inject: [DataSource, IDENTITY_CONFIG],
      useFactory: (db: DataSource, config: IdentityEnvironment) =>
        new RateLimitService(db, config),
    },
    AuthGuard,
    RolesGuard,
    OwnershipPolicy,
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
  exports: [
    AccessTokenService,
    SessionService,
    BrowserSecurityService,
    CredentialCrypto,
    RateLimitService,
    AuthGuard,
    RolesGuard,
    OwnershipPolicy,
  ],
})
export class IdentityAccessModule {}
