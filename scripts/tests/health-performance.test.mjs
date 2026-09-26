import assert from 'node:assert/strict';
import test from 'node:test';
import { localEnvironment, spawnProcess, terminate, waitForHttp } from '../lib.mjs';

test('health endpoints stay below 500ms and aggregate work stays below 10s', { skip: process.env.RUN_STACK_TESTS !== '1', timeout: 120_000 }, async () => {
  const env = localEnvironment();
  const stack = spawnProcess('node', ['scripts/dev.mjs', 'all']);
  const urls = [
    `http://127.0.0.1:${env.WEB_PORT}/api/health`,
    `http://127.0.0.1:${env.API_PORT}/api/v1/health/live`,
    `http://127.0.0.1:${env.API_PORT}/api/v1/health/ready`,
  ];
  try {
    await waitForHttp(urls[2], { timeoutMs: 90_000 });
    const aggregateStarted = performance.now();
    for (const url of urls) {
      for (let sample = 0; sample < 5; sample += 1) {
        const started = performance.now();
        const response = await fetch(url, { cache: 'no-store' });
        assert.equal(response.ok, true);
        assert.ok(performance.now() - started < 500, `${url} exceeded 500ms`);
      }
    }
    assert.ok(performance.now() - aggregateStarted < 10_000);
  } finally {
    await terminate(stack);
  }
});
