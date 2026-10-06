// Test-only configuration; never imported by application runtime.
const { randomUUID, randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { clientFor, cleanupPrefix } = require('./builder-test-storage.cjs');

const fields = [
  'ENDPOINT',
  'REGION',
  'BUCKET',
  'ACCESS_KEY_ID',
  'SECRET_ACCESS_KEY',
  'FORCE_PATH_STYLE',
];
function invalid(name) {
  throw new Error(`Invalid builder test configuration: ${name}`);
}
function testStorage(env) {
  const result = {};
  for (const field of fields) {
    const name = `BUILDER_TEST_S3_${field}`;
    const value = env[name];
    if (typeof value !== 'string' || !value || value.trim() !== value)
      invalid(name);
    result[field] = value;
  }
  let endpoint;
  try {
    endpoint = new URL(result.ENDPOINT);
  } catch {
    invalid('BUILDER_TEST_S3_ENDPOINT');
  }
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash
  )
    invalid('BUILDER_TEST_S3_ENDPOINT');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(result.REGION))
    invalid('BUILDER_TEST_S3_REGION');
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(result.BUCKET) ||
    !env.BUILDER_S3_BUCKET ||
    result.BUCKET === env.BUILDER_S3_BUCKET
  )
    invalid('BUILDER_TEST_S3_BUCKET/BUILDER_S3_BUCKET');
  if (!['true', 'false'].includes(result.FORCE_PATH_STYLE))
    invalid('BUILDER_TEST_S3_FORCE_PATH_STYLE');
  if (
    result.ACCESS_KEY_ID === env.BUILDER_S3_ACCESS_KEY_ID ||
    result.SECRET_ACCESS_KEY === env.BUILDER_S3_SECRET_ACCESS_KEY
  )
    invalid('BUILDER_TEST_S3_ACCESS_KEY_ID/BUILDER_TEST_S3_SECRET_ACCESS_KEY');
  return result;
}

function fixtureEnvironment(
  env,
  { runId, scratch, renderOrigin = 'http://127.0.0.1:1' },
) {
  if (!/^[a-f0-9]{32}$/.test(runId) || !scratch) invalid('run ownership');
  const storage = testStorage(env);
  const result = {
    ...env,
    NODE_ENV: 'test',
    BUILDER_TEST_RUN_ID: runId,
    BUILDER_TEST_DEVELOPMENT_BUCKET: env.BUILDER_S3_BUCKET,
    BUILDER_TEST_SCRATCH: scratch,
    BUILDER_S3_PREFIX: `tests/${runId}/`,
    BUILDER_RENDER_ORIGIN: renderOrigin,
    BUILDER_RATE_HMAC_KEY: randomBytes(32).toString('base64'),
  };
  for (const field of fields) result[`BUILDER_S3_${field}`] = storage[field];
  delete result.BUILDER_S3_SESSION_TOKEN;
  delete result.MINIO_ROOT_USER;
  delete result.MINIO_ROOT_PASSWORD;
  return result;
}

/** Explicit IAM test fixtures need valid config, but no live object storage. */
function offlineEnvironment() {
  const runId = randomUUID().replaceAll('-', '');
  return {
    BUILDER_S3_ENDPOINT: 'http://127.0.0.1:1',
    BUILDER_S3_REGION: 'us-east-1',
    BUILDER_S3_BUCKET: `builder-offline-${runId}`,
    BUILDER_S3_PREFIX: `tests/${runId}/`,
    BUILDER_S3_FORCE_PATH_STYLE: 'true',
    BUILDER_S3_ACCESS_KEY_ID: `offline-${runId}`,
    BUILDER_S3_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'),
    BUILDER_RENDER_ORIGIN: 'http://127.0.0.1:1',
    BUILDER_RATE_HMAC_KEY: randomBytes(32).toString('base64'),
  };
}

async function main(args, parent = process.env) {
  const hardDeadline = Date.now() + 300_000;
  if (!args.length || parent.NODE_ENV === 'production')
    invalid('command/NODE_ENV');
  // Validate BEFORE allocating scratch or spawning any child.
  testStorage(parent);
  const runId = randomUUID().replaceAll('-', '');
  const scratch = await mkdtemp(join(tmpdir(), `builder-test-${runId}-`));
  const env = fixtureEnvironment(parent, { runId, scratch });
  delete env.IAM_TEST_SCHEMA;
  delete env.BUILDER_TEST_SCHEMA;
  let child;
  const stop = () => {
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const timer = setTimeout(
    stop,
    Math.max(1, hardDeadline - Date.now() - 30_000),
  );
  try {
    await new Promise((resolve, reject) => {
      child = spawn(args[0], args.slice(1), {
        env,
        stdio: 'inherit',
        shell: false,
        detached: true,
      });
      child.once('error', () =>
        reject(new Error('Builder test child could not start.')),
      );
      child.once('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error('Builder test child failed.')),
      );
    });
  } finally {
    stop();
    clearTimeout(timer);
    const client = clientFor(env);
    try {
      await cleanupPrefix({
        client,
        bucket: env.BUILDER_S3_BUCKET,
        prefix: env.BUILDER_S3_PREFIX,
        runId,
        deadline: Math.min(hardDeadline, Date.now() + 30_000),
      });
    } catch {
      console.error(
        `cleanup: FAILED bucket=${env.BUILDER_S3_BUCKET} prefix=${env.BUILDER_S3_PREFIX} remaining=unknown reason=storage cleanup unavailable`,
      );
      process.exitCode = 1;
    } finally {
      client.destroy();
      await rm(scratch, { recursive: true, force: true });
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  }
}
module.exports = {
  fields,
  testStorage,
  fixtureEnvironment,
  offlineEnvironment,
};
if (require.main === module)
  main(process.argv.slice(2)).catch(() => {
    console.error(
      'Builder test wrapper failed; use validate:builder for storage suites.',
    );
    process.exitCode = 1;
  });
