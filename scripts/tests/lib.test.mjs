import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEnvValue } from '../lib.mjs';

test('parseEnvValue decodes double-quoted escaped newlines', () => {
  assert.equal(parseEnvValue('"first\\nsecond"'), 'first\nsecond');
});

test('parseEnvValue removes single quotes without changing JSON escapes', () => {
  const value = `'${JSON.stringify({
    'local-1': '-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----',
  })}'`;
  assert.deepEqual(JSON.parse(parseEnvValue(value)), {
    'local-1':
      '-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----',
  });
});

test('parseEnvValue preserves ordinary unquoted values', () => {
  assert.equal(parseEnvValue('http://localhost:3001'), 'http://localhost:3001');
});
