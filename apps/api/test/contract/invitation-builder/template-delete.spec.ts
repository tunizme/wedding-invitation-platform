import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { PublicationService } from '../../../src/modules/invitation-builder/publication/publication.service';

describe.sequential('delete never-published template drafts', () => {
  let f: Awaited<ReturnType<typeof builderDatabase>>;
  let admin: Awaited<ReturnType<typeof f.user>>;
  let customer: Awaited<ReturnType<typeof f.user>>;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    customer = await f.user();
  });
  afterAll(async () => {
    await f?.close();
  });
  it('deletes the draft and its references while preserving library assets', async () => {
    const template = await f.template(admin.principal);
    const asset = await f.asset(admin.principal);
    await f.db.query(
      'INSERT INTO template_draft_asset_refs(template_id,asset_id) VALUES($1,$2)',
      [template.id, asset.id],
    );
    await request(f.app.getHttpServer())
      .delete(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(204);
    await request(f.app.getHttpServer())
      .get(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .expect(404);
    expect(
      await f.db.query(
        'SELECT asset_id FROM template_draft_asset_refs WHERE template_id=$1',
        [template.id],
      ),
    ).toHaveLength(0);
    expect(
      await f.db.query("SELECT id FROM assets WHERE id=$1 AND status='READY'", [
        asset.id,
      ]),
    ).toHaveLength(1);
  });
  it('rejects customer access and stale versions without deleting', async () => {
    const template = await f.template(admin.principal);
    await request(f.app.getHttpServer())
      .delete(`/api/v1/admin/templates/${template.id}`)
      .set(customer.headers)
      .send({ expectedVersion: 1 })
      .expect(403);
    await request(f.app.getHttpServer())
      .delete(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .send({ expectedVersion: 2 })
      .expect(409);
    await request(f.app.getHttpServer())
      .get(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .expect(200);
  });
  it('preserves published templates and existing invitations', async () => {
    const template = await f.template(admin.principal);
    const revision = await f.revision(admin.principal, template.id);
    const invitation = await f.invitation(customer.principal, revision.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    await request(f.app.getHttpServer())
      .delete(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(409);
    expect(
      await f.db.query('SELECT id FROM invitations WHERE id=$1', [
        invitation.id,
      ]),
    ).toHaveLength(1);
    await f.db.query(
      "UPDATE invitation_templates SET status='UNPUBLISHED' WHERE id=$1",
      [template.id],
    );
    await request(f.app.getHttpServer())
      .delete(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(409);
  });
  it('blocks pending publication but allows deleting after a failed publication', async () => {
    const template = await f.template(admin.principal);
    const job = await f.app
      .get(PublicationService)
      .enqueueTemplate(admin.principal, template.id, 1, randomUUID());
    await request(f.app.getHttpServer())
      .delete(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(409);
    await f.db.query(
      "UPDATE publication_jobs SET status='FAILED',error_code='RENDER_UNAVAILABLE',candidate_document=NULL,candidate_data=NULL,completed_at=now() WHERE id=$1",
      [job.id],
    );
    await request(f.app.getHttpServer())
      .delete(`/api/v1/admin/templates/${template.id}`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(204);
    expect(
      await f.db.query('SELECT id FROM publication_jobs WHERE template_id=$1', [
        template.id,
      ]),
    ).toHaveLength(0);
  });
});
