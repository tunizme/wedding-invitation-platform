import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { emptyWedding } from '../../fixtures/invitation-builder/candidates';
import { InvitationPublicationService } from '../../../src/modules/invitations/application/invitation-publication.service';
import { ChromiumRenderer } from '../../../src/modules/invitation-builder/publication/chromium-renderer';
import sharp from 'sharp';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;

describe.sequential('customer invitation contract', () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<Fixture['user']>>;
  let owner: Awaited<ReturnType<Fixture['user']>>;
  let other: Awaited<ReturnType<Fixture['user']>>;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    owner = await f.user();
    other = await f.user();
  });
  afterAll(async () => {
    await f?.close();
  });

  it('lists only current published templates and denies stale revision selection', async () => {
    const published = await f.template(admin.principal),
      revision = await f.revision(admin.principal, published.id);
    await f.template(admin.principal);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [published.id, revision.id],
    );
    const catalog = await request(f.app.getHttpServer())
      .get('/api/v1/templates')
      .set(owner.headers)
      .expect(200);
    const choices = catalog.body as {
      items: { id: string; publishedRevisionId: string }[];
    };
    expect(choices.items).toEqual([
      expect.objectContaining({
        id: published.id,
        publishedRevisionId: revision.id,
      }),
    ]);
    const selected = await request(f.app.getHttpServer())
      .get(`/api/v1/templates/${published.id}/revisions/${revision.id}`)
      .set(owner.headers)
      .expect(200);
    expect(selected.body).toMatchObject({
      id: published.id,
      revisionId: revision.id,
      document: revision.document,
    });
    expect(selected.body).toHaveProperty('formFields');
    await request(f.app.getHttpServer())
      .get(`/api/v1/templates/${published.id}/revisions/${randomUUID()}`)
      .set(owner.headers)
      .expect(404);
    await request(f.app.getHttpServer())
      .get('/api/v1/templates')
      .set(admin.headers)
      .expect(403);
  });

  it('pins the current revision, derives owner from the session and rejects identity overrides', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    const path = '/api/v1/invitations';
    await request(f.app.getHttpServer())
      .post(path)
      .set(owner.headers)
      .send({
        templateId: template.id,
        designRevisionId: revision.id,
        ownerUserId: other.id,
      })
      .expect(422);
    const created = await request(f.app.getHttpServer())
      .post(path)
      .set(owner.headers)
      .send({ templateId: template.id, designRevisionId: revision.id })
      .expect(201);
    const detail = created.body as {
      id: string;
      ownerId: string;
      designRevisionId: string;
      status: string;
      editVersion: number;
      publicUrl: string | null;
    };
    expect(detail).toMatchObject({
      ownerId: owner.id,
      designRevisionId: revision.id,
      status: 'DRAFT',
      editVersion: 1,
      publicUrl: null,
    });
    const id = detail.id;
    await request(f.app.getHttpServer())
      .get(`${path}/${id}`)
      .set(other.headers)
      .expect(404);
    await request(f.app.getHttpServer())
      .patch(`${path}/${id}/draft`)
      .set(other.headers)
      .send({ expectedVersion: 1, weddingData: emptyWedding() })
      .expect(404);
    await request(f.app.getHttpServer())
      .patch(`${path}/${id}/draft`)
      .set(owner.headers)
      .send({
        expectedVersion: 1,
        ownerUserId: other.id,
        weddingData: emptyWedding(),
      })
      .expect(422);
    const saved = await request(f.app.getHttpServer())
      .patch(`${path}/${id}/draft`)
      .set(owner.headers)
      .send({ expectedVersion: 1, weddingData: emptyWedding() })
      .expect(200);
    expect(saved.body).toMatchObject({
      id,
      editVersion: 2,
      draftWeddingData: emptyWedding(),
    });
    await request(f.app.getHttpServer())
      .patch(`${path}/${id}/draft`)
      .set(owner.headers)
      .send({ expectedVersion: 1, weddingData: emptyWedding() })
      .expect(409);
    await request(f.app.getHttpServer())
      .post(path)
      .set(owner.headers)
      .send({ templateId: template.id, designRevisionId: randomUUID() })
      .expect(409);
    await request(f.app.getHttpServer())
      .post(`/api/v1/admin/templates/${template.id}/unpublish`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(200);
    await request(f.app.getHttpServer())
      .get(`/api/v1/templates/${template.id}/revisions/${revision.id}`)
      .set(owner.headers)
      .expect(404);
    const pinned = await request(f.app.getHttpServer())
      .get(`${path}/${id}`)
      .set(owner.headers)
      .expect(200);
    expect(pinned.body).toMatchObject({
      designRevisionId: revision.id,
      document: revision.document,
    });
    const pinnedAsset = `/api/v1/templates/${template.id}/revisions/${revision.id}/assets/${revision.thumbnail_asset_id}`;
    await request(f.app.getHttpServer())
      .get(pinnedAsset)
      .set(owner.headers)
      .expect(200);
    await request(f.app.getHttpServer())
      .get(pinnedAsset)
      .set(other.headers)
      .expect(404);
  });

  it('accepts only owner-scoped customer images in WeddingData', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    const created = await request(f.app.getHttpServer())
      .post('/api/v1/invitations')
      .set(owner.headers)
      .send({ templateId: template.id, designRevisionId: revision.id })
      .expect(201);
    const id = (created.body as { id: string }).id;
    const alien = await f.asset(other.principal),
      owned = await f.asset(owner.principal);
    await request(f.app.getHttpServer())
      .patch(`/api/v1/invitations/${id}/draft`)
      .set(owner.headers)
      .send({
        expectedVersion: 1,
        weddingData: { ...emptyWedding(), bride: { photo: alien.id } },
      })
      .expect(422);
    const saved = await request(f.app.getHttpServer())
      .patch(`/api/v1/invitations/${id}/draft`)
      .set(owner.headers)
      .send({
        expectedVersion: 1,
        weddingData: { ...emptyWedding(), bride: { photo: owned.id } },
      })
      .expect(200);
    expect(saved.body).toMatchObject({
      editVersion: 2,
      draftWeddingData: { bride: { photo: owned.id } },
    });
    expect(
      await f.db.query(
        'SELECT asset_id FROM invitation_asset_refs WHERE invitation_id=$1 AND slot=$2',
        [id, 'DRAFT'],
      ),
    ).toMatchObject([{ asset_id: owned.id }]);
  });

  it('publishes immutable snapshots at a stable slug and keeps draft edits private until republish', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    const created = await request(f.app.getHttpServer())
      .post('/api/v1/invitations')
      .set(owner.headers)
      .send({ templateId: template.id, designRevisionId: revision.id })
      .expect(201);
    const id = (created.body as { id: string }).id,
      path = `/api/v1/invitations/${id}`;
    const publish = async (expectedVersion: number, key = randomUUID()) => {
      const accepted = await request(f.app.getHttpServer())
        .post(`${path}/publish`)
        .set(owner.headers)
        .set('Idempotency-Key', key)
        .send({ expectedVersion })
        .expect(202);
      const jobId = (accepted.body as { id: string }).id,
        lease = randomUUID();
      await f.db.query(
        `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
        lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
        [jobId, lease],
      );
      const result = await f.app.get(InvitationPublicationService).finalize({
        jobId,
        leaseOwner: lease,
        asOf: '2026-01-01T00:00:00.000Z',
        visibleAssetIds: [],
        hasVisibleRsvp: false,
      });
      return { key, result };
    };
    await request(f.app.getHttpServer())
      .post(`${path}/publish`)
      .set(other.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1 })
      .expect(404);
    const first = await publish(1);
    expect(first.result).toMatchObject({
      resourceId: id,
      editVersion: 2,
      publicVersion: 1,
    });
    const slug = first.result.publicUrl;
    await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug.split('/').at(-1)}`)
      .expect(200);
    const draft = { ...emptyWedding(), bride: { name: 'Tên mới' } };
    await request(f.app.getHttpServer())
      .patch(`${path}/draft`)
      .set(owner.headers)
      .send({ expectedVersion: 2, weddingData: draft })
      .expect(200);
    const before = await f.db.query<
      { published_wedding_data: unknown; draft_wedding_data: unknown }[]
    >(
      'SELECT published_wedding_data,draft_wedding_data FROM invitations WHERE id=$1',
      [id],
    );
    expect(before[0].published_wedding_data).toEqual(emptyWedding());
    expect(before[0].draft_wedding_data).toEqual(draft);
    const second = await publish(3);
    expect(second.result).toMatchObject({
      editVersion: 4,
      publicVersion: 2,
      publicUrl: slug,
    });
    const replay = await request(f.app.getHttpServer())
      .post(`${path}/publish`)
      .set(owner.headers)
      .set('Idempotency-Key', first.key)
      .send({ expectedVersion: 1 })
      .expect(202);
    expect(replay.body).toMatchObject({
      status: 'SUCCEEDED',
      result: { publicVersion: 1 },
    });
    const unpublished = await request(f.app.getHttpServer())
      .post(`${path}/unpublish`)
      .set(owner.headers)
      .send({ expectedVersion: 4 })
      .expect(200);
    const summaryKeys = [
      'id',
      'status',
      'publicUrl',
      'publicVersion',
      'editVersion',
      'controlVersion',
      'rsvpOpen',
      'createdAt',
      'updatedAt',
    ];
    expect(
      Object.keys(unpublished.body as Record<string, unknown>).sort(),
    ).toEqual(summaryKeys.sort());
    expect(unpublished.body).toMatchObject({
      id,
      status: 'UNPUBLISHED',
      editVersion: 5,
      publicVersion: 2,
      publicUrl: slug,
    });
    const unchanged = await request(f.app.getHttpServer())
      .post(`${path}/unpublish`)
      .set(owner.headers)
      .send({ expectedVersion: 5 })
      .expect(200);
    expect(unchanged.body).toEqual(unpublished.body);
    await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug.split('/').at(-1)}`)
      .expect(404);
    const third = await publish(5);
    expect(third.result).toMatchObject({
      editVersion: 6,
      publicVersion: 3,
      publicUrl: slug,
    });
    await request(f.app.getHttpServer())
      .post(`${path}/unpublish`)
      .set(owner.headers)
      .send({ expectedVersion: 6 })
      .expect(200);
    await request(f.app.getHttpServer())
      .post(`${path}/publish`)
      .set(owner.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 7 })
      .expect(202);
    const invalidated = await request(f.app.getHttpServer())
      .post(`${path}/unpublish`)
      .set(owner.headers)
      .send({ expectedVersion: 7 })
      .expect(200);
    expect(
      Object.keys(invalidated.body as Record<string, unknown>).sort(),
    ).toEqual(summaryKeys.sort());
    expect(invalidated.body).toMatchObject({
      ...(unpublished.body as Record<string, unknown>),
      publicVersion: 3,
      editVersion: 8,
      updatedAt: expect.any(String) as string,
    });
  });

  it('runs invitation publication through the leased worker and commits only after capture', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    const created = await request(f.app.getHttpServer())
      .post('/api/v1/invitations')
      .set(owner.headers)
      .send({ templateId: template.id, designRevisionId: revision.id })
      .expect(201);
    const id = (created.body as { id: string }).id;
    const accepted = await request(f.app.getHttpServer())
      .post(`/api/v1/invitations/${id}/publish`)
      .set(owner.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1 })
      .expect(202);
    const jobId = (accepted.body as { id: string }).id,
      lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [jobId, lease],
    );
    const renderer = f.app.get(ChromiumRenderer),
      original = renderer.capture.bind(renderer);
    const png = await sharp({
      create: { width: 390, height: 520, channels: 4, background: '#FFFFFFFF' },
    })
      .png()
      .toBuffer();
    renderer.capture = () =>
      Promise.resolve({ png, issues: [], hasVisibleRsvp: false });
    try {
      const worker = f.app.get<{
        process: (claim: { id: string; lease_owner: string }) => Promise<void>;
      }>('PUBLICATION_WORKER');
      await worker.process({ id: jobId, lease_owner: lease });
    } finally {
      renderer.capture = original;
    }
    expect(
      await f.db.query(
        'SELECT status,result_public_version FROM publication_jobs WHERE id=$1',
        [jobId],
      ),
    ).toMatchObject([{ status: 'SUCCEEDED', result_public_version: 1 }]);
    expect(
      await f.db.query(
        'SELECT status,public_version FROM invitations WHERE id=$1',
        [id],
      ),
    ).toMatchObject([{ status: 'PUBLISHED', public_version: 1 }]);
  });
});
