import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  withOwnedResources,
  freePort,
  healthy,
  browserServer,
} from './builder-validate.mjs';
import { parityProxy } from './responsive-parity-proxy.mjs';
import { root } from './responsive-validate.mjs';
const suites = {
  publication: 'responsive-publication.spec.ts',
  customer: 'responsive-customer.spec.ts',
  authoring: 'responsive-authoring.spec.ts',
};
const suite = process.argv[3];
if (
  !suites[suite] ||
  !existsSync(resolve(root, 'apps/web/e2e/invitation-builder', suites[suite]))
)
  throw new Error('Missing real product suite prerequisite');
const envFile =
  process.env.RESPONSIVE_TEST_ENV ??
  resolve(root, '.artifacts/responsive/runtime.env');
if (!process.env.BUILDER_TEST_DATABASE_URL && existsSync(envFile))
  process.loadEnvFile(envFile);
try {
  await withOwnedResources({
    env: process.env,
    budgetMs: 850000,
    artifactsRoot: resolve(root, '.artifacts/responsive', suite),
    run: async (context) => {
      const apiPort = await freePort(),
        webPort = await freePort();
      Object.assign(context.env, {
        API_PORT: String(apiPort),
        WEB_PORT: String(webPort),
        API_PUBLIC_ORIGIN: `http://127.0.0.1:${apiPort}`,
        FRONTEND_ORIGIN: `http://127.0.0.1:${webPort}`,
        NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
        API_INTERNAL_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1`,
        BUILDER_RENDER_ORIGIN: `http://127.0.0.1:${webPort}`,
        BUILDER_ENABLE_PUBLICATION_WORKER: 'true',
        BUILDER_TEST_BROWSER_MODE:
          process.env.RESPONSIVE_TEST_BROWSER_MODE ?? 'docker',
        BUILDER_TEST_BROWSER_SEED: join(
          context.scratch,
          'responsive-seed.json',
        ),
      });
      if (suite !== 'publication') {
        context.env.RESPONSIVE_PARITY_AS_OF = new Date().toISOString();
        context.env.API_INTERNAL_BASE_URL = await parityProxy(
          context,
          context.env.API_PUBLIC_ORIGIN,
          context.env.RESPONSIVE_PARITY_AS_OF,
        );
      }
      await context.command('pnpm', [
        '--filter',
        '@wedding/api',
        'migration:run',
      ]);
      if (suite === 'customer')
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
          'test/contract/invitation-builder/responsive-customer.spec.ts',
        ]);
      if (suite === 'customer')
        await context.command('pnpm', [
          '--filter',
          '@wedding/web',
          'test',
          'tests/invitation-builder/responsive-customer.test.tsx',
          'tests/invitation-builder/customer-form.test.tsx',
          'tests/invitation-builder/customer-form-owner.test.tsx',
        ]);
      if (suite === 'authoring') {
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
          'test/contract/invitation-builder/responsive-authoring.spec.ts',
        ]);
        await context.command('pnpm', [
          '--filter',
          '@wedding/web',
          'test',
          'tests/invitation-builder/section-authoring.test.tsx',
        ]);
      }
      await context.command('pnpm', ['build:api']);
      await context.command('pnpm', ['build:web']);
      // The seed owns synthetic actors only; disable pumping until the runtime is healthy.
      await context.command(
        'node',
        [
          'apps/api/scripts/with-test-iam.cjs',
          'pnpm',
          '--filter',
          '@wedding/api',
          'exec',
          'vitest',
          'run',
          '--configLoader',
          'runner',
          '--config',
          'test/fixtures/invitation-builder/responsive-browser-seed.config.ts',
        ],
        { env: { ...context.env, BUILDER_ENABLE_PUBLICATION_WORKER: 'false' } },
      );
      await browserServer(context);
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
        `${context.env.API_PUBLIC_ORIGIN}/api/v1/health/ready`,
        context,
        backend,
      );
      await healthy(
        `${context.env.FRONTEND_ORIGIN}/api/health`,
        context,
        frontend,
      );
      for (const project of ['chromium', 'firefox', 'webkit']) {
        await context.command('node', [
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
            '--config=playwright.responsive.config.ts',
            `--project=${project}`,
          ],
          {
            env: {
              ...context.env,
              RESPONSIVE_SUITE: suite,
              RESPONSIVE_HOST_URL: context.env.FRONTEND_ORIGIN,
              RESPONSIVE_BROWSER_WS: context.env.BUILDER_TEST_BROWSER_WS,
              RESPONSIVE_ARTIFACTS: join(context.artifacts, project),
            },
          },
        );
      }
    },
  });
  console.log(
    `Responsive ${suite}: PASS; real API/SQL/publication/browser and owned cleanup verified`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
