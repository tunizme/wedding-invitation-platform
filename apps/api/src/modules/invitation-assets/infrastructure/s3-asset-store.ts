import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { OnModuleDestroy } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { InvitationBuilderEnvironment } from '../../../config/invitation-builder.environment';
import {
  AssetObjectMissingError,
  StorageUnavailableError,
  type AssetStore,
  type ObjectInfo,
  type ObjectPage,
  type StorageContext,
  type StoredObject,
} from '../domain/asset-store.port';

interface Operation {
  signal: AbortSignal;
  close: () => void;
  onAbort: (callback: () => void) => void;
}
const missing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  '$metadata' in error &&
  (error.$metadata as { httpStatusCode?: number })?.httpStatusCode === 404;

/** AWS SDK only. No MinIO SDK, bucket policies, URL signing or rename semantics. */
export class S3AssetStore implements AssetStore, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly active = new Set<AbortController>();
  constructor(private readonly config: InvitationBuilderEnvironment) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: config.credentials,
      maxAttempts: 2,
    });
  }
  private key(relative: string): string {
    if (
      !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.(?:webp|png)$/.test(relative) ||
      relative.length > 256
    )
      throw new StorageUnavailableError();
    return this.config.prefix + relative;
  }
  private operation(context: StorageContext): Operation {
    const remaining = Math.min(10_000, context.deadline - Date.now());
    if (
      !Number.isFinite(remaining) ||
      remaining <= 0 ||
      context.signal?.aborted
    )
      throw new StorageUnavailableError();
    const controller = new AbortController();
    this.active.add(controller);
    const abort = () => controller.abort();
    const timer = setTimeout(abort, remaining);
    context.signal?.addEventListener('abort', abort, { once: true });
    const listeners: (() => void)[] = [];
    return {
      signal: controller.signal,
      onAbort(callback) {
        listeners.push(callback);
        controller.signal.addEventListener('abort', callback, { once: true });
        if (controller.signal.aborted) callback();
      },
      close: () => {
        clearTimeout(timer);
        context.signal?.removeEventListener('abort', abort);
        for (const callback of listeners)
          controller.signal.removeEventListener('abort', callback);
        this.active.delete(controller);
      },
    };
  }
  private async bounded<T>(
    context: StorageContext,
    action: (operation: Operation) => Promise<T>,
  ): Promise<T> {
    const operation = this.operation(context);
    try {
      return await Promise.race([
        action(operation),
        new Promise<never>((_, reject) =>
          operation.onAbort(() => reject(new StorageUnavailableError())),
        ),
      ]);
    } catch (error) {
      if (error instanceof AssetObjectMissingError) throw error;
      throw new StorageUnavailableError();
    } finally {
      operation.close();
    }
  }
  async put(
    key: string,
    bytes: Buffer,
    contentType: string,
    sha256: string,
    context: StorageContext,
  ): Promise<void> {
    const objectKey = this.key(key);
    if (
      !['image/webp', 'image/png'].includes(contentType) ||
      !/^[a-f0-9]{64}$/.test(sha256) ||
      bytes.length === 0
    )
      throw new StorageUnavailableError();
    await this.bounded(context, async ({ signal }) => {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: objectKey,
          Body: bytes,
          ContentType: contentType,
          ContentLength: bytes.length,
          Metadata: { sha256 },
          IfNoneMatch: '*',
        }),
        { abortSignal: signal },
      );
    });
  }
  async get(
    key: string,
    maxBytes: number,
    context: StorageContext,
  ): Promise<StoredObject> {
    const objectKey = this.key(key);
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > 80 * 1024 * 1024
    )
      throw new StorageUnavailableError();
    return this.bounded(context, async (operation) => {
      let body: Readable | undefined;
      try {
        const response = await this.client.send(
          new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
          { abortSignal: operation.signal },
        );
        body = response.Body as Readable | undefined;
        if (!body || typeof body.destroy !== 'function')
          throw new StorageUnavailableError();
        // The async iterator propagates read errors; also cover aborts before it attaches.
        body.on('error', () => {});
        operation.onAbort(() => body?.destroy(new StorageUnavailableError()));
        if (
          response.ContentLength !== undefined &&
          response.ContentLength > maxBytes
        )
          throw new StorageUnavailableError();
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of body) {
          const bytes = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk as Uint8Array);
          total += bytes.length;
          if (total > maxBytes || operation.signal.aborted)
            throw new StorageUnavailableError();
          chunks.push(bytes);
        }
        if (
          response.ContentLength !== undefined &&
          total !== response.ContentLength
        )
          throw new StorageUnavailableError();
        return {
          bytes: Buffer.concat(chunks, total),
          contentType: response.ContentType ?? 'application/octet-stream',
        };
      } catch (error) {
        if (missing(error)) throw new AssetObjectMissingError();
        throw error;
      } finally {
        body?.destroy();
      }
    });
  }
  async head(key: string, context: StorageContext): Promise<ObjectInfo | null> {
    const objectKey = this.key(key);
    return this.bounded(context, async ({ signal }) => {
      try {
        const value = await this.client.send(
          new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
          { abortSignal: signal },
        );
        return {
          byteSize: value.ContentLength ?? 0,
          contentType: value.ContentType ?? 'application/octet-stream',
        };
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    });
  }
  async delete(key: string, context: StorageContext): Promise<void> {
    const objectKey = this.key(key);
    await this.bounded(context, async ({ signal }) => {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: objectKey }),
        { abortSignal: signal },
      );
    });
  }
  async list(
    relativePrefix: string,
    token: string | undefined,
    context: StorageContext,
  ): Promise<ObjectPage> {
    if (relativePrefix && !/^(?:[a-z0-9-]+\/)+$/.test(relativePrefix))
      throw new StorageUnavailableError();
    const prefix = this.config.prefix + relativePrefix;
    return this.bounded(context, async ({ signal }) => {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
        { abortSignal: signal },
      );
      const keys = (page.Contents ?? []).map((entry) => {
        if (!entry.Key?.startsWith(prefix)) throw new StorageUnavailableError();
        return entry.Key.slice(this.config.prefix.length);
      });
      if (page.IsTruncated && !page.NextContinuationToken)
        throw new StorageUnavailableError();
      return {
        keys,
        ...(page.IsTruncated ? { nextToken: page.NextContinuationToken } : {}),
      };
    });
  }
  onModuleDestroy(): void {
    for (const controller of this.active) controller.abort();
    this.client.destroy();
  }
}
