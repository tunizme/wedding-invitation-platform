import { withTestSchema, runCommand } from './iam-validate.mjs';

// The HTTP smoke script covers registration/mail plus CSP-1 context, intent,
// login, refresh and logout flow in its disposable IAM schema.
try {
  await withTestSchema({
    databaseUrl: process.env.IAM_TEST_DATABASE_URL,
    run: (env) =>
      runCommand(
        'node',
        [
          'apps/api/scripts/with-test-iam.cjs',
          'node',
          'apps/api/scripts/validate-registration-mail.cjs',
        ],
        { env: { ...process.env, ...env }, timeoutMs: 60_000 },
      ),
  });
} catch {
  console.error(
    'IAM Mailpit smoke failed. Check the test PostgreSQL URL, API build and local Mailpit availability.',
  );
  process.exitCode = 1;
}
