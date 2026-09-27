import type { DataSource } from 'typeorm';
import type { User } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { transaction } from '../infrastructure/transactions';
import { ChallengeService } from './challenge.service';

export class PasswordResetService {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
    private readonly challenges: ChallengeService,
  ) {}
  async request(email: string): Promise<void> {
    await transaction(this.db, async (manager) => {
      const [user] = await manager.query<User[]>(
        'SELECT * FROM users WHERE email=$1 FOR UPDATE',
        [email],
      );
      if (user?.login_method === 'LOCAL' && user.email_verified_at)
        await this.challenges.enqueuePasswordReset(manager, user.id, email);
    });
  }
  async confirm(proof: string, password: string): Promise<void> {
    // Hash before taking locks; proof/version are rechecked after acquiring them.
    const hash = await this.crypto.hashPassword(password);
    await transaction(this.db, (manager) =>
      this.challenges.consume(
        manager,
        proof,
        'PASSWORD_RESET',
        async (user) => {
          await manager.query(
            'UPDATE users SET password_hash=$2,credential_version=credential_version+1,credentials_updated_at=now(),updated_at=now() WHERE id=$1',
            [user.id, hash],
          );
          await manager.query(
            "UPDATE auth_sessions SET revoked_at=now(),revocation_reason='PASSWORD_RESET' WHERE user_id=$1 AND revoked_at IS NULL",
            [user.id],
          );
        },
      ),
    );
  }
}
