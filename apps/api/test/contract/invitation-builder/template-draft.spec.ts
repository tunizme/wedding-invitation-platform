import type { EditorDocument as TemplateDesign } from '../../../src/modules/invitation-builder/domain/editor-document';
import { createBlankDocument as blankDesign } from '../../../src/modules/invitation-builder/domain/editor-document';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { emptyWedding } from '../../fixtures/invitation-builder/candidates';
import type { WeddingData } from '../../../src/modules/invitation-builder/domain/document.types';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
type Account = Awaited<ReturnType<Fixture['user']>>;
interface Detail {
  id: string;
  name: string;
  category: string;
  tags: string[];
  status: string;
  sortOrder: number;
  coverUrl: string | null;
  coverAssetId: string | null;
  publishedRevisionId: string | null;
  editVersion: number;
  createdBy: string;
  draftDocument: TemplateDesign;
  draftSampleData: WeddingData;
}
const detail = (response: request.Response) => response.body as Detail;

describe.sequential('admin template draft contract', () => {
  let f: Fixture, admin: Account, secondAdmin: Account, customer: Account;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    secondAdmin = await f.user('ADMIN');
    customer = await f.user();
  });
  afterAll(async () => {
    await f?.close();
  });
  const create = () =>
    request(f.app.getHttpServer())
      .post('/api/v1/admin/templates')
      .set(admin.headers)
      .send({
        name: '  Thiệp cưới  ',
        category: '  Wedding  ',
        tags: ['Nhẹ nhàng'],
        sortOrder: 3,
      });

  it('creates an owned draft with a null cover and no premature public state', async () => {
    const response = await create().expect(201),
      value = detail(response);
    expect(value).toMatchObject({
      name: 'Thiệp cưới',
      category: 'Wedding',
      tags: ['Nhẹ nhàng'],
      sortOrder: 3,
      status: 'DRAFT',
      coverUrl: null,
      coverAssetId: null,
      publishedRevisionId: null,
      editVersion: 1,
      createdBy: admin.id,
      draftSampleData: { schemaVersion: 2, fields: {} },
    });
    expect(value.draftDocument).toEqual(blankDesign());
    expect(response.headers['cache-control']).toBe('no-store');
    const opened = await request(f.app.getHttpServer())
      .get('/api/v1/admin/templates/' + value.id)
      .set(secondAdmin.headers)
      .expect(200);
    expect(opened.body).toEqual(response.body);
  });

  it('requires admin role on every draft route and rejects forged metadata', async () => {
    const template = await f.template(admin.principal),
      server = f.app.getHttpServer();
    await request(server).get('/api/v1/admin/templates').expect(401);
    await request(server)
      .get('/api/v1/admin/templates')
      .set(customer.headers)
      .expect(403);
    await request(server)
      .patch('/api/v1/admin/templates/' + template.id + '/draft')
      .set(customer.headers)
      .send({
        expectedVersion: 1,
        document: blankDesign(),
        sampleData: emptyWedding(),
      })
      .expect(403);
    await request(server)
      .post('/api/v1/admin/templates')
      .set(admin.headers)
      .send({ name: 'Test', category: 'Wedding', createdBy: customer.id })
      .expect(422);
    await request(server)
      .patch('/api/v1/admin/templates/' + template.id)
      .set(admin.headers)
      .send({ expectedVersion: 1, status: 'PUBLISHED' })
      .expect(422);
    await request(server)
      .get('/api/v1/admin/templates/invalid')
      .set(admin.headers)
      .expect(400);
    await request(server)
      .get('/api/v1/admin/templates/' + randomUUID())
      .set(admin.headers)
      .expect(404);
  });

  it('saves a complete valid draft, rejects stale versions and preserves the winning data', async () => {
    const value = detail(await create().expect(201)),
      server = f.app.getHttpServer();
    const document = blankDesign();
    document.nodes.ROOT.props.canvas.height = 2200;
    const first = await request(server)
      .patch('/api/v1/admin/templates/' + value.id + '/draft')
      .set(admin.headers)
      .send({
        expectedVersion: 1,
        document,
        sampleData: { schemaVersion: 1, bride: { name: '  Ánh  ' } },
      })
      .expect(200);
    expect(detail(first)).toMatchObject({
      editVersion: 2,
      draftDocument: document,
      draftSampleData: { schemaVersion: 1, bride: { name: 'Ánh' } },
    });
    const stale = await request(server)
      .patch('/api/v1/admin/templates/' + value.id + '/draft')
      .set(secondAdmin.headers)
      .send({
        expectedVersion: 1,
        document: blankDesign(),
        sampleData: emptyWedding(),
      })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT' });
    const after = await request(server)
      .get('/api/v1/admin/templates/' + value.id)
      .set(admin.headers)
      .expect(200);
    expect(after.body).toEqual(first.body);
  });

  it('validates document, unused sample fields and asset scope atomically', async () => {
    const value = detail(await create().expect(201)),
      server = f.app.getHttpServer(),
      asset = await f.asset(customer.principal);
    const update = (document: unknown, sampleData: unknown) =>
      request(server)
        .patch('/api/v1/admin/templates/' + value.id + '/draft')
        .set(admin.headers)
        .send({ expectedVersion: 1, document, sampleData });
    const malformed = blankDesign();
    malformed.nodes.ROOT.nodes = [randomUUID()];
    await update(malformed, emptyWedding()).expect(422);
    await update(blankDesign(), {
      schemaVersion: 1,
      bride: { name: 12 },
    }).expect(422);
    const privateRef = await update(blankDesign(), {
      schemaVersion: 1,
      bride: { photo: asset.id },
    }).expect(422);
    expect(privateRef.body).toMatchObject({ code: 'ASSET_UNAVAILABLE' });
    const after = await request(server)
      .get('/api/v1/admin/templates/' + value.id)
      .set(admin.headers)
      .expect(200);
    expect(detail(after).editVersion).toBe(1);
    expect(detail(after).draftSampleData).toEqual({
      schemaVersion: 2,
      fields: {},
    });
  });

  it('updates metadata with CAS and chooses cover override, retained thumbnail, then null', async () => {
    const template = await f.template(admin.principal),
      server = f.app.getHttpServer(),
      asset = await f.asset(admin.principal);
    const path = '/api/v1/admin/templates/' + template.id;
    expect(
      detail(await request(server).get(path).set(admin.headers).expect(200))
        .coverUrl,
    ).toBeNull();
    await request(server)
      .get('/api/v1/templates/' + template.id + '/cover')
      .set(admin.headers)
      .expect(404);
    const changed = await request(server)
      .patch(path)
      .set(admin.headers)
      .send({ expectedVersion: 1, name: 'Mẫu đổi tên', coverAssetId: asset.id })
      .expect(200);
    expect(detail(changed)).toMatchObject({
      name: 'Mẫu đổi tên',
      category: 'Wedding',
      coverAssetId: asset.id,
      coverUrl: '/api/v1/templates/' + template.id + '/cover',
      editVersion: 2,
    });
    const override = await request(server)
      .get(detail(changed).coverUrl!)
      .set(admin.headers)
      .expect(200);
    expect(override.body).toEqual(
      (
        await f.store.get(asset.object_key, asset.byte_size, {
          deadline: Date.now() + 5000,
        })
      ).bytes,
    );
    const revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    const cleared = await request(server)
      .patch(path)
      .set(admin.headers)
      .send({ expectedVersion: 2, coverAssetId: null })
      .expect(200);
    expect(detail(cleared)).toMatchObject({
      coverAssetId: null,
      coverUrl: '/api/v1/templates/' + template.id + '/cover',
    });
    const thumbnail = await request(server)
      .get(detail(cleared).coverUrl!)
      .set(admin.headers)
      .expect(200)
      .expect('Content-Type', 'image/png');
    expect(Buffer.isBuffer(thumbnail.body)).toBe(true);
    await request(server)
      .get(detail(cleared).coverUrl!)
      .set(customer.headers)
      .expect(200);
    await request(server)
      .post('/api/v1/admin/templates/' + template.id + '/unpublish')
      .set(admin.headers)
      .send({ expectedVersion: 3 })
      .expect(200);
    await request(server)
      .get(detail(cleared).coverUrl!)
      .set(customer.headers)
      .expect(404);
    await request(server)
      .get(detail(cleared).coverUrl!)
      .set(admin.headers)
      .expect(200);
    await request(server).get(detail(cleared).coverUrl!).expect(401);
    await request(server)
      .patch(path)
      .set(admin.headers)
      .send({ expectedVersion: 1, name: 'Stale' })
      .expect(409);
  });

  it('duplicates metadata and safe references into a fresh unpublished identity owned by the caller', async () => {
    const template = await f.template(admin.principal),
      server = f.app.getHttpServer(),
      asset = await f.asset(admin.principal);
    const document = blankDesign();
    document.nodes.ROOT.props.canvas.background = {
      kind: 'asset',
      assetId: asset.id,
      fit: 'cover',
      positionX: 0.5,
      positionY: 0.5,
    };
    await request(server)
      .patch('/api/v1/admin/templates/' + template.id + '/draft')
      .set(admin.headers)
      .send({ expectedVersion: 1, document, sampleData: emptyWedding() })
      .expect(200);
    const duplicate = detail(
      await request(server)
        .post('/api/v1/admin/templates/' + template.id + '/duplicate')
        .set(secondAdmin.headers)
        .send({ expectedVersion: 2, name: 'Bản sao' })
        .expect(201),
    );
    expect(duplicate).toMatchObject({
      name: 'Bản sao',
      status: 'DRAFT',
      publishedRevisionId: null,
      editVersion: 1,
      createdBy: secondAdmin.id,
      draftDocument: document,
    });
    expect(duplicate.id).not.toBe(template.id);
    expect(
      await f.db.query(
        'SELECT asset_id FROM template_draft_asset_refs WHERE template_id=$1',
        [duplicate.id],
      ),
    ).toEqual([{ asset_id: asset.id }]);
    await request(server)
      .post('/api/v1/admin/templates/' + template.id + '/duplicate')
      .set(admin.headers)
      .send({ expectedVersion: 1, name: 'Stale copy' })
      .expect(409);
  });

  it('filters metadata and returns a closed, stable catalog-ordered page', async () => {
    const server = f.app.getHttpServer();
    for (const order of [9, -4, 1])
      await request(server)
        .post('/api/v1/admin/templates')
        .set(admin.headers)
        .send({
          name: 'Danh sách ' + order,
          category: 'Cursor category',
          tags: ['tag'],
          sortOrder: order,
        })
        .expect(201);
    const first = await request(server)
      .get('/api/v1/admin/templates')
      .query({
        category: 'Cursor category',
        tag: 'tag',
        status: 'DRAFT',
        q: 'Danh sách',
        limit: 2,
      })
      .set(admin.headers)
      .expect(200);
    const page = first.body as { items: Detail[]; nextCursor: string };
    expect(page.items.map((item) => item.sortOrder)).toEqual([-4, 1]);
    expect(page.items[0]).not.toHaveProperty('draftDocument');
    const next = await request(server)
      .get('/api/v1/admin/templates')
      .query({ category: 'Cursor category', limit: 2, cursor: page.nextCursor })
      .set(admin.headers)
      .expect(200);
    expect(
      (next.body as { items: Detail[] }).items.map((item) => item.sortOrder),
    ).toEqual([9]);
  });
});
