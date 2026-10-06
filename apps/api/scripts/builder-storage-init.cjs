// Explicit infrastructure provisioning, never called from application startup.
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

const CLIENT_IMAGE = 'wedding-builder-mc:2025-08-13';
function required(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new Error(`Invalid storage provisioning configuration: ${key}`);
  }
  return value;
}

function configuration(env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Local storage provisioning is unavailable in production.');
  }
  const rootUser = required(env, 'MINIO_ROOT_USER');
  const rootPassword = required(env, 'MINIO_ROOT_PASSWORD');
  const accounts = ['', 'TEST_'].map((kind) => {
    const base = `BUILDER_${kind}S3_`;
    const endpoint = required(env, `${base}ENDPOINT`);
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      /* handled below */
    }
    if (
      !url ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        `Invalid storage provisioning configuration: ${base}ENDPOINT`,
      );
    }
    const bucket = required(env, `${base}BUCKET`);
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
      throw new Error(
        `Invalid storage provisioning configuration: ${base}BUCKET`,
      );
    }
    const prefix = kind ? 'tests/' : required(env, 'BUILDER_S3_PREFIX');
    if (!/^(?:[a-zA-Z0-9_-]+\/)+$/.test(prefix) || prefix.length > 512) {
      throw new Error(
        'Invalid storage provisioning configuration: BUILDER_S3_PREFIX',
      );
    }
    const accessKey = required(env, `${base}ACCESS_KEY_ID`);
    const secretKey = required(env, `${base}SECRET_ACCESS_KEY`);
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(accessKey) || secretKey.length < 16) {
      throw new Error(
        `Invalid storage provisioning configuration: ${base}ACCESS_KEY_ID/${base}SECRET_ACCESS_KEY`,
      );
    }
    if (accessKey === rootUser || secretKey === rootPassword) {
      throw new Error(
        'Storage identities must be separate from infrastructure credentials.',
      );
    }
    const region = required(env, `${base}REGION`);
    if (
      region !== 'us-east-1' ||
      required(env, `${base}FORCE_PATH_STYLE`) !== 'true'
    ) {
      throw new Error(
        `Invalid local storage provisioning configuration: ${base}REGION/${base}FORCE_PATH_STYLE`,
      );
    }
    return {
      endpoint: url.origin,
      bucket,
      prefix,
      accessKey,
      secretKey,
      region,
    };
  });
  if (
    accounts[0].endpoint !== accounts[1].endpoint ||
    accounts[0].bucket === accounts[1].bucket ||
    accounts[0].accessKey === accounts[1].accessKey ||
    accounts[0].secretKey === accounts[1].secretKey
  ) {
    throw new Error(
      'Storage provisioning requires separate development/test buckets and identities on the local MinIO endpoint.',
    );
  }
  return { rootUser, rootPassword, accounts };
}

function policy(bucket, prefix) {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: ['s3:GetBucketLocation'],
        Resource: [`arn:aws:s3:::${bucket}`],
      },
      {
        Effect: 'Allow',
        Action: ['s3:ListBucket'],
        Resource: [`arn:aws:s3:::${bucket}`],
        Condition: { StringLike: { 's3:prefix': [`${prefix}*`] } },
      },
      {
        Effect: 'Allow',
        Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        Resource: [`arn:aws:s3:::${bucket}/${prefix}*`],
      },
    ],
  };
}

async function provision(env = process.env) {
  const hardDeadline = Date.now() + 60_000;
  const workDeadline = hardDeadline - 5_000;
  const config = configuration(env);
  const scratch = await mkdtemp(join(tmpdir(), 'builder-storage-init-'));
  const ownedContainers = new Set();
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const execute = (args, deadline = workDeadline, signal = controller.signal) =>
    new Promise((resolve, reject) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0 || signal?.aborted)
        return reject(
          new Error('Storage provisioning interrupted or timed out.'),
        );
      // Do not forward mc output or command arguments: either can contain secrets.
      const child = spawn('docker', args, { stdio: 'ignore', shell: false });
      const abort = () => child.kill('SIGKILL');
      const timer = setTimeout(abort, remaining);
      signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      child.once('error', () => {
        cleanup();
        reject(new Error('Storage provisioning could not start Docker.'));
      });
      child.once('close', (code) => {
        cleanup();
        code === 0
          ? resolve()
          : reject(
              new Error(
                'Storage provisioning command failed; check MinIO readiness and local credentials.',
              ),
            );
      });
    });
  const mc = async (...args) => {
    const name = `builder-storage-init-${randomUUID()}`;
    ownedContainers.add(name);
    await execute([
      'run',
      '--rm',
      '--name',
      name,
      '--network',
      'host',
      '--user',
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '--volume',
      `${scratch}:/config:Z`,
      CLIENT_IMAGE,
      '--config-dir',
      '/config',
      '--json',
      ...args,
    ]);
    ownedContainers.delete(name);
  };
  try {
    await writeFile(
      join(scratch, 'config.json'),
      JSON.stringify({
        version: '10',
        aliases: {
          builder: {
            url: config.accounts[0].endpoint,
            accessKey: config.rootUser,
            secretKey: config.rootPassword,
            api: 'S3v4',
            path: 'on',
          },
        },
      }),
      { mode: 0o600 },
    );
    await mc('ready', 'builder');
    for (const account of config.accounts) {
      const name = `builder-${createHash('sha256')
        .update(account.bucket + '/' + account.prefix)
        .digest('hex')
        .slice(0, 20)}`;
      const policyFile = `${name}.json`;
      await writeFile(
        join(scratch, policyFile),
        JSON.stringify(policy(account.bucket, account.prefix)),
        { mode: 0o600 },
      );
      await mc(
        'mb',
        '--ignore-existing',
        '--region',
        account.region,
        `builder/${account.bucket}`,
      );
      await mc('anonymous', 'set', 'none', `builder/${account.bucket}`);
      await mc(
        'admin',
        'policy',
        'create',
        'builder',
        name,
        `/config/${policyFile}`,
      );
      await mc(
        'admin',
        'user',
        'add',
        'builder',
        account.accessKey,
        account.secretKey,
      );
      await mc(
        'admin',
        'policy',
        'attach',
        'builder',
        name,
        '--user',
        account.accessKey,
      );
    }
    console.log(
      'MinIO provisioning: private development/test buckets and scoped identities ready.',
    );
  } finally {
    let incomplete = false;
    for (const name of ownedContainers) {
      try {
        await execute(['rm', '--force', name], hardDeadline, null);
      } catch {
        incomplete = true;
      }
    }
    await rm(scratch, { recursive: true, force: true });
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    if (incomplete)
      throw new Error(
        'Storage provisioning cleanup: FAILED (owned client container status unknown).',
      );
  }
}

module.exports = { configuration, policy, provision };
if (require.main === module)
  provision().catch((error) => {
    const safe =
      /^(Invalid (local )?storage provisioning|Storage (provisioning|identities)|Local storage provisioning)/.test(
        error.message,
      );
    console.error(
      safe
        ? error.message
        : 'Storage provisioning failed; no configuration values are logged.',
    );
    process.exitCode = 1;
  });
