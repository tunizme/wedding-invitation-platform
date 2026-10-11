import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const { testStorage, fixtureEnvironment } = apiRequire(
  './scripts/with-test-builder.cjs',
);
const { clientFor, cleanupPrefix } = apiRequire(
  './scripts/builder-test-storage.cjs',
);
const api = (kind, name) =>
  `apps/api/test/${kind}/invitation-builder/${name}.spec.ts`;
const web = (name, extension = 'tsx') =>
  `apps/web/tests/invitation-builder/${name}.test.${extension}`;
const browser = (name) => `apps/web/e2e/invitation-builder/${name}.spec.ts`;
const order = [
  'setup',
  'foundation',
  'US1',
  'US2',
  'US3',
  'US4',
  'US6',
  'US5',
  'all',
];
const suites = {
  setup: [
    'scripts/tests/builder-validate.test.mjs',
    'scripts/tests/scope-check.test.mjs',
    api('unit', 'environment'),
    web('environment', 'ts'),
    api('integration', 'storage-setup'),
    api('contract', 'fixture-manifest'),
    browser('compatibility'),
  ],
  foundation: [
    api('contract', 'http-boundary'),
    api('contract', 'document'),
    api('integration', 'foundation'),
    api('integration', 'storage'),
    web('document', 'ts'),
    'apps/api/test/integration/migrations.integration.spec.ts',
  ],
  US1: [
    api('contract', 'template-draft'),
    api('integration', 'template-draft'),
    web('editor-state'),
    web('publication-controls'),
    web('client', 'ts'),
    browser('authoring'),
  ],
  US2: [
    api('unit', 'binding'),
    api('unit', 'qr-bank'),
    api('contract', 'rendering'),
    web('bindings', 'ts'),
    web('widgets'),
    web('qr-bank', 'ts'),
    browser('authoring'),
    browser('renderer-fit'),
  ],
  US3: [
    api('contract', 'assets'),
    api('contract', 'publication'),
    api('integration', 'publication-races'),
    api('integration', 'asset-races'),
    web('assets'),
    web('asset-preview'),
    browser('template-publication'),
  ],
  US4: [
    api('contract', 'invitations'),
    api('contract', 'public-invitation'),
    api('integration', 'invitation-races'),
    web('customer-form'),
    web('binding-panel'),
    web('scene-preview'),
    web('asset-failure'),
    web('pagination'),
    web('font-readiness', 'ts'),
    browser('convergence'),
    browser('customer-invitation'),
  ],
  US6: [
    api('contract', 'rsvp'),
    api('integration', 'rsvp-races'),
    web('rsvp'),
    browser('rsvp'),
  ],
  US5: [
    api('contract', 'assistance'),
    api('integration', 'assistance'),
    web('assistance'),
    browser('assistance'),
  ],
  all: [
    api('contract', 'http-contract'),
    api('integration', 'privacy'),
    api('integration', 'retention'),
    browser('privacy'),
    browser('performance'),
    'scripts/tests/independent-builds.test.mjs',
  ],
};
const phases = {
  setup: ['setup', 5],
  foundation: ['foundation', 10],
  editor: ['US2', 15],
  templates: ['US3', 20],
  invitations: ['US5', 25],
  rsvp: ['US5', 30],
  all: ['all', 45],
};
const stories = { US1: 15, US2: 15, US3: 20, US4: 25, US6: 30, US5: 30 };

export function selection(args) {
  if (args[0] === '--') args = args.slice(1);
  if (
    args.length !== 2 ||
    !['--phase', '--story'].includes(args[0]) ||
    !(args[0] === '--phase'
      ? Object.hasOwn(phases, args[1])
      : Object.hasOwn(stories, args[1]))
  ) {
    throw new Error(
      'Usage: pnpm validate:builder --phase setup|foundation|editor|templates|invitations|rsvp|all OR --story US1|US2|US3|US4|US6|US5',
    );
  }
  const [last, minutes] =
    args[0] === '--phase' ? phases[args[1]] : [args[1], stories[args[1]]];
  return {
    kind: args[0].slice(2),
    name: args[1],
    last,
    budgetMs: minutes * 60_000,
    files: [
      ...new Set(
        order.slice(0, order.indexOf(last) + 1).flatMap((name) => suites[name]),
      ),
    ],
  };
}

export function assertRequiredFiles(files, directory = root) {
  const missing = files.filter(
    (file) =>
      !existsSync(resolve(directory, file)) ||
      statSync(resolve(directory, file)).size === 0,
  );
  if (missing.length)
    throw new Error(
      `Missing required builder files (selector not ready):\n${missing.join('\n')}`,
    );
}

export class Processes {
  children = new Set();
  start(
    command,
    args,
    { env = process.env, cwd = root, stdio = 'inherit' } = {},
  ) {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
      shell: false,
      detached: process.platform !== 'win32',
    });
    this.children.add(child);
    child.completion = new Promise((done, reject) => {
      child.once('error', () =>
        reject(new Error('Builder child could not start.')),
      );
      child.once('close', (code) =>
        code === 0
          ? done()
          : reject(new Error(`Builder child exited ${code ?? 'by signal'}.`)),
      );
    });
    // Long-lived servers are awaited during shutdown; prevent unhandled rejection.
    child.completion.catch(() => {});
    return child;
  }
  stop(child) {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH')
        throw new Error('Builder writer shutdown failed.');
    }
  }
  async run(command, args, { deadline, signal, ...options }) {
    if (signal?.aborted || Date.now() >= deadline)
      throw new Error('Builder workload interrupted or timed out.');
    const child = this.start(command, args, options);
    let failed = false;
    const interrupt = () => {
      failed = true;
      this.stop(child);
    };
    const timer = setTimeout(interrupt, deadline - Date.now());
    signal?.addEventListener('abort', interrupt, { once: true });
    try {
      await child.completion;
      if (failed) throw new Error('Builder workload interrupted or timed out.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', interrupt);
      this.stop(child);
      this.children.delete(child);
    }
  }
  async shutdown(deadline) {
    const children = [...this.children];
    for (const child of children) this.stop(child);
    await bounded(
      () => Promise.allSettled(children.map((child) => child.completion)),
      deadline,
    );
    this.children.clear();
  }
}

async function bounded(action, deadline, signal) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Builder deadline exceeded.');
  if (signal?.aborted)
    throw new Error('Builder workload interrupted or timed out.');
  let timer;
  let abort;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Builder deadline exceeded.')),
          remaining,
        );
        abort = () =>
          reject(new Error('Builder workload interrupted or timed out.'));
        signal?.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}

export async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

export async function withOwnedResources({
  env = process.env,
  budgetMs,
  cleanupReserveMs = 30_000,
  run,
  databaseFactory,
  storageFactory,
  report = console.log,
  artifactsRoot = resolve(root, '.artifacts/builder'),
}) {
  const startedAt = Date.now();
  const hardDeadline = startedAt + budgetMs;
  const workDeadline = hardDeadline - cleanupReserveMs;
  if (workDeadline <= startedAt)
    throw new Error('Builder budget must exceed cleanup reserve.');
  const storage = testStorage(env);
  let databaseUrl;
  try {
    databaseUrl = new URL(env.BUILDER_TEST_DATABASE_URL);
  } catch {
    throw new Error(
      'Set BUILDER_TEST_DATABASE_URL to an explicit disposable PostgreSQL database.',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
    throw new Error('Invalid BUILDER_TEST_DATABASE_URL protocol.');
  const runId = randomUUID().replaceAll('-', '');
  const schema = `builder_test_${runId}`;
  const prefix = `tests/${runId}/`;
  const artifacts = join(artifactsRoot, runId);
  await mkdir(artifacts, { recursive: true });
  const owned = {
    runId,
    schema,
    bucket: storage.BUCKET,
    prefix,
    artifacts,
    startedAt,
    hardDeadline,
    workDeadline,
  };
  await writeFile(
    join(artifacts, 'ownership.json'),
    JSON.stringify(owned, null, 2),
  );
  const scratch = await mkdtemp(join(tmpdir(), `builder-${runId}-`));
  const childEnv = fixtureEnvironment(env, { runId, scratch });
  delete childEnv.IAM_TEST_SCHEMA;
  databaseUrl.searchParams.set('options', `-c search_path=${schema}`);
  Object.assign(childEnv, {
    BUILDER_TEST_SCHEMA: schema,
    DATABASE_URL: databaseUrl.toString(),
    BUILDER_TEST_ARTIFACTS: artifacts,
  });
  const processes = new Processes();
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const timer = setTimeout(interrupt, Math.max(1, workDeadline - Date.now()));
  const db = databaseFactory
    ? databaseFactory()
    : new (apiRequire('pg').Client)({
        connectionString: env.BUILDER_TEST_DATABASE_URL,
        connectionTimeoutMillis: 5000,
        query_timeout: 8000,
        statement_timeout: 6000,
        lock_timeout: 2000,
        application_name: 'builder-validation-control',
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
      });
  const s3 = storageFactory ? storageFactory(childEnv) : clientFor(childEnv);
  let schemaOwned = false;
  let outcome;
  // pg emits idle connection failures outside an awaited query. Keep them in
  // the bounded lifecycle so owned cleanup evidence is always produced.
  const connectionFailed = () => {
    outcome ??= new Error('Owned database control connection failed.');
    controller.abort();
  };
  db.on?.('error', connectionFailed);
  let result;
  const extraCleanup = [];
  try {
    await bounded(() => db.connect(), workDeadline, controller.signal);
    await bounded(
      () => db.query(`CREATE SCHEMA "${schema}"`),
      workDeadline,
      controller.signal,
    );
    schemaOwned = true;
    result = await bounded(
      () =>
        run({
          ...owned,
          scratch,
          env: childEnv,
          processes,
          signal: controller.signal,
          extraCleanup,
          command: (command, args, options = {}) =>
            processes.run(command, args, {
              env: childEnv,
              deadline: workDeadline,
              signal: controller.signal,
              ...options,
            }),
        }),
      workDeadline,
      controller.signal,
    );
  } catch (error) {
    outcome = error;
  } finally {
    clearTimeout(timer);
    controller.abort();
    const cleanupDeadline = Math.min(hardDeadline, Date.now() + 30_000);
    const failures = [];
    let writersStopped = true;
    try {
      await processes.shutdown(cleanupDeadline);
    } catch {
      writersStopped = false;
      failures.push('writer shutdown');
    }
    for (const cleanup of extraCleanup.reverse()) {
      try {
        await cleanup(cleanupDeadline);
      } catch {
        writersStopped = false;
        failures.push('owned process/container');
      }
    }
    const cleanupStep = async (reason, operation) => {
      try {
        await bounded(operation, cleanupDeadline);
      } catch {
        failures.push(reason);
      }
    };
    if (writersStopped) {
      // Once writers stop these resources are independent. A storage outage
      // must not consume the entire budget before SQL/scratch cleanup can run.
      await Promise.all([
        cleanupStep('object inventory unknown', () =>
          cleanupPrefix({
            client: s3,
            bucket: storage.BUCKET,
            prefix,
            runId,
            deadline: cleanupDeadline,
          }),
        ),
        (async () => {
          if (schemaOwned)
            await cleanupStep('owned schema', () =>
              db.query(`DROP SCHEMA "${schema}" CASCADE`),
            );
          await cleanupStep('database connection', () => db.end());
        })(),
        cleanupStep('owned scratch', () =>
          rm(scratch, { recursive: true, force: true }),
        ),
      ]);
    } else {
      failures.push(
        'schema/prefix/scratch retained because writers may still be active',
      );
      await cleanupStep('database connection', () => db.end());
    }
    // Force-close a stuck control connection without starting new SQL work.
    if (failures.includes('database connection'))
      db.connection?.stream?.destroy();
    s3.destroy();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    const cleanup = {
      status: failures.length ? 'FAILED' : 'PASS',
      bucket: storage.BUCKET,
      prefix,
      schema,
      remaining: failures.length ? failures : [],
      reason: failures.length ? 'Owned resource cleanup incomplete' : undefined,
    };
    await writeFile(
      join(artifacts, 'cleanup.json'),
      JSON.stringify(cleanup, null, 2),
    );
    report(
      `cleanup: ${cleanup.status} bucket=${storage.BUCKET} prefix=${prefix}${failures.length ? ' remaining=unknown; see owned-resource report' : ''}`,
    );
    if (failures.length)
      outcome = new Error(
        'Builder cleanup failed; inspect sanitized owned-resource report.',
      );
  }
  if (outcome) throw outcome;
  return result;
}

export async function healthy(url, context, child) {
  while (Date.now() < context.workDeadline && !context.signal.aborted) {
    if (child?.exitCode !== null && child?.exitCode !== undefined)
      throw new Error('Builder server exited before readiness.');
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(1000)]),
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      /* retry within the existing work budget */
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('Builder server readiness timed out.');
}

export async function browserServer(context) {
  if (context.env.BUILDER_TEST_BROWSER_MODE !== 'docker') return;
  const port = await freePort();
  const name = `builder-browser-${context.runId}`;
  const path = `/${context.runId}`;
  context.extraCleanup.push((deadline) =>
    context.processes.run('docker', ['rm', '--force', name], {
      deadline,
      stdio: 'ignore',
    }),
  );
  const child = context.processes.start(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      name,
      '--network',
      'host',
      '--init',
      '--shm-size=1g',
      'wedding-builder-playwright:1.63.0',
      'run-server',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--path',
      path,
    ],
    { env: context.env, stdio: 'ignore' },
  );
  // The server serves a small discovery/health page on its HTTP port.
  await healthy(`http://127.0.0.1:${port}`, context, child);
  context.env.BUILDER_TEST_BROWSER_WS = `ws://127.0.0.1:${port}${path}`;
}

async function runBrowser(
  context,
  files,
  baseUrl,
  { resetLoginIp = false } = {},
) {
  const projects = ['chromium', 'firefox', 'webkit'];
  // RSVP adds independent owner/admin/other login setups. Give that story its
  // own IAM source-quota window in the disposable schema; business RSVP quota
  // and email buckets remain intact, and every required file still runs.
  const rsvpFiles = files.filter((file) => file === browser('rsvp'));
  const dependencyFiles = files.filter((file) => file !== browser('rsvp'));
  const batches =
    resetLoginIp && rsvpFiles.length && dependencyFiles.length
      ? [dependencyFiles, rsvpFiles]
      : [files];
  let executed = 0;
  for (const project of projects) {
    for (const [batchIndex, batch] of batches.entries()) {
      if (resetLoginIp && executed > 0)
        await context.command(process.execPath, [
          'apps/api/scripts/builder-reset-browser-login-ip.cjs',
        ]);
      await context.command(
        'pnpm',
        [
          '--filter',
          '@wedding/web',
          'exec',
          'playwright',
          'test',
          `--project=${project}`,
          ...batch.map((file) => file.slice('apps/web/'.length)),
        ],
        {
          env: {
            ...context.env,
            BUILDER_TEST_WEB_URL: baseUrl,
            BUILDER_TEST_ARTIFACTS: join(
              context.artifacts,
              `browser-${project}${batches.length > 1 ? (batchIndex === 0 ? '-dependencies' : '-rsvp') : ''}`,
            ),
          },
        },
      );
      executed++;
    }
  }
}

export async function validate(selected, env = process.env) {
  assertRequiredFiles(selected.files);
  await withOwnedResources({
    env,
    budgetMs: selected.budgetMs,
    run: async (context) => {
      const apiFiles = selected.files
        .filter((file) => file.startsWith('apps/api/'))
        .map((file) => file.slice('apps/api/'.length));
      const webFiles = selected.files
        .filter((file) => file.startsWith('apps/web/tests/'))
        .map((file) => file.slice('apps/web/'.length));
      const scriptFiles = selected.files.filter((file) =>
        file.startsWith('scripts/'),
      );
      await context.command(process.execPath, [
        '--test',
        '--test-isolation=none',
        '--test-timeout=30000',
        ...scriptFiles,
      ]);
      await context.command('pnpm', ['scope:check']);
      await context.command('pnpm', [
        '--filter',
        '@wedding/api',
        'migration:run',
      ]);
      await context.command('node', [
        'apps/api/scripts/with-test-iam.cjs',
        'pnpm',
        '--filter',
        '@wedding/api',
        'exec',
        'vitest',
        'run',
        '--configLoader',
        'runner',
        '--maxWorkers=1',
        ...apiFiles,
      ]);
      await context.command('pnpm', [
        '--filter',
        '@wedding/web',
        'test',
        ...webFiles,
      ]);
      await browserServer(context);
      const fixture = join(context.scratch, 'compat');
      await cp(
        resolve(root, 'apps/web/tests/fixtures/builder-compat'),
        fixture,
        { recursive: true },
      );
      await symlink(
        resolve(root, 'apps/web/node_modules'),
        join(fixture, 'node_modules'),
        'dir',
      );
      await context.command('pnpm', [
        '--filter',
        '@wedding/web',
        'exec',
        'next',
        'build',
        fixture,
        '--webpack',
      ]);
      const compatPort = await freePort();
      const compat = context.processes.start(
        'pnpm',
        [
          '--filter',
          '@wedding/web',
          'exec',
          'next',
          'start',
          fixture,
          '--hostname',
          '127.0.0.1',
          '--port',
          String(compatPort),
        ],
        { env: context.env },
      );
      await healthy(`http://127.0.0.1:${compatPort}`, context, compat);
      await runBrowser(
        context,
        [browser('compatibility')],
        `http://127.0.0.1:${compatPort}`,
      );
      context.processes.stop(compat);
      const otherBrowsers = selected.files.filter(
        (file) =>
          file.startsWith('apps/web/e2e/') && file !== browser('compatibility'),
      );
      if (otherBrowsers.length || selected.name === 'all') {
        const apiPort = await freePort();
        const webPort = await freePort();
        Object.assign(context.env, {
          API_PORT: String(apiPort),
          WEB_PORT: String(webPort),
          API_PUBLIC_ORIGIN: `http://127.0.0.1:${apiPort}`,
          FRONTEND_ORIGIN: `http://127.0.0.1:${webPort}`,
          NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
          API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
          BUILDER_RENDER_ORIGIN: `http://127.0.0.1:${webPort}`,
          BUILDER_ENABLE_PUBLICATION_WORKER: 'true',
        });
        await context.command('pnpm', ['build:api']);
        await context.command('pnpm', ['build:web']);
        context.env.BUILDER_TEST_BROWSER_SEED = join(
          context.scratch,
          'browser-seed.json',
        );
        await context.command('pnpm', [
          '--filter',
          '@wedding/api',
          'exec',
          'vitest',
          'run',
          '--configLoader',
          'runner',
          '--maxWorkers=1',
          '--config',
          'test/fixtures/invitation-builder/seed.config.ts',
          'test/fixtures/invitation-builder/browser-seed.spec.ts',
        ]);
        const backend = context.processes.start(
          'node',
          [
            'apps/api/scripts/with-test-iam.cjs',
            'pnpm',
            '--filter',
            '@wedding/api',
            'start',
          ],
          { env: context.env },
        );
        const frontend = context.processes.start(
          'pnpm',
          ['--filter', '@wedding/web', 'start'],
          { env: context.env },
        );
        await healthy(
          `http://127.0.0.1:${apiPort}/api/v1/health/ready`,
          context,
          backend,
        );
        await healthy(
          `http://127.0.0.1:${webPort}/api/health`,
          context,
          frontend,
        );
        await runBrowser(context, otherBrowsers, context.env.FRONTEND_ORIGIN, {
          resetLoginIp: true,
        });
      }
      if (selected.name === 'all') {
        for (const command of [
          'format:check',
          'lint',
          'typecheck',
          'test',
          'test:scripts',
          'scope:check',
        ])
          await context.command('pnpm', [command]);
        await context.command('node', [
          'apps/api/scripts/with-test-iam.cjs',
          'pnpm',
          '--filter',
          '@wedding/api',
          'test:iam',
        ]);
        await context.command('pnpm', ['health']);
      }
    },
  });
  console.log(
    `Builder ${selected.kind} ${selected.name}: PASS (automated evidence; manual acceptance remains separate).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await validate(selection(process.argv.slice(2)));
  } catch (error) {
    const safe =
      /^(Usage:|Missing required builder|Invalid builder test|Set BUILDER_TEST|Invalid BUILDER_TEST|Builder )/.test(
        error.message,
      );
    console.error(
      safe
        ? error.message
        : 'Builder validation failed; inspect bounded checks and sanitized resource reports.',
    );
    process.exitCode = 1;
  }
}
