import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('local smoke uses bounded waits and finally cleanup', async () => {
  const source = await readFile(new URL('../local-smoke.mjs', import.meta.url), 'utf8');
  assert.match(source, /timeoutMs: 90_000/);
  assert.match(source, /finally\s*{\s*await terminate\(development\)/);
});
