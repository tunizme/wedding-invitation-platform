import { afterEach, describe, expect, it, vi } from 'vitest';
import { databaseOptions } from '../../src/infrastructure/database/data-source';

describe('database safety configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses only a validated disposable schema in test mode', () => {
    const schema = `iam_test_${'a'.repeat(32)}`;
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('BUILDER_TEST_SCHEMA', undefined);
    vi.stubEnv('IAM_TEST_SCHEMA', schema);
    const options = databaseOptions('postgresql://test:test@localhost/test');
    expect(options).toMatchObject({
      schema,
      extra: { options: `-c search_path=${schema}` },
    });
    vi.stubEnv('NODE_ENV', 'production');
    expect(() =>
      databaseOptions('postgresql://test:test@localhost/test'),
    ).toThrow('IAM_TEST_SCHEMA');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('IAM_TEST_SCHEMA', 'public');
    expect(() =>
      databaseOptions('postgresql://test:test@localhost/test'),
    ).toThrow('IAM_TEST_SCHEMA');
  });
  it('isolates builder schemas and rejects ambiguous or production overrides', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('IAM_TEST_SCHEMA', undefined);
    vi.stubEnv('BUILDER_TEST_SCHEMA', `builder_test_${'b'.repeat(32)}`);
    expect(
      databaseOptions('postgresql://test:test@localhost/test'),
    ).toMatchObject({ schema: `builder_test_${'b'.repeat(32)}` });
    vi.stubEnv('IAM_TEST_SCHEMA', `iam_test_${'a'.repeat(32)}`);
    expect(() => databaseOptions()).toThrow();
    vi.stubEnv('IAM_TEST_SCHEMA', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => databaseOptions()).toThrow('BUILDER_TEST_SCHEMA');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('BUILDER_TEST_SCHEMA', 'public');
    expect(() => databaseOptions()).toThrow('BUILDER_TEST_SCHEMA');
  });
  it('never synchronizes or automatically runs migrations', () => {
    const options = databaseOptions(
      'postgresql://user:password@localhost:5432/database',
    );
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });
});
