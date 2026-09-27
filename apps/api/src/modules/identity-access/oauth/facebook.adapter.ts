import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import type { IdentityEnvironment } from '../../../config/identity-access.environment';
import type {
  ProviderIdentityPort,
  VerifiedProviderIdentity,
} from '../domain/provider-identity.port';

export const FACEBOOK_GRAPH_VERSION = 'v26.0';
const providerTimeoutMs = 10_000;

type FetchResponse = Pick<Response, 'ok' | 'json'>;
type FacebookFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<FetchResponse>;

export interface FacebookAuthorizationInput {
  state: string;
}

export interface FacebookCallbackInput {
  code: string;
}

export type FacebookCallbackFailure =
  | 'FACEBOOK_TOKEN_EXCHANGE'
  | 'FACEBOOK_TOKEN_INVALID'
  | 'FACEBOOK_PROFILE_FETCH'
  | 'FACEBOOK_PROFILE_MISMATCH';

export class FacebookCallbackRejected extends UnauthorizedException {
  constructor(readonly failureCode: FacebookCallbackFailure) {
    super();
  }
}

interface FacebookTokenResponse {
  access_token?: unknown;
}

interface FacebookDebugResponse {
  data?: {
    app_id?: unknown;
    is_valid?: unknown;
    user_id?: unknown;
    expires_at?: unknown;
  };
}

interface FacebookProfileResponse {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  picture?: { data?: { url?: unknown } };
}

export class FacebookAdapter implements ProviderIdentityPort<FacebookCallbackInput> {
  private readonly redirectUri: string;

  constructor(
    private readonly config: IdentityEnvironment,
    private readonly fetcher: FacebookFetch = fetch,
  ) {
    this.redirectUri = `${config.apiOrigin}/api/v1/auth/oauth/facebook/callback`;
  }

  authorizationUrl(input: FacebookAuthorizationInput): string {
    this.requireEnabled();
    const location = new URL(
      `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`,
    );
    location.searchParams.set('client_id', this.config.facebookClientId!);
    location.searchParams.set('redirect_uri', this.redirectUri);
    location.searchParams.set('state', input.state);
    location.searchParams.set('response_type', 'code');
    location.searchParams.set('scope', 'public_profile,email');
    return location.toString();
  }

  async verifyCallback(
    input: FacebookCallbackInput,
  ): Promise<VerifiedProviderIdentity> {
    this.requireEnabled();
    const accessToken = await this.exchange(input.code);
    const debug = await this.debug(accessToken);
    const now = Math.floor(Date.now() / 1000);
    if (
      debug.is_valid !== true ||
      debug.app_id !== this.config.facebookClientId ||
      typeof debug.user_id !== 'string' ||
      !debug.user_id ||
      debug.user_id.length > 255 ||
      typeof debug.expires_at !== 'number' ||
      !Number.isSafeInteger(debug.expires_at) ||
      debug.expires_at <= now
    )
      throw new FacebookCallbackRejected('FACEBOOK_TOKEN_INVALID');

    const profile = await this.profile(accessToken);
    if (profile.id !== debug.user_id)
      throw new FacebookCallbackRejected('FACEBOOK_PROFILE_MISMATCH');

    const normalizedEmail =
      typeof profile.email === 'string'
        ? profile.email.trim().toLowerCase()
        : '';
    const validEmail =
      normalizedEmail.length > 0 &&
      normalizedEmail.length <= 254 &&
      isEmail(normalizedEmail);
    const picture = profile.picture?.data?.url;
    return {
      provider: 'FACEBOOK',
      subject: debug.user_id,
      email: validEmail ? normalizedEmail : null,
      // Product policy trusts a valid /me email only after token/app/user checks above.
      emailVerified: validEmail,
      displayName:
        typeof profile.name === 'string'
          ? profile.name.trim().slice(0, 100) || null
          : null,
      avatarUrl:
        typeof picture === 'string' &&
        picture.length <= 2048 &&
        picture.startsWith('https://')
          ? picture
          : null,
    };
  }

  private async exchange(code: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.config.facebookClientId!,
      client_secret: this.config.facebookClientSecret!,
      redirect_uri: this.redirectUri,
      code,
    });
    let payload: FacebookTokenResponse;
    try {
      const response = await this.request(
        `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        },
      );
      if (!response.ok)
        throw new FacebookCallbackRejected('FACEBOOK_TOKEN_EXCHANGE');
      payload = (await response.json()) as FacebookTokenResponse;
    } catch (error) {
      if (error instanceof FacebookCallbackRejected) throw error;
      throw new FacebookCallbackRejected('FACEBOOK_TOKEN_EXCHANGE');
    }
    if (
      typeof payload.access_token !== 'string' ||
      payload.access_token.length < 1 ||
      payload.access_token.length > 4096
    )
      throw new FacebookCallbackRejected('FACEBOOK_TOKEN_EXCHANGE');
    return payload.access_token;
  }

  private async debug(accessToken: string) {
    const location = new URL(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/debug_token`,
    );
    location.searchParams.set('input_token', accessToken);
    location.searchParams.set(
      'access_token',
      `${this.config.facebookClientId!}|${this.config.facebookClientSecret!}`,
    );
    try {
      const response = await this.request(location);
      if (!response.ok)
        throw new FacebookCallbackRejected('FACEBOOK_TOKEN_INVALID');
      const payload = (await response.json()) as FacebookDebugResponse;
      if (!payload.data)
        throw new FacebookCallbackRejected('FACEBOOK_TOKEN_INVALID');
      return payload.data;
    } catch (error) {
      if (error instanceof FacebookCallbackRejected) throw error;
      throw new FacebookCallbackRejected('FACEBOOK_TOKEN_INVALID');
    }
  }

  private async profile(accessToken: string): Promise<FacebookProfileResponse> {
    const location = new URL(
      `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me`,
    );
    location.searchParams.set('fields', 'id,name,email,picture.type(large)');
    location.searchParams.set('access_token', accessToken);
    location.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', this.config.facebookClientSecret!)
        .update(accessToken)
        .digest('hex'),
    );
    try {
      const response = await this.request(location);
      if (!response.ok)
        throw new FacebookCallbackRejected('FACEBOOK_PROFILE_FETCH');
      return (await response.json()) as FacebookProfileResponse;
    } catch (error) {
      if (error instanceof FacebookCallbackRejected) throw error;
      throw new FacebookCallbackRejected('FACEBOOK_PROFILE_FETCH');
    }
  }

  private request(input: string | URL, init: RequestInit = {}) {
    return this.fetcher(input, {
      ...init,
      signal: AbortSignal.timeout(providerTimeoutMs),
    });
  }

  private requireEnabled(): void {
    if (
      !this.config.facebookEnabled ||
      !this.config.facebookClientId ||
      !this.config.facebookClientSecret
    )
      throw new UnauthorizedException();
  }
}
