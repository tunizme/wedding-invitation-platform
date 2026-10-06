import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { fixtureBytes } from '../../fixtures/invitation-builder/candidates';
import { StorageUnavailableError } from '../../../src/modules/invitation-assets/domain/asset-store.port';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
type Account = Awaited<ReturnType<Fixture['user']>>;
type AssetSummary = { id: string; name: string; kind: string; mimeType: string; byteSize: number; width: number; height: number; previewUrl: string };
const assetSummary = (response: request.Response) => response.body as AssetSummary;

describe.sequential('asset HTTP contract', () => {
  let f: Fixture;
  let admin: Account;
  let customer: Account;
  let other: Account;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    customer = await f.user();
    other = await f.user();
  });
  afterAll(async () => { await f?.close(); });

  const attach = (path: string, headers: Record<string, string>, name = 'Ảnh', kind = 'IMAGE') =>
    request(f.app.getHttpServer()).post(path).set(headers)
      .field('name', name).field('kind', kind)
      .attach('file', fixtureBytes(), { filename: 'uploaded.png', contentType: 'image/png' });

  it('normalizes an authenticated admin upload and returns only the reusable summary', async () => {
    const response = await attach('/api/v1/admin/template-assets', admin.headers, 'Ảnh nền', 'BACKGROUND');
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const uploaded = assetSummary(response);
    expect(uploaded).toMatchObject({ name: 'Ảnh nền', kind: 'BACKGROUND', mimeType: 'image/webp', width: 80, height: 60 });
    expect(uploaded.previewUrl).toBe(`/api/v1/assets/${uploaded.id}/content`);
    expect(uploaded).not.toHaveProperty('objectKey');
    const content = await request(f.app.getHttpServer()).get(uploaded.previewUrl).set(admin.headers).expect(200);
    expect(content.headers['content-type']).toContain('image/webp');
    const metadata = await sharp(content.body as Buffer).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 80, height: 60 });
    expect(metadata.exif).toBeUndefined();
  });

  it('scopes customer assets to their owner and keeps them out of the reusable template library', async () => {
    const uploaded = assetSummary(await attach('/api/v1/assets', customer.headers).expect(201));
    expect(uploaded).toMatchObject({ kind: 'IMAGE', mimeType: 'image/webp', width: 80, height: 60 });
    await request(f.app.getHttpServer()).get(`/api/v1/assets/${uploaded.id}/content`).set(other.headers).expect(404);
    await request(f.app.getHttpServer()).get(`/api/v1/assets/${uploaded.id}/content`).set(admin.headers).expect(404);
    const own = (await request(f.app.getHttpServer()).get('/api/v1/assets').set(customer.headers).expect(200)).body as { items: AssetSummary[] };
    expect(own.items.map((asset) => asset.id)).toContain(uploaded.id);
    const library = (await request(f.app.getHttpServer()).get('/api/v1/admin/template-assets').set(admin.headers).expect(200)).body as { items: AssetSummary[] };
    expect(library.items.map((asset) => asset.id)).not.toContain(uploaded.id);
  });

  it('rejects missing auth, wrong roles, spoofed image signatures and unsupported SVG', async () => {
    await attach('/api/v1/admin/template-assets', {}).expect(401);
    await attach('/api/v1/admin/template-assets', customer.headers).expect(403);
    await request(f.app.getHttpServer()).post('/api/v1/assets').set(customer.headers)
      .field('name', 'Not an image').field('kind', 'IMAGE')
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { filename: 'image.png', contentType: 'image/png' }).expect(422);
    await request(f.app.getHttpServer()).post('/api/v1/assets').set(customer.headers)
      .field('name', 'Spoof').field('kind', 'IMAGE')
      .attach('file', Buffer.from('not a png'), { filename: 'image.png', contentType: 'image/png' }).expect(422);
  });

  it('enforces the multipart byte limit before decoding and preserves exact-origin CORS', async () => {
    await request(f.app.getHttpServer()).post('/api/v1/assets').set(customer.headers)
      .field('name', 'Too large').field('kind', 'IMAGE')
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
    const allowed = await request(f.app.getHttpServer()).options('/api/v1/admin/template-assets')
      .set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type').expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(f.app.getHttpServer()).options('/api/v1/admin/template-assets')
      .set('Origin', 'https://attacker.example').set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a real image beyond the decoded dimension limit and leaves no usable asset on storage failure', async () => {
    const tooWide = await sharp({ create: { width: 10_001, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
    await request(f.app.getHttpServer()).post('/api/v1/assets').set(customer.headers)
      .field('name', 'Too wide').field('kind', 'IMAGE')
      .attach('file', tooWide, { filename: 'wide.png', contentType: 'image/png' }).expect(422);
    const originalPut = f.store.put.bind(f.store);
    f.store.put = () => Promise.reject(new StorageUnavailableError());
    try {
      await attach('/api/v1/assets', customer.headers, 'Storage outage').expect(503);
      expect(await f.db.query("SELECT id FROM assets WHERE uploaded_by=$1 AND name='Storage outage'", [customer.id])).toEqual([]);
      expect(await f.db.query("SELECT id FROM asset_storage_writes WHERE status='WRITING'")).not.toHaveLength(0);
    } finally {
      f.store.put = originalPut;
    }
  });

  it('deletes an unreferenced uploaded asset and immediately denies later content access', async () => {
    const uploaded = assetSummary(await attach('/api/v1/admin/template-assets', admin.headers).expect(201));
    await request(f.app.getHttpServer()).delete(`/api/v1/assets/${uploaded.id}`).set(admin.headers).expect(204);
    await request(f.app.getHttpServer()).get(uploaded.previewUrl).set(admin.headers).expect(404);
  });

  it('prevents deleting any asset retained by a template cover reference', async () => {
    const uploaded = assetSummary(await attach('/api/v1/admin/template-assets', admin.headers).expect(201));
    const template = await f.template(admin.principal);
    await request(f.app.getHttpServer()).patch(`/api/v1/admin/templates/${template.id}`).set(admin.headers)
      .send({ expectedVersion: 1, coverAssetId: uploaded.id }).expect(200);
    const conflict = await request(f.app.getHttpServer()).delete(`/api/v1/assets/${uploaded.id}`).set(admin.headers).expect(409);
    expect((conflict.body as { code: string }).code).toBe('ASSET_IN_USE');
    await request(f.app.getHttpServer()).delete(`/api/v1/assets/${uploaded.id}`).set(customer.headers).expect(404);
  });
});
