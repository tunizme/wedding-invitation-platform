import { randomBytes, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { lockSessions, lockUsers } from '../infrastructure/transactions';
import { AccessTokenService } from './access-token.service';
import type { UserRole } from '../authorization/principal';

export type RevocationReason =
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_LOCK'
  | 'REFRESH_REUSE'
  | 'EXPIRED';

export class SessionService {
  constructor(
    private readonly config: IdentityEnvironment,
    private readonly crypto: CredentialCrypto,
    private readonly tokens: AccessTokenService,
  ) {}

  async issue(manager: EntityManager, userId: string) {
    await lockUsers(manager, [userId]);
    const [user] = await manager.query<
      {
        id: string;
        role: UserRole;
        status: string;
        login_method: string;
        email_verified_at: Date | null;
      }[]
    >(
      'SELECT id,role,status,login_method,email_verified_at FROM users WHERE id = $1',
      [userId],
    );
    if (!user || user.status !== 'ACTIVE' || !user.email_verified_at)
      throw new Error('SESSION_NOT_ALLOWED');
    const now = new Date();
    const expires = new Date(now.getTime() + 14 * 86400_000);
    const id = randomUUID();
    const seed = randomBytes(32);
    const token = this.crypto.randomToken();
    await manager.query(
      'INSERT INTO auth_sessions (id,user_id,csrf_seed,csrf_key_version,created_at,absolute_expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, userId, seed, this.config.keyVersion, now, expires],
    );
    await manager.query(
      'INSERT INTO refresh_credentials (id,session_id,token_hash,hash_key_version,generation,issued_at,expires_at) VALUES ($1,$2,$3,$4,0,$5,$6)',
      [
        randomUUID(),
        id,
        this.crypto.refreshDigest(token, this.config.keyVersion),
        this.config.keyVersion,
        now,
        expires,
      ],
    );
    return {
      sessionId: id,
      refreshToken: token,
      expiresAt: expires,
      csrfSeed: seed,
      csrfKeyVersion: this.config.keyVersion,
      accessToken: this.tokens.issue({ sub: userId, sid: id, role: user.role }),
    };
  }

  async revokeAll(
    manager: EntityManager,
    userId: string,
    reason: RevocationReason,
  ): Promise<void> {
    await lockUsers(manager, [userId]);
    await lockSessions(manager, userId);
    await manager.query(
      'UPDATE auth_sessions SET revoked_at = now(), revocation_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, reason],
    );
  }
}
