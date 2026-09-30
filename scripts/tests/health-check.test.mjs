import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { databaseProbe } from '../health-check.mjs';

test('root health reports every component with bounded HTTP probes', async () => {
  const source = await readFile(
    new URL('../health-check.mjs', import.meta.url),
    'utf8',
  );
  for (const component of [
    'frontend',
    'backend-live',
    'backend-ready',
    'postgresql',
  ]) {
    assert.match(source, new RegExp(component));
  }
  assert.match(source, /AbortSignal\.timeout\(3000\)/);
  assert.match(source, /results\.every/);
});

test('direct database health probes a service-container without exposing its URL', async () => {
  const calls = [];
  const result = await databaseProbe(
    {
      DATABASE_HEALTH_MODE: 'direct',
      DATABASE_URL: 'postgresql://health:top-secret@127.0.0.1:5432/health',
      DATABASE_HEALTH_TIMEOUT_MS: '750',
    },
    {
      clientFactory: (options) => ({
        async connect() {
          calls.push(['connect', options]);
        },
        async query(sql) {
          calls.push(['query', sql]);
        },
        async end() {
          calls.push(['end']);
        },
      }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.name, 'postgresql');
  assert.equal(calls[0][1].connectionTimeoutMillis, 750);
  assert.deepEqual(calls[1], ['query', 'SELECT 1']);
});

test('direct database health sanitizes connection failures and closes the client', async () => {
  let ended = false;
  const result = await databaseProbe(
    {
      DATABASE_HEALTH_MODE: 'direct',
      DATABASE_URL: 'postgresql://health:top-secret@127.0.0.1:5432/health',
      DATABASE_HEALTH_TIMEOUT_MS: '750',
    },
    {
      clientFactory: () => ({
        async connect() {
          throw new Error(
            'connect failed for postgresql://health:top-secret@127.0.0.1:5432/health',
          );
        },
        async query() {},
        async end() {
          ended = true;
        },
      }),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, 'Direct PostgreSQL readiness probe failed');
  assert.equal(JSON.stringify(result).includes('top-secret'), false);
  assert.equal(ended, true);
});
