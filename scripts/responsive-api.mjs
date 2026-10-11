import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { withOwnedResources } from './builder-validate.mjs';
import { root } from './responsive-validate.mjs';
const suites = {
  regression: [
    'test/contract/invitation-builder',
    'test/integration/invitation-builder',
    'test/contract/invitations',
    'test/integration/invitations',
    'test/contract/invitation-assets',
    'test/integration/invitation-assets',
  ],
  customer: ['test/contract/invitation-builder/responsive-customer.spec.ts'],
  publication: [
    'test/contract/invitation-builder/responsive-publication.spec.ts',
    'test/integration/invitation-builder/responsive-publication-races.spec.ts',
  ],
  persistence: [
    'test/integration/invitation-builder/responsive-migration.spec.ts',
    'test/integration/invitation-builder/responsive-reference-races.spec.ts',
  ],
};
const suite = process.argv[3];
if (!suites[suite]) throw new Error('Unsupported responsive API suite');
const envFile =
  process.env.RESPONSIVE_TEST_ENV ??
  resolve(root, '.artifacts/builder/test-runtime.env');
if (!process.env.BUILDER_TEST_DATABASE_URL && existsSync(envFile))
  process.loadEnvFile(envFile);
try {
  await withOwnedResources({
    env: process.env,
    budgetMs: 850000,
    artifactsRoot: resolve(root, '.artifacts/responsive', `api-${suite}`),
    run: async (context) => {
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
        ...(suite === 'persistence' ? ['--project', 'integration'] : []),
        ...suites[suite],
      ]);
    },
  });
  console.log(
    `Responsive ${suite}: PASS; isolated SQL/storage/process cleanup verified`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
