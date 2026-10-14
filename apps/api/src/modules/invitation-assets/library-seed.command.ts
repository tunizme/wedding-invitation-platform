import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { validateInvitationBuilderEnvironment } from '../../config/invitation-builder.environment';
import { databaseOptions } from '../../infrastructure/database/data-source';
import { AssetWriteService } from './application/asset-write.service';
import { mp3Duration } from './application/mp3';
import { S3AssetStore } from './infrastructure/s3-asset-store';

/**
 * Local-only: ingests .artifacts/library-seed (written by scripts/library-fetch-open.cjs)
 * as TEMPLATE-scope stock/background/audio assets through the durable write path.
 * Idempotent by Openverse id; every row keeps its licence and source in `attribution`.
 */
interface ManifestItem {
  kind: 'DECORATION' | 'BACKGROUND' | 'AUDIO';
  category: string;
  categoryLabel: string;
  file: string;
  title: string;
  creator: string;
  license: string;
  licenseVersion: string;
  licenseUrl: string;
  sourceUrl: string;
  provider: string;
  openverseId: string;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const root = resolve(__dirname, '../../../../..');
const seedRoot = resolve(root, '.artifacts/library-seed');
const MAX_OUTPUT_EDGE = 4096;

function assertLocal(): void {
  if (!process.argv.includes('--seed-library'))
    throw new Error(
      'Required: --seed-library (adds open-licence stock/background/audio rows to the local library).',
    );
  const database = new URL(process.env.DATABASE_URL ?? '');
  const storage = new URL(process.env.BUILDER_S3_ENDPOINT ?? '');
  if (
    process.env.NODE_ENV !== 'development' ||
    !LOCAL_HOSTS.includes(database.hostname) ||
    !LOCAL_HOSTS.includes(storage.hostname)
  )
    throw new Error(
      'Only a development database and local object storage are allowed.',
    );
}

async function ensureBucket(): Promise<void> {
  const client = new S3Client({
    region: process.env.BUILDER_S3_REGION,
    endpoint: process.env.BUILDER_S3_ENDPOINT,
    forcePathStyle: process.env.BUILDER_S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.BUILDER_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.BUILDER_S3_SECRET_ACCESS_KEY ?? '',
    },
  });
  try {
    await client.send(
      new HeadBucketCommand({ Bucket: process.env.BUILDER_S3_BUCKET }),
    );
  } catch {
    await client.send(
      new CreateBucketCommand({ Bucket: process.env.BUILDER_S3_BUCKET }),
    );
  } finally {
    client.destroy();
  }
}

const displayName = (item: ManifestItem): string => {
  const title = [...(item.title || item.categoryLabel).trim()]
    .slice(0, 100)
    .join('');
  return title || item.categoryLabel;
};

async function main(): Promise<void> {
  assertLocal();
  const manifestPath = resolve(seedRoot, 'manifest.json');
  if (!existsSync(manifestPath))
    throw new Error('Run scripts/library-fetch-open.cjs first.');
  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as ManifestItem[];
  await ensureBucket();
  const db = new DataSource(databaseOptions());
  await db.initialize();
  try {
    const [admin] = await db.query<{ id: string }[]>(
      `SELECT id FROM users WHERE role='ADMIN' ORDER BY created_at LIMIT 1`,
    );
    if (!admin)
      throw new Error(
        'No ADMIN account: run `pnpm --filter @wedding/api bootstrap:admin` first.',
      );
    // Seeding never hashes rate-limit keys or renders pages; throwaway values satisfy config validation only.
    const store = new S3AssetStore(
      validateInvitationBuilderEnvironment({
        ...process.env,
        BUILDER_RENDER_ORIGIN:
          process.env.BUILDER_RENDER_ORIGIN ?? 'http://127.0.0.1:3000',
        BUILDER_RATE_HMAC_KEY:
          process.env.BUILDER_RATE_HMAC_KEY ??
          randomBytes(32).toString('base64'),
      }),
    );
    const writes = new AssetWriteService(db, store);
    const done = new Set(
      (
        await db.query<{ id: string }[]>(
          `SELECT attribution->>'openverseId' AS id FROM assets WHERE attribution IS NOT NULL`,
        )
      ).map((row) => row.id),
    );
    let added = 0;
    let skipped = 0;
    const failed: string[] = [];
    for (const item of manifest) {
      if (done.has(item.openverseId)) {
        skipped++;
        continue;
      }
      try {
        const bytes = readFileSync(resolve(seedRoot, item.file));
        const context = { deadline: Date.now() + 30_000 };
        const attribution = {
          provider: item.provider,
          creator: item.creator,
          license: item.license,
          licenseVersion: item.licenseVersion,
          licenseUrl: item.licenseUrl,
          sourceUrl: item.sourceUrl,
          openverseId: item.openverseId,
          categoryLabel: item.categoryLabel,
        };
        const base = {
          scope: 'TEMPLATE' as const,
          owner_user_id: admin.id,
          uploaded_by: admin.id,
          assistance_invitation_id: null,
          name: displayName(item),
          category: item.category,
          attribution,
        };
        if (item.kind === 'AUDIO') {
          await writes.upload(
            bytes,
            'audio/mpeg',
            {
              ...base,
              kind: 'AUDIO',
              width: 0,
              height: 0,
              duration_ms: mp3Duration(bytes),
            },
            context,
          );
        } else {
          const image = await sharp(bytes, { failOn: 'error' })
            .rotate()
            .resize({
              width: MAX_OUTPUT_EDGE,
              height: MAX_OUTPUT_EDGE,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: 90, effort: 4 })
            .toBuffer({ resolveWithObject: true });
          await writes.upload(
            image.data,
            'image/webp',
            {
              ...base,
              kind: item.kind,
              width: image.info.width,
              height: image.info.height,
            },
            context,
          );
        }
        added++;
      } catch (error) {
        failed.push(
          `${item.file}: ${error instanceof Error ? error.message : 'failed'}`,
        );
      }
    }
    process.stdout.write(
      `Library seed: added=${added} skipped=${skipped} failed=${failed.length}\n`,
    );
    for (const line of failed.slice(0, 20)) process.stdout.write(`  ${line}\n`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'LIBRARY_SEED_FAILED'}\n`,
  );
  process.exitCode = 1;
});
