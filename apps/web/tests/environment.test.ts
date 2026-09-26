import { describe, expect, it } from 'vitest';
import { parsePublicEnvironment } from '../src/config/env';

describe('frontend environment', () => {
  it('accepts browser-safe configuration and defaults the port', () => {
    expect(
      parsePublicEnvironment({
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
      }),
    ).toEqual({
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/api/v1',
      WEB_PORT: 3000,
    });
  });

  it.each([
    [{}, 'NEXT_PUBLIC_API_BASE_URL'],
    [{ NEXT_PUBLIC_API_BASE_URL: 'not-a-url' }, 'NEXT_PUBLIC_API_BASE_URL'],
  ])(
    'rejects invalid configuration without echoing values',
    (values, field) => {
      expect(() => parsePublicEnvironment(values)).toThrow(field);
      try {
        parsePublicEnvironment(values);
      } catch (error) {
        expect(String(error)).not.toContain('not-a-url');
      }
    },
  );
});
