import { describe, expect, it } from 'vitest';
import {
  authContextBounds,
  validateIdentityEnvironment,
} from '../../../src/config/identity-access.environment';
import { CredentialCrypto } from '../../../src/modules/identity-access/infrastructure/credential-crypto';
import { identityFixture } from '../../identity-fixture';

describe('006 auth context configuration', () => {
  it('exposes the fixed CSP-1 bounds', () => {
    const config = validateIdentityEnvironment(identityFixture());
    expect(config.authContext).toEqual({
      capNames: 8,
      capBytes: 2048,
      provisionalBindingSeconds: 900,
      confirmedBindingSeconds: 2_592_000,
      provisionalContextRetentionSeconds: 3600,
      idleContextSeconds: 2_592_000,
      intentSeconds: 60,
      oauthIntentSeconds: 600,
      outcomeRetentionSeconds: 86_400,
    });
    expect(config.rates.AUTH_CONTEXT_PROVISION.limit).toBe(20);
    expect(config.rates.AUTH_INTENT_RESERVE.seconds).toBe(600);
  });

  it('rejects overrides that differ from the contract and accepts equal ones', () => {
    expect(() =>
      validateIdentityEnvironment({
        ...identityFixture(),
        IAM_AUTH_CONTEXT_CAP_NAMES: '64',
      }),
    ).toThrow(/IAM_AUTH_CONTEXT_CAP_NAMES/);
    expect(
      validateIdentityEnvironment({
        ...identityFixture(),
        IAM_AUTH_CONTEXT_CAP_BYTES: String(authContextBounds.capBytes),
      }).authContext.capBytes,
    ).toBe(2048);
  });

  it('domain-separates binding and emission digests from refresh digests', () => {
    const config = validateIdentityEnvironment(identityFixture());
    const crypto = new CredentialCrypto(config);
    const secret = crypto.randomToken();
    const binding = crypto.bindingDigest(secret, config.keyVersion);
    expect(binding).toHaveLength(32);
    expect(
      binding.equals(crypto.refreshDigest(secret, config.keyVersion)),
    ).toBe(false);
    expect(
      crypto.emissionDigest('a', 'b').equals(crypto.emissionDigest('ab', '')),
    ).toBe(false);
    expect(() => crypto.bindingDigest(secret, 999)).toThrow(
      'UNKNOWN_KEY_VERSION',
    );
  });
});
