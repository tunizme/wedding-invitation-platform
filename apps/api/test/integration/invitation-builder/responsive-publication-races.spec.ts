import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { TemplatePublicationService } from '../../../src/modules/invitation-builder/publication/template-publication.service';
import { AssetCleanupWorker } from '../../../src/modules/invitation-assets/infrastructure/asset-cleanup.worker';
import { AssetObjectMissingError } from '../../../src/modules/invitation-assets/domain/asset-store.port';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import {
  responsiveDatabase,
  responsiveDocument,
} from '../../fixtures/invitation-builder/responsive-seed';
import {
  ChromiumRenderer,
  TrustedRenderError,
} from '../../../src/modules/invitation-builder/publication/chromium-renderer';
type Fixture = Awaited<ReturnType<typeof responsiveDatabase>>;
type Worker = {
  failOwned: (id: string, lease: string, code: string) => Promise<boolean>;
  reclaimExpired: () => Promise<number>;
  process: (job: { id: string; lease_owner: string }) => Promise<void>;
};
describe.sequential('responsive publication failure preservation', () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<Fixture['user']>>;
  beforeAll(async () => {
    f = await responsiveDatabase();
    admin = await f.user('ADMIN');
  });
  afterAll(async () => {
    await f?.close();
  });
  afterEach(async () => {
    await f.db.query<Record<string, unknown>[]>(
      "UPDATE publication_jobs SET status='FAILED',error_code='RENDER_UNAVAILABLE',completed_at=clock_timestamp(),candidate_document=NULL,candidate_data=NULL,staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE status IN ('PENDING','RUNNING')",
    );
    await f.db.query<Record<string, unknown>[]>(
      'DELETE FROM publication_job_asset_refs',
    );
  });
  for (const code of [
    'CONTENT_OVERFLOW',
    'FONT_UNAVAILABLE',
    'RENDER_TIMEOUT',
    'RENDER_VERSION_MISMATCH',
  ] as const)
    it(`keeps prior revision on desktop ${code} failure`, async () => {
      const template = await f.template(admin.principal);
      const previous = await f.revision(admin.principal, template.id);
      const document = responsiveDocument();
      await f.db.query<Record<string, unknown>[]>(
        "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2,draft_document=$3 WHERE id=$1",
        [template.id, previous.id, document],
      );
      const accepted = await request(f.app.getHttpServer())
        .post(`/api/v1/admin/templates/${template.id}/publish`)
        .set(admin.headers)
        .set('Idempotency-Key', randomUUID())
        .send({ expectedVersion: 1 })
        .expect(202);
      const id = (accepted.body as { id: string }).id,
        lease = randomUUID();
      await f.db.query<Record<string, unknown>[]>(
        "UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1",
        [id, lease],
      );
      const renderer = f.app.get(ChromiumRenderer),
        original = renderer.capture.bind(renderer);
      const sid = document.sectionOrder[0];
      renderer.capture = (input) => {
        expect(input.scene.schemaVersion).toBe(2);
        return Promise.reject(
          new TrustedRenderError(code, [
            {
              path: `/sections/${sid}`,
              code: 'CONTENT_OVERFLOW',
              sectionId: sid,
              layout: 'desktop',
            },
          ]),
        );
      };
      try {
        await f.app
          .get<Worker>('PUBLICATION_WORKER')
          .process({ id, lease_owner: lease });
      } finally {
        renderer.capture = original;
      }
      expect(
        (
          await f.db.query<Record<string, unknown>[]>(
            'SELECT status,published_revision_id,edit_version FROM invitation_templates WHERE id=$1',
            [template.id],
          )
        )[0],
      ).toMatchObject({
        status: 'PUBLISHED',
        published_revision_id: previous.id,
        edit_version: 1,
      });
      expect(
        (
          await f.db.query<Record<string, unknown>[]>(
            'SELECT status,error_code,issues FROM publication_jobs WHERE id=$1',
            [id],
          )
        )[0],
      ).toMatchObject({
        status: 'FAILED',
        error_code: code,
        issues: [{ sectionId: sid, layout: 'desktop' }],
      });
    });
  async function queued(withAsset = false) {
    const template = await f.template(admin.principal);
    const previous = await f.revision(admin.principal, template.id);
    const asset = withAsset ? await f.asset(admin.principal) : undefined;
    const document = responsiveDocument(
      asset ? [asset.id, asset.id] : undefined,
    );
    await f.db.query<Record<string, unknown>[]>(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2,draft_document=$3 WHERE id=$1",
      [template.id, previous.id, document],
    );
    const response = await request(f.app.getHttpServer())
      .post(`/api/v1/admin/templates/${template.id}/publish`)
      .set(admin.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1 })
      .expect(202);
    const id = (response.body as { id: string }).id,
      lease = randomUUID();
    await f.db.query<Record<string, unknown>[]>(
      "UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1",
      [id, lease],
    );
    return { template, previous, document, id, lease, asset };
  }
  async function thumbnail(id: string, lease: string) {
    const png = await sharp({
      create: { width: 390, height: 520, channels: 4, background: '#FFFAF4FF' },
    })
      .png()
      .toBuffer();
    return f.writer.prepare(
      png,
      'image/png',
      { deadline: Date.now() + 10000 },
      { id, leaseToken: lease },
    );
  }
  it('commits full immutable scene2 metadata, mobile thumbnail and receipt atomically', async () => {
    const q = await queued(true);
    const prepared = await thumbnail(q.id, q.lease);
    const result = await f.app.get(TemplatePublicationService).finalize({
      jobId: q.id,
      leaseOwner: q.lease,
      thumbnail: prepared,
      asOf: '2026-01-01T00:00:00.000Z',
      visibleAssetIds: [q.asset!.id],
      hasVisibleRsvp: true,
    });
    const [revision] = await f.db.query<Record<string, unknown>[]>(
      'SELECT * FROM template_design_revisions WHERE id=$1',
      [result.revisionId],
    );
    expect(revision).toMatchObject({
      schema_version: 2,
      renderer_contract_version: 2,
      document: q.document,
      thumbnail_asset_id: result.thumbnailAssetId,
    });
    expect(
      (
        await f.db.query<Record<string, unknown>[]>(
          'SELECT width,height FROM assets WHERE id=$1',
          [result.thumbnailAssetId],
        )
      )[0],
    ).toEqual({ width: 390, height: 520 });
    expect(
      await f.db.query<Record<string, unknown>[]>(
        'SELECT * FROM publication_job_asset_refs WHERE job_id=$1',
        [q.id],
      ),
    ).toEqual([]);
    expect(
      (
        await f.db.query<Record<string, unknown>[]>(
          'SELECT status,result_revision_id FROM publication_jobs WHERE id=$1',
          [q.id],
        )
      )[0],
    ).toMatchObject({
      status: 'SUCCEEDED',
      result_revision_id: result.revisionId,
    });
    await expect(
      f.db.query<Record<string, unknown>[]>(
        'UPDATE template_design_revisions SET document=$2 WHERE id=$1',
        [result.revisionId, q.previous.document],
      ),
    ).rejects.toThrow();
  });
  for (const race of ['edit', 'unpublish', 'lease', 'deadline'] as const)
    it(`fences ${race} before committing v2 or staging references`, async () => {
      const q = await queued();
      const prepared = await thumbnail(q.id, q.lease);
      if (race === 'edit')
        await f.db.query<Record<string, unknown>[]>(
          'UPDATE invitation_templates SET edit_version=edit_version+1 WHERE id=$1',
          [q.template.id],
        );
      if (race === 'unpublish')
        await request(f.app.getHttpServer())
          .post(`/api/v1/admin/templates/${q.template.id}/unpublish`)
          .set(admin.headers)
          .send({ expectedVersion: 1 })
          .expect(200);
      if (race === 'lease')
        await f.db.query<Record<string, unknown>[]>(
          'UPDATE publication_jobs SET lease_owner=$2,attempts=2 WHERE id=$1',
          [q.id, randomUUID()],
        );
      if (race === 'deadline') {
        const [original] = await f.db.query<Record<string, unknown>[]>(
          'SELECT * FROM publication_jobs WHERE id=$1',
          [q.id],
        );
        await f.db.query<Record<string, unknown>[]>(
          "UPDATE publication_jobs SET status='FAILED',error_code='RENDER_TIMEOUT',completed_at=clock_timestamp(),candidate_document=NULL,candidate_data=NULL,staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL WHERE id=$1",
          [q.id],
        );
        const aged = randomUUID();
        await f.db.query<Record<string, unknown>[]>(
          `INSERT INTO publication_jobs(id,template_id,requested_by,request_key,request_hash,expected_edit_version,candidate_document,candidate_data,candidate_hash,status,attempts,lease_owner,lease_expires_at,created_at,deadline_at)
   VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,'RUNNING',1,$9,$10,$11,$10)`,
          [
            aged,
            q.template.id,
            original.requested_by,
            randomUUID(),
            original.request_hash,
            original.candidate_document,
            original.candidate_data,
            original.candidate_hash,
            q.lease,
            new Date(Date.now() - 1000),
            new Date(Date.now() - 91000),
          ],
        );
        q.id = aged;
      }
      await expect(
        f.app.get(TemplatePublicationService).finalize({
          jobId: q.id,
          leaseOwner: q.lease,
          thumbnail: prepared,
          asOf: '2026-01-01T00:00:00.000Z',
          visibleAssetIds: [],
          hasVisibleRsvp: true,
        }),
      ).rejects.toMatchObject({ problemCode: 'VERSION_CONFLICT' });
      expect(
        (
          await f.db.query<Record<string, unknown>[]>(
            'SELECT published_revision_id FROM invitation_templates WHERE id=$1',
            [q.template.id],
          )
        )[0].published_revision_id,
      ).toBe(q.previous.id);
      expect(
        await f.db.query<Record<string, unknown>[]>(
          'SELECT id FROM assets WHERE object_key=$1',
          [prepared.intent.object_key],
        ),
      ).toEqual([]);
    });
  it('retains queued nested assets against deletion, then releases refs on deadline reclamation', async () => {
    const q = await queued(true);
    await request(f.app.getHttpServer())
      .delete(`/api/v1/assets/${q.asset!.id}`)
      .set(admin.headers)
      .expect(409);
    await f.db.query<Record<string, unknown>[]>(
      "UPDATE publication_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [q.id],
    );
    const worker = f.app.get<Worker>('PUBLICATION_WORKER');
    expect(await worker.reclaimExpired()).toBe(1);
    expect(
      await f.db.query<Record<string, unknown>[]>(
        'SELECT * FROM publication_job_asset_refs WHERE job_id=$1',
        [q.id],
      ),
    ).toEqual([]);
    expect(
      (
        await f.db.query<Record<string, unknown>[]>(
          'SELECT candidate_document,candidate_data,status FROM publication_jobs WHERE id=$1',
          [q.id],
        )
      )[0],
    ).toEqual({
      candidate_document: null,
      candidate_data: null,
      status: 'FAILED',
    });
  });
  it('rejects stale failure and staged commit while allowing the successor retry to finish and clean only old staging', async () => {
    const q = await queued();
    const old = await thumbnail(q.id, q.lease);
    const successor = randomUUID();
    await f.db.query<Record<string, unknown>[]>(
      'UPDATE publication_jobs SET lease_owner=$2,attempts=2 WHERE id=$1',
      [q.id, successor],
    );
    expect(
      await f.app
        .get<Worker>('PUBLICATION_WORKER')
        .failOwned(q.id, q.lease, 'RENDER_TIMEOUT'),
    ).toBe(false);
    await expect(
      f.app.get(TemplatePublicationService).finalize({
        jobId: q.id,
        leaseOwner: q.lease,
        thumbnail: old,
        asOf: '2026-01-01T00:00:00.000Z',
        visibleAssetIds: [],
        hasVisibleRsvp: true,
      }),
    ).rejects.toMatchObject({ problemCode: 'VERSION_CONFLICT' });
    const next = await thumbnail(q.id, successor);
    const result = await f.app.get(TemplatePublicationService).finalize({
      jobId: q.id,
      leaseOwner: successor,
      thumbnail: next,
      asOf: '2026-01-01T00:00:00.000Z',
      visibleAssetIds: [],
      hasVisibleRsvp: true,
    });
    expect(result.revisionId).not.toBe(q.previous.id);
    await f.db.query<Record<string, unknown>[]>(
      "UPDATE asset_storage_writes SET status='ABANDONED',cleaned_at=clock_timestamp()-interval '2 hours' WHERE id=$1",
      [old.intent.id],
    );
    await f.app.get(AssetCleanupWorker).runBatch();
    await expect(
      f.store.get(old.intent.object_key, 100000, {
        deadline: Date.now() + 5000,
      }),
    ).rejects.toBeInstanceOf(AssetObjectMissingError);
    expect(
      await f.store.head(next.intent.object_key, {
        deadline: Date.now() + 5000,
      }),
    ).toBeTruthy();
  });
});
