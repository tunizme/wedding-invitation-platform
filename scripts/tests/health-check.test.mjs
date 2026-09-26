import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('root health reports every component with bounded HTTP probes', async () => {
  const source = await readFile(new URL('../health-check.mjs', import.meta.url), 'utf8');
  for (const component of ['frontend', 'backend-live', 'backend-ready', 'postgresql']) {
    assert.match(source, new RegExp(component));
  }
  assert.match(source, /AbortSignal\.timeout\(3000\)/);
  assert.match(source, /results\.every/);
});
