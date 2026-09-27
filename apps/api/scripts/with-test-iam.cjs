// Explicit local/CI wrapper. Runtime startup never creates fallback keys.
const { generateKeyPairSync, randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
if (!args.length || process.env.NODE_ENV === 'production') {
  console.error(
    'Run with-test-iam only in an explicitly non-production test environment and supply a command.',
  );
  process.exit(1);
}
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const keys = () => JSON.stringify({ 1: randomBytes(32).toString('base64') });
const child = spawn(args[0], args.slice(1), {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    IAM_KEY_VERSION: '1',
    API_PUBLIC_ORIGIN: process.env.API_PUBLIC_ORIGIN ?? 'http://localhost:3001',
    FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    IAM_JWT_ISSUER: 'https://test.invalid',
    IAM_JWT_AUDIENCE: 'wedding-test',
    IAM_JWT_KID: 'test',
    IAM_JWT_PRIVATE_KEY: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    IAM_JWT_PUBLIC_KEYS: JSON.stringify({
      test: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }),
    IAM_REFRESH_KEYS: keys(),
    IAM_CSRF_KEYS: keys(),
    IAM_ENCRYPTION_KEYS: keys(),
    IAM_RATE_KEYS: keys(),
    IAM_GOOGLE_ENABLED: 'false',
    IAM_FACEBOOK_ENABLED: 'false',
    IAM_EMAIL_TRANSPORT: 'smtp',
    IAM_EMAIL_FROM: 'no-reply@wedding.test',
  },
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Could not launch IAM test command');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
