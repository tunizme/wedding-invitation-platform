import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import type { DataSource } from 'typeorm';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { ChallengeService } from '../verification/challenge.service';

export class CustomerInvitationService {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
    private readonly challenges: ChallengeService,
  ) {}
  async invite(adminId: string, rawEmail: unknown) {
    if (typeof rawEmail !== 'string') throw new UnprocessableEntityException();
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254 || !isEmail(email))
      throw new UnprocessableEntityException();
    const hash = await this.crypto.hashPassword(
      this.crypto.randomToken() + 'Aa1!',
    );
    return this.db.transaction(async (manager) => {
      // Serialize first invitations for the same email, including concurrent requests.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [email],
      );
      const [admin] = await manager.query<{ role: string; status: string }[]>(
        'SELECT role,status FROM users WHERE id=$1 FOR SHARE',
        [adminId],
      );
      if (admin?.role !== 'ADMIN' || admin.status !== 'ACTIVE')
        throw new ForbiddenException();
      let [user] = await manager.query<
        {
          id: string;
          role?: string;
          status?: string;
          invitation_pending: boolean;
        }[]
      >(
        'SELECT id,role,status,invitation_pending FROM users WHERE email=$1 FOR UPDATE',
        [email],
      );
      if (user && (user.role !== 'CUSTOMER' || user.status !== 'ACTIVE'))
        throw new ForbiddenException();
      if (!user) {
        user = { id: randomUUID(), invitation_pending: true };
        await manager.query(
          `INSERT INTO users(id,email,password_hash,login_method,role,status,invited_by,invitation_pending,credentials_updated_at,created_at,updated_at)
          VALUES($1,$2,$3,'LOCAL','CUSTOMER','ACTIVE',$4,true,now(),now(),now())`,
          [user.id, email, hash, adminId],
        );
      }
      if (user.invitation_pending)
        await this.challenges.enqueueCustomerInvitation(
          manager,
          user.id,
          email,
        );
      return {
        id: user.id,
        email,
        activationPending: user.invitation_pending,
        invitationQueued: !!user.invitation_pending,
      };
    });
  }
  async activate(proof: string, password: string) {
    let hash: string;
    try {
      hash = await this.crypto.hashPassword(password);
    } catch {
      throw new UnprocessableEntityException();
    }
    await this.db.transaction((manager) =>
      this.challenges.consume(
        manager,
        proof,
        'LOCAL_EMAIL_VERIFICATION',
        async (user) => {
          const [pending] = await manager.query<
            { invitation_pending: boolean; status: string }[]
          >('SELECT invitation_pending,status FROM users WHERE id=$1', [
            user.id,
          ]);
          if (!pending?.invitation_pending || pending.status !== 'ACTIVE')
            throw new ForbiddenException();
          await manager.query(
            `UPDATE users SET password_hash=$2,email_verified_at=clock_timestamp(),invitation_pending=false,
        credential_version=credential_version+1,credentials_updated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,
            [user.id, hash],
          );
        },
      ),
    );
  }
}
