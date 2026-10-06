import { describe, expect, it } from 'vitest';
import { validateInvitationBuilderEnvironment } from '../../../src/config/invitation-builder.environment';
import { builderRuntimeFixture } from '../../fixtures/invitation-builder/runtime';
import { databaseOptions } from '../../../src/infrastructure/database/data-source';

describe('builder configuration boundaries', () => {
  const environment = () => ({ ...builderRuntimeFixture(), NODE_ENV: 'test' });
  it('validates without contacting storage', () => {
    const config = validateInvitationBuilderEnvironment(environment());
    expect(config.rateHmacKey.length).toBeGreaterThanOrEqual(32);
    expect(config.forcePathStyle).toBe(true);
  });
  it('allows AWS default credentials only when both keys/token are absent', () => {
    const env: Record<string, unknown> = environment();
    delete env.BUILDER_S3_ENDPOINT;
    delete env.BUILDER_S3_ACCESS_KEY_ID;
    delete env.BUILDER_S3_SECRET_ACCESS_KEY;
    delete env.BUILDER_S3_SESSION_TOKEN;
    env.BUILDER_S3_FORCE_PATH_STYLE = 'false';
    expect(
      validateInvitationBuilderEnvironment(env).credentials,
    ).toBeUndefined();
    env.BUILDER_S3_SESSION_TOKEN = 'sentinel';
    expect(() => validateInvitationBuilderEnvironment(env)).toThrow(
      'BUILDER_S3_SESSION_TOKEN',
    );
  });
  it.each([
    ['BUILDER_S3_ENDPOINT', 'http://secret:sentinel@localhost'],
    ['BUILDER_S3_ENDPOINT', 'http://localhost/path'],
    ['BUILDER_S3_ENDPOINT', 'http://localhost?sentinel=1'],
    ['BUILDER_S3_ENDPOINT', 'ftp://localhost'],
    ['BUILDER_S3_BUCKET', '../sentinel'],
    ['BUILDER_S3_PREFIX', '../sentinel/'],
    ['BUILDER_S3_PREFIX', '/root/'],
    ['BUILDER_S3_FORCE_PATH_STYLE', '1'],
    ['BUILDER_S3_REGION', ''],
    ['BUILDER_RATE_HMAC_KEY', 'sentinel'],
    ['BUILDER_RENDER_ORIGIN', 'https://localhost/path'],
    ['BUILDER_S3_SECRET_ACCESS_KEY', undefined],
  ])('rejects invalid %s without including its value', (key, value) => {
    try {
      validateInvitationBuilderEnvironment({ ...environment(), [key]: value });
      expect.fail('accepted invalid configuration');
    } catch (error) {
      expect((error as Error).message).toContain('Invalid builder environment');
      expect((error as Error).message).not.toContain('sentinel');
    }
  });
  it('rejects cleartext custom storage endpoints outside explicit local/test environments', () => {
    expect(() =>
      validateInvitationBuilderEnvironment({
        ...environment(),
        NODE_ENV: 'production',
      }),
    ).toThrow('BUILDER_S3_ENDPOINT');
  });
  it('keeps explicit migrations and disallows synchronize', () => {
    const config = databaseOptions('postgres://test:test@127.0.0.1:1/test');
    expect(config.synchronize).toBe(false);
    expect(config.migrationsRun).toBe(false);
  });
});
