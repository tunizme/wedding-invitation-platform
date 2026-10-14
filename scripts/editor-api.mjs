import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { withOwnedResources } from './builder-validate.mjs';
import { pnpmCommand } from './auth-transition-stack.mjs';
const root = resolve(import.meta.dirname, '..');
const env =
  process.env.EDITOR_TEST_ENV ??
  resolve(root, '.artifacts/responsive/runtime.env');
if (!process.env.BUILDER_TEST_DATABASE_URL && existsSync(env))
  process.loadEnvFile(env);
try {
  await withOwnedResources({
    env: process.env,
    budgetMs: 240000,
    artifactsRoot: resolve(root, '.artifacts/editor/api'),
    run: async (context) => {
      // Node cannot spawn pnpm.cmd without a shell on Windows; run its JS entry.
      const [pnpm, pnpmArgs] = pnpmCommand([
        '--filter',
        '@wedding/api',
        'exec',
        'vitest',
        'run',
        '--configLoader',
        'runner',
        '--maxWorkers=1',
        ...(process.argv.find((arg) => arg.startsWith('--file='))
          ? [process.argv.find((arg) => arg.startsWith('--file=')).slice(7)]
          : process.argv.includes('--all-builder')
            ? [
                'test/contract/invitation-builder',
                'test/integration/invitation-builder',
              ]
            : [
                '--project',
                'integration',
                'test/integration/invitation-builder/interactions.spec.ts',
              ]),
      ]);
      await context.command(process.execPath, [
        'apps/api/scripts/with-test-iam.cjs',
        pnpm,
        ...pnpmArgs,
      ]);
    },
  });
  console.log(
    'Editor API: PASS; owned schema/storage/process cleanup verified',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
