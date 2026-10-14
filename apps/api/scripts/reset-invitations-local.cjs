// Destructive local command: deletes all invitation/template/media data, preserves accounts.
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  quiet: true,
});
const { Client } = require('pg');
const { S3Client, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
async function main() {
  const deadline = Date.now() + 120000;
  if (!process.argv.includes('--delete-all-invitation-data'))
    throw new Error(
      'Required: --delete-all-invitation-data (permanently deletes local templates, invitations, media, publications, presets and responses; preserves accounts).',
    );
  const url = new URL(process.env.DATABASE_URL);
  if (
    process.env.NODE_ENV !== 'development' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('Only a development database on localhost is allowed.');

  const storageUrl = new URL(process.env.BUILDER_S3_ENDPOINT);
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(storageUrl.hostname) ||
    !process.env.BUILDER_S3_BUCKET ||
    !process.env.BUILDER_S3_PREFIX ||
    !process.env.BUILDER_S3_ACCESS_KEY_ID ||
    !process.env.BUILDER_S3_SECRET_ACCESS_KEY
  )
    throw new Error(
      'Local storage endpoint, bucket, prefix and credentials are required before resetting.',
    );
  const port = process.argv.find((arg) => arg.startsWith('--port='));
  if (port) url.port = port.slice(7);
  const db = new Client({
    connectionString: url.href,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  await db.connect();
  const manifestPath = path.resolve(
    __dirname,
    '../../../.artifacts/manual/invitation-reset-objects.json',
  );
  let manifest;
  try {
    const [{ count: accountsBefore }] = (
      await db.query('SELECT count(*)::integer AS count FROM users')
    ).rows;
    const keys = (
      await db.query(
        'SELECT object_key FROM assets UNION SELECT object_key FROM asset_storage_writes',
      )
    ).rows.map((row) => row.object_key);
    manifest = {
      bucket: process.env.BUILDER_S3_BUCKET,
      prefix: process.env.BUILDER_S3_PREFIX,
      keys,
    };
    if (fs.existsSync(manifestPath)) {
      const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (old.bucket !== manifest.bucket || old.prefix !== manifest.prefix)
        throw new Error(
          'A prior storage cleanup manifest belongs to another bucket/prefix.',
        );
      manifest.keys = [...new Set([...old.keys, ...keys])];
    }
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    await db.query('BEGIN');
    await db.query(
      'TRUNCATE TABLE invitation_templates, invitations, editor_presets, assets CASCADE',
    );
    const [{ count: accountsAfter }] = (
      await db.query('SELECT count(*)::integer AS count FROM users')
    ).rows;
    if (accountsAfter !== accountsBefore)
      throw new Error('Account preservation check failed.');
    await db.query('COMMIT');
    console.log(`Invitation data reset; preserved ${accountsAfter} accounts.`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
  const store = new S3Client({
    endpoint: process.env.BUILDER_S3_ENDPOINT,
    region: process.env.BUILDER_S3_REGION,
    forcePathStyle: process.env.BUILDER_S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.BUILDER_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BUILDER_S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 2,
  });
  try {
    for (let i = 0; i < manifest.keys.length; i += 1000) {
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw new Error(
          'Reset cleanup deadline reached; rerun with retained manifest.',
        );
      const result = await store.send(
        new DeleteObjectsCommand({
          Bucket: manifest.bucket,
          Delete: {
            Objects: manifest.keys
              .slice(i, i + 1000)
              .map((key) => ({ Key: manifest.prefix + key })),
            Quiet: true,
          },
        }),
        { abortSignal: AbortSignal.timeout(Math.min(15000, remaining)) },
      );
      if (result.Errors?.length)
        throw new Error(
          'Storage cleanup incomplete; rerun this same command with the retained manifest.',
        );
    }
    fs.unlinkSync(manifestPath);
    console.log(`Stored invitation objects deleted: ${manifest.keys.length}.`);
  } finally {
    store.destroy();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Invitation reset failed.',
  );
  process.exitCode = 1;
});
