import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireApi = createRequire(resolve(root, 'apps/api/package.json'));
const order = [
  'setup',
  'foundation',
  'US1',
  'US2',
  'US3',
  'US4',
  'US5',
  'US9',
  'US6',
  'US7',
  'US8',
  'US10',
  'all',
];
const api = (kind, name) =>
  `apps/api/test/${kind}/identity-access/${name}.spec.ts`;
const web = (name) => `apps/web/tests/identity-access/${name}.test.tsx`;
const story = (name) => [
  api('contract', name),
  api('integration', name),
  web(name),
];
const files = {
  setup: [api('contract', 'design')],
  foundation: [
    api('unit', 'security'),
    api('integration', 'foundation'),
    'apps/api/test/integration/migrations.integration.spec.ts',
    'apps/api/test/integration/health-ready.integration.spec.ts',
  ],
  US1: [
    api('unit', 'email-sender'),
    ...story('registration').filter((path) => !path.startsWith('apps/web')),
    web('register'),
  ],
  US2: [...story('verification'), api('integration', 'recovery-races')],
  US3: story('login'),
  US4: [...story('session'), api('integration', 'revocation-races')],
  US5: story('social-onboarding'),
  US9: [
    api('unit', 'authorization'),
    api('integration', 'authorization'),
    web('authorization'),
  ],
  US6: story('google'),
  US7: story('facebook'),
  US8: story('profile'),
  US10: [
    ...story('admin'),
    api('integration', 'admin-performance'),
    api('integration', 'bootstrap-admin'),
  ],
  all: ['retention', 'full-flow', 'secret-hygiene'].map((name) =>
    api('integration', name),
  ),
};

export function parsePhase(args) {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (
    normalized.length !== 2 ||
    normalized[0] !== '--phase' ||
    !order.includes(normalized[1])
  ) {
    throw new Error(`Usage: pnpm validate:iam --phase ${order.join('|')}`);
  }
  return normalized[1];
}

export function phaseFiles(phase) {
  if (!order.includes(phase)) throw new Error('Unknown IAM phase');
  return order
    .slice(0, order.indexOf(phase) + 1)
    .flatMap((name) => files[name]);
}

export function assertRequiredFiles(paths) {
  const missing = paths.filter(
    (path) =>
      !existsSync(resolve(root, path)) ||
      statSync(resolve(root, path)).size === 0,
  );
  if (missing.length)
    throw new Error(
      `Missing required test files (phase not ready):\n${missing.join('\n')}`,
    );
}

export function runCommand(
  command,
  args,
  { cwd = root, env = process.env, timeoutMs, signal, stdio = 'inherit' } = {},
) {
  return new Promise((done, reject) => {
    if (signal?.aborted) return reject(new Error('IAM validation aborted'));
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      return reject(new Error('IAM validation timeout'));
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
      shell: false,
      detached: process.platform !== 'win32',
    });
    let failure;
    function killGroup() {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH')
          failure ??= new Error('Could not stop validation process');
      }
    }
    const abort = () => {
      failure = new Error('IAM validation aborted');
      killGroup();
    };
    const timer = setTimeout(() => {
      failure = new Error(`${command}: timeout`);
      killGroup();
    }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      killGroup();
    };
    child.once('error', () => {
      failure = new Error(`Unable to start ${command}`);
      cleanup();
      reject(failure);
    });
    child.once('close', (code) => {
      cleanup();
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`${command}: exit ${code}`));
      else done();
    });
  });
}

export async function withTestSchema({ databaseUrl, run, clientFactory } = {}) {
  if (!databaseUrl)
    throw new Error(
      'Set IAM_TEST_DATABASE_URL to an explicit disposable-test PostgreSQL target. DATABASE_URL is not used as a fallback.',
    );
  const url = new URL(databaseUrl);
  if (!['postgresql:', 'postgres:'].includes(url.protocol))
    throw new Error('IAM_TEST_DATABASE_URL must use PostgreSQL');
  const schema = `iam_test_${randomUUID().replaceAll('-', '')}`;
  const client = clientFactory
    ? clientFactory()
    : new (requireApi('pg').Client)({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        query_timeout: 10_000,
        statement_timeout: 8000,
        lock_timeout: 3000,
        application_name: 'iam-validation-control',
      });
  let owned = false;
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    owned = true;
    url.searchParams.set('options', `-c search_path=${schema}`);
    return await run({
      NODE_ENV: 'test',
      IAM_TEST_SCHEMA: schema,
      DATABASE_URL: url.toString(),
    });
  } finally {
    try {
      // Only the unpredictable schema created by THIS run can be dropped.
      if (owned) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  }
}

export async function validate(phase) {
  const required = phaseFiles(phase);
  assertRequiredFiles(required);
  const timeout =
    phase === 'setup'
      ? 300_000
      : phase === 'all'
        ? 1_800_000
        : phase === 'US10'
          ? 900_000
          : 600_000;
  const deadline = Date.now() + timeout;
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const run = (command, args, env) =>
    runCommand(command, args, {
      env: { ...process.env, ...env },
      timeoutMs: deadline - Date.now(),
      signal: controller.signal,
    });
  try {
    if (phase === 'setup') {
      await run('pnpm', [
        '--filter',
        '@wedding/api',
        'test:contract',
        'test/contract/identity-access/design.spec.ts',
      ]);
      await run(process.execPath, [
        '--test',
        '--test-isolation=none',
        '--test-timeout=30000',
        'scripts/tests/iam-validate.test.mjs',
        'scripts/tests/scope-check.test.mjs',
      ]);
      await run('pnpm', ['scope:check']);
    } else {
      await withTestSchema({
        databaseUrl: process.env.IAM_TEST_DATABASE_URL,
        run: async (env) => {
          const selected = required
            .filter((path) => path.startsWith('apps/api/'))
            .map((path) => path.slice('apps/api/'.length));
          await run(
            'pnpm',
            [
              '--filter',
              '@wedding/api',
              'exec',
              'vitest',
              'run',
              '--configLoader',
              'runner',
              '--maxWorkers=1',
              ...selected,
            ],
            env,
          );
          const frontend = required
            .filter((path) => path.startsWith('apps/web/'))
            .map((path) => path.slice('apps/web/'.length));
          if (frontend.length)
            await run(
              'pnpm',
              ['--filter', '@wedding/web', 'test', ...frontend],
              env,
            );
          if (phase === 'all') {
            for (const command of [
              'format:check',
              'lint',
              'typecheck',
              'test',
              'test:scripts',
              'build',
              'scope:check',
            ])
              await run('pnpm', [command], env);
            await run(
              'pnpm',
              ['--filter', '@wedding/api', 'test:integration'],
              env,
            );
            await run('pnpm', ['health'], env);
          }
        },
      });
    }
    console.log(
      `IAM phase ${phase}: PASS (automated checks only; provider/browser/usability evidence remains separate).`,
    );
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await validate(parsePhase(process.argv.slice(2)));
  } catch (error) {
    // Do not emit connection URLs, child environments or database error details.
    const safe =
      /^(Usage:|Unknown IAM|Missing required|Set IAM_TEST_DATABASE_URL|IAM_TEST_DATABASE_URL must|IAM validation|pnpm:|Unable to start|Could not stop)/.test(
        error.message,
      );
    console.error(
      safe
        ? error.message
        : 'IAM validation failed; inspect the bounded test output and test database availability.',
    );
    process.exitCode = 1;
  }
}
