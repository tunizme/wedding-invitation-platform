import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type { AuthSession, RefreshCredential, User } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import {
  lockSessions,
  lockUsers,
  transaction,
} from '../infrastructure/transactions';
import { AccessTokenService } from './access-token.service';
import { AuthTransitionProblemException } from '../../../common/errors/public-problem.exception';
import type {
  AuthContextService,
  ContextRequest,
} from '../context/auth-context.service';
import type { BrowserSecurityService } from './browser-security.service';
import { safeProfile } from './local-login.service';

interface RefreshContext {
  credential: RefreshCredential;
  session: AuthSession;
  user: User;
}

type RotationResult =
  | { kind: 'denied' }
  | {
      kind: 'rotated';
      refreshToken: string;
      expiresAt: Date;
      accessToken: string;
      csrfSeed: Buffer;
      csrfKeyVersion: number;
      sessionId: string;
      user: ReturnType<typeof safeProfile>;
    };

export class RefreshService {
  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
    private readonly crypto: CredentialCrypto,
    private readonly tokens: AccessTokenService,
    private readonly contexts?: AuthContextService,
    private readonly browser?: BrowserSecurityService,
  ) {}

  private digests(token: string): Buffer[] {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return [];
    return Object.keys(this.config.refreshKeys).map((version) =>
      this.crypto.refreshDigest(token, Number(version)),
    );
  }

  private async find(
    manager: Pick<EntityManager, 'query'> | DataSource,
    token: string,
  ): Promise<RefreshContext | undefined> {
    const digests = this.digests(token);
    if (!digests.length) return undefined;
    const placeholders = digests.map((_, index) => `$${index + 1}`).join(',');
    const [row] = await manager.query<
      (RefreshCredential &
        AuthSession &
        User & {
          credential_id: string;
          session_id_value: string;
          user_id_value: string;
          credential_expires_at: Date;
          credential_revoked_at: Date | null;
          session_revoked_at: Date | null;
          session_context_id: string | null;
          user_created_at: Date;
        })[]
    >(
      `SELECT c.*,c.id AS credential_id,c.expires_at AS credential_expires_at,
              c.revoked_at AS credential_revoked_at,
              s.id AS session_id_value,s.user_id AS user_id_value,
              s.csrf_seed,s.csrf_key_version,s.created_at,s.last_refreshed_at,
              s.absolute_expires_at,s.revoked_at AS session_revoked_at,
              s.revocation_reason,s.user_agent_summary,
              s.context_id AS session_context_id,s.slot_tag,
              u.email,u.password_hash,u.login_method,u.role,u.status,u.email_verified_at,
              u.display_name,u.phone_number,u.avatar_url,u.credentials_updated_at,
              u.credential_version,u.created_at AS user_created_at,u.updated_at
       FROM refresh_credentials c
       JOIN auth_sessions s ON s.id=c.session_id
       JOIN users u ON u.id=s.user_id
       WHERE c.token_hash IN (${placeholders}) LIMIT 1`,
      digests,
    );
    if (!row) return undefined;
    return {
      credential: {
        id: row.credential_id,
        session_id: row.session_id,
        token_hash: row.token_hash,
        hash_key_version: row.hash_key_version,
        generation: row.generation,
        issued_at: row.issued_at,
        expires_at: row.credential_expires_at,
        consumed_at: row.consumed_at,
        revoked_at: row.credential_revoked_at,
        replaced_by_id: row.replaced_by_id,
      },
      session: {
        id: row.session_id_value,
        user_id: row.user_id_value,
        csrf_seed: row.csrf_seed,
        csrf_key_version: row.csrf_key_version,
        created_at: row.created_at,
        last_refreshed_at: row.last_refreshed_at,
        absolute_expires_at: row.absolute_expires_at,
        revoked_at: row.session_revoked_at,
        revocation_reason: row.revocation_reason,
        user_agent_summary: row.user_agent_summary,
        context_id: row.session_context_id,
        slot_tag: row.slot_tag,
      },
      user: {
        id: row.user_id_value,
        email: row.email,
        password_hash: row.password_hash,
        login_method: row.login_method,
        role: row.role,
        status: row.status,
        email_verified_at: row.email_verified_at,
        display_name: row.display_name,
        phone_number: row.phone_number,
        avatar_url: row.avatar_url,
        credentials_updated_at: row.credentials_updated_at,
        credential_version: row.credential_version,
        created_at: row.user_created_at,
        updated_at: row.updated_at,
      },
    };
  }

  private eligible(context: RefreshContext, now = new Date()): boolean {
    return (
      !context.credential.consumed_at &&
      !context.credential.revoked_at &&
      !context.session.revoked_at &&
      context.credential.expires_at > now &&
      context.session.absolute_expires_at > now &&
      context.user.status === 'ACTIVE'
    );
  }

  async context(token: string): Promise<RefreshContext> {
    const context = await this.presented(token);
    if (!context || !this.eligible(context)) throw new UnauthorizedException();
    return context;
  }

  async presented(token: string): Promise<RefreshContext> {
    const context = await this.find(this.db, token);
    if (!context) throw new UnauthorizedException();
    return context;
  }

  async rotate(token: string) {
    const observed = await this.find(this.db, token);
    if (!observed) throw new UnauthorizedException();
    const nextToken = this.crypto.randomToken();
    const result = await transaction(this.db, (manager) =>
      this.rotateLocked(manager, token, observed, nextToken),
    );
    if (result.kind === 'denied') throw new UnauthorizedException();
    return result;
  }

  /**
   * 006 F3: rotate only the context's current session slot. Never scans other
   * slots; a consumed value presented in the current slot still revokes the
   * family (003). Denials are returned (not thrown) inside the transaction so
   * a REFRESH_REUSE revocation commits.
   */
  async rotateCurrent(
    request: ContextRequest,
    contextId: string,
    expectedTag: string | undefined,
  ) {
    if (!this.contexts || !this.browser) throw new UnauthorizedException();
    const contexts = this.contexts;
    const browser = this.browser;
    const nextToken = this.crypto.randomToken();
    type Outcome =
      RotationResult | { kind: 'superseded' } | { kind: 'missing' };
    const result = await transaction(
      this.db,
      async (
        manager,
      ): Promise<
        | Outcome
        | (Extract<RotationResult, { kind: 'rotated' }> & {
            slotTag: string;
            bindingSecret: string;
            contextRevision: number;
            cleanupNames: string[];
          })
      > => {
        const bound = await contexts.bind(manager, request, contextId);
        const tag = await contexts.currentSessionTag(manager, bound.context);
        if (!tag) {
          await contexts.settle(manager, bound);
          return { kind: 'missing' };
        }
        if (tag !== expectedTag) {
          await contexts.settle(manager, bound);
          return { kind: 'superseded' };
        }
        const token = browser.readExactlyOne(
          request,
          browser.slotCookieName(tag),
        );
        const observed = token ? await this.find(manager, token) : undefined;
        if (
          !token ||
          !observed ||
          observed.session.id !== bound.context.current_session_id
        ) {
          await contexts.settle(manager, bound);
          return { kind: 'missing' };
        }
        const rotated = await this.rotateLocked(
          manager,
          token,
          observed,
          nextToken,
        );
        if (rotated.kind === 'denied') {
          await contexts.settle(manager, bound);
          return rotated;
        }
        const bindingSecret = browser.readExactlyOne(
          request,
          browser.bindingCookieName(contextId),
        ) as string;
        const cleanupNames = await contexts.settle(manager, bound, [
          {
            name: browser.slotCookieName(tag),
            kind: 'SLOT',
            ownerSessionId: rotated.sessionId,
            value: rotated.refreshToken,
          },
          {
            name: browser.bindingCookieName(contextId),
            kind: 'BINDING',
            ownerContextId: contextId,
            value: bindingSecret,
          },
        ]);
        return {
          ...rotated,
          slotTag: tag,
          bindingSecret,
          cleanupNames,
          contextRevision: Number(bound.context.revision),
        };
      },
    );
    if (result.kind === 'superseded')
      throw new AuthTransitionProblemException('SUPERSEDED');
    if (result.kind === 'missing')
      throw new AuthTransitionProblemException('CREDENTIAL_MISSING');
    if (result.kind === 'denied') throw new UnauthorizedException();
    return result as Extract<typeof result, { slotTag: string }>;
  }

  /** Current session of a bound context, for CSRF bootstrap (read-only). */
  async currentForContext(
    request: ContextRequest,
    contextId: string,
    expectedTag: string | undefined,
    /**
     * CSRF bootstrap requires an eligible credential. The refresh path must not
     * (003 `presented()`): a consumed value has to reach rotation so the
     * REFRESH_REUSE family revocation commits.
     */
    options: { requireEligible?: boolean } = { requireEligible: true },
  ): Promise<RefreshContext> {
    if (!this.contexts || !this.browser) throw new UnauthorizedException();
    const contexts = this.contexts;
    const browser = this.browser;
    const outcome = await transaction(this.db, async (manager) => {
      const bound = await contexts.bind(manager, request, contextId);
      const tag = await contexts.currentSessionTag(manager, bound.context);
      await contexts.settle(manager, bound);
      if (!tag) return { kind: 'missing' as const };
      if (tag !== expectedTag) return { kind: 'superseded' as const };
      const token = browser.readExactlyOne(
        request,
        browser.slotCookieName(tag),
      );
      const found = token ? await this.find(manager, token) : undefined;
      if (
        !found ||
        found.session.id !== bound.context.current_session_id ||
        (options.requireEligible !== false && !this.eligible(found))
      )
        return { kind: 'missing' as const };
      return { kind: 'ok' as const, found };
    });
    if (outcome.kind === 'superseded')
      throw new AuthTransitionProblemException('SUPERSEDED');
    if (outcome.kind === 'missing')
      throw new AuthTransitionProblemException('CREDENTIAL_MISSING');
    return outcome.found;
  }

  private async rotateLocked(
    manager: EntityManager,
    token: string,
    observed: RefreshContext,
    nextToken: string,
  ): Promise<RotationResult> {
    await lockUsers(manager, [observed.user.id]);
    await lockSessions(manager, observed.user.id);
    const current = await this.find(manager, token);
    if (!current || current.session.id !== observed.session.id)
      return { kind: 'denied' };
    const now = new Date();
    if (current.credential.consumed_at || current.credential.revoked_at) {
      await manager.query(
        `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,$2),
           revocation_reason=COALESCE(revocation_reason,'REFRESH_REUSE') WHERE id=$1`,
        [current.session.id, now],
      );
      return { kind: 'denied' };
    }
    if (!this.eligible(current, now)) {
      if (!current.session.revoked_at)
        await manager.query(
          "UPDATE auth_sessions SET revoked_at=$2,revocation_reason='EXPIRED' WHERE id=$1",
          [current.session.id, now],
        );
      return { kind: 'denied' };
    }
    const successorId = randomUUID();
    await manager.query(
      `INSERT INTO refresh_credentials
         (id,session_id,token_hash,hash_key_version,generation,issued_at,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        successorId,
        current.session.id,
        this.crypto.refreshDigest(nextToken, this.config.keyVersion),
        this.config.keyVersion,
        current.credential.generation + 1,
        now,
        current.session.absolute_expires_at,
      ],
    );
    await manager.query(
      'UPDATE refresh_credentials SET consumed_at=$2,replaced_by_id=$3 WHERE id=$1',
      [current.credential.id, now, successorId],
    );
    await manager.query(
      'UPDATE auth_sessions SET last_refreshed_at=$2 WHERE id=$1',
      [current.session.id, now],
    );
    return {
      kind: 'rotated',
      refreshToken: nextToken,
      expiresAt: current.session.absolute_expires_at,
      accessToken: this.tokens.issue({
        sub: current.user.id,
        sid: current.session.id,
        role: current.user.role as 'CUSTOMER' | 'ADMIN',
      }),
      csrfSeed: current.session.csrf_seed,
      csrfKeyVersion: current.session.csrf_key_version,
      sessionId: current.session.id,
      user: safeProfile(current.user),
    };
  }

  async revokeCurrent(token: string): Promise<void> {
    const observed = await this.find(this.db, token);
    if (!observed) return;
    await transaction(this.db, async (manager) => {
      await lockUsers(manager, [observed.user.id]);
      await lockSessions(manager, observed.user.id);
      const current = await this.find(manager, token);
      if (!current || !this.eligible(current)) return;
      await manager.query(
        "UPDATE auth_sessions SET revoked_at=now(),revocation_reason='LOGOUT' WHERE id=$1 AND revoked_at IS NULL",
        [current.session.id],
      );
    });
  }
}
