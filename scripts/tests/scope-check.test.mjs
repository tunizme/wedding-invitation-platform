import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasForbiddenScope,
  isScopePath,
  scopeViolations,
} from '../scope-check.mjs';

test('scope scanner tolerates deleted files still present in the Git index', () => {
  assert.deepEqual(
    scopeViolations(['apps/web/src/__deleted_scope_fixture__.tsx']),
    [],
  );
});

test('scope scanner only covers source and direct manifests', () => {
  assert.equal(isScopePath('apps/web/src/app/page.tsx'), true);
  assert.equal(isScopePath('apps/api/package.json'), true);
  assert.equal(isScopePath('docs/payment-notes.md'), false);
  assert.equal(isScopePath('specs/001-project-foundation/spec.md'), false);
  assert.equal(isScopePath('apps/api/test/payment.spec.ts'), false);
  assert.equal(isScopePath('pnpm-lock.yaml'), false);
});

test('scope scanner recognizes excluded feature implementation terms', () => {
  assert.equal(hasForbiddenScope('const vnpayClient = createClient()'), true);
  assert.equal(hasForbiddenScope('payment provider'), true);
  assert.equal(hasForbiddenScope('export class HealthService {}'), false);
});

test('feature 004 approves invitation editing and private object storage', () => {
  assert.equal(hasForbiddenScope('invitation editor'), false);
  assert.equal(
    hasForbiddenScope('Craft.js Moveable MinIO S3 AssetStore'),
    false,
  );
  assert.equal(hasForbiddenScope('invitation editor payment provider'), true);
  assert.equal(hasForbiddenScope('invitation editor VNPay'), true);
});

test('approved IAM authentication and authorization are in scope', () => {
  assert.equal(hasForbiddenScope('authentication authorization'), false);
  assert.equal(hasForbiddenScope('Google Facebook email verification'), false);
  assert.equal(hasForbiddenScope('authentication with payment provider'), true);
});
