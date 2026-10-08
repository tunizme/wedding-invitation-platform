import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  budgets,
  order,
  parsePhase,
  partition,
  phaseFiles,
  registry,
  assertCaseEvidence,
} from '../auth-transition-validate.mjs';
import { assertRequiredFiles } from '../iam-validate.mjs';
import { pnpmCommand } from '../auth-transition-stack.mjs';

test('pnpm launches native Linux/Windows binaries directly and JS entries through Node', () => {
  const args = ['--filter', '@wedding/web', 'test'];
  for (const executable of ['/opt/pnpm/pnpm', 'C:\\tools\\pnpm.exe'])
    assert.deepEqual(pnpmCommand(args, executable), [executable, args]);
  for (const entry of ['/opt/pnpm/pnpm.cjs', 'C:\\tools\\pnpm.js'])
    assert.deepEqual(pnpmCommand(args, entry), [
      process.execPath,
      [entry, ...args],
    ]);
});

test('parsePhase accepts only known phases', () => {
  assert.equal(parsePhase(['--phase', 'US1']), 'US1');
  assert.equal(parsePhase(['--', '--phase', 'all']), 'all');
  assert.throws(() => parsePhase(['--phase', 'US9']), /Usage/);
  assert.throws(() => parsePhase([]), /Usage/);
});

test('every phase has a registry entry and a budget within quickstart limits', () => {
  for (const phase of order) {
    assert.ok(Array.isArray(registry[phase]) && registry[phase].length > 0);
    assert.ok(budgets[phase] > 30_000);
  }
  assert.equal(budgets.setup, 300_000);
  assert.ok(budgets.foundation <= 600_000);
  assert.ok(budgets.US1 <= 1_200_000);
  assert.ok(budgets.US4 <= 900_000);
  assert.ok(budgets.all <= 3_600_000);
});

test('phases are cumulative', () => {
  const us1 = phaseFiles('US1');
  for (const path of registry.setup) assert.ok(us1.includes(path));
  for (const path of registry.foundation) assert.ok(us1.includes(path));
  assert.ok(!us1.some((path) => registry.US2.includes(path)));
});

test('partition separates API, web unit, browser and script checks', () => {
  const parts = partition(phaseFiles('US1'));
  assert.ok(parts.apiTests.every((path) => path.startsWith('test/')));
  assert.ok(parts.webUnit.every((path) => /\.test\.tsx?$/.test(path)));
  assert.ok(parts.browser.every((path) => path.endsWith('.spec.ts')));
  assert.ok(
    !parts.webUnit.some(
      (path) => path.includes('auth-transition/') && path.endsWith('.spec.ts'),
    ),
  );
  assert.ok(
    parts.scripts.includes('apps/api/scripts/validate-iam-contract.cjs'),
  );
});

test('setup and implemented phase registry files exist; missing files fail fast', () => {
  assertRequiredFiles(registry.setup);
  assert.throws(
    () =>
      assertRequiredFiles([
        'apps/api/test/integration/identity-access/missing.spec.ts',
      ]),
    /Missing required test files/,
  );
});

test('case evidence rejects empty, missing, skipped, todo and interrupted required cases', () => {
  const expected = [{ file: 'case.spec.ts', name: 'B2', project: 'webkit' }];
  const row = { ...expected[0], status: 'passed' };
  assert.doesNotThrow(() =>
    assertCaseEvidence({ cases: [row], complete: true }, expected),
  );
  for (const cases of [
    [],
    [{ ...row, project: 'chromium' }],
    ...['skipped', 'todo', 'pending', 'failed', 'interrupted'].map((status) => [
      { ...row, status },
    ]),
  ]) {
    assert.throws(
      () => assertCaseEvidence({ cases, complete: true }, expected),
      /evidence/,
    );
  }
  assert.throws(
    () => assertCaseEvidence({ cases: [row], complete: false }, expected),
    /evidence/,
  );
  assert.throws(
    () => assertCaseEvidence({ cases: [row, row], complete: true }, expected),
    /evidence/,
  );
});
