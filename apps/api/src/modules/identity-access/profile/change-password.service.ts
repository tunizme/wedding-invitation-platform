import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { PasswordChangeNotApplicableException } from '../../../common/errors/public-problem.exception';
import type { User } from '../domain/entities';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import {
  lockSessions,
  lockUsers,
  transaction,
} from '../infrastructure/transactions';

export class ChangePasswordService {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
  ) {}

  async change(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.crypto.validatePassword(newPassword);
    const [observed] = await this.db.query<User[]>(
      'SELECT * FROM users WHERE id=$1',
      [userId],
    );
    if (!observed) throw new UnauthorizedException();
    if (observed.login_method !== 'LOCAL' || !observed.password_hash)
      throw new PasswordChangeNotApplicableException();
    if (
      !(await this.crypto.verifyPassword(
        observed.password_hash,
        currentPassword,
      ))
    )
      throw new BadRequestException();

    const replacementHash = await this.crypto.hashPassword(newPassword);
    await transaction(this.db, async (manager) => {
      await lockUsers(manager, [userId]);
      await lockSessions(manager, userId);
      const [current] = await manager.query<User[]>(
        'SELECT * FROM users WHERE id=$1',
        [userId],
      );
      if (!current) throw new UnauthorizedException();
      if (current.login_method !== 'LOCAL' || !current.password_hash)
        throw new PasswordChangeNotApplicableException();
      if (
        !(await this.crypto.verifyPassword(
          current.password_hash,
          currentPassword,
        ))
      )
        throw new BadRequestException();

      await manager.query(
        `SELECT id FROM auth_challenges
         WHERE user_id=$1 AND purpose='PASSWORD_RESET' ORDER BY id FOR UPDATE`,
        [userId],
      );
      await manager.query(
        `UPDATE users
         SET password_hash=$2,credential_version=credential_version+1,
             credentials_updated_at=now(),updated_at=now()
         WHERE id=$1`,
        [userId, replacementHash],
      );
      await manager.query(
        `UPDATE auth_sessions SET revoked_at=now(),revocation_reason='PASSWORD_CHANGE'
         WHERE user_id=$1 AND revoked_at IS NULL`,
        [userId],
      );
      await manager.query(
        `UPDATE auth_challenges SET status='REVOKED',revoked_at=now()
         WHERE user_id=$1 AND purpose='PASSWORD_RESET'
           AND status IN ('ACTIVE','PENDING_DELIVERY')`,
        [userId],
      );
    });
  }
}
