import assert from 'node:assert/strict';
import test from 'node:test';
import {
  phaseFiles,
  parsePhase,
  runCommand,
  withTestSchema,
  assertRequiredFiles,
} from '../iam-validate.mjs';

test('phase parser accepts only the documented phases', () => {
  assert.equal(parsePhase(['--phase', 'setup']), 'setup');
  assert.equal(parsePhase(['--', '--phase', 'US10']), 'US10');
  assert.throws(() => parsePhase([]), /--phase/);
  assert.throws(() => parsePhase(['--phase', 'unknown']), /phase/);
  assert.throws(
    () => parsePhase(['--phase', 'setup', '--ignore-errors']),
    /--phase/,
  );
});

test('Setup has no unimplemented runtime prerequisites; stories include dependency regression', () => {
  assert.deepEqual(phaseFiles('setup'), [
    'apps/api/test/contract/identity-access/design.spec.ts',
  ]);
  assert.ok(
    phaseFiles('foundation').some((path) =>
      path.endsWith('/foundation.spec.ts'),
    ),
  );
  assert.ok(
    phaseFiles('US6').some((path) => path.endsWith('/authorization.spec.ts')),
  );
  assert.ok(
    phaseFiles('US2').some((path) => path.endsWith('/registration.spec.ts')),
  );
  assert.ok(
    phaseFiles('all').some((path) => path.endsWith('/secret-hygiene.spec.ts')),
  );
  assert.throws(
    () => assertRequiredFiles(['not-created-test.spec.ts']),
    /Missing required test/,
  );
});

test('bounded child process propagates failures and terminates on timeout', async () => {
  await runCommand(process.execPath, ['-e', 'process.exit(0)'], {
    timeoutMs: 2000,
  });
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'process.exit(7)'], {
      timeoutMs: 2000,
    }),
    /exit 7/,
  );
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 100,
    }),
    /timeout/,
  );
});

test('aborted command cannot start a new process', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runCommand(process.execPath, ['-e', 'process.exit(0)'], {
      timeoutMs: 2000,
      signal: controller.signal,
    }),
    /aborted/,
  );
});

test('abort terminates a running child and reports failure', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    await assert.rejects(
      runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        timeoutMs: 2000,
        signal: controller.signal,
      }),
      /aborted/,
    );
  } finally {
    clearTimeout(timer);
  }
});

test('spawn failure and exhausted time budget fail closed', async () => {
  await assert.rejects(
    runCommand('/nonexistent/iam-test-command', [], { timeoutMs: 1000 }),
    /Unable to start/,
  );
  await assert.rejects(
    runCommand(process.execPath, [], { timeoutMs: 0 }),
    /timeout/,
  );
});

function fakeDatabase({ failCreate = false, failConnect = false } = {}) {
  const calls = [];
  return {
    calls,
    clientFactory: () => ({
      async connect() {
        calls.push('connect');
        if (failConnect) throw new Error('connect failed');
      },
      async query(sql) {
        calls.push(sql);
        if (failCreate && sql.startsWith('CREATE'))
          throw new Error('create failed');
      },
      async end() {
        calls.push('end');
      },
    }),
  };
}

for (const failRun of [false, true]) {
  test(`disposable schema cleanup runs after ${failRun ? 'failure' : 'success'}`, async () => {
    const db = fakeDatabase();
    const promise = withTestSchema({
      databaseUrl: 'postgresql://test:test@localhost/iam_test',
      clientFactory: db.clientFactory,
      run: async (env) => {
        assert.match(env.IAM_TEST_SCHEMA, /^iam_test_[a-f0-9]{32}$/);
        assert.equal(env.NODE_ENV, 'test');
        assert.equal(
          new URL(env.DATABASE_URL).searchParams.get('options'),
          `-c search_path=${env.IAM_TEST_SCHEMA}`,
        );
        if (failRun) throw new Error('test failure');
      },
    });
    if (failRun) await assert.rejects(promise, /test failure/);
    else await promise;
    const created = db.calls.find((sql) => sql.startsWith('CREATE SCHEMA'));
    const dropped = db.calls.find((sql) => sql.startsWith('DROP SCHEMA'));
    assert.equal(created.match(/"(.*?)"/)[1], dropped.match(/"(.*?)"/)[1]);
    assert.equal(db.calls.at(-1), 'end');
  });
}

test('failed creation never drops an unowned schema; connection always closes', async () => {
  for (const options of [{ failCreate: true }, { failConnect: true }]) {
    const db = fakeDatabase(options);
    await assert.rejects(
      withTestSchema({
        databaseUrl: 'postgresql://test:test@localhost/iam_test',
        clientFactory: db.clientFactory,
        run: async () => assert.fail('must not run'),
      }),
    );
    assert.equal(
      db.calls.some((sql) => sql.startsWith('DROP SCHEMA')),
      false,
    );
    assert.equal(db.calls.at(-1), 'end');
  }
});

test('database must be explicitly supplied as a test target', async () => {
  await assert.rejects(
    withTestSchema({ run: async () => {} }),
    /IAM_TEST_DATABASE_URL/,
  );
});

test('failed schema teardown still closes the control connection', async () => {
  let ended = false;
  await assert.rejects(
    withTestSchema({
      databaseUrl: 'postgresql://test:test@localhost/iam_test',
      clientFactory: () => ({
        async connect() {},
        async query(sql) {
          if (sql.startsWith('DROP')) throw new Error('drop failed');
        },
        async end() {
          ended = true;
        },
      }),
      run: async () => {},
    }),
    /drop failed/,
  );
  assert.equal(ended, true);
});
