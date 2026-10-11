import { resolve } from 'node:path';
import {
  withOwnedResources,
  browserServer,
  freePort,
} from './builder-validate.mjs';
import { root } from './responsive-validate.mjs';
process.loadEnvFile(resolve(root, '.artifacts/responsive/runtime.env'));
process.loadEnvFile(resolve(root, '.artifacts/auth-transition/persistent.env'));
const frontend = process.argv.includes('--frontend');
try {
  await withOwnedResources({
    env: { ...process.env, BUILDER_TEST_BROWSER_MODE: 'docker' },
    budgetMs: frontend ? 3000000 : 3900000,
    artifactsRoot: resolve(root, '.artifacts/responsive/auth-regression'),
    run: async (context) => {
      await browserServer(context);
      const authEnv = {
        ...context.env,
        AUTH_TRANSITION_FAIL_FAST: '1',
        AUTH_TRANSITION_BROWSER_WS: context.env.BUILDER_TEST_BROWSER_WS,
        FRONTEND_TEST_BROWSER_WS: context.env.BUILDER_TEST_BROWSER_WS,
        FRONTEND_TEST_FAIL_FAST: '1',
      };
      for (const key of [
        'AUTH_TRANSITION_WEB_URL',
        'AUTH_TRANSITION_API_URL',
        'AUTH_TRANSITION_PROVIDER_URL',
      ])
        authEnv[key] = '';
      for (const key of [
        'AUTH_TRANSITION_WEB_PORT',
        'AUTH_TRANSITION_API_PORT',
        'AUTH_TRANSITION_PROXY_PORT',
        'AUTH_TRANSITION_PROVIDER_PORT',
      ])
        authEnv[key] = String(await freePort());
      for (const key of Object.keys(authEnv))
        if (key.startsWith('BUILDER_TEST_')) delete authEnv[key];
      if (frontend) {
        for (const [key, value] of Object.entries(process.env))
          if (
            key === 'BUILDER_TEST_DATABASE_URL' ||
            key.startsWith('BUILDER_TEST_S3_') ||
            key.startsWith('BUILDER_S3_')
          )
            authEnv[key] = value;
      }
      await context.command(
        'node',
        [
          frontend
            ? 'scripts/frontend-validate.mjs'
            : 'scripts/auth-transition-validate.mjs',
          '--phase',
          'all',
        ],
        { env: authEnv },
      );
    },
  });
  console.log(
    'Responsive auth regression: PASS; owned browser cleanup verified',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
