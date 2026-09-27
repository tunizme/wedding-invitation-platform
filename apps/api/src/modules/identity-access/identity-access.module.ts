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
  ],
  providers: [
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
      inject: [DataSource, IDENTITY_CONFIG, CredentialCrypto],
      useFactory: (
        db: DataSource,
        config: IdentityEnvironment,
        crypto: CredentialCrypto,
      ) => new OAuthTransactionService(db, config, crypto),
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
      ],
      useFactory: (
        db: DataSource,
        sessions: SessionService,
        onboarding: SocialOnboardingService,
        oauthTransactions: OAuthTransactionService,
      ) =>
        new ResolveSocialIdentityService(
          db,
          sessions,
          onboarding,
          oauthTransactions,
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
      ],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        sessions: SessionService,
        onboarding: SocialOnboardingService,
      ) =>
        new CompleteSocialOnboardingService(db, crypto, sessions, onboarding),
    },
    {
      provide: RefreshService,
      inject: [
        DataSource,
        IDENTITY_CONFIG,
        CredentialCrypto,
        AccessTokenService,
      ],
      useFactory: (
        db: DataSource,
        config: IdentityEnvironment,
        crypto: CredentialCrypto,
        tokens: AccessTokenService,
      ) => new RefreshService(db, config, crypto, tokens),
    },
    {
      provide: LocalLoginService,
      inject: [DataSource, CredentialCrypto, SessionService],
      useFactory: (
        db: DataSource,
        crypto: CredentialCrypto,
        sessions: SessionService,
      ) => new LocalLoginService(db, crypto, sessions),
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
