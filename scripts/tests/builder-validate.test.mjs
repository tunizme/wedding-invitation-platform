import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  selection,
  assertRequiredFiles,
  withOwnedResources,
  Processes,
} from '../builder-validate.mjs';

const requireApi = createRequire(resolve('apps/api/package.json'));
const { fields, testStorage, fixtureEnvironment } = requireApi(
  './scripts/with-test-builder.cjs',
);
const { cleanupPrefix } = requireApi('./scripts/builder-test-storage.cjs');
const environment = () => ({
  BUILDER_TEST_DATABASE_URL:
    'postgresql://test:private-sentinel@127.0.0.1:1/disposable',
  BUILDER_S3_BUCKET: 'development-bucket',
  BUILDER_S3_ACCESS_KEY_ID: 'development-user',
  BUILDER_S3_SECRET_ACCESS_KEY: 'development-secret',
  BUILDER_TEST_S3_ENDPOINT: 'http://127.0.0.1:9000',
  BUILDER_TEST_S3_REGION: 'us-east-1',
  BUILDER_TEST_S3_BUCKET: 'test-bucket',
  BUILDER_TEST_S3_ACCESS_KEY_ID: 'test-user',
  BUILDER_TEST_S3_SECRET_ACCESS_KEY: 'test-secret-sentinel',
  BUILDER_TEST_S3_FORCE_PATH_STYLE: 'true',
});
function database() {
  const queries = [];
  return {
    queries,
    async connect() {},
    async query(sql) {
      queries.push(sql);
    },
    async end() {},
  };
}
function storage() {
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command.input);
      return {};
    },
    destroy() {},
  };
}

test('selectors keep full dependency closure without duplicate suites', () => {
  assert.equal(selection(['--phase', 'setup']).budgetMs, 300_000);
  assert.equal(selection(['--phase', 'all']).budgetMs, 2_700_000);
  for (const [name, budget] of [
    ['US1', 15],
    ['US2', 15],
    ['US3', 20],
    ['US4', 25],
    ['US6', 30],
    ['US5', 30],
  ]) {
    const selected = selection(['--story', name]);
    assert.equal(selected.budgetMs, budget * 60_000);
    assert.equal(selected.files.length, new Set(selected.files).size);
  }
  const us4 = selection(['--story', 'US4']).files;
  assert.ok(us4.some((file) => file.includes('invitation-races')));
  assert.ok(
    !us4.some(
      (file) => file.includes('assistance') || file.endsWith('/rsvp.spec.ts'),
    ),
  );
  const us6 = selection(['--story', 'US6']).files;
  assert.ok(us6.some((file) => file.includes('rsvp-races')));
  assert.ok(!us6.some((file) => file.includes('assistance')));
  for (const phase of ['invitations', 'rsvp']) {
    const files = selection(['--phase', phase]).files;
    assert.ok(files.some((file) => file.includes('assistance')));
    assert.ok(files.some((file) => file.includes('rsvp-races')));
  }
  assert.throws(() => selection(['--story', 'US9']), /Usage/);
  assert.throws(
    () => assertRequiredFiles(['absent.spec.ts'], tmpdir()),
    /Missing required/,
  );
});

test('all six storage variables are mandatory; no development identity fallback', () => {
  for (const field of fields) {
    for (const bad of [undefined, '', ' ']) {
      const env = environment();
      env[`BUILDER_TEST_S3_${field}`] = bad;
      assert.throws(
        () => testStorage(env),
        new RegExp(`BUILDER_TEST_S3_${field}`),
      );
    }
  }
  for (const [key, value] of [
    ['BUILDER_TEST_S3_ENDPOINT', 'http://secret:sentinel@localhost'],
    ['BUILDER_TEST_S3_ENDPOINT', 'http://localhost/path'],
    ['BUILDER_TEST_S3_REGION', '../region'],
    ['BUILDER_TEST_S3_BUCKET', 'development-bucket'],
    ['BUILDER_TEST_S3_FORCE_PATH_STYLE', '1'],
    ['BUILDER_TEST_S3_ACCESS_KEY_ID', 'development-user'],
    ['BUILDER_TEST_S3_SECRET_ACCESS_KEY', 'development-secret'],
  ]) {
    assert.throws(
      () => testStorage({ ...environment(), [key]: value }),
      (error) => !error.message.includes('sentinel'),
    );
  }
});

test('mapping is child-only, owns the prefix, strips session/root credentials', () => {
  const parent = {
    ...environment(),
    BUILDER_S3_SESSION_TOKEN: 'session-sentinel',
    MINIO_ROOT_PASSWORD: 'root-sentinel',
    BUILDER_S3_PREFIX: 'unrelated/',
  };
  const before = { ...parent };
  const runId = 'a'.repeat(32);
  const child = fixtureEnvironment(parent, { runId, scratch: '/tmp/owned' });
  assert.deepEqual(parent, before);
  assert.equal(child.BUILDER_S3_BUCKET, 'test-bucket');
  assert.equal(child.BUILDER_S3_ACCESS_KEY_ID, 'test-user');
  assert.equal(child.BUILDER_S3_PREFIX, `tests/${runId}/`);
  assert.equal(child.BUILDER_S3_SESSION_TOKEN, undefined);
  assert.equal(child.MINIO_ROOT_PASSWORD, undefined);
  assert.throws(() =>
    fixtureEnvironment(parent, { runId: '../unsafe', scratch: '/tmp/owned' }),
  );
});

test('cleanup paginates, rejects out-of-scope keys and never deletes buckets', async () => {
  const runId = 'b'.repeat(32),
    prefix = `tests/${runId}/`;
  const calls = [];
  let page = 0;
  const client = {
    async send(command) {
      calls.push(command);
      if (command.constructor.name === 'DeleteObjectCommand') return {};
      return [
        {
          Contents: [{ Key: prefix + 'one' }],
          IsTruncated: true,
          NextContinuationToken: 'next',
        },
        { Contents: [{ Key: prefix + 'two' }] },
        {},
      ][page++];
    },
  };
  await cleanupPrefix({
    client,
    bucket: 'test-bucket',
    prefix,
    runId,
    deadline: Date.now() + 1000,
  });
  assert.equal(
    calls.filter((c) => c.constructor.name === 'DeleteObjectCommand').length,
    2,
  );
  assert.equal(calls[2].input.ContinuationToken, 'next');
  assert.ok(calls.every((c) => c.input.Bucket === 'test-bucket'));
  await assert.rejects(
    cleanupPrefix({
      client,
      bucket: 'test-bucket',
      prefix: 'tests/',
      runId,
      deadline: Date.now() + 1000,
    }),
    /unowned/,
  );
  await assert.rejects(
    cleanupPrefix({
      client: {
        async send() {
          return { Contents: [{ Key: 'development/private' }] };
        },
      },
      bucket: 'test-bucket',
      prefix,
      runId,
      deadline: Date.now() + 1000,
    }),
    /outside owned/,
  );
});

test('two isolated runs drop only their own schema and object namespace', async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), 'builder-runner-test-'));
  try {
    const runs = [];
    await Promise.all(
      [0, 1].map(async () => {
        const db = database(),
          s3 = storage();
        await withOwnedResources({
          env: environment(),
          budgetMs: 1000,
          cleanupReserveMs: 200,
          artifactsRoot,
          databaseFactory: () => db,
          storageFactory: () => s3,
          report: () => {},
          run: async (context) => {
            runs.push({ context, db, s3 });
          },
        });
      }),
    );
    assert.notEqual(runs[0].context.prefix, runs[1].context.prefix);
    for (const { context, db, s3 } of runs) {
      assert.deepEqual(db.queries, [
        `CREATE SCHEMA "${context.schema}"`,
        `DROP SCHEMA "${context.schema}" CASCADE`,
      ]);
      assert.ok(s3.calls.every((call) => call.Prefix === context.prefix));
      const report = JSON.parse(
        await readFile(join(context.artifacts, 'cleanup.json'), 'utf8'),
      );
      assert.equal(report.status, 'PASS');
      await assert.rejects(readFile(join(context.scratch, 'anything')));
    }
  } finally {
    await rm(artifactsRoot, { recursive: true, force: true });
  }
});

test('missing database fails before resources start even if DATABASE_URL exists', async () => {
  const env = {
    ...environment(),
    BUILDER_TEST_DATABASE_URL: undefined,
    DATABASE_URL: 'postgres://dev',
  };
  await assert.rejects(
    withOwnedResources({
      env,
      budgetMs: 300_000,
      run: () => assert.fail('ran'),
    }),
    /BUILDER_TEST_DATABASE_URL/,
  );
});

test('workload timeout still runs cleanup inside the hard deadline', async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), 'builder-timeout-test-'));
  const s3 = storage(),
    db = database();
  let resource;
  const start = Date.now();
  try {
    await assert.rejects(
      withOwnedResources({
        env: environment(),
        budgetMs: 500,
        cleanupReserveMs: 200,
        artifactsRoot,
        databaseFactory: () => db,
        storageFactory: () => s3,
        report: () => {},
        run: (context) => {
          resource = context;
          return new Promise(() => {});
        },
      }),
      /deadline|timed out/,
    );
    assert.ok(Date.now() - start < 800);
    assert.ok(db.queries.some((query) => query.startsWith('DROP SCHEMA')));
    assert.equal(
      JSON.parse(
        await readFile(join(resource.artifacts, 'cleanup.json'), 'utf8'),
      ).status,
      'PASS',
    );
  } finally {
    await rm(artifactsRoot, { recursive: true, force: true });
  }
});

test('hanging storage is bounded and cleanup failure defeats successful workload', async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), 'builder-hang-test-'));
  let resource;
  const messages = [];
  const start = Date.now();
  try {
    await assert.rejects(
      withOwnedResources({
        env: environment(),
        budgetMs: 250,
        cleanupReserveMs: 150,
        artifactsRoot,
        databaseFactory: database,
        storageFactory: () => ({
          send: () => new Promise(() => {}),
          destroy() {},
        }),
        report: (message) => messages.push(message),
        run: async (context) => {
          resource = context;
        },
      }),
      /cleanup failed/,
    );
    assert.ok(Date.now() - start < 700);
    assert.ok(messages[0].startsWith('cleanup: FAILED'));
    assert.ok(!messages.join('').includes('sentinel'));
    assert.equal(
      JSON.parse(
        await readFile(join(resource.artifacts, 'cleanup.json'), 'utf8'),
      ).status,
      'FAILED',
    );
  } finally {
    await rm(artifactsRoot, { recursive: true, force: true });
  }
});

test('child failure and abort stop owned process groups', async () => {
  const processes = new Processes();
  await assert.rejects(
    processes.run(process.execPath, ['-e', 'process.exit(7)'], {
      deadline: Date.now() + 2000,
      stdio: 'ignore',
    }),
    /child exited/,
  );
  const controller = new AbortController();
  const running = processes.run(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    { deadline: Date.now() + 2000, signal: controller.signal, stdio: 'ignore' },
  );
  setTimeout(() => controller.abort(), 50);
  await assert.rejects(running);
  assert.equal(processes.children.size, 0);
});

// Windows has no deliverable SIGTERM: process.kill(pid, 'SIGTERM') terminates
// the process without running handlers, so this behavior is POSIX-only.
test(
  'handled SIGTERM enters cleanup immediately without exhausting the work budget',
  {
    skip:
      process.platform === 'win32' && 'SIGTERM handlers cannot run on Windows',
  },
  async () => {
    const artifactsRoot = await mkdtemp(join(tmpdir(), 'builder-signal-test-'));
    const runner = new URL('../builder-validate.mjs', import.meta.url).href;
    const source = `
    import assert from 'node:assert/strict';
    import {withOwnedResources} from ${JSON.stringify(runner)};
    const queries=[];
    await assert.rejects(withOwnedResources({env:${JSON.stringify(environment())},budgetMs:5000,cleanupReserveMs:1000,
      artifactsRoot:${JSON.stringify(artifactsRoot)},report:()=>{},
      databaseFactory:()=>({async connect(){},async query(sql){queries.push(sql)},async end(){}}),
      storageFactory:()=>({async send(){return {}},destroy(){}}),
      run:()=>{setTimeout(()=>process.kill(process.pid,'SIGTERM'),20);return new Promise(()=>{});}
    }),/interrupted/);
    assert.ok(queries.some(query=>query.startsWith('DROP SCHEMA')));
  `;
    try {
      const processes = new Processes();
      await processes.run(
        process.execPath,
        ['--input-type=module', '-e', source],
        { deadline: Date.now() + 2000, stdio: 'pipe' },
      );
    } finally {
      await rm(artifactsRoot, { recursive: true, force: true });
    }
  },
);


test('idle database connection errors enter bounded cleanup without exposing server details', async () => {
  const artifactsRoot = await mkdtemp(join(tmpdir(), 'builder-idle-error-'));
  const db = Object.assign(new EventEmitter(), database());
  let resource;
  try {
    await assert.rejects(withOwnedResources({
      env: environment(), budgetMs: 1000, cleanupReserveMs: 200,
      artifactsRoot, databaseFactory: () => db, storageFactory: storage,
      report: () => {},
      run: async (context) => {
        resource = context;
        db.emit('error', new Error('private-server-sentinel'));
        await new Promise(resolve => setTimeout(resolve, 10));
      },
    }), error => !error.message.includes('private-server-sentinel'));
    const cleanup = JSON.parse(await readFile(join(resource.artifacts, 'cleanup.json'), 'utf8'));
    assert.equal(cleanup.status, 'PASS');
    assert.ok(db.queries.includes(`DROP SCHEMA "${resource.schema}" CASCADE`));
    assert.ok(!JSON.stringify(cleanup).includes('private-server-sentinel'));
  } finally { await rm(artifactsRoot, { recursive: true, force: true }); }
});
