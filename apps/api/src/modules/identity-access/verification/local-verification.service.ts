import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { User } from '../domain/entities';
import { transaction } from '../infrastructure/transactions';
import { ChallengeService } from './challenge.service';

export class LocalVerificationService {
  constructor(
    private readonly db: DataSource,
    private readonly challenges: ChallengeService,
  ) {}
  async request(email: string): Promise<void> {
    await transaction(this.db, async (manager) => {
      const [user] = await manager.query<User[]>(
        'SELECT * FROM users WHERE email=$1 FOR UPDATE',
        [email],
      );
      if (user?.login_method === 'LOCAL' && !user.email_verified_at) {
        if (user.invitation_pending) {
          if (user.status === 'ACTIVE')
            await this.challenges.enqueueCustomerInvitation(
              manager,
              user.id,
              email,
            );
        } else
          await this.challenges.enqueueLocalVerification(
            manager,
            user.id,
            email,
          );
      }
    });
  }
  async confirm(proof: string): Promise<void> {
    await transaction(this.db, (manager) =>
      this.challenges.consume(
        manager,
        proof,
        'LOCAL_EMAIL_VERIFICATION',
        async (user) => {
          if (user.invitation_pending) throw new BadRequestException();
          await manager.query(
            'UPDATE users SET email_verified_at=now(),updated_at=now() WHERE id=$1',
            [user.id],
          );
        },
      ),
    );
  }
}
