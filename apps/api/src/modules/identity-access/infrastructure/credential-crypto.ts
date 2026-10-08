import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import * as argon2 from 'argon2';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';

export const passwordOptions = {
  type: argon2.argon2id,
  version: 0x13,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export class CredentialCrypto {
  constructor(private readonly config: IdentityEnvironment) {}

  validatePassword(password: string, minimum = 8): void {
    if (
      typeof password !== 'string' ||
      [...password].length < minimum ||
      [...password].length > 128 ||
      Buffer.byteLength(password, 'utf8') > 512 ||
      Buffer.from(password, 'utf8').toString('utf8') !== password
    )
      throw new Error('INVALID_PASSWORD');
  }

  async hashPassword(password: string): Promise<string> {
    this.validatePassword(password);
    return argon2.hash(password, passwordOptions);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      this.validatePassword(password, 1);
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsPasswordRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, passwordOptions);
    } catch {
      return true;
    }
  }

  randomToken(): string {
    return randomBytes(32).toString('base64url');
  }
  proofDigest(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }
  refreshDigest(token: string, version: number): Buffer {
    const key = this.config.refreshKeys[version];
    if (!key) throw new Error('UNKNOWN_KEY_VERSION');
    return createHmac('sha256', key).update(token).digest();
  }

  /**
   * 006 context binding digest. Reuses the refresh key versions with domain
   * separation, so no additional secret is required.
   */
  bindingDigest(secret: string, version: number): Buffer {
    const key = this.config.refreshKeys[version];
    if (!key) throw new Error('UNKNOWN_KEY_VERSION');
    return createHmac('sha256', key)
      .update('wa-binding\0')
      .update(secret)
      .digest();
  }

  /** 006 cookie ledger: digest of an emitted cookie value (value never stored). */
  emissionDigest(name: string, value: string): Buffer {
    return createHmac('sha256', this.config.refreshKeys[this.config.keyVersion])
      .update('wa-emission\0')
      .update(name)
      .update('\0')
      .update(value)
      .digest();
  }

  encrypt(
    value: string,
    context: string,
  ): { ciphertext: Buffer; keyVersion: number } {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.config.encryptionKeys[this.config.keyVersion],
      nonce,
    );
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]),
      keyVersion: this.config.keyVersion,
    };
  }

  decrypt(
    envelope: { ciphertext: Buffer; keyVersion: number },
    context: string,
  ): string {
    try {
      const { ciphertext, keyVersion } = envelope;
      if (ciphertext.length < 28 || !this.config.encryptionKeys[keyVersion])
        throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.config.encryptionKeys[keyVersion],
        ciphertext.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(ciphertext.subarray(12, 28));
      return Buffer.concat([
        decipher.update(ciphertext.subarray(28)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('INVALID_ENCRYPTED_CREDENTIAL');
    }
  }
}
