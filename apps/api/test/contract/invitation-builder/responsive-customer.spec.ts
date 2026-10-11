import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  responsiveDatabase,
  responsiveDocument,
} from '../../fixtures/invitation-builder/responsive-seed';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
type Fixture = Awaited<ReturnType<typeof responsiveDatabase>>;
let f: Fixture;
beforeAll(async () => {
  f = await responsiveDatabase();
});
afterAll(async () => {
  await f?.close();
});
it('allows Customer data1 on pinned v2, preserves draft/public separation and rejects design or foreign actors', async () => {
  const admin = await f.user('ADMIN'),
    customer = await f.user('CUSTOMER'),
    other = await f.user('CUSTOMER');
  const template = await f.template(admin.principal);
  const document = responsiveDocument(),
    revisionId = randomUUID();
  const thumbnail = await f.asset(admin.principal, 'SYSTEM_THUMBNAIL');
  await f.db.query<Record<string, unknown>[]>(
    'INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,created_by,thumbnail_asset_id) VALUES($1,$2,1,2,$3,$4,$5,2,$6,$7)',
    [
      revisionId,
      template.id,
      document,
      { schemaVersion: 1 },
      canonicalHash({ document, data: { schemaVersion: 1 } }),
      admin.id,
      thumbnail.id,
    ],
  );
  await f.db.query<Record<string, unknown>[]>(
    "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
    [template.id, revisionId],
  );
  const app = f.app.getHttpServer();
  const created = await request(app)
    .post('/api/v1/invitations')
    .set(customer.headers)
    .send({ templateId: template.id, designRevisionId: revisionId })
    .expect(201);
  const id = (created.body as { id: string }).id;
  for (const patch of [
    { document },
    { style: {} },
    { bindings: [] },
    { layout: 'desktop' },
    { weddingData: { schemaVersion: 2 } },
  ])
    await request(app)
      .patch(`/api/v1/invitations/${id}/draft`)
      .set(customer.headers)
      .send({ expectedVersion: 1, weddingData: { schemaVersion: 1 }, ...patch })
      .expect(422);
  await request(app)
    .patch(`/api/v1/invitations/${id}/draft`)
    .set(other.headers)
    .send({ expectedVersion: 1, weddingData: { schemaVersion: 1 } })
    .expect(404);
  await request(app)
    .patch(`/api/v1/invitations/${id}/draft`)
    .set(admin.headers)
    .send({ expectedVersion: 1, weddingData: { schemaVersion: 1 } })
    .expect(403);
  await request(app).get(`/api/v1/invitations/${id}`).expect(401);
  const saved = await request(app)
    .patch(`/api/v1/invitations/${id}/draft`)
    .set(customer.headers)
    .send({
      expectedVersion: 1,
      weddingData: { schemaVersion: 1, bride: { name: 'Mai' } },
    })
    .expect(200);
  expect((saved.body as { designRevisionId: string }).designRevisionId).toBe(
    revisionId,
  );
  expect((saved.body as { document: unknown }).document).toEqual(document);
  await request(app)
    .patch(`/api/v1/invitations/${id}/draft`)
    .set(customer.headers)
    .send({ expectedVersion: 1, weddingData: { schemaVersion: 1 } })
    .expect(409);
  expect(
    (
      await f.db.query<Record<string, unknown>[]>(
        'SELECT published_scene,public_version,design_revision_id FROM invitations WHERE id=$1',
        [id],
      )
    )[0],
  ).toEqual({
    published_scene: null,
    public_version: 0,
    design_revision_id: revisionId,
  });
});
