import { randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type { ExternalProvider } from '../domain/provider-identity.port';
import { CredentialCrypto } from '../infrastructure/credential-crypto';
import { transaction } from '../infrastructure/transactions';
import type {
  AuthContextService,
  BoundContext,
  ContextRequest,
} from '../context/auth-context.service';
import type { AuthIntentService } from '../context/auth-intent.service';

const statePattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;

export interface OAuthStart {
  id: string;
  state: string;
  binding: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  expiresAt: Date;
}

export interface OAuthClaim {
  id: string;
  contextId: string | null;
  intentId: string | null;
  expectedNonceHash: Buffer;
  codeVerifier: string;
  returnTargetKey: string;
}

export class OAuthTransactionService {
  constructor(
    private readonly db: DataSource,
    private readonly config: IdentityEnvironment,
    private readonly crypto: CredentialCrypto,
    private readonly contexts?: AuthContextService,
    private readonly intents?: AuthIntentService,
  ) {}

  async start(
    provider: ExternalProvider,
    returnTargetKey: 'OAUTH_RESULT',
    request?: ContextRequest,
    intentId?: string,
  ): Promise<OAuthStart> {
    if (
      !['GOOGLE', 'FACEBOOK'].includes(provider) ||
      returnTargetKey !== 'OAUTH_RESULT'
    )
      throw new BadRequestException();
    if (this.contexts || this.intents) {
      if (!request || !intentId || !this.contexts || !this.intents)
        throw new BadRequestException();
    }
    const id = randomUUID();
    const stateSecret = this.crypto.randomToken();
    const bindingSecret = this.crypto.randomToken();
    const nonce = this.crypto.randomToken();
    const codeVerifier = this.crypto.randomToken();
    const codeChallenge = this.crypto
      .proofDigest(codeVerifier)
      .toString('base64url');
    const encrypted =
      provider === 'GOOGLE'
        ? this.crypto.encrypt(codeVerifier, `oauth:${id}`)
        : undefined;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttl.oauth * 1000);
    await transaction(this.db, async (manager) => {
      let contextId: string | undefined;
      let bound: BoundContext | undefined;
      if (request && intentId && this.contexts && this.intents) {
        const [owner] = await manager.query<{ context_id: string }[]>(
          'SELECT context_id FROM auth_intents WHERE id=$1',
          [intentId],
        );
        contextId = owner?.context_id;
        if (!contextId) throw new BadRequestException();
        bound = await this.contexts.bind(
          manager,
          {
            ...request,
            headers: { ...request.headers, 'x-auth-context': contextId },
          },
          contextId,
        );
        const intent = await this.intents.assertCurrent(
          manager,
          bound,
          intentId,
          'OAUTH',
        );
        if (intent.oauth_started_at) throw new BadRequestException();
        await manager.query(
          'UPDATE auth_intents SET oauth_started_at=now() WHERE id=$1',
          [intentId],
        );
      }
      await manager.query(
        `INSERT INTO oauth_transactions
       (id,provider,state_hash,browser_binding_hash,nonce_hash,pkce_verifier_ciphertext,
        encryption_key_version,return_target_key,status,created_at,expires_at,intent_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,$11)`,
        [
          id,
          provider,
          this.crypto.proofDigest(stateSecret),
          this.crypto.proofDigest(bindingSecret),
          provider === 'GOOGLE' ? this.crypto.proofDigest(nonce) : null,
          encrypted?.ciphertext ?? null,
          encrypted?.keyVersion ?? null,
          returnTargetKey,
          now,
          expiresAt,
          intentId ?? null,
        ],
      );
      // Binding may have merged co-present groups. Close that bookkeeping only
      // after the OAuth business write so L-infinity remains last.
      if (bound && this.contexts) await this.contexts.settle(manager, bound);
    });
    return {
      id,
      state: `${id}.${stateSecret}`,
      binding: `${id}.${bindingSecret}`,
      nonce,
      codeVerifier,
      codeChallenge,
      expiresAt,
    };
  }

  private parse(value: string | undefined) {
    if (!value) return undefined;
    const match = statePattern.exec(value);
    return match ? { id: match[1], secret: match[2] } : undefined;
  }

  private matches(secret: string, expected: Buffer): boolean {
    const actual = this.crypto.proofDigest(secret);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  async claim(
    provider: ExternalProvider,
    state: string | undefined,
    binding: string | undefined,
  ): Promise<OAuthClaim> {
    const parsedState = this.parse(state);
    const parsedBinding = this.parse(binding);
    if (
      !['GOOGLE', 'FACEBOOK'].includes(provider) ||
      !parsedState ||
      !parsedBinding ||
      parsedState.id !== parsedBinding.id
    )
      throw new BadRequestException();
    const claimed = await transaction(this.db, async (manager) => {
      const [row] = await manager.query<
        {
          id: string;
          provider: string;
          state_hash: Buffer;
          browser_binding_hash: Buffer;
          nonce_hash: Buffer | null;
          pkce_verifier_ciphertext: Buffer | null;
          encryption_key_version: number | null;
          return_target_key: string;
          context_id: string | null;
          intent_id: string | null;
          status: string;
          expires_at: Date;
        }[]
      >(
        `SELECT t.*,i.context_id FROM oauth_transactions t
         LEFT JOIN auth_intents i ON i.id=t.intent_id
         WHERE t.id=$1 FOR UPDATE OF t`,
        [parsedState.id],
      );
      const [{ now }] = await manager.query<{ now: Date }[]>(
        'SELECT clock_timestamp() AS now',
      );
      if (
        !row ||
        row.provider !== provider ||
        row.status !== 'PENDING' ||
        !this.matches(parsedState.secret, row.state_hash) ||
        !this.matches(parsedBinding.secret, row.browser_binding_hash) ||
        (provider === 'GOOGLE' &&
          (!row.nonce_hash ||
            !row.pkce_verifier_ciphertext ||
            !row.encryption_key_version)) ||
        (provider === 'FACEBOOK' &&
          (row.nonce_hash !== null ||
            row.pkce_verifier_ciphertext !== null ||
            row.encryption_key_version !== null)) ||
        row.return_target_key !== 'OAUTH_RESULT'
      )
        throw new BadRequestException();
      if (row.expires_at <= now) {
        await manager.query(
          "UPDATE oauth_transactions SET status='EXPIRED',failure_code='EXPIRED',pkce_verifier_ciphertext=NULL,encryption_key_version=NULL WHERE id=$1",
          [row.id],
        );
        return undefined;
      }
      const codeVerifier =
        provider === 'GOOGLE'
          ? this.crypto.decrypt(
              {
                ciphertext: row.pkce_verifier_ciphertext!,
                keyVersion: row.encryption_key_version!,
              },
              `oauth:${row.id}`,
            )
          : '';
      await manager.query(
        "UPDATE oauth_transactions SET status='PROCESSING',claimed_at=$2 WHERE id=$1 AND status='PENDING'",
        [row.id, now],
      );
      return {
        id: row.id,
        contextId: row.context_id,
        intentId: row.intent_id,
        expectedNonceHash: row.nonce_hash ?? Buffer.alloc(0),
        codeVerifier,
        returnTargetKey: row.return_target_key,
      };
    });
    if (!claimed) throw new BadRequestException();
    return claimed;
  }

  async complete(id: string, manager?: EntityManager): Promise<void> {
    const result: unknown = await (manager ?? this.db.manager).query<unknown>(
      `UPDATE oauth_transactions
       SET status='CONSUMED',consumed_at=now(),pkce_verifier_ciphertext=NULL,encryption_key_version=NULL
       WHERE id=$1 AND status='PROCESSING'`,
      [id],
    );
    if (!Array.isArray(result) || result[1] !== 1)
      throw new BadRequestException();
  }

  async fail(id: string, failureCode: string): Promise<void> {
    await this.db.query(
      `UPDATE oauth_transactions
       SET status='FAILED',failure_code=$2,pkce_verifier_ciphertext=NULL,encryption_key_version=NULL
       WHERE id=$1 AND status='PROCESSING'`,
      [id, failureCode.slice(0, 50)],
    );
  }
}
