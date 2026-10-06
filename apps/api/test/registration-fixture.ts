import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/infrastructure/database/data-source';
import { identityFixture } from './identity-fixture';
import { validateIdentityEnvironment } from '../src/config/identity-access.environment';
import { CredentialCrypto } from '../src/modules/identity-access/infrastructure/credential-crypto';
import { ChallengeService } from '../src/modules/identity-access/verification/challenge.service';
import { RegisterLocalService } from '../src/modules/identity-access/application/register-local.service';

export async function registrationFixture() {
  if (!process.env.IAM_TEST_SCHEMA && !process.env.BUILDER_TEST_SCHEMA)
    throw new Error(
      'Use validate:iam or validate:builder with a disposable schema',
    );
  const db = new DataSource(databaseOptions());
  await db.initialize();
  try {
    await db.runMigrations();
    const config = validateIdentityEnvironment(identityFixture());
    const crypto = new CredentialCrypto(config);
    const challenges = new ChallengeService(crypto);
    const register = new RegisterLocalService(db, crypto, challenges);
    const clear = async () => {
      await db.query(
        'TRUNCATE users,external_identities,auth_sessions,refresh_credentials,pending_social_onboardings,auth_challenges,oauth_transactions,auth_rate_limit_buckets,email_outbox,admin_audit_events CASCADE',
      );
    };
    await clear();
    return {
      db,
      config,
      crypto,
      challenges,
      register,
      clear,
      close: async () => {
        try {
          await clear();
        } finally {
          await db.destroy();
        }
      },
    };
  } catch (error) {
    await db.destroy();
    throw error;
  }
}
