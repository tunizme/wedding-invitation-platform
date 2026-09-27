import { createHash, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { isEmail } from 'class-validator';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type {
  ProviderIdentityPort,
  VerifiedProviderIdentity,
} from '../domain/provider-identity.port';

interface GoogleClient {
  generateAuthUrl(options: Record<string, unknown>): string;
  getToken(options: {
    code: string;
    codeVerifier: string;
    redirect_uri: string;
  }): Promise<{ tokens: { id_token?: string | null } }>;
  verifyIdToken(options: {
    idToken: string;
    audience: string;
    maxExpiry: number;
  }): Promise<{ getPayload(): TokenPayload | undefined }>;
}

export interface GoogleAuthorizationInput {
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface GoogleCallbackInput {
  code: string;
  codeVerifier: string;
  expectedNonceHash: Buffer;
}

export type GoogleCallbackFailure =
  | 'GOOGLE_TOKEN_EXCHANGE'
  | 'GOOGLE_ID_TOKEN_MISSING'
  | 'GOOGLE_ID_TOKEN_VERIFY'
  | 'GOOGLE_CLAIMS_INVALID';

export class GoogleCallbackRejected extends UnauthorizedException {
  constructor(readonly failureCode: GoogleCallbackFailure) {
    super();
  }
}

const timeout = async <T>(work: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PROVIDER_TIMEOUT')), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export class GoogleAdapter implements ProviderIdentityPort<GoogleCallbackInput> {
  private readonly client: GoogleClient;
  private readonly redirectUri: string;

  constructor(
    private readonly config: IdentityEnvironment,
    client?: GoogleClient,
  ) {
    if (!config.googleClientId || !config.googleClientSecret)
      this.client = client ?? ({} as GoogleClient);
    else
      this.client =
        client ??
        (new OAuth2Client({
          clientId: config.googleClientId,
          clientSecret: config.googleClientSecret,
          redirectUri: `${config.apiOrigin}/api/v1/auth/oauth/google/callback`,
          transporterOptions: { timeout: 10_000, retry: false },
        }) as GoogleClient);
    this.redirectUri = `${config.apiOrigin}/api/v1/auth/oauth/google/callback`;
  }

  authorizationUrl(input: GoogleAuthorizationInput): string {
    this.requireEnabled();
    return this.client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: this.redirectUri,
    });
  }

  async verifyCallback(
    input: GoogleCallbackInput,
  ): Promise<VerifiedProviderIdentity> {
    this.requireEnabled();
    let exchanged: Awaited<ReturnType<GoogleClient['getToken']>>;
    try {
      exchanged = await timeout(
        this.client.getToken({
          code: input.code,
          codeVerifier: input.codeVerifier,
          redirect_uri: this.redirectUri,
        }),
      );
    } catch {
      throw new GoogleCallbackRejected('GOOGLE_TOKEN_EXCHANGE');
    }
    const idToken = exchanged.tokens.id_token;
    if (!idToken) throw new GoogleCallbackRejected('GOOGLE_ID_TOKEN_MISSING');
    let ticket: Awaited<ReturnType<GoogleClient['verifyIdToken']>>;
    try {
      ticket = await timeout(
        this.client.verifyIdToken({
          idToken,
          audience: this.config.googleClientId!,
          maxExpiry: 86_400,
        }),
      );
    } catch {
      throw new GoogleCallbackRejected('GOOGLE_ID_TOKEN_VERIFY');
    }
    const payload = ticket.getPayload();
    const now = Math.floor(Date.now() / 1000);
    const nonce = payload?.nonce;
    const nonceBuffer = nonce
      ? createHash('sha256').update(nonce).digest()
      : Buffer.alloc(0);
    if (
      !payload ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(
        payload.iss,
      ) ||
      payload.aud !== this.config.googleClientId ||
      (payload.azp !== undefined &&
        payload.azp !== this.config.googleClientId) ||
      !payload.sub ||
      payload.sub.length > 255 ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.iat > now + 300 ||
      payload.exp <= now ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > 86_400 ||
      nonceBuffer.length !== input.expectedNonceHash.length ||
      !timingSafeEqual(nonceBuffer, input.expectedNonceHash)
    )
      throw new GoogleCallbackRejected('GOOGLE_CLAIMS_INVALID');
    const normalizedEmail = payload.email?.trim().toLowerCase();
    const validEmail =
      !!normalizedEmail &&
      normalizedEmail.length <= 254 &&
      isEmail(normalizedEmail);
    const picture = payload.picture;
    return {
      provider: 'GOOGLE',
      subject: payload.sub,
      email: validEmail ? normalizedEmail : null,
      emailVerified: validEmail && payload.email_verified === true,
      displayName: payload.name?.trim().slice(0, 100) || null,
      avatarUrl:
        typeof picture === 'string' &&
        picture.length <= 2048 &&
        picture.startsWith('https://')
          ? picture
          : null,
    };
  }

  private requireEnabled(): void {
    if (
      !this.config.googleEnabled ||
      !this.config.googleClientId ||
      !this.config.googleClientSecret
    )
      throw new UnauthorizedException();
  }
}
