const assert = require('node:assert/strict');
const checks = [];
const test =
  require.main === module
    ? require('node:test').test
    : (name, run) => checks.push({ name, run });
module.exports = { checks };

test('IAM dependencies support the pinned Node 24 CommonJS backend', () => {
  assert.equal(process.versions.node.split('.')[0], '24');
  for (const name of [
    '@nestjs/jwt',
    'jsonwebtoken',
    'google-auth-library',
    'nodemailer',
    'resend',
  ]) {
    assert.ok(require(name));
  }
});

test('native Argon2id roundtrip preserves Unicode and whitespace', async () => {
  const argon2 = require('argon2');
  const password = '  mật-khẩu-🔐  ';
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
  const [, algorithm, version, parameters] = hash.split('$');
  assert.equal(algorithm, 'argon2id');
  assert.equal(version, 'v=19');
  assert.deepEqual(parameters.split(',').sort(), ['m=19456', 'p=1', 't=2']);
  assert.equal(await argon2.verify(hash, password), true);
  assert.equal(await argon2.verify(hash, password.trim()), false);
});
