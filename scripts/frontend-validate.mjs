import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  withOwnedResources,
  browserServer as startOwnedBrowser,
  freePort,
  assertRequiredFiles,
} from './builder-validate.mjs';
import {
  pnpmCommand,
  runOwnedCommand,
  waitForLive,
  createOwnedNextTsconfig,
  stopOwnedProcess,
} from './auth-transition-stack.mjs';
import { assertCaseEvidence } from './auth-transition-validate.mjs';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function ownedCleanupStatus(directory) {
  try {
    const reports = existsSync(directory)
      ? readdirSync(directory).map((run) =>
          join(directory, run, 'cleanup.json'),
        )
      : [];
    return reports.length > 0 &&
      reports.every(
        (file) =>
          existsSync(file) &&
          JSON.parse(readFileSync(file, 'utf8')).status === 'PASS',
      )
      ? 'PASS'
      : 'FAILED_OR_UNKNOWN';
  } catch {
    return 'FAILED_OR_UNKNOWN';
  }
}
export const stories = [
  'US1',
  'US2',
  'US3',
  'US4',
  'US5',
  'US6',
  'US7',
  'US8',
  'US9',
  'US10',
];
export const budgets = {
  unit: 600000,
  browser: 1200000,
  package: 900000,
  all: 2700000,
};
const web = (name) => `apps/web/tests/${name}`;
const e2e = (name) => `apps/web/e2e/frontend-foundation/${name}.spec.ts`;
export const registry = {
  US1: {
    unit: [
      web('identity-access/session.test.tsx'),
      web('identity-access/request-scope.test.ts'),
      web('identity-access/private-lifetimes.test.tsx'),
      web('identity-access/profile.test.tsx'),
      web('identity-access/login.test.tsx'),
      web('identity-access/social-onboarding.test.tsx'),
      web('identity-access/admin.test.tsx'),
      web('invitation-builder/client.test.ts'),
      web('invitation-builder/customer-form.test.tsx'),
      web('invitation-builder/publication-controls.test.tsx'),
      web('invitation-builder/asset-preview.test.tsx'),
      web('invitation-builder/rsvp.test.tsx'),
      web('invitation-builder/template-owner.test.tsx'),
      web('invitation-builder/asset-library-owner.test.tsx'),
      web('invitation-builder/customer-form-owner.test.tsx'),
    ],
    browser: [e2e('principal-isolation')],
    package: [],
  },
  US2: {
    unit: [
      web('frontend-foundation/surface-boundaries.test.tsx'),
      web('invitation-builder/font-readiness.test.ts'),
    ],
    browser: [e2e('surface-isolation')],
    package: [e2e('packaged-fonts')],
  },
  US3: {
    unit: [
      web('frontend-foundation/platform-controls.test.tsx'),
      web('identity-access/verification.test.tsx'),
      web('identity-access/auth-recovery.test.tsx'),
      web('identity-access/register.test.tsx'),
    ],
    browser: [
      e2e('account-journeys'),
      e2e('keyboard-journeys'),
      e2e('template-style-isolation'),
    ],
    package: [e2e('packaged-fonts')],
  },
  US4: {
    unit: [
      web('frontend-foundation/modal-surface.test.tsx'),
      web('invitation-builder/assets.test.tsx'),
      web('invitation-builder/binding-panel.test.tsx'),
      web('invitation-builder/bindings.test.ts'),
    ],
    browser: [e2e('media-library')],
    package: [],
  },
  US5: {
    unit: [
      web('foundation-page.test.tsx'),
      web('frontend-foundation/product-shell.test.tsx'),
    ],
    browser: [],
    package: [],
  },
  US6: {
    unit: [
      web('invitation-builder/template-owner.test.tsx'),
      web('invitation-builder/pagination.test.tsx'),
    ],
    browser: [e2e('product-experience')],
    package: [],
  },
  US8: {
    unit: [
      web('invitation-builder/event-local-time.test.ts'),
      web('invitation-builder/customer-form.test.tsx'),
      web('invitation-builder/asset-library-owner.test.tsx'),
    ],
    browser: [e2e('product-editor'), e2e('prototype-parity')],
    package: [],
  },
  US9: {
    unit: [
      web('invitation-builder/admin-template-pages.test.tsx'),
      web('invitation-builder/template-owner.test.tsx'),
      web('invitation-builder/pagination.test.tsx'),
    ],
    browser: [e2e('prototype-parity')],
    package: [],
  },
  US10: {
    unit: [web('frontend-foundation/product-shell.test.tsx')],
    browser: [e2e('prototype-parity')],
    package: [e2e('packaged-fonts')],
  },
  US7: {
    unit: [
      web('invitation-builder/customer-form.test.tsx'),
      web('invitation-builder/rsvp.test.tsx'),
    ],
    browser: [e2e('product-editor')],
    package: [],
  },
};
export function selection(args) {
  if (args[0] === '--') args = args.slice(1);
  if (
    ![2, 4].includes(args.length) ||
    args[0] !== '--phase' ||
    !Object.hasOwn(budgets, args[1]) ||
    (args.length === 4 &&
      !(
        (args[2] === '--through' && stories.includes(args[3])) ||
        (args[2] === '--story' &&
          ['US6', 'US7', 'US8', 'US9', 'US10'].includes(args[3]) &&
          ['unit', 'browser'].includes(args[1]))
      )) ||
    (args[1] === 'all' && args.length === 4)
  )
    throw new Error(
      'Usage: validate:frontend --phase unit|browser|package|all [--through US1|US2|US3|US4|US5|US6|US7|US8|US9|US10]; all rejects through/story; unit/browser allow --story US6|US7|US8|US9|US10 (PARTIAL).',
    );
  const phase = args[1],
    isolated = args[2] === '--story' ? args[3] : undefined,
    through = isolated ? undefined : args[3];
  if (phase === 'package' && through === 'US1')
    throw new Error(
      'Package coverage starts at US2; package-through-US1 cannot provision resources.',
    );
  const selectedStories = isolated
    ? [isolated]
    : stories.slice(0, through ? stories.indexOf(through) + 1 : stories.length);
  const phases = phase === 'all' ? ['unit', 'browser', 'package'] : [phase];
  const files = [
    ...new Set(
      selectedStories.flatMap((s) => phases.flatMap((p) => registry[s][p])),
    ),
  ];
  return {
    phase,
    through,
    isolated,
    stories: selectedStories,
    files,
    budgetMs: budgets[phase],
    coverage: through || isolated ? 'PARTIAL' : 'FULL',
    missingCoverage:
      through || isolated
        ? stories.filter((s) => !selectedStories.includes(s))
        : [],
  };
}
export function assertInventory(selected, directory = root) {
  assertRequiredFiles(selected.files, directory);
  const path = join(directory, 'scripts/frontend-cases.json');
  if (!existsSync(path))
    throw new Error(
      'Missing required fixed frontend case inventory: scripts/frontend-cases.json',
    );
  const inventory = JSON.parse(readFileSync(path, 'utf8'));
  for (const file of selected.files)
    if (!inventory[file]?.length)
      throw new Error(`Missing required frontend cases: ${file}`);
  return inventory;
}
export function assertBrowserCaseBudgets(selected, directory = root) {
  const ts = createRequire(join(root, 'apps/web/package.json'))('typescript');
  for (const file of selected.files.filter((file) => file.includes('/e2e/'))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(join(directory, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    if (source.parseDiagnostics.length)
      throw new Error(`Invalid browser suite syntax: ${file}`);
    const check = (value) => {
      if (
        !value ||
        !ts.isNumericLiteral(value) ||
        Number(value.text) > 30000 ||
        Number(value.text) <= 0
      )
        throw new Error(
          `Browser cases must have an explicit budget <=30s: ${file}`,
        );
    };
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const expression = node.expression.getText(source);
        if (
          (expression.startsWith('test.') ||
            expression.startsWith('testInfo.')) &&
          node.expression.name.text === 'setTimeout'
        )
          check(node.arguments[0]);
        if (expression === 'test.describe.configure') {
          const options = node.arguments[0];
          if (!options || !ts.isObjectLiteralExpression(options))
            throw new Error(
              `Browser cases require reviewable <=30s configuration: ${file}`,
            );
          for (const property of options.properties) {
            if (ts.isSpreadAssignment(property))
              throw new Error(
                `Browser cases cannot conceal a >30s override: ${file}`,
              );
            if (
              property.name?.getText(source).replaceAll(/['"]/g, '') ===
              'timeout'
            )
              check(property.initializer);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
export function expectedCases(selected, inventory, phase) {
  return selected.stories
    .flatMap((s) => registry[s][phase])
    .filter((f, i, a) => a.indexOf(f) === i)
    .flatMap((file) =>
      inventory[file]
        .filter(
          (row) =>
            typeof row === 'string' ||
            [row.story]
              .flat()
              .some((story) => selected.stories.includes(story)),
        )
        .flatMap((row) => {
          const name = typeof row === 'string' ? row : row.name;
          return phase === 'unit'
            ? [{ file, name }]
            : ['chromium', 'firefox', 'webkit'].map((project) => ({
                file,
                name,
                project,
              }));
        }),
    );
}
export async function validate(selected, env = process.env) {
  const inventory = assertInventory(selected); // fail before provisioning
  assertBrowserCaseBudgets(selected);
  const parent = join(root, '.artifacts/frontend-foundation');
  mkdirSync(parent, { recursive: true });
  const artifacts = mkdtempSync(join(parent, 'run-'));
  const report = { ...selected, result: 'FAIL', cleanup: 'NOT_REQUIRED' };
  const deadline = Date.now() + selected.budgetMs - 30000;
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const reporter = join(root, 'scripts/auth-transition-evidence-reporter.mjs');
  const run = async (args, extra = {}) => {
    const [cmd, argv] = pnpmCommand(args);
    await runOwnedCommand(cmd, argv, {
      cwd: root,
      env: { ...env, ...extra },
      timeoutMs: deadline - Date.now(),
      signal: controller.signal,
      cleanupDeadline: deadline + 30000,
    });
  };
  const verify = (file, phase) =>
    assertCaseEvidence(
      JSON.parse(readFileSync(file, 'utf8')),
      expectedCases(selected, inventory, phase),
    );
  try {
    if (['unit', 'all'].includes(selected.phase)) {
      const caseReport = join(artifacts, 'unit.json');
      await run(
        [
          '--filter',
          '@wedding/web',
          'exec',
          'vitest',
          'run',
          '--configLoader',
          'runner',
          `--reporter=${reporter}`,
          '--reporter=default',
          ...selected.stories
            .flatMap((s) => registry[s].unit)
            .map((f) => f.slice(9)),
        ],
        { AUTH_TRANSITION_CASE_REPORT: caseReport },
      );
      verify(caseReport, 'unit');
      for (const command of [
        'format:check:web',
        'lint:web',
        'typecheck:web',
        'test:web',
      ])
        await run([command]);
      const config = createOwnedNextTsconfig(join(root, 'apps/web'));
      try {
        await run(['build:web'], {
          NEXT_TSCONFIG_PATH: config.filename,
          NEXT_DIST_DIR: '.next-auth-transition-frontend-quality',
        });
      } finally {
        config.cleanup();
      }
      await run(['scope:check']);
    }
    if (['browser', 'package', 'all'].includes(selected.phase)) {
      report.cleanup = 'PENDING';
      await withOwnedResources({
        env,
        budgetMs: Math.max(30001, deadline + 30000 - Date.now()),
        artifactsRoot: join(artifacts, 'owned'),
        run: async (c) => {
          const apiPort = await freePort(),
            webPort = await freePort(),
            providerPort = await freePort();
          Object.assign(c.env, {
            PLAYWRIGHT_NO_COPY_PROMPT: '1',
            API_PORT: String(apiPort),
            HARNESS_PROVIDER_PORT: String(providerPort),
            FRONTEND_TEST_PROVIDER_URL: `http://127.0.0.1:${providerPort}`,
            BUILDER_ENABLE_PUBLICATION_WORKER: 'false',
            WEB_PORT: String(webPort),
            FRONTEND_ORIGIN: `http://127.0.0.1:${webPort}`,
            API_PUBLIC_ORIGIN: `http://127.0.0.1:${apiPort}`,
            NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
            API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
            BUILDER_RENDER_ORIGIN: `http://127.0.0.1:${webPort}`,
            FRONTEND_TEST_SEED: join(c.scratch, 'frontend-seed.json'),
            FRONTEND_TEST_WEB_URL: `http://127.0.0.1:${webPort}`,
            FRONTEND_TEST_API_URL: `http://127.0.0.1:${apiPort}`,
            FRONTEND_TEST_ARTIFACTS: artifacts,
          });
          if (c.env.BUILDER_TEST_BROWSER_MODE === 'docker') {
            await startOwnedBrowser(c);
            c.env.FRONTEND_TEST_BROWSER_WS = c.env.BUILDER_TEST_BROWSER_WS;
          }
          const command = async (args, extra = {}) => {
            const [cmd, argv] = pnpmCommand(args);
            await c.command(cmd, argv, { env: { ...c.env, ...extra } });
          };
          await command(['--filter', '@wedding/api', 'migration:run']);
          if (selected.stories.includes('US2')) {
            const publicationEvidence = join(artifacts, 'publication.json');
            const publicationFile =
              'apps/api/test/integration/invitation-builder/publication-races.spec.ts';
            const required = [
              'keeps the previous revision on font unavailable',
              'keeps the previous revision when a referenced image disappears before capture',
              'does not replace an existing public pointer while a new immutable candidate waits',
            ];
            await command(
              [
                '--filter',
                '@wedding/api',
                'exec',
                'vitest',
                'run',
                '--configLoader',
                'runner',
                '--project=integration',
                '--maxWorkers=1',
                'test/integration/invitation-builder/publication-races.spec.ts',
                '--reporter=default',
                `--reporter=${reporter}`,
              ],
              { AUTH_TRANSITION_CASE_REPORT: publicationEvidence },
            );
            assertCaseEvidence(
              JSON.parse(readFileSync(publicationEvidence, 'utf8')),
              required.map((name) => ({ file: publicationFile, name })),
            );
            report.publicationEvidence = 'PASS';
          }
          await command([
            '--filter',
            '@wedding/api',
            'exec',
            'vitest',
            'run',
            '--configLoader',
            'runner',
            '--maxWorkers=1',
            '--config',
            'test/fixtures/invitation-builder/frontend-seed.config.ts',
          ]);
          await command(['build:api']);
          const [apiCmd, apiArgs] = pnpmCommand([
            '--filter',
            '@wedding/api',
            'exec',
            'ts-node',
            '--transpile-only',
            'test/fixtures/identity-access/oauth-browser-harness.ts',
          ]);
          c.processes.start(
            process.execPath,
            ['apps/api/scripts/with-test-iam.cjs', apiCmd, ...apiArgs],
            {
              env: {
                ...c.env,
                BUILDER_ENABLE_PUBLICATION_WORKER: selected.stories.some(
                  (story) => ['US7', 'US8', 'US9', 'US10'].includes(story),
                )
                  ? 'true'
                  : 'false',
              },
            },
          );
          await waitForLive(
            `${c.env.API_PUBLIC_ORIGIN}/api/v1/health/ready`,
            c.workDeadline,
            c.signal,
          );
          let browserServer;
          for (const phase of selected.phase === 'all'
            ? ['browser', 'package']
            : [selected.phase]) {
            if (phase === 'browser') {
              const config = createOwnedNextTsconfig(join(root, 'apps/web'));
              c.extraCleanup.push(async () => config.cleanup());
              Object.assign(c.env, {
                NEXT_DIST_DIR: '.next-auth-transition-frontend-' + webPort,
                NEXT_TSCONFIG_PATH: config.filename,
              });
              const production = selected.stories.some((story) =>
                ['US7', 'US8', 'US9', 'US10'].includes(story),
              );
              const webEnv = {
                ...c.env,
                ...(production ? { NODE_ENV: 'production' } : {}),
              };
              if (production) {
                const [buildCmd, buildArgs] = pnpmCommand([
                  '--filter',
                  '@wedding/web',
                  'exec',
                  'next',
                  'build',
                ]);
                await c.command(buildCmd, buildArgs, { env: webEnv });
              }
              const [pnpm, pnpmArgs] = pnpmCommand([
                '--filter',
                '@wedding/web',
                'exec',
                'next',
                production ? 'start' : 'dev',
                '--hostname',
                '127.0.0.1',
                '--port',
                String(webPort),
              ]);
              browserServer = c.processes.start(pnpm, pnpmArgs, {
                env: webEnv,
              });
            } else {
              if (browserServer) {
                await stopOwnedProcess(browserServer, {
                  deadline: c.workDeadline,
                });
              }
              const packagePort = webPort;
              const image = `wedding-frontend-validation:${c.runId}`;
              const container = `frontend-validation-${c.runId}`;
              await c.command('docker', [
                'build',
                '--file',
                'apps/web/Dockerfile',
                '--tag',
                image,
                '--build-arg',
                `NEXT_PUBLIC_API_BASE_URL=${c.env.NEXT_PUBLIC_API_BASE_URL}`,
                '.',
              ]);
              c.extraCleanup.push((deadline) =>
                c.processes.run('docker', ['image', 'rm', image], {
                  deadline,
                  stdio: 'ignore',
                }),
              );
              c.extraCleanup.push((deadline) =>
                c.processes.run('docker', ['rm', '--force', container], {
                  deadline,
                  stdio: 'ignore',
                }),
              );
              c.env.FRONTEND_ORIGIN = `http://127.0.0.1:${packagePort}`;
              c.env.FRONTEND_TEST_WEB_URL = c.env.FRONTEND_ORIGIN;
              c.processes.start(
                'docker',
                [
                  'run',
                  '--name',
                  container,
                  '--init',
                  '--network',
                  'host',
                  '--env',
                  `PORT=${packagePort}`,
                  '--env',
                  `API_INTERNAL_BASE_URL=http://127.0.0.1:${apiPort}/api/v1`,
                  image,
                ],
                { env: c.env },
              );
            }
            await waitForLive(
              `${c.env.FRONTEND_ORIGIN}/api/health`,
              c.workDeadline,
              c.signal,
            );
            await command(['health'], { DATABASE_HEALTH_MODE: 'direct' });
            report.ownedHealth = [...(report.ownedHealth ?? []), phase];
            const file = join(artifacts, phase + '.json');
            const specs = [
              ...new Set(selected.stories.flatMap((s) => registry[s][phase])),
            ];
            const names = expectedCases(selected, inventory, phase).map(
              (c) => c.name,
            );
            const grep = [...new Set(names)]
              .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('|');
            // The full inventory exceeds the Windows command-line limit, so the
            // pattern travels in a file that playwright.frontend.config.ts reads.
            const grepFile = join(artifacts, phase + '.grep');
            writeFileSync(grepFile, grep);
            await command(
              [
                '--filter',
                '@wedding/web',
                'exec',
                'playwright',
                'test',
                '-c',
                'playwright.frontend.config.ts',
                `--reporter=list,${reporter}`,
                ...specs.map((f) => f.split('/').at(-1)),
              ],
              {
                FRONTEND_TEST_GREP_FILE: grepFile,
                AUTH_TRANSITION_CASE_REPORT: file,
                FRONTEND_TEST_THROUGH: selected.through ?? 'US4',
              },
            );
            verify(file, phase);
          }
        },
      });
      report.cleanup = 'PASS';
    }
    report.result = 'PASS';
  } catch (error) {
    if (report.cleanup === 'PENDING') {
      report.cleanup = ownedCleanupStatus(join(artifacts, 'owned'));
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    writeFileSync(
      join(artifacts, 'summary.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `frontend ${selected.phase} ${selected.coverage}: ${report.result}; cleanup=${report.cleanup}; report=${artifacts}`,
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await validate(selection(process.argv.slice(2)));
  } catch (error) {
    console.error(
      /^(Usage:|Missing required|Package coverage)/.test(error.message)
        ? error.message
        : 'Frontend validation failed; inspect bounded status output.',
    );
    process.exitCode = 1;
  }
}
