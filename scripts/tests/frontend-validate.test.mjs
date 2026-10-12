import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  selection,
  ownedCleanupStatus,
  registry,
  budgets,
  assertInventory,
  expectedCases,
  assertBrowserCaseBudgets,
} from '../frontend-validate.mjs';
import { assertCaseEvidence } from '../auth-transition-validate.mjs';
test('browser budget guard rejects excessive and computed per-case overrides', () => {
  const dir = mkdtempSync(join(tmpdir(), 'frontend-budget-'));
  const file = 'apps/web/e2e/frontend-foundation/example.spec.ts';
  try {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    for (const source of [
      'test.setTimeout(60000)',
      'test.setTimeout(limit)',
      'test.describe.configure({timeout: 120_000})',
      'test.info().setTimeout(45000)',
    ]) {
      writeFileSync(join(dir, file), source);
      assert.throws(
        () => assertBrowserCaseBudgets({ files: [file] }, dir),
        /30s/,
      );
    }
    writeFileSync(join(dir, file), "test('broken', async =>");
    assert.throws(
      () => assertBrowserCaseBudgets({ files: [file] }, dir),
      /syntax/,
    );
    writeFileSync(
      join(dir, file),
      'test.setTimeout(30_000); test.describe.configure({timeout: 15000});',
    );
    assert.doesNotThrow(() => assertBrowserCaseBudgets({ files: [file] }, dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('strict selector grammar and full default coverage', () => {
  for (const phase of Object.keys(budgets)) {
    const s = selection(['--phase', phase]);
    assert.equal(s.coverage, 'FULL');
    assert.equal(s.stories.length, 10);
  }
  for (const args of [
    [],
    ['--phase', 'bad'],
    ['--phase', 'all', '--through', 'US1'],
    ['--phase', 'unit', '--through', 'US11'],
    ['--phase', 'unit', 'extra'],
  ])
    assert.throws(() => selection(args), /Usage/);
});
test('fixed story dependency closures always report PARTIAL', () => {
  for (let n = 1; n <= 10; n++) {
    const s = selection(['--phase', 'browser', '--through', 'US' + n]);
    assert.equal(s.coverage, 'PARTIAL');
    assert.equal(s.stories.length, n);
    assert.equal(s.missingCoverage.length, 10 - n);
    assert.deepEqual(s.files, [
      ...new Set(s.stories.flatMap((x) => registry[x].browser)),
    ]);
  }
});
test('package-through-US1 rejects before provisioning', () =>
  assert.throws(
    () => selection(['--phase', 'package', '--through', 'US1']),
    /starts at US2/,
  ));
test('missing files and fixed cases fail without narrowing coverage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'frontend-inventory-'));
  try {
    const s = selection(['--phase', 'unit', '--through', 'US1']);
    assert.throws(() => assertInventory(s, dir), /Missing required/);
    for (const file of s.files) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), 'fixture');
    }
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts/frontend-cases.json'), '{}');
    assert.throws(
      () => assertInventory(s, dir),
      /Missing required frontend cases/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('fixed per-case stages retain earlier expectations across shared files', () => {
  const s = selection(['--phase', 'package', '--through', 'US2']);
  const file = registry.US2.package[0];
  const cases = expectedCases(
    s,
    {
      [file]: [
        { name: 'noto', story: 'US2' },
        { name: 'platform', story: 'US3' },
      ],
    },
    'package',
  );
  assert.equal(cases.length, 3);
  assert.ok(cases.every((c) => c.name === 'noto'));
});
test('incomplete skipped failed or missing case evidence cannot PASS', () => {
  const row = { file: 'f', name: 'test' };
  for (const report of [
    { complete: false, cases: [] },
    { complete: true, cases: [] },
    { complete: true, cases: [{ ...row, status: 'skipped' }] },
    { complete: true, cases: [{ ...row, status: 'failed' }] },
  ])
    assert.throws(() => assertCaseEvidence(report, [row]));
  assert.throws(() =>
    assertCaseEvidence(
      { complete: true, cases: [{ ...row, status: 'passed' }] },
      [{ file: 'f', name: 'missing' }],
    ),
  );
});
test('budgets reserve cleanup and never exceed agreed phase limits', () =>
  assert.deepEqual(budgets, {
    unit: 600000,
    browser: 1200000,
    package: 900000,
    all: 2700000,
  }));

test('failure reports preserve verified cleanup and reject missing or damaged evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'frontend-cleanup-'));
  try {
    assert.equal(ownedCleanupStatus(directory), 'FAILED_OR_UNKNOWN');
    const run = join(directory, 'owned-run');
    mkdirSync(run);
    const report = join(run, 'cleanup.json');
    for (const value of ['{}', '{"status":"FAILED"}', 'damaged']) {
      writeFileSync(report, value);
      assert.equal(ownedCleanupStatus(directory), 'FAILED_OR_UNKNOWN');
    }
    writeFileSync(report, '{"status":"PASS"}');
    assert.equal(ownedCleanupStatus(directory), 'PASS');
    mkdirSync(join(directory, 'unconfirmed-run'));
    assert.equal(ownedCleanupStatus(directory), 'FAILED_OR_UNKNOWN');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('isolated product increment remains partial and cannot weaken default or all gates', () => {
  const selected = selection(['--phase', 'browser', '--story', 'US6']);
  assert.equal(selected.coverage, 'PARTIAL');
  assert.deepEqual(selected.stories, ['US6']);
  assert.deepEqual(selected.files, registry.US6.browser);
  assert.equal(selected.missingCoverage.length, 9);
  assert.throws(() => selection(['--phase', 'all', '--story', 'US6']), /Usage/);
  assert.throws(
    () => selection(['--phase', 'package', '--story', 'US6']),
    /Usage/,
  );
  assert.ok(
    selection(['--phase', 'all']).files.includes(registry.US6.browser[0]),
  );
});

test('expanded prototype coverage is required by full gates while isolated increments stay partial', () => {
  for (const story of ['US8', 'US9', 'US10']) {
    const selected = selection(['--phase', 'browser', '--story', story]);
    assert.equal(selected.coverage, 'PARTIAL');
    assert.deepEqual(selected.stories, [story]);
    assert.equal(selected.missingCoverage.length, 9);
    assert.throws(
      () => selection(['--phase', 'all', '--story', story]),
      /Usage/,
    );
  }
  const full = selection(['--phase', 'all']);
  assert.ok(full.files.includes(registry.US9.unit[0]));
  assert.ok(full.files.includes(registry.US10.browser[0]));
  assert.deepEqual(full.missingCoverage, []);
});
