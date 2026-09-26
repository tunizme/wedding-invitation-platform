import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { infrastructure } from '../infra.mjs';

test('destructive reset is explicitly guarded', async () => {
  await assert.rejects(() => infrastructure('reset', []), /deletes.*volume/i);
});

test('development startup waits for DB, migrates, then starts apps and always cleans up', async () => {
  const source = await readFile(new URL('../dev.mjs', import.meta.url), 'utf8');
  const database = source.indexOf("'postgres'");
  const migration = source.indexOf("'migration:run'");
  const api = source.indexOf("'@wedding/api', 'dev'");
  assert.ok(database >= 0 && database < migration && migration < api);
  assert.match(source, /finally\s*{\s*await cleanup\(\)/);
});
