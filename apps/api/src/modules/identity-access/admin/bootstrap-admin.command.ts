import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { validateIdentityEnvironment } from '../../../config/identity-access.environment';
import { databaseOptions } from '../../../infrastructure/database/data-source';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { transaction } from '../infrastructure/transactions';

export interface BootstrapAdminInput {
  email: string;
  password: string;
}

export async function bootstrapAdmin(
  db: DataSource,
  crypto: CredentialCrypto,
  input: BootstrapAdminInput,
): Promise<{ outcome: 'CREATED' | 'ALREADY_EXISTS' }> {
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('INVALID_ADMIN_EMAIL');
  crypto.validatePassword(input.password);
  const hash = await crypto.hashPassword(input.password);
  return transaction(db, async (manager) => {
    const [existing] = await manager.query<{ role: string }[]>(
      'SELECT role FROM users WHERE email=$1 FOR UPDATE',
      [email],
    );
    if (existing) {
      if (existing.role === 'ADMIN') return { outcome: 'ALREADY_EXISTS' };
      throw new Error('ADMIN_BOOTSTRAP_EMAIL_IN_USE');
    }
    await manager.query(
      `INSERT INTO users
       (id,email,password_hash,login_method,role,status,email_verified_at,credentials_updated_at,created_at,updated_at)
       VALUES ($1,$2,$3,'LOCAL','ADMIN','ACTIVE',now(),now(),now(),now())`,
      [randomUUID(), email, hash],
    );
    return { outcome: 'CREATED' };
  });
}

function emailArgument(args: string[]): string {
  if (args.length !== 2 || args[0] !== '--email' || !args[1])
    throw new Error(
      'Usage: pnpm --filter @wedding/api bootstrap:admin -- --email <address>',
    );
  return args[1];
}

async function hiddenPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('ADMIN_BOOTSTRAP_REQUIRES_TTY');
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0003')
          return finish(new Error('ADMIN_BOOTSTRAP_CANCELLED'));
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function main() {
  const email = emailArgument(process.argv.slice(2));
  const password = await hiddenPassword('Admin password (hidden): ');
  const confirmation = await hiddenPassword('Confirm password (hidden): ');
  if (password !== confirmation)
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD_MISMATCH');
  const { DataSource } = await import('typeorm');
  const db = new DataSource(databaseOptions());
  await db.initialize();
  try {
    const config = validateIdentityEnvironment(process.env);
    const result = await bootstrapAdmin(db, new CredentialCrypto(config), {
      email,
      password,
    });
    process.stdout.write(
      result.outcome === 'CREATED'
        ? 'ADMIN provisioned with verified email.\n'
        : 'ADMIN already exists; no changes made.\n',
    );
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const code =
      error instanceof Error ? error.message : 'ADMIN_BOOTSTRAP_FAILED';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
