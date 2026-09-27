const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const checks = [];
const test =
  require.main === module
    ? require('node:test').test
    : (name, run) => checks.push({ name, run });
module.exports = { checks };
const SwaggerParser = require('@apidevtools/swagger-parser');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { load } = require('js-yaml');

const contractPath = resolve(
  __dirname,
  '../../../specs/003-identity-access-management/contracts/identity-access.openapi.yaml',
);
const contract = load(readFileSync(contractPath, 'utf8'));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
// Translate local component references into a standard JSON Schema $defs bundle.
// Do not pass OpenAPI keywords to AJV or disable strict schema validation.
function toJsonSchema(value) {
  if (Array.isArray(value)) return value.map(toJsonSchema);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (key === '$ref') {
        assert.match(child, /^#\/components\/schemas\//);
        return [key, child.replace('#/components/schemas/', '#/$defs/')];
      }
      return [key, toJsonSchema(child)];
    }),
  );
}
ajv.addSchema({
  $id: 'urn:iam:schemas',
  $defs: toJsonSchema(contract.components.schemas),
});
const schema = (name) =>
  ajv.compile({ $ref: `urn:iam:schemas#/$defs/${name}` });
module.exports.validateSchema = (name, value) => schema(name)(value);

test('OpenAPI 3.1 document validates without external reference resolution', async () => {
  assert.equal(contract.openapi, '3.1.0');
  await SwaggerParser.validate(structuredClone(contract), {
    resolve: { external: false },
  });
});

test('every component schema compiles under JSON Schema 2020-12', () => {
  const names = Object.keys(contract.components.schemas);
  assert.ok(names.length > 0);
  for (const name of names) assert.equal(typeof schema(name), 'function');
});

const customer = {
  id: 'b8f83023-4db8-4a4f-88b9-5d78a3eb9581',
  email: 'customer@example.test',
  emailVerified: true,
  loginMethod: 'LOCAL',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  displayName: null,
  phoneNumber: null,
  avatarUrl: null,
  createdAt: '2026-09-26T00:00:00Z',
  updatedAt: '2026-09-26T00:00:00Z',
};

test('AdminCustomer accepts the complete safe fixture', () => {
  const validate = schema('AdminCustomer');
  assert.equal(validate(customer), true, JSON.stringify(validate.errors));
});

for (const field of ['createdAt', 'updatedAt']) {
  test(`AdminCustomer rejects missing ${field}`, () => {
    const fixture = { ...customer };
    delete fixture[field];
    const validate = schema('AdminCustomer');
    assert.equal(validate(fixture), false);
    assert.ok(validate.errors.some((error) => error.keyword === 'required'));
  });
}

for (const field of [
  'password',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'identity',
  'unknown',
]) {
  test(`AdminCustomer rejects additional field ${field}`, () => {
    const validate = schema('AdminCustomer');
    assert.equal(
      validate({ ...customer, [field]: 'synthetic-test-value' }),
      false,
    );
    assert.ok(
      validate.errors.some((error) => error.keyword === 'additionalProperties'),
    );
  });
}

test('onboarding conflict is documented only after proof and browser binding', () => {
  const operation =
    contract.paths['/auth/social-onboarding/verifications/confirm'].post;
  assert.deepEqual(operation.security, [
    { onboardingCookie: [], csrfHeader: [] },
  ]);
  assert.ok(operation.responses['400']);
  assert.ok(operation.responses['403']);
  const conflict = operation.responses['409'];
  assert.match(
    conflict.description,
    /After valid proof and browser binding only/,
  );
  assert.match(conflict.description, /ONBOARDING_CANNOT_COMPLETE/);
  const validate = schema('Problem');
  assert.equal(
    validate({
      type: 'about:blank',
      title: 'Không thể hoàn tất đăng ký',
      status: 409,
      code: 'ONBOARDING_CANNOT_COMPLETE',
      requestId: 'synthetic-request',
    }),
    true,
    JSON.stringify(validate.errors),
  );
});

test('logout contract protects active revocation and permits no-session cleanup', () => {
  const operation = contract.paths['/auth/logout'].post;
  assert.deepEqual(operation.security, [
    { refreshCookie: [], csrfHeader: [] },
    {},
  ]);
  assert.match(
    operation.description,
    /Exact allowed Origin is always required/,
  );
  assert.match(operation.description, /active session requires both/);
  assert.match(
    operation.description,
    /no-active-session branch, never to active revocation/,
  );
  assert.ok(operation.responses['204'].headers['Set-Cookie']);
  assert.ok(operation.responses['403']);
});
