import { RetainUnpublishedTemplateRevision20261004000100 } from '../../../src/infrastructure/database/migrations/20261004000100-RetainUnpublishedTemplateRevision';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { TemplatePublicationService } from '../../../src/modules/invitation-builder/publication/template-publication.service';
import { PublicationService } from '../../../src/modules/invitation-builder/publication/publication.service';
import { AssetCleanupWorker } from '../../../src/modules/invitation-assets/infrastructure/asset-cleanup.worker';
import { AssetObjectMissingError } from '../../../src/modules/invitation-assets/domain/asset-store.port';
import { StorageUnavailableError } from '../../../src/modules/invitation-assets/domain/asset-store.port';
import {
  ChromiumRenderer,
  TrustedRenderError,
} from '../../../src/modules/invitation-builder/publication/chromium-renderer';
import {
  blankDesign,
  emptyWedding,
  fixtureBytes,
} from '../../fixtures/invitation-builder/candidates';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
type Operation = { id: string };
type Problem = { code: string };
type PublicationWorkerPort = {
  failOwned: (
    jobId: string,
    leaseOwner: string,
    code: string,
  ) => Promise<boolean>;
  reclaimExpired: () => Promise<number>;
  process: (claimed: { id: string; lease_owner: string }) => Promise<void>;
};

describe.sequential('publication admission and state races', () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<Fixture['user']>>;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
  });
  afterAll(async () => {
    await f?.close();
  });
  afterEach(async () => {
    if (!f) return;
    await f.db.query('DELETE FROM publication_job_asset_refs');
    await f.db
      .query(`UPDATE publication_jobs SET status='FAILED',error_code='RENDER_UNAVAILABLE',completed_at=clock_timestamp(),
      candidate_document=NULL,candidate_data=NULL,staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL
      WHERE status IN ('PENDING','RUNNING')`);
  });

  const publish = (
    templateId: string,
    key = randomUUID(),
    expectedVersion = 1,
  ) =>
    request(f.app.getHttpServer())
      .post(`/api/v1/admin/templates/${templateId}/publish`)
      .set(admin.headers)
      .set('Idempotency-Key', key)
      .send({ expectedVersion });

  it('atomically admits a matching concurrent retry once and excludes a competing key', async () => {
    const template = await f.template(admin.principal),
      key = randomUUID();
    const concurrent = await Promise.all([
      publish(template.id, key),
      publish(template.id, key),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      202, 202,
    ]);
    const first = concurrent[0].body as Operation,
      second = concurrent[1].body as Operation;
    expect(first.id).toBe(second.id);
    expect(
      await f.db.query('SELECT id FROM publication_jobs WHERE template_id=$1', [
        template.id,
      ]),
    ).toHaveLength(1);
    const conflict = await publish(template.id).expect(409);
    expect((conflict.body as Problem).code).toBe('PUBLICATION_IN_PROGRESS');
  });

  it('does not replace an existing public pointer while a new immutable candidate waits', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    const queued = await publish(template.id).expect(202),
      operation = queued.body as Operation;
    const unchanged = await f.db.query<
      { status: string; published_revision_id: string; edit_version: number }[]
    >(
      'SELECT status,published_revision_id,edit_version FROM invitation_templates WHERE id=$1',
      [template.id],
    );
    expect(unchanged[0]).toMatchObject({
      status: 'PUBLISHED',
      published_revision_id: revision.id,
      edit_version: 1,
    });
    expect(
      await f.db.query(
        'SELECT status,candidate_document,candidate_data FROM publication_jobs WHERE id=$1',
        [operation.id],
      ),
    ).toHaveLength(1);
  });

  it('advances editVersion on repeat unpublish while a republish candidate is active', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    await publish(template.id).expect(202);
    await request(f.app.getHttpServer())
      .post(`/api/v1/admin/templates/${template.id}/unpublish`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(200);
    const repeated = await request(f.app.getHttpServer())
      .post(`/api/v1/admin/templates/${template.id}/unpublish`)
      .set(admin.headers)
      .send({ expectedVersion: 2 })
      .expect(200);
    expect(
      repeated.body as {
        status: string;
        editVersion: number;
        publishedRevisionId: string | null;
      },
      repeated.text,
    ).toMatchObject({
      status: 'UNPUBLISHED',
      editVersion: 3,
      publishedRevisionId: revision.id,
    });
    expect(
      await f.db.query(
        'SELECT expected_edit_version,status FROM publication_jobs WHERE template_id=$1',
        [template.id],
      ),
    ).toMatchObject([{ expected_edit_version: 1, status: 'PENDING' }]);
  });

  it('bounds admission at twelve queued or running renderer jobs', async () => {
    const templates = await Promise.all(
      Array.from({ length: 12 }, () => f.template(admin.principal)),
    );
    const accepted = await Promise.all(
      templates.map((template) => publish(template.id)),
    );
    expect(accepted.every((response) => response.status === 202)).toBe(true);
    const extraTemplate = await f.template(admin.principal),
      previous = await f.revision(admin.principal, extraTemplate.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [extraTemplate.id, previous.id],
    );
    const extra = await publish(extraTemplate.id).expect(503);
    expect(extra.headers['retry-after']).toBe('5');
    expect((extra.body as Problem).code).toBe('RENDER_QUEUE_FULL');
    expect(
      await f.db.query(
        'SELECT status,published_revision_id,edit_version FROM invitation_templates WHERE id=$1',
        [extraTemplate.id],
      ),
    ).toMatchObject([
      {
        status: 'PUBLISHED',
        published_revision_id: previous.id,
        edit_version: 1,
      },
    ]);
  });

  it('terminalizes an expired lease and clears candidate payload and reference rows', async () => {
    const template = await f.template(admin.principal),
      asset = await f.asset(admin.principal);
    const accepted = await publish(template.id).expect(202),
      operation = accepted.body as Operation;
    const lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()-interval '1 second',staged_thumbnail_key=$3 WHERE id=$1`,
      [operation.id, lease, `${randomUUID()}/${randomUUID()}.png`],
    );
    await f.db.query(
      'INSERT INTO publication_job_asset_refs(job_id,asset_id) VALUES($1,$2)',
      [operation.id, asset.id],
    );
    const worker = f.app.get<PublicationWorkerPort>('PUBLICATION_WORKER');
    expect(await worker.reclaimExpired()).toBe(1);
    const rows = await f.db.query<
      {
        status: string;
        error_code: string;
        candidate_document: unknown;
        candidate_data: unknown;
        staged_thumbnail_key: string | null;
      }[]
    >(
      'SELECT status,error_code,candidate_document,candidate_data,staged_thumbnail_key FROM publication_jobs WHERE id=$1',
      [operation.id],
    );
    expect(rows[0]).toMatchObject({
      status: 'FAILED',
      candidate_document: null,
      candidate_data: null,
      staged_thumbnail_key: null,
    });
    expect(rows[0].error_code).toBeTruthy();
    expect(
      await f.db.query(
        'SELECT job_id FROM publication_job_asset_refs WHERE job_id=$1',
        [operation.id],
      ),
    ).toEqual([]);
  });

  it('ignores an expired worker failure after a successor owns the lease', async () => {
    const template = await f.template(admin.principal),
      asset = await f.asset(admin.principal);
    const accepted = await publish(template.id).expect(202),
      operation = accepted.body as Operation;
    const stale = randomUUID(),
      successor = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '20 seconds' WHERE id=$1`,
      [operation.id, stale],
    );
    await f.db.query(
      'INSERT INTO publication_job_asset_refs(job_id,asset_id) VALUES($1,$2)',
      [operation.id, asset.id],
    );
    await f.db.query(
      `UPDATE publication_jobs SET attempts=2,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [operation.id, successor],
    );
    const current = await f.db.query<{ lease_owner: string }[]>(
      'SELECT lease_owner FROM publication_jobs WHERE id=$1',
      [operation.id],
    );
    expect(current[0].lease_owner).toBe(successor);
    const worker = f.app.get<PublicationWorkerPort>('PUBLICATION_WORKER');
    expect(await worker.failOwned(operation.id, stale, 'RENDER_TIMEOUT')).toBe(
      false,
    );
    const rows = await f.db.query<
      { status: string; lease_owner: string; candidate_document: unknown }[]
    >(
      'SELECT status,lease_owner,candidate_document FROM publication_jobs WHERE id=$1',
      [operation.id],
    );
    expect(rows[0]).toMatchObject({
      status: 'RUNNING',
      lease_owner: successor,
    });
    expect(rows[0].candidate_document).toBeTruthy();
    expect(
      await f.db.query(
        'SELECT job_id FROM publication_job_asset_refs WHERE job_id=$1',
        [operation.id],
      ),
    ).toHaveLength(1);
  });

  it('atomically commits a lease-owned template revision, thumbnail reference, and receipt', async () => {
    const template = await f.template(admin.principal),
      accepted = await publish(template.id).expect(202);
    const operation = accepted.body as Operation,
      lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [operation.id, lease],
    );
    const png = await sharp({
      create: { width: 390, height: 520, channels: 4, background: '#FFFFFFFF' },
    })
      .png()
      .toBuffer();
    const thumbnail = await f.writer.prepare(
      png,
      'image/png',
      { deadline: Date.now() + 10000 },
      { id: operation.id, leaseToken: lease },
    );
    const finalizer = f.app.get(TemplatePublicationService);
    const result = await finalizer.finalize({
      jobId: operation.id,
      leaseOwner: lease,
      thumbnail,
      asOf: '2026-01-01T00:00:00.000Z',
      visibleAssetIds: [],
      hasVisibleRsvp: false,
    });
    expect(result).toMatchObject({ resourceId: template.id, editVersion: 2 });
    const current = await f.db.query<
      { status: string; edit_version: number; published_revision_id: string }[]
    >(
      'SELECT status,edit_version,published_revision_id FROM invitation_templates WHERE id=$1',
      [template.id],
    );
    expect(current[0]).toMatchObject({
      status: 'PUBLISHED',
      edit_version: 2,
      published_revision_id: result.revisionId,
    });
    const revision = await f.db.query<{ thumbnail_asset_id: string }[]>(
      'SELECT thumbnail_asset_id FROM template_design_revisions WHERE id=$1',
      [result.revisionId],
    );
    expect(revision[0].thumbnail_asset_id).toBe(result.thumbnailAssetId);
    expect(
      await f.db.query(
        'SELECT job_id FROM publication_job_asset_refs WHERE job_id=$1',
        [operation.id],
      ),
    ).toEqual([]);
    const receipt = await f.app
      .get(PublicationService)
      .getOperation(admin.principal, operation.id);
    expect(receipt).toMatchObject({
      status: 'SUCCEEDED',
      result: {
        resourceId: template.id,
        editVersion: 2,
        revisionId: result.revisionId,
      },
    });
  });

  it('rejects a stale thumbnail finalizer without changing the public pointer or successor artifact', async () => {
    const template = await f.template(admin.principal),
      previous = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, previous.id],
    );
    const accepted = await publish(template.id).expect(202),
      operation = accepted.body as Operation;
    const stale = randomUUID(),
      successor = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [operation.id, stale],
    );
    const png = await sharp({
      create: { width: 390, height: 520, channels: 4, background: '#FFFFFFFF' },
    })
      .png()
      .toBuffer();
    const oldThumbnail = await f.writer.prepare(
      png,
      'image/png',
      { deadline: Date.now() + 10000 },
      { id: operation.id, leaseToken: stale },
    );
    await f.db.query(
      `UPDATE publication_jobs SET attempts=2,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [operation.id, successor],
    );
    const finalizer = f.app.get(TemplatePublicationService);
    await expect(
      finalizer.finalize({
        jobId: operation.id,
        leaseOwner: stale,
        thumbnail: oldThumbnail,
        asOf: '2026-01-01T00:00:00.000Z',
        visibleAssetIds: [],
        hasVisibleRsvp: false,
      }),
    ).rejects.toMatchObject({ problemCode: 'VERSION_CONFLICT' });
    expect(
      await f.db.query(
        'SELECT published_revision_id FROM invitation_templates WHERE id=$1',
        [template.id],
      ),
    ).toMatchObject([{ published_revision_id: previous.id }]);
    expect(
      await f.db.query('SELECT id FROM assets WHERE object_key=$1', [
        oldThumbnail.intent.object_key,
      ]),
    ).toEqual([]);
    const nextThumbnail = await f.writer.prepare(
      png,
      'image/png',
      { deadline: Date.now() + 10000 },
      { id: operation.id, leaseToken: successor },
    );
    const result = await finalizer.finalize({
      jobId: operation.id,
      leaseOwner: successor,
      thumbnail: nextThumbnail,
      asOf: '2026-01-01T00:00:00.000Z',
      visibleAssetIds: [],
      hasVisibleRsvp: false,
    });
    expect(
      await f.db.query(
        'SELECT published_revision_id FROM invitation_templates WHERE id=$1',
        [template.id],
      ),
    ).toMatchObject([{ published_revision_id: result.revisionId }]);
    expect(
      await f.db.query('SELECT object_key FROM assets WHERE id=$1', [
        result.thumbnailAssetId,
      ]),
    ).toMatchObject([{ object_key: nextThumbnail.intent.object_key }]);
    await f.db.query(
      `UPDATE asset_storage_writes SET status='ABANDONED',cleaned_at=clock_timestamp()-interval '2 hours'
      WHERE id=$1`,
      [oldThumbnail.intent.id],
    );
    await f.app.get(AssetCleanupWorker).runBatch();
    await expect(
      f.store.get(oldThumbnail.intent.object_key, png.length, {
        deadline: Date.now() + 5000,
      }),
    ).rejects.toBeInstanceOf(AssetObjectMissingError);
    expect(
      await f.store.head(nextThumbnail.intent.object_key, {
        deadline: Date.now() + 5000,
      }),
    ).toBeTruthy();
    expect(
      await f.db.query(
        'SELECT status,lease_owner FROM publication_jobs WHERE id=$1',
        [operation.id],
      ),
    ).toMatchObject([{ status: 'SUCCEEDED', lease_owner: null }]);
  });

  it.each([
    ['renderer unavailable', 'RENDER_UNAVAILABLE'],
    ['font unavailable', 'FONT_UNAVAILABLE'],
    ['image or layout overflow', 'CONTENT_OVERFLOW'],
    ['renderer timeout', 'RENDER_TIMEOUT'],
    ['renderer contract mismatch', 'RENDER_VERSION_MISMATCH'],
  ] as const)('keeps the previous revision on %s', async (_scenario, code) => {
    const template = await f.template(admin.principal),
      previous = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, previous.id],
    );
    const accepted = await publish(template.id).expect(202),
      operation = accepted.body as Operation,
      lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [operation.id, lease],
    );
    const renderer = f.app.get(ChromiumRenderer),
      original = renderer.capture.bind(renderer);
    const issue = {
      path: '/nodes/00000000-0000-4000-8000-000000000001/content',
      nodeId: '00000000-0000-4000-8000-000000000001',
      code: 'CONTENT_OVERFLOW',
    };
    renderer.capture = () =>
      Promise.reject(new TrustedRenderError(code, [issue]));
    try {
      await f.app
        .get<PublicationWorkerPort>('PUBLICATION_WORKER')
        .process({ id: operation.id, lease_owner: lease });
    } finally {
      renderer.capture = original;
    }
    expect(
      await f.db.query(
        'SELECT status,published_revision_id,edit_version FROM invitation_templates WHERE id=$1',
        [template.id],
      ),
    ).toMatchObject([
      {
        status: 'PUBLISHED',
        published_revision_id: previous.id,
        edit_version: 1,
      },
    ]);
    expect(
      await f.db.query(
        'SELECT status,error_code,candidate_document,candidate_data,issues FROM publication_jobs WHERE id=$1',
        [operation.id],
      ),
    ).toMatchObject([
      {
        status: 'FAILED',
        error_code: code,
        candidate_document: null,
        candidate_data: null,
        issues: [issue],
      },
    ]);
  });

  it('keeps the previous revision when thumbnail storage fails after capture', async () => {
    const template = await f.template(admin.principal),
      previous = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, previous.id],
    );
    const accepted = await publish(template.id).expect(202),
      operation = accepted.body as Operation,
      lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [operation.id, lease],
    );
    const renderer = f.app.get(ChromiumRenderer),
      originalCapture = renderer.capture.bind(renderer);
    const originalPut = f.store.put.bind(f.store);
    const png = await sharp({
      create: { width: 390, height: 520, channels: 4, background: '#FFFFFFFF' },
    })
      .png()
      .toBuffer();
    renderer.capture = () =>
      Promise.resolve({ png, issues: [], hasVisibleRsvp: false });
    f.store.put = () => Promise.reject(new StorageUnavailableError());
    try {
      await f.app
        .get<PublicationWorkerPort>('PUBLICATION_WORKER')
        .process({ id: operation.id, lease_owner: lease });
    } finally {
      renderer.capture = originalCapture;
      f.store.put = originalPut;
    }
    expect(
      await f.db.query(
        'SELECT status,published_revision_id,edit_version FROM invitation_templates WHERE id=$1',
        [template.id],
      ),
    ).toMatchObject([
      {
        status: 'PUBLISHED',
        published_revision_id: previous.id,
        edit_version: 1,
      },
    ]);
    expect(
      await f.db.query(
        'SELECT status,error_code,candidate_document,candidate_data FROM publication_jobs WHERE id=$1',
        [operation.id],
      ),
    ).toMatchObject([
      {
        status: 'FAILED',
        error_code: 'RENDER_UNAVAILABLE',
        candidate_document: null,
        candidate_data: null,
      },
    ]);
  });

  for (const target of ['template', 'invitation'] as const)
    it(`rejects same-size corrupted asset before ${target} capture and retains the prior release`, async () => {
      const template = await f.template(admin.principal),
        previous = await f.revision(admin.principal, template.id);
      const image = await f.asset(admin.principal),
        document = blankDesign();
      document.nodes.ROOT.props.canvas.background = {
        kind: 'asset',
        assetId: image.id,
        fit: 'cover',
        positionX: 0.5,
        positionY: 0.5,
      };
      await request(f.app.getHttpServer())
        .patch(`/api/v1/admin/templates/${template.id}/draft`)
        .set(admin.headers)
        .send({ expectedVersion: 1, document, sampleData: emptyWedding() })
        .expect(200);
      await f.db.query(
        "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
        [template.id, previous.id],
      );
      let resourceId = template.id,
        headers = admin.headers;
      if (target === 'invitation') {
        const { canonicalHash } =
          await import('../../../src/modules/invitation-builder/domain/validation-helpers');
        const revisionId = randomUUID();
        await f.db.query(
          `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by)
        SELECT $1,template_id,revision_number+1,schema_version,$2,sample_data,$3,renderer_contract_version,thumbnail_asset_id,created_by FROM template_design_revisions WHERE id=$4`,
          [revisionId, document, canonicalHash(document), previous.id],
        );
        await f.db.query(
          'INSERT INTO template_revision_asset_refs(revision_id,asset_id) VALUES($1,$2)',
          [revisionId, image.id],
        );
        const owner = await f.user();
        headers = owner.headers;
        const invitation = await f.invitation(owner.principal, revisionId);
        resourceId = invitation.id;
      }
      const url =
        target === 'template'
          ? `/api/v1/admin/templates/${resourceId}/publish`
          : `/api/v1/invitations/${resourceId}/publish`;
      const enqueue = (expectedVersion: number) =>
        request(f.app.getHttpServer())
          .post(url)
          .set(headers)
          .set('Idempotency-Key', randomUUID())
          .send({ expectedVersion });
      const worker = f.app.get<PublicationWorkerPort>('PUBLICATION_WORKER');
      const renderer = f.app.get(ChromiumRenderer),
        originalCapture = renderer.capture.bind(renderer),
        originalGet = f.store.get.bind(f.store);
      let captures = 0;
      renderer.capture = () => {
        captures++;
        return Promise.resolve({
          png: fixtureBytes(),
          issues: [],
          hasVisibleRsvp: false,
        });
      };
      const process = async (id: string) => {
        const lease = randomUUID();
        await f.db.query(
          "UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1",
          [id, lease],
        );
        await worker.process({ id, lease_owner: lease });
      };
      try {
        const first = await enqueue(target === 'template' ? 2 : 1).expect(202);
        await process((first.body as Operation).id);
        expect(captures).toBe(1);
        const table =
          target === 'template' ? 'invitation_templates' : 'invitations';
        const [before] = await f.db.query<Record<string, unknown>[]>(
          `SELECT * FROM ${table} WHERE id=$1`,
          [resourceId],
        );
        expect(before.status).toBe('PUBLISHED');
        const revisions = await f.db.query<{ id: string }[]>(
          'SELECT id FROM template_design_revisions WHERE template_id=$1',
          [template.id],
        );
        const assets = await f.db.query<{ id: string }[]>(
          'SELECT id FROM assets',
        );
        f.store.get = async (...args) => {
          const object = await originalGet(...args);
          if (args[0] !== image.object_key) return object;
          const bytes = Buffer.from(object.bytes);
          bytes[0] ^= 1;
          return { ...object, bytes };
        };
        const corrupt = await enqueue(before.edit_version as number).expect(
          202,
        );
        await process((corrupt.body as Operation).id);
        expect(captures).toBe(1);
        expect(
          await f.db.query(`SELECT * FROM ${table} WHERE id=$1`, [resourceId]),
        ).toEqual([before]);
        expect(
          await f.db.query(
            'SELECT id FROM template_design_revisions WHERE template_id=$1',
            [template.id],
          ),
        ).toEqual(revisions);
        expect(await f.db.query('SELECT id FROM assets')).toEqual(assets);
        expect(
          await f.db.query(
            'SELECT status,error_code FROM publication_jobs WHERE id=$1',
            [(corrupt.body as Operation).id],
          ),
        ).toMatchObject([
          { status: 'FAILED', error_code: 'RENDER_UNAVAILABLE' },
        ]);
      } finally {
        renderer.capture = originalCapture;
        f.store.get = originalGet;
      }
    });

  it('keeps the previous revision when a referenced image disappears before capture', async () => {
    const template = await f.template(admin.principal),
      previous = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, previous.id],
    );
    const image = await f.asset(admin.principal),
      document = blankDesign();
    document.nodes.ROOT.props.canvas.background = {
      kind: 'asset',
      assetId: image.id,
      fit: 'cover',
      positionX: 0.5,
      positionY: 0.5,
    };
    await request(f.app.getHttpServer())
      .patch(`/api/v1/admin/templates/${template.id}/draft`)
      .set(admin.headers)
      .send({ expectedVersion: 1, document, sampleData: emptyWedding() })
      .expect(200);
    const accepted = await publish(template.id, randomUUID(), 2).expect(202),
      operation = accepted.body as Operation,
      lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [operation.id, lease],
    );
    await f.store.delete(image.object_key, { deadline: Date.now() + 5000 });
    await f.app
      .get<PublicationWorkerPort>('PUBLICATION_WORKER')
      .process({ id: operation.id, lease_owner: lease });
    expect(
      await f.db.query(
        'SELECT status,published_revision_id,edit_version FROM invitation_templates WHERE id=$1',
        [template.id],
      ),
    ).toMatchObject([
      {
        status: 'PUBLISHED',
        published_revision_id: previous.id,
        edit_version: 2,
      },
    ]);
    expect(
      await f.db.query(
        'SELECT status,error_code FROM publication_jobs WHERE id=$1',
        [operation.id],
      ),
    ).toMatchObject([{ status: 'FAILED', error_code: 'ASSET_UNAVAILABLE' }]);
  });
  it('rejects never-published templates and retains revision/cover on an idempotent unpublish', async () => {
    const template = await f.template(admin.principal);
    const url = `/api/v1/admin/templates/${template.id}/unpublish`;
    const notPublished = await request(f.app.getHttpServer())
      .post(url)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(409);
    expect((notPublished.body as Problem).code).toBe('NOT_PUBLISHED');
    const revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    const first = await request(f.app.getHttpServer())
      .post(url)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(200);
    expect(first.body).toMatchObject({
      publishedRevisionId: revision.id,
      editVersion: 2,
      draftDocument: template.draft_document,
      coverUrl: `/api/v1/templates/${template.id}/cover`,
    });
    const repeated = await request(f.app.getHttpServer())
      .post(url)
      .set(admin.headers)
      .send({ expectedVersion: 2 })
      .expect(200);
    expect(repeated.body).toEqual(first.body);
    await request(f.app.getHttpServer())
      .get(`/api/v1/templates/${template.id}/cover`)
      .set(admin.headers)
      .expect(200);
    const customer = await f.user();
    await request(f.app.getHttpServer())
      .get(`/api/v1/templates/${template.id}/cover`)
      .set(customer.headers)
      .expect(404);
  });

  it('backfills legacy unpublished pointers and repairs never-published legacy rows without changing old migrations', async () => {
    const retained = await f.template(admin.principal),
      draft = await f.template(admin.principal);
    const revision = await f.revision(admin.principal, retained.id);
    const runner = f.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new RetainUnpublishedTemplateRevision20261004000100();
      await migration.down(runner);
      await runner.query(
        "UPDATE invitation_templates SET status='UNPUBLISHED',published_revision_id=NULL WHERE id=ANY($1::uuid[])",
        [[retained.id, draft.id]],
      );
      await migration.up(runner);
      const rows = (await runner.query(
        'SELECT id,status,published_revision_id FROM invitation_templates WHERE id=ANY($1::uuid[])',
        [[retained.id, draft.id]],
      )) as {
        id: string;
        status: string;
        published_revision_id: string | null;
      }[];
      expect(rows.find((row) => row.id === retained.id)).toMatchObject({
        status: 'UNPUBLISHED',
        published_revision_id: revision.id,
      });
      expect(rows.find((row) => row.id === draft.id)).toMatchObject({
        status: 'DRAFT',
        published_revision_id: null,
      });
      await expect(
        runner.query(
          'UPDATE invitation_templates SET published_revision_id=NULL WHERE id=$1',
          [retained.id],
        ),
      ).rejects.toThrow();
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('uses the invitation enqueue clock unchanged across worker retries', async () => {
    const owner = await f.user();
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    const invitation = await f.invitation(owner.principal, revision.id);
    const operation = await f.app
      .get(PublicationService)
      .enqueueInvitation(owner.principal, invitation.id, 1, randomUUID());
    const rows = await f.db.query<{ created_at: Date }[]>(
      'SELECT created_at FROM publication_jobs WHERE id=$1',
      [operation.id],
    );
    const asOf = rows[0].created_at.toISOString();
    expect(Math.abs(Date.now() - Date.parse(asOf))).toBeLessThan(10_000);
    const renderer = f.app.get(ChromiumRenderer),
      capture = renderer.capture.bind(renderer);
    const clocks: string[] = [];
    const worker = f.app.get<PublicationWorkerPort>('PUBLICATION_WORKER');
    const failOwned = worker.failOwned.bind(worker);
    // Simulate a lost terminalization write: the next owned attempt retries the same captured job.
    worker.failOwned = () => Promise.resolve(false);
    renderer.capture = (input) => {
      clocks.push(input.asOf);
      return Promise.reject(new TrustedRenderError('RENDER_UNAVAILABLE'));
    };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const lease = randomUUID();
        await f.db.query(
          `UPDATE publication_jobs SET status='RUNNING',attempts=$3,lease_owner=$2,lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
          [operation.id, lease, attempt + 1],
        );
        await f.app
          .get<PublicationWorkerPort>('PUBLICATION_WORKER')
          .process({ id: operation.id, lease_owner: lease });
      }
    } finally {
      renderer.capture = capture;
      worker.failOwned = failOwned;
    }
    expect(clocks).toEqual([asOf, asOf]);
  });
});
