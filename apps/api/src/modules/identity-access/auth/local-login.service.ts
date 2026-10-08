import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { User } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { transaction } from '../infrastructure/transactions';
import { SessionService } from './session.service';
import { BrowserSecurityService } from './browser-security.service';
import type {
  AuthContextService,
  ContextRequest,
} from '../context/auth-context.service';
import type { AuthIntentService } from '../context/auth-intent.service';

const dummyPasswordHash =
  '$argon2id$v=19$m=19456,p=1,t=2$DGp9ZSNJQ1ThG/n5z4M2nQ$2rWRVEPbZwwJ13jM8/fEnkRUDfgM4zyc1cpgvbelmto';

export interface SafeUserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  loginMethod: 'LOCAL' | 'GOOGLE' | 'FACEBOOK';
  role: 'CUSTOMER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  displayName: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
}

export function safeProfile(user: User): SafeUserProfile {
  return {
    id: user.id,
    email: user.email,
    emailVerified: !!user.email_verified_at,
    loginMethod: user.login_method as SafeUserProfile['loginMethod'],
    role: user.role as SafeUserProfile['role'],
    status: user.status as SafeUserProfile['status'],
    displayName: user.display_name,
    phoneNumber: user.phone_number,
    avatarUrl: user.avatar_url,
  };
}

/** 006: the reserved LOCAL_LOGIN intent this login executes under. */
export interface LoginContext {
  request: ContextRequest;
  contextId: string;
  intentId: string;
}

export class LocalLoginService {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
    private readonly sessions: SessionService,
    private readonly contexts?: AuthContextService,
    private readonly intents?: AuthIntentService,
    private readonly browser?: BrowserSecurityService,
  ) {}

  async login(email: string, password: string, context?: LoginContext) {
    const [observed] = await this.db.query<User[]>(
      'SELECT * FROM users WHERE email=$1',
      [email],
    );
    const observedHash =
      observed?.login_method === 'LOCAL' && observed.password_hash
        ? observed.password_hash
        : dummyPasswordHash;
    const matches = await this.crypto.verifyPassword(observedHash, password);
    if (!matches || !observed || observed.login_method !== 'LOCAL')
      throw new UnauthorizedException();

    const upgradedHash = this.crypto.needsPasswordRehash(observedHash)
      ? await this.crypto.hashPassword(password)
      : undefined;

    return transaction(this.db, async (manager) => {
      // 006 L0: context lock and intent authority come before any 003 lock.
      const bound =
        context && this.contexts && this.intents
          ? await this.contexts.bind(
              manager,
              context.request,
              context.contextId,
            )
          : undefined;
      if (bound && this.intents && context)
        await this.intents.assertCurrent(
          manager,
          bound,
          context.intentId,
          'LOCAL_LOGIN',
        );
      await this.sessions.lockIssuanceUsers(manager, observed.id, bound);
      const [current] = await manager.query<User[]>(
        'SELECT * FROM users WHERE id=$1',
        [observed.id],
      );
      if (
        !current ||
        current.login_method !== 'LOCAL' ||
        !current.password_hash ||
        !(await this.crypto.verifyPassword(current.password_hash, password)) ||
        current.status !== 'ACTIVE'
      )
        throw new UnauthorizedException();
      if (!current.email_verified_at) throw new ForbiddenException();

      if (
        upgradedHash &&
        current.password_hash === observedHash &&
        this.crypto.needsPasswordRehash(current.password_hash)
      )
        await manager.query(
          'UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1',
          [current.id, upgradedHash],
        );

      const session = await this.sessions.issue(
        manager,
        current.id,
        bound ? { context: bound } : {},
      );
      let cleanupNames: string[] = [];
      if (bound && context && this.intents && this.contexts && this.browser) {
        await this.intents.resolve(
          manager,
          context.intentId,
          'COMMITTED',
          'SESSION_ESTABLISHED',
          session.sessionId,
        );
        // L∞ last: record the new slot emission (capacity checked here too).
        cleanupNames = await this.contexts.settle(manager, bound, [
          {
            name: this.browser.slotCookieName(session.slotTag ?? ''),
            kind: 'SLOT',
            ownerSessionId: session.sessionId,
            value: session.refreshToken,
          },
        ]);
      }
      return {
        session,
        cleanupNames,
        user: safeProfile(current),
        contextRevision: bound ? Number(bound.context.revision) : undefined,
      };
    });
  }
}
