import { randomBytes } from 'node:crypto';
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
import { GoogleAdapter } from '../../../src/modules/identity-access/oauth/google.adapter';
import { OAuthTransactionService } from '../../../src/modules/identity-access/oauth/oauth-transaction.service';
import { SocialOnboardingService } from '../../../src/modules/identity-access/oauth/social-onboarding.service';
import { registrationFixture } from '../../registration-fixture';

describe.sequential('Google OAuth security and identity resolution', () => {
  let fixture: Awaited<ReturnType<typeof registrationFixture>>;
  let transactions: OAuthTransactionService;
  let resolver: ResolveSocialIdentityService;

  beforeAll(async () => {
    fixture = await registrationFixture();
    const tokens = new AccessTokenService(fixture.config);
    const sessions = new SessionService(fixture.config, fixture.crypto, tokens);
    const onboarding = new SocialOnboardingService(
      fixture.db,
      fixture.config,
      fixture.crypto,
      fixture.challenges,
    );
    transactions = new OAuthTransactionService(
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

  it('stores only digests/encrypted PKCE and atomically permits one callback claimant', async () => {
    const started = await transactions.start('GOOGLE', 'OAUTH_RESULT');
    const [row] = await fixture.db.query<
      {
        state_hash: Buffer;
        browser_binding_hash: Buffer;
        nonce_hash: Buffer;
        pkce_verifier_ciphertext: Buffer;
        expires_at: Date;
        created_at: Date;
      }[]
    >('SELECT * FROM oauth_transactions WHERE id=$1', [started.id]);
    expect(
      row.state_hash.equals(
        fixture.crypto.proofDigest(started.state.split('.')[1]),
      ),
    ).toBe(true);
    expect(
      row.browser_binding_hash.equals(
        fixture.crypto.proofDigest(started.binding.split('.')[1]),
      ),
    ).toBe(true);
    expect(
      row.nonce_hash.equals(fixture.crypto.proofDigest(started.nonce)),
    ).toBe(true);
    expect(row.pkce_verifier_ciphertext.toString()).not.toContain(
      started.codeVerifier,
    );
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(600_000);
    const claims = await Promise.allSettled([
      transactions.claim('GOOGLE', started.state, started.binding),
      transactions.claim('GOOGLE', started.state, started.binding),
    ]);
    expect(
      claims.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      claims.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('materializes an expired transaction and destroys its recoverable PKCE secret', async () => {
    const started = await transactions.start('GOOGLE', 'OAUTH_RESULT');
    await fixture.db.query(
      "UPDATE oauth_transactions SET expires_at=now()-interval '1 second' WHERE id=$1",
      [started.id],
    );
    await expect(
      transactions.claim('GOOGLE', started.state, started.binding),
    ).rejects.toThrow();
    const [row] = await fixture.db.query<
      { status: string; pkce_verifier_ciphertext: Buffer | null }[]
    >(
      'SELECT status,pkce_verifier_ciphertext FROM oauth_transactions WHERE id=$1',
      [started.id],
    );
    expect(row).toEqual({
      status: 'EXPIRED',
      pkce_verifier_ciphertext: null,
    });
  });

  it.each([
    ['signature', { verificationError: true }, 'GOOGLE_ID_TOKEN_VERIFY'],
    ['issuer', { iss: 'https://attacker.invalid' }, 'GOOGLE_CLAIMS_INVALID'],
    ['audience', { aud: 'wrong-client' }, 'GOOGLE_CLAIMS_INVALID'],
    ['authorized party', { azp: 'wrong-client' }, 'GOOGLE_CLAIMS_INVALID'],
    ['nonce', { nonce: 'wrong-nonce' }, 'GOOGLE_CLAIMS_INVALID'],
    ['expiry', { exp: 1 }, 'GOOGLE_CLAIMS_INVALID'],
    [
      'issued-at',
      { iat: Math.floor(Date.now() / 1000) + 600 },
      'GOOGLE_CLAIMS_INVALID',
    ],
  ])('rejects invalid %s claims', async (_name, change, failureCode) => {
    const nonce = randomBytes(32).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://accounts.google.com',
      aud: 'google-client',
      azp: 'google-client',
      sub: 'google-subject',
      email: 'person@example.test',
      email_verified: true,
      nonce,
      iat: now - 5,
      exp: now + 300,
      ...change,
    };
    const client = {
      generateAuthUrl: vi.fn(),
      getToken: vi.fn(() =>
        Promise.resolve({ tokens: { id_token: 'signed-id-token' } }),
      ),
      verifyIdToken:
        'verificationError' in change
          ? vi.fn(() => Promise.reject(new Error('bad signature')))
          : vi.fn(() => Promise.resolve({ getPayload: () => payload })),
    };
    const adapter = new GoogleAdapter(
      {
        ...fixture.config,
        googleEnabled: true,
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
      },
      client,
    );
    await expect(
      adapter.verifyCallback({
        code: 'provider-code',
        codeVerifier: randomBytes(32).toString('base64url'),
        expectedNonceHash: fixture.crypto.proofDigest(nonce),
      }),
    ).rejects.toMatchObject({ failureCode });
  });

  it('uses S256/nonce/minimal scopes and trusts email only after verified claims', async () => {
    const nonce = randomBytes(32).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'accounts.google.com',
      aud: 'google-client',
      azp: 'google-client',
      sub: 'stable-subject',
      email: 'Person@Example.test',
      email_verified: true,
      name: 'Person',
      picture: 'https://images.example.test/a.png',
      nonce,
      iat: now - 2,
      exp: now + 300,
    };
    const client = {
      generateAuthUrl: vi.fn(() => 'https://accounts.google.test/auth'),
      getToken: vi.fn(() =>
        Promise.resolve({
          tokens: { id_token: 'id-token', access_token: 'discard-me' },
        }),
      ),
      verifyIdToken: vi.fn(() =>
        Promise.resolve({
          getPayload: () => payload,
        }),
      ),
    };
    const adapter = new GoogleAdapter(
      {
        ...fixture.config,
        googleEnabled: true,
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
      },
      client,
    );
    adapter.authorizationUrl({
      state: 'state',
      nonce,
      codeChallenge: 'challenge',
    });
    expect(client.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        nonce,
      }),
    );
    const identity = await adapter.verifyCallback({
      code: 'provider-code',
      codeVerifier: 'verifier',
      expectedNonceHash: fixture.crypto.proofDigest(nonce),
    });
    expect(identity).toMatchObject({
      provider: 'GOOGLE',
      subject: 'stable-subject',
      email: 'person@example.test',
      emailVerified: true,
    });
    expect(JSON.stringify(identity)).not.toContain('discard-me');
    payload.email_verified = false;
    await expect(
      adapter.verifyCallback({
        code: 'provider-code-2',
        codeVerifier: 'verifier',
        expectedNonceHash: fixture.crypto.proofDigest(nonce),
      }),
    ).resolves.toMatchObject({
      email: 'person@example.test',
      emailVerified: false,
    });
  });

  it('resolves provider subject first, rejects locks, and never links an email collision', async () => {
    const first = await resolver.resolve({
      provider: 'GOOGLE',
      subject: 'stable-subject',
      email: 'first@example.test',
      emailVerified: true,
      displayName: 'First',
      avatarUrl: null,
    });
    expect(first.kind).toBe('session');
    const userId = first.kind === 'session' ? first.user.id : '';
    const repeat = await resolver.resolve({
      provider: 'GOOGLE',
      subject: 'stable-subject',
      email: 'changed@example.test',
      emailVerified: true,
      displayName: 'Changed',
      avatarUrl: null,
    });
    expect(repeat.kind === 'session' && repeat.user.id).toBe(userId);
    await fixture.db.query("UPDATE users SET status='LOCKED' WHERE id=$1", [
      userId,
    ]);
    await expect(
      resolver.resolve({
        provider: 'GOOGLE',
        subject: 'stable-subject',
        email: 'changed@example.test',
        emailVerified: true,
        displayName: null,
        avatarUrl: null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await fixture.db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [
      userId,
    ]);
    await expect(
      resolver.resolve({
        provider: 'GOOGLE',
        subject: 'different-subject',
        email: 'first@example.test',
        emailVerified: true,
        displayName: null,
        avatarUrl: null,
      }),
    ).rejects.toThrow();
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
    expect(
      await fixture.db.query('SELECT id FROM external_identities'),
    ).toHaveLength(1);
  });

  it('fails closed when a linked identity disagrees with the User login method', async () => {
    const identity = {
      provider: 'GOOGLE' as const,
      subject: 'inconsistent-provider',
      email: 'inconsistent@example.test',
      emailVerified: true,
      displayName: null,
      avatarUrl: null,
    };
    const first = await resolver.resolve(identity);
    expect(first.kind).toBe('session');
    await fixture.db.query('TRUNCATE auth_sessions CASCADE');
    await fixture.db.query("UPDATE users SET login_method='FACEBOOK'");

    await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
    expect(await fixture.db.query('SELECT id FROM auth_sessions')).toHaveLength(
      0,
    );
  });

  it('fails closed when an identity points to a missing User', async () => {
    const identity = {
      provider: 'GOOGLE' as const,
      subject: 'missing-linked-user',
      email: 'missing-linked-user@example.test',
      emailVerified: true,
      displayName: null,
      avatarUrl: null,
    };
    const first = await resolver.resolve(identity);
    expect(first.kind).toBe('session');
    await fixture.db.query('TRUNCATE auth_sessions CASCADE');
    await fixture.db.query(
      'ALTER TABLE external_identities DROP CONSTRAINT external_identities_user_id_fkey',
    );
    try {
      await fixture.db.query('DELETE FROM users');
      await expect(resolver.resolve(identity)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
      expect(
        await fixture.db.query('SELECT id FROM auth_sessions'),
      ).toHaveLength(0);
    } finally {
      await fixture.db.query('DELETE FROM external_identities');
      await fixture.db.query(
        'ALTER TABLE external_identities ADD CONSTRAINT external_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT',
      );
    }
  });

  it.each([
    [
      'existing session',
      {
        provider: 'GOOGLE' as const,
        subject: 'atomic-existing',
        email: 'atomic-existing@example.test',
        emailVerified: true,
        displayName: null,
        avatarUrl: null,
      },
      'existing',
    ],
    [
      'new account',
      {
        provider: 'GOOGLE' as const,
        subject: 'atomic-new',
        email: 'atomic-new@example.test',
        emailVerified: true,
        displayName: null,
        avatarUrl: null,
      },
      'new',
    ],
    [
      'onboarding',
      {
        provider: 'GOOGLE' as const,
        subject: 'atomic-onboarding',
        email: null,
        emailVerified: false,
        displayName: null,
        avatarUrl: null,
      },
      'onboarding',
    ],
  ])(
    'rolls back %s changes when OAuth transaction finalization fails',
    async (_name, identity, scenario) => {
      if (scenario === 'existing') {
        await resolver.resolve(identity);
        await fixture.db.query('TRUNCATE auth_sessions CASCADE');
        await fixture.db.query(
          "UPDATE external_identities SET last_authenticated_at='2000-01-01T00:00:00Z'",
        );
      }
      const complete = vi
        .spyOn(transactions, 'complete')
        .mockRejectedValueOnce(new Error('injected finalization failure'));

      await expect(
        resolver.resolveClaimed(
          identity,
          '00000000-0000-4000-8000-000000000001',
        ),
      ).rejects.toThrow('injected finalization failure');
      complete.mockRestore();

      expect(
        await fixture.db.query('SELECT id FROM auth_sessions'),
      ).toHaveLength(0);
      if (scenario === 'existing') {
        expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
        const [linked] = await fixture.db.query<
          { last_authenticated_at: Date | null }[]
        >('SELECT last_authenticated_at FROM external_identities');
        expect(linked.last_authenticated_at?.toISOString()).toBe(
          '2000-01-01T00:00:00.000Z',
        );
      } else {
        expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
        expect(
          await fixture.db.query('SELECT id FROM external_identities'),
        ).toHaveLength(0);
      }
      expect(
        await fixture.db.query('SELECT id FROM pending_social_onboardings'),
      ).toHaveLength(0);
    },
  );

  it('creates exactly one user for concurrent callbacks with the same subject', async () => {
    const identity = {
      provider: 'GOOGLE' as const,
      subject: 'concurrent-subject',
      email: 'concurrent@example.test',
      emailVerified: true,
      displayName: null,
      avatarUrl: null,
    };
    const results = await Promise.all([
      resolver.resolve(identity),
      resolver.resolve(identity),
    ]);
    expect(results.every((result) => result.kind === 'session')).toBe(true);
    expect(
      new Set(
        results.map((result) => result.kind === 'session' && result.user.id),
      ).size,
    ).toBe(1);
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(1);
  });

  it('sends missing or untrusted email evidence to bounded onboarding', async () => {
    for (const [subject, email, emailVerified] of [
      ['missing', null, false],
      ['untrusted', 'untrusted@example.test', false],
    ] as const) {
      const result = await resolver.resolve({
        provider: 'GOOGLE',
        subject,
        email,
        emailVerified,
        displayName: null,
        avatarUrl: null,
      });
      expect(result.kind).toBe('onboarding');
    }
    expect(await fixture.db.query('SELECT id FROM users')).toHaveLength(0);
  });
});
