import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../src/config/environment';

const valid = {
  NODE_ENV: 'test',
  API_PORT: '3001',
  DATABASE_URL: 'postgresql://wedding:top-secret@localhost:5432/wedding',
  FRONTEND_ORIGIN: 'http://localhost:3000',
};

describe('backend environment', () => {
  it('parses valid values', () => {
    expect(validateEnvironment(valid).API_PORT).toBe(3001);
  });

  it.each(['DATABASE_URL', 'FRONTEND_ORIGIN'])(
    'names missing %s without leaking secrets',
    (key) => {
      const values = { ...valid };
      delete values[key as keyof typeof values];
      expect(() => validateEnvironment(values)).toThrow(key);
      try {
        validateEnvironment(values);
      } catch (error) {
        expect(String(error)).not.toContain('top-secret');
      }
    },
  );

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ ...valid, API_PORT: '70000' })).toThrow(
      'API_PORT',
    );
  });
});
