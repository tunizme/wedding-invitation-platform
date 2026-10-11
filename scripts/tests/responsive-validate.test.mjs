import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  selectCases,
  redact,
  runCase,
  validate,
  containedPath,
} from '../responsive-validate.mjs';

const entry = (patch = {}) => ({
  id: 'test',
  phase: 'contracts',
  cwd: '.',
  files: ['fixture.txt'],
  command: [process.execPath, '-e', 'process.exit(0)'],
  ...patch,
});
function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'responsive-runner-'));
  writeFileSync(join(base, 'fixture.txt'), 'synthetic');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return base;
}
test('rejects empty, malformed, unknown, duplicate and incomplete phase selections', () => {
  for (const manifest of [[], [entry(), entry()], [entry({ files: [] })]])
    assert.throws(() => selectCases(manifest, 'contracts'));
  assert.throws(() => selectCases([entry()], 'absent'));
  assert.throws(() => selectCases([entry()], 'all'), /Missing phase/);
  assert.throws(() => selectCases([entry()], 'rendering', 'US3'));
  assert.throws(
    () =>
      selectCases([entry({ phase: 'rendering', story: 'US1' })], 'rendering'),
    /US2/,
  );
  assert.equal(
    selectCases(
      [entry({ phase: 'rendering', story: 'US1' })],
      'rendering',
      'US1',
    ).length,
    1,
  );
});
test('rejects path escape, missing fixture and absent required environment before spawn', async (t) => {
  const base = fixture(t);
  assert.throws(() => containedPath(base, '../outside'), /outside/);
  await assert.rejects(
    runCase(entry({ files: ['missing'] }), { root: base }),
    /Missing prerequisite/,
  );
  await assert.rejects(
    runCase(entry({ env: ['RESPONSIVE_TEST_MISSING'] }), { root: base }),
    /Missing RESPONSIVE/,
  );
});
test('reports nonzero exit with credential redaction', async (t) => {
  const base = fixture(t);
  const result = await runCase(
    entry({
      command: [
        process.execPath,
        '-e',
        "require('fs').writeSync(2,process.env.TEST_SECRET);process.exitCode=3",
      ],
    }),
    { root: base, env: { TEST_SECRET: 'sensitive-value' } },
  );
  assert.equal(result.status, 'FAIL');
  assert.equal(result.code, 3);
  assert.ok(!result.diagnostics.includes('sensitive-value'));
  assert.match(result.diagnostics, /REDACTED/);
});
test('bounds execution and kills only the owned process group', async (t) => {
  const base = fixture(t);
  const result = await runCase(
    entry({
      command: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
      timeoutMs: 60,
    }),
    { root: base },
  );
  assert.equal(result.status, 'FAIL');
  assert.equal(result.timedOut, true);
  assert.ok(result.durationMs < 3000);
  assert.ok(existsSync(join(base, 'fixture.txt')));
});
test('writes failure evidence and does not run later cases or destroy unrelated data', async (t) => {
  const base = fixture(t);
  await assert.rejects(
    validate({
      base,
      phase: 'contracts',
      manifest: [
        entry({
          command: [process.execPath, '-e', 'process.exit(2)'],
        }),
        entry({
          id: 'later',
          command: [
            process.execPath,
            '-e',
            "require('fs').writeFileSync('later.txt','bad')",
          ],
        }),
      ],
    }),
    (error) => {
      assert.equal(error.report.cases.length, 1);
      assert.equal(error.report.cleanup, 'UNVERIFIED');
      return true;
    },
  );
  assert.ok(!existsSync(join(base, 'later.txt')));
  assert.ok(existsSync(join(base, 'fixture.txt')));
});
test('preflight prevents earlier side effects when later prerequisites are missing', async (t) => {
  const base = fixture(t);
  await assert.rejects(
    validate({
      base,
      phase: 'contracts',
      manifest: [
        entry({
          command: [
            process.execPath,
            '-e',
            "require('fs').writeFileSync('side-effect.txt','bad')",
          ],
        }),
        entry({ id: 'missing', files: ['absent'] }),
      ],
    }),
    /Missing prerequisite/,
  );
  assert.ok(!existsSync(join(base, 'side-effect.txt')));
});
test('handles unavailable executables and already aborted runs', async (t) => {
  const base = fixture(t);
  await assert.rejects(
    runCase(entry({ command: ['responsive-command-does-not-exist'] }), {
      root: base,
    }),
    /ENOENT/,
  );
  const controller = new AbortController();
  controller.abort();
  const result = await runCase(entry(), {
    root: base,
    signal: controller.signal,
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.timedOut, true);
});
test('redacts bearer tokens and database URLs independent of env', () => {
  assert.equal(
    redact('Bearer abc postgresql://u:p@host/db', {}),
    'Bearer [REDACTED] postgresql://[REDACTED]',
  );
});
