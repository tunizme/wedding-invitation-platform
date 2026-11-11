const { spawnSync } = require('node:child_process');
const { S3Client, HeadBucketCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');

async function initStorage() {
  const endpoint = process.env.BUILDER_S3_ENDPOINT || 'http://minio:9000';
  const region = process.env.BUILDER_S3_REGION || 'us-east-1';
  const bucket = process.env.BUILDER_S3_BUCKET || 'wedding-builder-development';
  const accessKeyId =
    process.env.MINIO_ROOT_USER ||
    process.env.BUILDER_S3_ACCESS_KEY_ID ||
    'wedding-storage-root';
  const secretAccessKey =
    process.env.MINIO_ROOT_PASSWORD ||
    process.env.BUILDER_S3_SECRET_ACCESS_KEY ||
    '27022003';

  console.log(`[docker-init] Checking storage bucket '${bucket}' at ${endpoint}...`);
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`[docker-init] Bucket '${bucket}' already exists.`);
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`[docker-init] Bucket '${bucket}' created successfully.`);
    } catch (createErr) {
      console.warn(`[docker-init] Bucket creation note:`, createErr.message);
    }
  } finally {
    client.destroy();
  }
}

function runMigration() {
  console.log('[docker-init] Running database migrations...');
  const result = spawnSync(
    'node',
    [
      'apps/api/node_modules/typeorm/cli.js',
      'migration:run',
      '-d',
      'apps/api/dist/infrastructure/database/data-source.js',
    ],
    { stdio: 'inherit', env: process.env },
  );

  if (result.status !== 0) {
    console.error(
      '[docker-init] Database migration failed with code',
      result.status,
    );
    process.exit(result.status || 1);
  }
  console.log('[docker-init] Database migrations completed successfully.');
}

async function main() {
  try {
    await initStorage();
  } catch (err) {
    console.warn('[docker-init] Storage init warning (continuing):', err.message);
  }
  runMigration();
  console.log('[docker-init] Infrastructure initialization complete.');
}

main();
