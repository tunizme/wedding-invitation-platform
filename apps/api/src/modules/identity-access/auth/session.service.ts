import { randomBytes, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { lockSessions, lockUsers } from '../infrastructure/transactions';
import { AccessTokenService } from './access-token.service';
import type { UserRole } from '../authorization/principal';
import type { BoundContext } from '../context/auth-context.service';

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

  /** Lock the complete issuance user set before any caller locks a user.
   * The bound context is already held at L0, so its current owner is stable.
   */
  async lockIssuanceUsers(
    manager: EntityManager,
    userId: string,
    context?: Pick<BoundContext, 'context'>,
  ): Promise<void> {
    const prior = context?.context.current_session_id
      ? await manager.query<{ user_id: string }[]>(
          'SELECT user_id FROM auth_sessions WHERE id=$1',
          [context.context.current_session_id],
        )
      : [];
    await lockUsers(manager, [userId, ...prior.map((row) => row.user_id)]);
  }

  /**
   * Issue a session. With a bound 006 context (already locked at L0 by the
   * caller), the session gets an immutable slot tag, becomes the context's
   * current session and supersedes the previous one. Ledger recording of the
   * slot emission is the caller's final settle() step (L∞).
   */
  async issue(
    manager: EntityManager,
    userId: string,
    options: { context?: Pick<BoundContext, 'context'> } = {},
  ) {
    const context = options.context?.context;
    let superseded: { id: string; user_id: string } | undefined;
    if (context?.current_session_id) {
      [superseded] = await manager.query<{ id: string; user_id: string }[]>(
        'SELECT id,user_id FROM auth_sessions WHERE id=$1 AND revoked_at IS NULL',
        [context.current_session_id],
      );
    }
    await lockUsers(manager, [
      userId,
      ...(superseded ? [superseded.user_id] : []),
    ]);
    if (context)
      for (const owner of [...new Set([userId, superseded?.user_id])]
        .filter((id): id is string => Boolean(id))
        .sort())
        await lockSessions(manager, owner);
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
    const slotTag = context ? randomBytes(16).toString('base64url') : null;
    await manager.query(
      'INSERT INTO auth_sessions (id,user_id,csrf_seed,csrf_key_version,created_at,absolute_expires_at,context_id,slot_tag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        userId,
        seed,
        this.config.keyVersion,
        now,
        expires,
        context?.id ?? null,
        slotTag,
      ],
    );
    if (context) {
      if (superseded)
        await manager.query(
          `UPDATE auth_sessions SET revoked_at=now(),revocation_reason='SUPERSEDED'
           WHERE id=$1 AND revoked_at IS NULL`,
          [superseded.id],
        );
      await manager.query(
        'UPDATE auth_contexts SET current_session_id=$2 WHERE id=$1',
        [context.id, id],
      );
      context.current_session_id = id;
    }
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
      slotTag,
      supersededSessionId: context ? (superseded?.id ?? null) : null,
      refreshToken: token,
      expiresAt: expires,
      csrfSeed: seed,
      csrfKeyVersion: this.config.keyVersion,
      accessToken: this.tokens.issue({ sub: userId, sid: id, role: user.role }),
    };
  }

  /** 006: slot tag of a session (by JWT sid); null for legacy sessions. */
  async slotTagOf(
    manager: Pick<EntityManager, 'query'>,
    sessionId: string,
  ): Promise<string | null> {
    const [row] = await manager.query<{ slot_tag: string | null }[]>(
      'SELECT slot_tag FROM auth_sessions WHERE id=$1',
      [sessionId],
    );
    return row?.slot_tag ?? null;
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
