import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { User } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { lockUsers, transaction } from '../infrastructure/transactions';
import { SessionService } from './session.service';

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

export class LocalLoginService {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
    private readonly sessions: SessionService,
  ) {}

  async login(email: string, password: string) {
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
      await lockUsers(manager, [observed.id]);
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

      const session = await this.sessions.issue(manager, current.id);
      return { session, user: safeProfile(current) };
    });
  }
}
