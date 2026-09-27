import { randomUUID } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import type { DataSource } from 'typeorm';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { ChallengeService } from '../verification/challenge.service';
import { transaction } from '../infrastructure/transactions';

export class RegisterLocalService {
  constructor(
    private readonly db: DataSource,
    private readonly crypto: CredentialCrypto,
    private readonly challenges: ChallengeService,
  ) {}
  async register(rawEmail: string, password: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (email.length > 254 || !isEmail(email))
      throw new UnprocessableEntityException();
    let hash: string;
    try {
      hash = await this.crypto.hashPassword(password);
    } catch {
      throw new UnprocessableEntityException();
    }
    // Hash for new and duplicate requests alike; the unique constraint decides the winner.
    try {
      await transaction(this.db, async (manager) => {
        const id = randomUUID();
        await manager.query(
          "INSERT INTO users (id,email,password_hash,login_method,role,status,credentials_updated_at,created_at,updated_at) VALUES ($1,$2,$3,'LOCAL','CUSTOMER','ACTIVE',now(),now(),now())",
          [id, email, hash],
        );
        await this.challenges.enqueueLocalVerification(manager, id, email);
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505' &&
        'table' in error &&
        error.table === 'users' &&
        'constraint' in error &&
        error.constraint === 'users_email_key'
      )
        return;
      throw error;
    }
  }
}
