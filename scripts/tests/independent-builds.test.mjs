import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('filtered app commands target exactly one workspace', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const action of ['format', 'format:check', 'lint', 'typecheck', 'test', 'build']) {
    assert.match(manifest.scripts[`${action}:web`], /--filter @wedding\/web/);
    assert.match(manifest.scripts[`${action}:api`], /--filter @wedding\/api/);
  }
});
