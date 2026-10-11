import type { TemplateDesignV2 } from '../../../src/modules/invitation-builder/domain/document.types';
type DetailBody = { draftDocument: TemplateDesignV2; editVersion: number };
import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import {
  responsiveDatabase,
  responsiveDocument,
} from '../../fixtures/invitation-builder/responsive-seed';
type Fixture = Awaited<ReturnType<typeof responsiveDatabase>>;
let f: Fixture;
beforeAll(async () => {
  f = await responsiveDatabase();
});
afterAll(async () => {
  await f?.close();
});
it('Admin v2 save/reload/CAS and duplicate remap preserve immutable revision and reject other roles', async () => {
  const admin = await f.user('ADMIN'),
    customer = await f.user('CUSTOMER');
  const app = f.app.getHttpServer();
  const template = await f.template(admin.principal),
    previous = await f.revision(admin.principal, template.id),
    document = responsiveDocument();
  await request(app)
    .patch(`/api/v1/admin/templates/${template.id}/draft`)
    .set(customer.headers)
    .send({ expectedVersion: 1, document, sampleData: { schemaVersion: 1 } })
    .expect(403);
  await request(app)
    .patch(`/api/v1/admin/templates/${template.id}/draft`)
    .set(admin.headers)
    .send({ expectedVersion: 1, document, sampleData: { schemaVersion: 2 } })
    .expect(422);
  const saved = await request(app)
    .patch(`/api/v1/admin/templates/${template.id}/draft`)
    .set(admin.headers)
    .send({ expectedVersion: 1, document, sampleData: { schemaVersion: 1 } })
    .expect(200);
  expect((saved.body as DetailBody).draftDocument).toEqual(document);
  const loaded = await request(app)
    .get(`/api/v1/admin/templates/${template.id}`)
    .set(admin.headers)
    .expect(200);
  expect((loaded.body as DetailBody).draftDocument).toEqual(document);
  await request(app)
    .patch(`/api/v1/admin/templates/${template.id}/draft`)
    .set(admin.headers)
    .send({ expectedVersion: 1, document, sampleData: { schemaVersion: 1 } })
    .expect(409);
  const copied = await request(app)
    .post(`/api/v1/admin/templates/${template.id}/duplicate`)
    .set(admin.headers)
    .send({
      expectedVersion: (saved.body as DetailBody).editVersion,
      name: 'Bản sao responsive',
    })
    .expect(201);
  const copy = (copied.body as DetailBody).draftDocument;
  expect(copy.schemaVersion).toBe(2);
  expect(copy.sectionOrder.every((id: string) => !document.sections[id])).toBe(
    true,
  );
  expect(Object.keys(copy.nodes).every((id) => !document.nodes[id])).toBe(true);
  for (const id of copy.sectionOrder) {
    expect(copy.sections[id].id).toBe(id);
    for (const child of [
      ...copy.sections[id].flowNodeIds,
      ...copy.sections[id].artworkNodeIds,
    ])
      expect(copy.nodes[child].id).toBe(child);
  }
  expect(
    (
      await f.db.query<Record<string, unknown>[]>(
        'SELECT document FROM template_design_revisions WHERE id=$1',
        [previous.id],
      )
    )[0].document,
  ).toEqual(previous.document);
});
