import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHealth } from '../health-check.mjs';
import { localEnvironment, run, spawnProcess, terminate, waitForHttp } from '../lib.mjs';

test(
  'full-stack health matrix identifies every unavailable component',
  { skip: process.env.RUN_STACK_TESTS !== '1', timeout: 120_000 },
  async () => {
    const env = localEnvironment();
    const stack = spawnProcess('node', ['scripts/dev.mjs', 'all']);
    try {
      await waitForHttp(`http://127.0.0.1:${env.API_PORT}/api/v1/health/ready`, {
        timeoutMs: 90_000,
      });

      const healthy = await checkHealth({ print: false });
      assert.equal(healthy.ok, true);

      const frontendDown = await checkHealth({
        print: false,
        overrides: { WEB_PORT: '39990' },
      });
      assert.equal(frontendDown.ok, false);
      assert.equal(frontendDown.results.find((item) => item.name === 'frontend').ok, false);
      assert.equal(frontendDown.results.find((item) => item.name === 'backend-ready').ok, true);

      const backendDown = await checkHealth({
        print: false,
        overrides: { API_PORT: '39991' },
      });
      assert.equal(backendDown.ok, false);
      assert.equal(backendDown.results.find((item) => item.name === 'frontend').ok, true);
      assert.equal(backendDown.results.find((item) => item.name === 'backend-live').ok, false);

      await run('docker', ['compose', 'stop', 'postgres'], { env });
      const databaseDown = await checkHealth({ print: false });
      assert.equal(databaseDown.ok, false);
      assert.equal(databaseDown.results.find((item) => item.name === 'frontend').ok, true);
      assert.equal(databaseDown.results.find((item) => item.name === 'backend-live').ok, true);
      assert.equal(databaseDown.results.find((item) => item.name === 'backend-ready').ok, false);
      assert.equal(databaseDown.results.find((item) => item.name === 'postgresql').ok, false);
    } finally {
      await terminate(stack);
    }
  },
);
