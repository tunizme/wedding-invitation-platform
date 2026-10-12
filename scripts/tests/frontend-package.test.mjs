import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const fonts = join(root, 'apps/web/public/fonts/invitation-builder');
const manifest = JSON.parse(readFileSync(join(fonts, 'manifest.json'), 'utf8'));

test('all sixteen invitation WOFF2 assets match the committed manifest', () => {
  assert.equal(manifest.faces.length, 8);
  const sources = manifest.faces.flatMap((face) => face.sources);
  assert.equal(sources.length, 16);
  assert.equal(new Set(sources.map((source) => source.url)).size, 16);
  for (const source of sources) {
    const name = source.url.split('/').at(-1);
    const path = join(fonts, name);
    assert.equal(statSync(path).size, source.bytes, name);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), source.sha256, name);
    assert.equal(readFileSync(path).toString('ascii', 0, 4), 'wOF2', name);
  }
});

test('the standalone runner owns static and public assets', () => {
  const dockerfile = readFileSync(join(root, 'apps/web/Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY --from=builder \/workspace\/apps\/web\/\.next\/static \.\/apps\/web\/\.next\/static/);
  assert.match(dockerfile, /COPY --from=builder \/workspace\/apps\/web\/public \.\/apps\/web\/public/);
});

test('licensed platform font sources match their pinned manifest', () => {
  const directory = join(root, 'apps/web/src/ui/platform/fonts');
  const platform = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(platform.license, 'OFL-1.1');
  assert.equal(platform.files.length, 7);
  for (const file of platform.files) {
    const path = join(directory, file.file);
    const bytes = readFileSync(path);
    assert.equal(bytes.length, file.bytes, file.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }
});
