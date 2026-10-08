import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertRequiredFiles, withTestSchema } from './iam-validate.mjs';
import {
  pnpmCommand,
  runOwnedCommand,
  withAuthTransitionStack,
} from './auth-transition-stack.mjs';

/**
 * Feature 006 runner (quickstart "Phase runner").
 * Registry is fixed: a phase fails before running anything if a required file
 * is missing or empty. Each phase also runs every earlier phase's files.
 */
const root = fileURLToPath(new URL('../', import.meta.url));
export const order = ['setup', 'foundation', 'US1', 'US2', 'US3', 'US4', 'all'];

/** Budgets include the 30s cleanup reserve (quickstart). */
export const budgets = {
  setup: 300_000,
  foundation: 600_000,
  US1: 1_200_000,
  US2: 1_200_000,
  US3: 1_200_000,
  US4: 900_000,
  all: 3_600_000,
};
const CLEANUP_RESERVE_MS = 30_000;

const api = (kind, name) =>
  `apps/api/test/${kind}/identity-access/${name}.spec.ts`;
const web = (name, ext = 'test.ts') =>
  `apps/web/tests/identity-access/${name}.${ext}`;
const browser = (name) => `apps/web/tests/auth-transition/${name}.spec.ts`;

export const registry = {
  setup: [
    'apps/api/scripts/validate-iam-contract.cjs',
    'apps/web/tests/auth-transition/support/delivery-proxy.test.ts',
    'scripts/tests/auth-transition-validate.test.mjs',
    'scripts/tests/auth-transition-stack.test.mjs',
    browser('suite-self-check'),
  ],
  foundation: [
    api('integration', 'oauth-browser-harness'),
    api('integration', 'auth-context-schema'),
    api('contract', 'auth-context'),
    api('integration', 'auth-context'),
    api('integration', 'auth-context-locks'),
    web('auth-selector'),
    web('auth-transport'),
    browser('selector-idb'),
  ],
  US1: [
    api('contract', 'auth-transition-session'),
    api('integration', 'auth-transition-session'),
    browser('us1-late-effects'),
    browser('us1-no-web-locks'),
    web('auth-transition-session', 'test.tsx'),
  ],
  US2: [
    api('contract', 'auth-intent-outcome'),
    api('integration', 'auth-capacity'),
    browser('us2-uncertain'),
    browser('us2-recovery'),
    web('auth-recovery', 'test.tsx'),
    web('operation-recovery'),
  ],
  US3: [
    api('contract', 'auth-transition-oauth'),
    api('integration', 'auth-transition-oauth'),
    browser('us3-oauth'),
  ],
  US4: [
    api('integration', 'auth-cutover'),
    browser('us4-cutover'),
    web('auth-renewal', 'test.tsx'),
  ],
  all: [
    api('integration', 'retention'),
    api('integration', 'secret-hygiene'),
    browser('a5-cookie-limits'),
  ],
};

export function parsePhase(args) {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  if (
    normalized.length !== 2 ||
    normalized[0] !== '--phase' ||
    !order.includes(normalized[1])
  )
    throw new Error(
      `Usage: pnpm validate:auth-transition --phase ${order.join('|')}`,
    );
  return normalized[1];
}

export function phaseFiles(phase) {
  if (!order.includes(phase)) throw new Error('Unknown auth-transition phase');
  return order
    .slice(0, order.indexOf(phase) + 1)
    .flatMap((name) => registry[name]);
}

export function partition(paths) {
  return {
    apiTests: paths
      .filter((path) => path.startsWith('apps/api/test/'))
      .map((path) => path.slice('apps/api/'.length)),
    webUnit: paths
      .filter(
        (path) =>
          path.startsWith('apps/web/tests/') && /\.test\.tsx?$/.test(path),
      )
      .map((path) => path.slice('apps/web/'.length)),
    browser: paths
      .filter((path) =>
        /^apps\/web\/tests\/auth-transition\/.*\.spec\.ts$/.test(path),
      )
      .map((path) => path.slice('apps/web/'.length)),
    scripts: paths.filter(
      (path) =>
        path.startsWith('scripts/') || path.startsWith('apps/api/scripts/'),
    ),
  };
}

const projects = ['chromium', 'firefox', 'webkit', 'chromium-no-web-locks'];
const inventory = JSON.parse(
  readFileSync(
    new URL('./auth-transition-cases.json', import.meta.url),
    'utf8',
  ),
);

export function assertCaseEvidence(report, expected) {
  if (
    !report?.complete ||
    !Array.isArray(report.cases) ||
    !report.cases.length ||
    !expected.length
  )
    throw new Error('auth-transition evidence: incomplete or empty suite');
  const key = (row) => JSON.stringify([row.file, row.name, row.project ?? '']);
  const actual = new Map();
  for (const row of report.cases) {
    if (row.status !== 'passed' || actual.has(key(row)))
      throw new Error(
        'auth-transition evidence: skipped, unfinished, failed or duplicate case',
      );
    actual.set(key(row), row);
  }
  for (const row of expected)
    if (!actual.has(key(row)))
      throw new Error(
        `auth-transition evidence: missing case in ${row.file}${row.project ? ` (${row.project})` : ''}`,
      );
}

export function requiredCases(paths, browser = false) {
  return paths.flatMap((file) => {
    if (!inventory[file]?.length)
      throw new Error(
        `auth-transition evidence: missing fixed inventory for ${file}`,
      );
    return inventory[file].flatMap((name) =>
      browser
        ? projects.map((project) => ({ file, name, project }))
        : [{ file, name }],
    );
  });
}

export async function validate(phase) {
  const required = phaseFiles(phase);
  assertRequiredFiles(required);
  const deadline = Date.now() + budgets[phase] - CLEANUP_RESERVE_MS;
  const parent = resolve(root, '.artifacts/auth-transition');
  mkdirSync(parent, { recursive: true });
  const evidenceDir = mkdtempSync(resolve(parent, 'run-'));
  const reporter = resolve(
    root,
    'scripts/auth-transition-evidence-reporter.mjs',
  );
  const readEvidence = (file, paths, browser = false) =>
    assertCaseEvidence(
      JSON.parse(readFileSync(file, 'utf8')),
      requiredCases(paths, browser),
    );
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const run = (command, args, env = {}) => {
    // pnpm is a .cmd shim on Windows and cannot be spawned without a shell;
    // run its JS entry with the current Node instead when available.
    const [executable, commandArgs] =
      command === 'pnpm' ? pnpmCommand(args) : [command, args];
    return runOwnedCommand(executable, commandArgs, {
      env: { ...process.env, ...env },
      timeoutMs: deadline - Date.now(),
      signal: controller.signal,
      cleanupDeadline: deadline + CLEANUP_RESERVE_MS,
    });
  };
  const {
    apiTests,
    webUnit,
    browser: browserSpecs,
    scripts,
  } = partition(required);
  try {
    for (const [index, script] of scripts.entries()) {
      const report = resolve(evidenceDir, `node-${index}.json`);
      await run(
        process.execPath,
        [
          '--test',
          '--test-isolation=none',
          '--test-timeout=30000',
          '--test-reporter=spec',
          '--test-reporter=./scripts/auth-transition-node-reporter.mjs',
          '--test-reporter-destination=stdout',
          '--test-reporter-destination=stdout',
          script,
        ],
        { AUTH_TRANSITION_CASE_REPORT: report },
      );
      readEvidence(report, [script]);
    }
    if (webUnit.length) {
      const report = resolve(evidenceDir, 'web.json');
      await run(
        'pnpm',
        [
          '--filter',
          '@wedding/web',
          'exec',
          'vitest',
          'run',
          '--configLoader',
          'runner',
          '--reporter=default',
          `--reporter=${reporter}`,
          ...webUnit,
        ],
        { AUTH_TRANSITION_CASE_REPORT: report },
      );
      readEvidence(
        report,
        webUnit.map((file) => `apps/web/${file}`),
      );
    }
    if (apiTests.length) {
      const report = resolve(evidenceDir, 'api.json');
      await withTestSchema({
        databaseUrl: process.env.IAM_TEST_DATABASE_URL,
        run: (env) =>
          run(
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
              '--reporter=default',
              `--reporter=${reporter}`,
              ...apiTests,
            ],
            { ...env, AUTH_TRANSITION_CASE_REPORT: report },
          ),
      });
      readEvidence(
        report,
        apiTests.map((file) => `apps/api/${file}`),
      );
    }
    const needsStack = browserSpecs.some(
      (spec) => !spec.endsWith('suite-self-check.spec.ts'),
    );
    const browserReport = resolve(evidenceDir, 'browser.json');
    const playwright = async (env = {}) => {
      await run(
        'pnpm',
        [
          '--filter',
          '@wedding/web',
          'exec',
          'playwright',
          'test',
          '-c',
          'playwright.auth-transition.config.ts',
          `--reporter=list,${reporter}`,
          ...browserSpecs.map((spec) =>
            spec.replace(/^tests\/auth-transition\//, ''),
          ),
        ],
        { ...env, AUTH_TRANSITION_CASE_REPORT: browserReport },
      );
      readEvidence(
        browserReport,
        browserSpecs.map((file) => `apps/web/${file}`),
        true,
      );
    };
    if (
      browserSpecs.length &&
      needsStack &&
      !process.env.AUTH_TRANSITION_WEB_URL
    )
      // Owned stack: disposable schema + migrations + API harness + web dev,
      // always stopped and dropped by this run (scripts/auth-transition-stack.mjs).
      await withAuthTransitionStack({
        withWeb: true,
        deadline,
        cleanupDeadline: deadline + CLEANUP_RESERVE_MS,
        signal: controller.signal,
        run: ({ apiUrl, providerUrl, webUrl, proxyPort }) =>
          playwright({
            AUTH_TRANSITION_API_URL: apiUrl,
            AUTH_TRANSITION_PROVIDER_URL: providerUrl,
            AUTH_TRANSITION_WEB_URL: webUrl,
            AUTH_TRANSITION_PROXY_PORT: String(proxyPort),
          }),
      });
    else if (browserSpecs.length) await playwright();
    if (phase === 'all')
      for (const command of [
        'format:check',
        'lint',
        'typecheck',
        'test',
        'build',
        'scope:check',
      ])
        await run('pnpm', [command]);
    console.log(
      `auth-transition phase ${phase}: PASS (automated checks; runtime evidence recorded separately in validation-results.md).`,
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
    const safe =
      /^(Usage:|Unknown auth-transition|Missing required|Set IAM_TEST_DATABASE_URL|IAM_TEST_DATABASE_URL must|Set AUTH_TRANSITION_WEB_URL|auth-transition stack|IAM validation|pnpm:|Unable to start|Could not stop)/.test(
        error.message,
      );
    console.error(
      safe
        ? error.message
        : 'auth-transition validation failed; inspect the bounded test output.',
    );
    process.exitCode = 1;
  }
}

export { root };
