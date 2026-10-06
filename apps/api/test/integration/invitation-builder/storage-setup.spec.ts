import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { validateInvitationBuilderEnvironment } from '../../../src/config/invitation-builder.environment';
import { builderRuntimeFixture } from '../../fixtures/invitation-builder/runtime';

describe.sequential('real MinIO setup and least-privilege identities', () => {
  let client: S3Client;
  let bucket: string;
  let key: string;
  let endpoint: string;
  beforeAll(() => {
    if (!process.env.BUILDER_TEST_RUN_ID)
      throw new Error('Use validate:builder for real storage setup tests.');
    const config = validateInvitationBuilderEnvironment({
      ...builderRuntimeFixture(),
      NODE_ENV: 'test',
    });
    client = new S3Client({ ...config, maxAttempts: 1 });
    bucket = config.bucket;
    endpoint = config.endpoint!;
    key = `${config.prefix}setup/${randomUUID()}.txt`;
  });
  afterAll(async () => {
    try {
      if (client && key)
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(3000) },
        );
    } finally {
      client?.destroy();
    }
  });
  it('writes/reads only the test namespace', async () => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: 'owned-setup-fixture',
      }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(5000) },
    );
    expect(await response.Body?.transformToString()).toBe(
      'owned-setup-fixture',
    );
  });
  it('denies anonymous object and bucket listing', async () => {
    for (const path of [`/${bucket}/${key}`, `/${bucket}?list-type=2`]) {
      const response = await fetch(endpoint + path, {
        signal: AbortSignal.timeout(5000),
      });
      await response.body?.cancel();
      expect(response.status).toBe(403);
    }
  });
  it('test identity cannot list or read development bucket, nor write outside tests/', async () => {
    const development = process.env.BUILDER_TEST_DEVELOPMENT_BUCKET;
    expect(development).toBeTruthy();
    await expect(
      client.send(
        new ListObjectsV2Command({
          Bucket: development,
          Prefix: 'development/',
        }),
        { abortSignal: AbortSignal.timeout(5000) },
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
    await expect(
      client.send(
        new GetObjectCommand({
          Bucket: development,
          Key: 'development/denied',
        }),
        { abortSignal: AbortSignal.timeout(5000) },
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
    await expect(
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: 'outside-tests/denied',
          Body: 'denied',
        }),
        { abortSignal: AbortSignal.timeout(5000) },
      ),
    ).rejects.toMatchObject({ $metadata: { httpStatusCode: 403 } });
  });
});
