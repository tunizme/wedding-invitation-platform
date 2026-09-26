import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPortsAvailable } from '../lib.mjs';

test('port preflight identifies an occupied component and port', async () => {
  const check = async (port) => port !== 3000;
  await assert.rejects(
    () => assertPortsAvailable({ frontend: 3000, api: 3001 }, check),
    /frontend \(3000\)/,
  );
  await assert.doesNotReject(() => assertPortsAvailable({ api: 3001 }, check));
});
