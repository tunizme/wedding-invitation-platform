import { describe, expect, it } from 'vitest';
import { serverEnvironment } from '../../src/config/server-env';

describe('server-only API URL', () => {
  it('requires configuration only when called', () => {
    expect(() => serverEnvironment({})).toThrow('API_INTERNAL_BASE_URL');
    expect(
      serverEnvironment({
        API_INTERNAL_BASE_URL: 'http://127.0.0.1:3001/api/v1/',
      }).apiInternalBaseUrl,
    ).toBe('http://127.0.0.1:3001/api/v1');
  });
  it.each([
    'https://secret:sentinel@example.com/api/v1',
    'file:///api/v1',
    'https://example.com/other',
    'https://example.com/api/v1?token=sentinel',
    'https://example.com/api/v1#sentinel',
  ])('rejects unsafe URL without reflecting it', (value) => {
    expect(() => serverEnvironment({ API_INTERNAL_BASE_URL: value })).toThrow(
      'Invalid server environment: API_INTERNAL_BASE_URL',
    );
  });
});
