import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { builderRuntimeFixture } from './fixtures/invitation-builder/runtime';

export function identityFixture(): Record<string, string> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const keys = () =>
    JSON.stringify({ '1': randomBytes(32).toString('base64') });
  return {
    ...builderRuntimeFixture(),
    NODE_ENV: 'test',
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
    FRONTEND_ORIGIN: 'http://localhost:3000',
    API_PUBLIC_ORIGIN: 'http://localhost:3001',
  };
}
