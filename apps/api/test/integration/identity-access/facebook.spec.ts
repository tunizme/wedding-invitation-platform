import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ResolveSocialIdentityService } from '../../../src/modules/identity-access/application/resolve-social-identity.service';
import { AccessTokenService } from '../../../src/modules/identity-access/auth/access-token.service';
import { SessionService } from '../../../src/modules/identity-access/auth/session.service';
import {
  FacebookAdapter,
  FacebookCallbackRejected,
  FACEBOOK_GRAPH_VERSION,
} from '../../../src/modules/identity-access/oauth/facebook.adapter';
import { SocialOnboardingService } from '../../../src/modules/identity-access/oauth/social-onboarding.service';
import { OAuthTransactionService } from '../../../src/modules/identity-access/oauth/oauth-transaction.service';
import { registrationFixture } from '../../registration-fixture';

type FetchResponse = Pick<Response, 'ok' | 'json'>;

describe.sequential(
  'Facebook OAuth verification and identity resolution',
  () => {
    let fixture: Awaited<ReturnType<typeof registrationFixture>>;
    let resolver: ResolveSocialIdentityService;

    beforeAll(async () => {
      fixture = await registrationFixture();
      const tokens = new AccessTokenService(fixture.config);
      const sessions = new SessionService(
        fixture.config,
        fixture.crypto,
        tokens,
      );
      const onboarding = new SocialOnboardingService(
        fixture.db,
        fixture.config,
        fixture.crypto,
        fixture.challenges,
      );
      const transactions = new OAuthTransactionService(
        fixture.db,
        fixture.config,
        fixture.crypto,
      );
      resolver = new ResolveSocialIdentityService(
        fixture.db,
        sessions,
        onboarding,
        transactions,
      );
    });
    beforeEach(async () => fixture.clear());
    afterAll(async () => fixture.close());

    const response = (body: unknown, ok = true): FetchResponse => ({
      ok,
      json: () => Promise.resolve(body),
    });

    function adapter(
      debugData: Record<string, unknown>,
      profile: Record<string, unknown> = {
        id: 'facebook-subject',
        name: 'Facebook Person',
        email: 'Person@Example.test',
        picture: { data: { url: 'https://images.example.test/facebook.png' } },
      },
    ) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response({ access_token: 'user-access-token' }))
        .mockResolvedValueOnce(response({ data: debugData }))
        .mockResolvedValueOnce(response(profile));
      return {
        fetcher,
        value: new FacebookAdapter(
          {
            ...fixture.config,
            facebookEnabled: true,
            facebookClientId: 'facebook-client',
            facebookClientSecret: 'facebook-secret',
          },
          fetcher,
        ),
      };
    }

    it('pins the supported Graph version and requests only public_profile/email', () => {
      const { value } = adapter({});
      const location = new URL(
        value.authorizationUrl({ state: 'state-value' }),
      );
      expect(FACEBOOK_GRAPH_VERSION).toBe('v26.0');
      expect(location.pathname).toBe('/v26.0/dialog/oauth');
      expect(location.searchParams.get('scope')).toBe('public_profile,email');
      expect(location.searchParams.get('state')).toBe('state-value');
      expect(location.searchParams.has('nonce')).toBe(false);
      expect(location.searchParams.has('code_challenge')).toBe(false);
    });

    it.each([
      [
        'invalid token',
        {
          is_valid: false,
          app_id: 'facebook-client',
          user_id: 'facebook-subject',
          expires_at: 4_102_444_800,
        },
      ],
      [
        'app mismatch',
        {
          is_valid: true,
          app_id: 'other-app',
          user_id: 'facebook-subject',
          expires_at: 4_102_444_800,
        },
      ],
      [
        'expired token',
        {
          is_valid: true,
          app_id: 'facebook-client',
          user_id: 'facebook-subject',
          expires_at: 1,
        },
      ],
    ])('rejects %s debug_token evidence', async (_name, data) => {
      const { value } = adapter(data);
      await expect(
        value.verifyCallback({ code: 'code' }),
      ).rejects.toBeInstanceOf(FacebookCallbackRejected);
    });

    it('rejects a debug_token and /me user mismatch', async () => {
      const { value } = adapter({
        is_valid: true,
        app_id: 'facebook-client',
        user_id: 'debug-user',
        expires_at: 4_102_444_800,
      });
      await expect(
        value.verifyCallback({ code: 'code' }),
      ).rejects.toMatchObject({
        failureCode: 'FACEBOOK_PROFILE_MISMATCH',
      });
    });

    it('uses appsecret_proof, discards tokens and trusts valid Facebook email by policy', async () => {
      const { value, fetcher } = adapter({
        is_valid: true,
        app_id: 'facebook-client',
        user_id: 'facebook-subject',
        expires_at: 4_102_444_800,
      });
      const identity = await value.verifyCallback({ code: 'provider-code' });
      const profileUrl = new URL(String(fetcher.mock.calls[2][0]));
      expect(profileUrl.searchParams.get('appsecret_proof')).toBe(
        createHmac('sha256', 'facebook-secret')
          .update('user-access-token')
          .digest('hex'),
      );
      expect(identity).toEqual({
        provider: 'FACEBOOK',
        subject: 'facebook-subject',
        email: 'person@example.test',
        emailVerified: true,
        displayName: 'Facebook Person',
        avatarUrl: 'https://images.example.test/facebook.png',
      });
      expect(JSON.stringify(identity)).not.toContain('user-access-token');
    });

    it('accepts a matching profile without email only as onboarding input', async () => {
      const { value } = adapter(
        {
          is_valid: true,
          app_id: 'facebook-client',
          user_id: 'facebook-subject',
          expires_at: 4_102_444_800,
        },
        { id: 'facebook-subject', name: 'Facebook Person' },
      );
      const identity = await value.verifyCallback({ code: 'provider-code' });
      expect(identity).toMatchObject({
        provider: 'FACEBOOK',
        email: null,
        emailVerified: false,
      });
      await expect(resolver.resolve(identity)).resolves.toMatchObject({
        kind: 'onboarding',
      });
      expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
    });

    it('maps exchange/debug/profile outages to safe rejection codes', async () => {
      for (const failureIndex of [0, 1, 2]) {
        const fetcher = vi.fn();
        for (let index = 0; index < failureIndex; index += 1) {
          fetcher.mockResolvedValueOnce(
            index === 0
              ? response({ access_token: 'user-access-token' })
              : response({
                  data: {
                    is_valid: true,
                    app_id: 'facebook-client',
                    user_id: 'facebook-subject',
                    expires_at: 4_102_444_800,
                  },
                }),
          );
        }
        fetcher.mockRejectedValueOnce(new Error('provider unavailable'));
        const value = new FacebookAdapter(
          {
            ...fixture.config,
            facebookEnabled: true,
            facebookClientId: 'facebook-client',
            facebookClientSecret: 'facebook-secret',
          },
          fetcher,
        );
        await expect(
          value.verifyCallback({ code: 'code' }),
        ).rejects.toBeInstanceOf(FacebookCallbackRejected);
      }
    });

    it('creates a session for a new valid email, repeats by subject and denies LOCKED', async () => {
      const identity = {
        provider: 'FACEBOOK' as const,
        subject: 'stable-facebook-subject',
        email: 'facebook@example.test',
        emailVerified: true,
        displayName: 'Facebook Person',
        avatarUrl: null,
      };
      const first = await resolver.resolve(identity);
      expect(first.kind).toBe('session');
      const userId = first.kind === 'session' ? first.user.id : '';
      expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
      expect(
        await fixture.db.query('SELECT id FROM external_identities'),
      ).toHaveLength(1);
      const repeat = await resolver.resolve({
        ...identity,
        email: 'changed@example.test',
      });
      expect(repeat.kind === 'session' && repeat.user.id).toBe(userId);
      await expect(
        resolver.resolve({
          ...identity,
          subject: 'different-facebook-subject',
        }),
      ).rejects.toThrow();
      expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
      await fixture.db.query("UPDATE users SET status='LOCKED' WHERE id=$1", [
        userId,
      ]);
      await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  },
);
