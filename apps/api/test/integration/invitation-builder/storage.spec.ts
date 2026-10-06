import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  validateInvitationBuilderEnvironment,
  type InvitationBuilderEnvironment,
} from '../../../src/config/invitation-builder.environment';
import { S3AssetStore } from '../../../src/modules/invitation-assets/infrastructure/s3-asset-store';
import {
  AssetWriteService,
  type NewAssetMetadata,
} from '../../../src/modules/invitation-assets/application/asset-write.service';
import {
  StorageUnavailableError,
  AssetObjectMissingError,
} from '../../../src/modules/invitation-assets/domain/asset-store.port';
import { builderRuntimeFixture } from '../../fixtures/invitation-builder/runtime';
import { registrationFixture } from '../../registration-fixture';

describe.sequential(
  'S3 adapter and SQL write-intent boundary on real MinIO',
  () => {
    let config: InvitationBuilderEnvironment;
    let store: S3AssetStore;
    let writer: AssetWriteService;
    let fixture: Awaited<ReturnType<typeof registrationFixture>>;
    let metadata: NewAssetMetadata;
    const bytes = readFileSync(
      resolve(
        __dirname,
        '../../../../../specs/004-invitation-builder/contracts/fixtures/assets/photo.png',
      ),
    );
    const sha = createHash('sha256').update(bytes).digest('hex');
    const budget = () => ({ deadline: Date.now() + 5000 });
    beforeAll(async () => {
      if (!process.env.BUILDER_TEST_RUN_ID)
        throw new Error('Use validate:builder for real storage tests.');
      config = validateInvitationBuilderEnvironment({
        ...builderRuntimeFixture(),
        NODE_ENV: 'test',
      });
      store = new S3AssetStore(config);
      fixture = await registrationFixture();
      await fixture.register.register(
        'builder-storage@example.test',
        'Valid test passphrase 123!',
      );
      const users: { id: string }[] = await fixture.db.query(
        'SELECT id FROM users WHERE email=$1',
        ['builder-storage@example.test'],
      );
      metadata = {
        scope: 'SYSTEM_THUMBNAIL',
        owner_user_id: null,
        uploaded_by: users[0].id,
        assistance_invitation_id: null,
        name: 'Fixture thumbnail',
        kind: 'THUMBNAIL',
        width: 80,
        height: 60,
      };
      writer = new AssetWriteService(fixture.db, store);
    });
    afterAll(async () => {
      store?.onModuleDestroy();
      if (fixture) await fixture.close();
    });
    it('round-trips SHA-256 bytes, lists, prevents overwrite and deletes idempotently', async () => {
      const key = `${randomUUID()}/${randomUUID()}.png`;
      await store.put(key, bytes, 'image/png', sha, budget());
      expect(await store.head(key, budget())).toEqual({
        byteSize: bytes.length,
        contentType: 'image/png',
      });
      const loaded = await store.get(key, bytes.length, budget());
      expect(createHash('sha256').update(loaded.bytes).digest('hex')).toBe(sha);
      expect((await store.list('', undefined, budget())).keys).toContain(key);
      await expect(
        store.put(key, Buffer.from('changed'), 'image/png', sha, budget()),
      ).rejects.toBeInstanceOf(StorageUnavailableError);
      expect((await store.get(key, bytes.length, budget())).bytes).toEqual(
        bytes,
      );
      await store.delete(key, budget());
      await store.delete(key, budget());
      expect(await store.head(key, budget())).toBeNull();
      await expect(
        store.get(key, bytes.length, budget()),
      ).rejects.toBeInstanceOf(AssetObjectMissingError);
    });
    it('isolates two namespaces and rejects traversal keys', async () => {
      const first = new S3AssetStore({
        ...config,
        prefix: config.prefix + 'isolation-a/',
      });
      const second = new S3AssetStore({
        ...config,
        prefix: config.prefix + 'isolation-b/',
      });
      const key = `${randomUUID()}.png`;
      try {
        await first.put(key, bytes, 'image/png', sha, budget());
        expect(await second.head(key, budget())).toBeNull();
        await expect(
          first.get('../' + key, bytes.length, budget()),
        ).rejects.toBeInstanceOf(StorageUnavailableError);
        expect((await second.list('', undefined, budget())).keys).toEqual([]);
      } finally {
        first.onModuleDestroy();
        second.onModuleDestroy();
      }
    });
    it('keeps object bytes private and denies the test identity outside its allowed prefix', async () => {
      const key = `${randomUUID()}.png`;
      await store.put(key, bytes, 'image/png', sha, budget());
      const url = new URL(
        `${config.bucket}/${config.prefix}${key}`,
        config.endpoint + '/',
      );
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      expect(response.status).toBe(403);
      const outside = new S3AssetStore({
        ...config,
        prefix: 'outside-test-policy/',
      });
      try {
        await expect(
          outside.head(`${randomUUID()}.png`, budget()),
        ).rejects.toEqual(new StorageUnavailableError());
      } finally {
        outside.onModuleDestroy();
      }
    });
    it('returns safe failure for bad credentials and an unavailable endpoint', async () => {
      for (const override of [
        {
          credentials: {
            accessKeyId: 'invalid-test-identity',
            secretAccessKey: 'invalid-test-secret',
          },
        },
        { endpoint: 'http://127.0.0.1:1' },
      ]) {
        const bad = new S3AssetStore({ ...config, ...override });
        try {
          await expect(
            bad.head(`${randomUUID()}.png`, { deadline: Date.now() + 1000 }),
          ).rejects.toEqual(new StorageUnavailableError());
        } finally {
          bad.onModuleDestroy();
        }
      }
    });
    it('bounds response body consumption and closes a stalled stream', async () => {
      const sockets = new Set<Socket>();
      const server = createServer((_request, response) => {
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': String(bytes.length),
        });
        response.write(bytes.subarray(0, 1));
      });
      server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const port = (server.address() as { port: number }).port;
      const hanging = new S3AssetStore({
        ...config,
        endpoint: `http://127.0.0.1:${port}`,
      });
      const start = Date.now();
      try {
        await expect(
          hanging.get(`${randomUUID()}.png`, bytes.length, {
            deadline: start + 200,
          }),
        ).rejects.toBeInstanceOf(StorageUnavailableError);
        expect(Date.now() - start).toBeLessThan(1000);
      } finally {
        hanging.onModuleDestroy();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((done) => server.close(() => done()));
      }
    });
    it('commits READY metadata and write intent together after confirmed Put', async () => {
      const asset = await writer.upload(bytes, 'image/png', metadata, budget());
      expect(asset.status).toBe('READY');
      expect(asset.sha256).toBe(sha);
      const rows: { status: string; asset_id: string }[] =
        await fixture.db.query(
          'SELECT status,asset_id FROM asset_storage_writes WHERE object_key=$1',
          [asset.object_key],
        );
      expect(rows).toEqual([{ status: 'COMMITTED', asset_id: asset.id }]);
      expect(
        (await store.get(asset.object_key, asset.byte_size, budget())).bytes,
      ).toEqual(bytes);
    });
    it('SQL failure leaves no READY metadata, retaining an intent for cleanup', async () => {
      const prepared = await writer.prepare(bytes, 'image/png', budget());
      await expect(
        fixture.db.transaction((manager) =>
          writer.finalize(manager, prepared, { ...metadata, name: '' }),
        ),
      ).rejects.toBeDefined();
      const assets: unknown[] = await fixture.db.query(
        'SELECT id FROM assets WHERE object_key=$1',
        [prepared.intent.object_key],
      );
      const intents: { status: string; asset_id: string | null }[] =
        await fixture.db.query(
          'SELECT status,asset_id FROM asset_storage_writes WHERE id=$1',
          [prepared.intent.id],
        );
      expect(assets).toEqual([]);
      expect(intents).toEqual([{ status: 'WRITING', asset_id: null }]);
    });
    it('an expired writer cannot commit even when its object exists', async () => {
      const prepared = await writer.prepare(bytes, 'image/png', {
        deadline: Date.now() + 500,
      });
      await new Promise((done) => setTimeout(done, 550));
      await expect(
        fixture.db.transaction((manager) =>
          writer.finalize(manager, prepared, metadata),
        ),
      ).rejects.toBeInstanceOf(StorageUnavailableError);
      expect(
        await fixture.db.query('SELECT id FROM assets WHERE object_key=$1', [
          prepared.intent.object_key,
        ]),
      ).toEqual([]);
      expect(
        await store.head(prepared.intent.object_key, budget()),
      ).not.toBeNull();
    });
  },
);
