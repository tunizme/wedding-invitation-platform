import { UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { User } from '../domain/entities';
import { safeProfile, type SafeUserProfile } from '../auth/local-login.service';
import { lockUsers, transaction } from '../infrastructure/transactions';

export interface ProfileUpdate {
  displayName?: string | null;
  phoneNumber?: string | null;
}

export class ProfileService {
  constructor(private readonly db: DataSource) {}

  async get(userId: string): Promise<SafeUserProfile> {
    const [user] = await this.db.query<User[]>(
      'SELECT * FROM users WHERE id=$1',
      [userId],
    );
    if (!user) throw new UnauthorizedException();
    return safeProfile(user);
  }

  async update(
    userId: string,
    update: ProfileUpdate,
  ): Promise<SafeUserProfile> {
    return transaction(this.db, async (manager) => {
      await lockUsers(manager, [userId]);
      await manager.query(
        `UPDATE users
         SET display_name=CASE WHEN $2 THEN $3 ELSE display_name END,
             phone_number=CASE WHEN $4 THEN $5 ELSE phone_number END,
             updated_at=now()
         WHERE id=$1`,
        [
          userId,
          Object.hasOwn(update, 'displayName'),
          update.displayName ?? null,
          Object.hasOwn(update, 'phoneNumber'),
          update.phoneNumber ?? null,
        ],
      );
      const [user] = await manager.query<User[]>(
        'SELECT * FROM users WHERE id=$1',
        [userId],
      );
      if (!user) throw new UnauthorizedException();
      return safeProfile(user);
    });
  }
}
