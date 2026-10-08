import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import {
  waitForLive,
  stopOwnedProcess,
  runOwnedCommand,
  createOwnedNextTsconfig,
} from '../auth-transition-stack.mjs';

test('owned Next tsconfig is disposable and cleanup never overwrites app config', () => {
  const directory = mkdtempSync(join(tmpdir(), 'auth-transition-tsconfig-'));
  try {
    const source = join(directory, 'tsconfig.json');
    const original = '{"compilerOptions":{"strict":true}}\n';
    writeFileSync(source, original);
    const owned = createOwnedNextTsconfig(directory, 'test-stack');
    const generated = join(directory, owned.filename);
    assert.equal(readFileSync(generated, 'utf8'), original);

    // Simulate Next adding route types to its selected config while an editor
    // changes the canonical config; stack cleanup must preserve that edit.
    writeFileSync(
      generated,
      '{"include":[".next-auth-transition/types/**/*.ts"]}\n',
    );
    const concurrentEdit = '{"compilerOptions":{"strict":false}}\n';
    writeFileSync(source, concurrentEdit);
    owned.cleanup();
    owned.cleanup();
    assert.equal(readFileSync(source, 'utf8'), concurrentEdit);
    assert.throws(() => readFileSync(generated, 'utf8'), { code: 'ENOENT' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('startup health checks obey the remaining phase deadline', async () => {
  const started = Date.now();
  await assert.rejects(
    waitForLive('http://127.0.0.1:1', Date.now() + 80),
    /deadline/,
  );
  assert.ok(Date.now() - started < 1000);
});

test('startup interruption stops readiness immediately', async () => {
  const controller = new AbortController();
  const pending = waitForLive(
    'http://127.0.0.1:1',
    Date.now() + 5000,
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, /aborted/);
});

test('cleanup escalates a child that ignores SIGTERM and verifies exit', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)",
    ],
    {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  try {
    await once(child.stdout, 'data');
    await stopOwnedProcess(child, { graceMs: 40, deadline: Date.now() + 2000 });
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
  }
});

test('cleanup failure cannot become a successful timeout', async () => {
  await assert.rejects(
    stopOwnedProcess(
      { pid: process.pid, exitCode: null, signalCode: null },
      { deadline: Date.now() - 1 },
    ),
    /cleanup deadline/,
  );
});

test('hung migration commands obey cancellation and are reaped', async () => {
  const controller = new AbortController();
  const pending = runOwnedCommand(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    {
      timeoutMs: 5000,
      signal: controller.signal,
      stdio: 'ignore',
    },
  );
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(pending, /aborted/);
});
