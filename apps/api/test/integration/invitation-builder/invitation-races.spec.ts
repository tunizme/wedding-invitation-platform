import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import {
  blankDesign,
  emptyWedding,
} from '../../fixtures/invitation-builder/candidates';
import { InvitationPublicationService } from '../../../src/modules/invitations/application/invitation-publication.service';
import { resolveDesign } from '../../../src/modules/invitation-builder/domain/resolve-design';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;

describe.sequential('customer invitation transaction races', () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<Fixture['user']>>;
  let owner: Awaited<ReturnType<Fixture['user']>>;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    owner = await f.user();
  });
  afterAll(async () => {
    await f?.close();
  });

  async function publishedTemplate() {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
    return { template, revision };
  }

  it('serializes selection against template unpublish at the current revision', async () => {
    const { template, revision } = await publishedTemplate();
    const lock = f.db.createQueryRunner();
    await lock.connect();
    await lock.startTransaction();
    try {
      await lock.query(
        'SELECT id FROM invitation_templates WHERE id=$1 FOR UPDATE',
        [template.id],
      );
      const pending = request(f.app.getHttpServer())
        .post('/api/v1/invitations')
        .set(owner.headers)
        .send({ templateId: template.id, designRevisionId: revision.id });
      const response = pending.then((value) => value);
      const blockerPid = (
        (await lock.query('SELECT pg_backend_pid() AS pid')) as {
          pid: number;
        }[]
      )[0].pid;
      let blocked = false;
      for (let attempt = 0; attempt < 200 && !blocked; attempt++) {
        const rows: { blocked: boolean }[] = await f.db.query(
          'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',
          [blockerPid],
        );
        blocked = rows[0].blocked;
        if (!blocked) await new Promise((done) => setTimeout(done, 10));
      }
      expect(blocked).toBe(true);
      await lock.query(
        "UPDATE invitation_templates SET status='UNPUBLISHED' WHERE id=$1",
        [template.id],
      );
      await lock.commitTransaction();
      expect((await response).status).toBe(409);
      expect(
        await f.db.query(
          'SELECT id FROM invitations WHERE design_revision_id=$1',
          [revision.id],
        ),
      ).toEqual([]);
    } finally {
      if (lock.isTransactionActive) await lock.rollbackTransaction();
      await lock.release();
    }
  });

  it('allows one of two stale tab saves and rejects finalization after a draft edit', async () => {
    const { template, revision } = await publishedTemplate();
    const created = await request(f.app.getHttpServer())
      .post('/api/v1/invitations')
      .set(owner.headers)
      .send({ templateId: template.id, designRevisionId: revision.id })
      .expect(201);
    const id = (created.body as { id: string }).id,
      path = `/api/v1/invitations/${id}`;
    const [left, right] = await Promise.all([
      request(f.app.getHttpServer())
        .patch(`${path}/draft`)
        .set(owner.headers)
        .send({
          expectedVersion: 1,
          weddingData: { ...emptyWedding(), bride: { name: 'Mai' } },
        }),
      request(f.app.getHttpServer())
        .patch(`${path}/draft`)
        .set(owner.headers)
        .send({
          expectedVersion: 1,
          weddingData: { ...emptyWedding(), bride: { name: 'Lan' } },
        }),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const current = await request(f.app.getHttpServer())
      .get(path)
      .set(owner.headers)
      .expect(200);
    expect((current.body as { editVersion: number }).editVersion).toBe(2);
    const enqueued = await request(f.app.getHttpServer())
      .post(`${path}/publish`)
      .set(owner.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 2 })
      .expect(202);
    const jobId = (enqueued.body as { id: string }).id,
      lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [jobId, lease],
    );
    await request(f.app.getHttpServer())
      .patch(`${path}/draft`)
      .set(owner.headers)
      .send({
        expectedVersion: 2,
        weddingData: { ...emptyWedding(), bride: { name: 'Newer' } },
      })
      .expect(200);
    await expect(
      f.app.get(InvitationPublicationService).finalize({
        jobId,
        leaseOwner: lease,
        asOf: '2026-01-01T00:00:00Z',
        visibleAssetIds: [],
        hasVisibleRsvp: false,
      }),
    ).rejects.toMatchObject({
      response: 'VERSION_CONFLICT',
    });
    expect(
      await f.db.query(
        'SELECT status,public_version FROM invitations WHERE id=$1',
        [id],
      ),
    ).toMatchObject([{ status: 'DRAFT', public_version: 0 }]);
  });

  it('fences an in-flight republish when the owner unpublishes', async () => {
    const { template, revision } = await publishedTemplate();
    const created = await request(f.app.getHttpServer())
      .post('/api/v1/invitations')
      .set(owner.headers)
      .send({ templateId: template.id, designRevisionId: revision.id })
      .expect(201);
    const id = (created.body as { id: string }).id,
      path = `/api/v1/invitations/${id}`;
    const scene = resolveDesign(blankDesign(), emptyWedding(), {
      mode: 'capture',
      asOf: '2026-01-01T00:00:00Z',
    }).scene;
    await f.db.query(
      `UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,
      published_wedding_data=$3,published_scene=$4,published_at=clock_timestamp() WHERE id=$1`,
      [id, randomUUID(), emptyWedding(), scene],
    );
    const enqueued = await request(f.app.getHttpServer())
      .post(`${path}/publish`)
      .set(owner.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1 })
      .expect(202);
    const jobId = (enqueued.body as { id: string }).id,
      lease = randomUUID();
    await f.db.query(
      `UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=clock_timestamp()+interval '40 seconds' WHERE id=$1`,
      [jobId, lease],
    );
    await request(f.app.getHttpServer())
      .post(`${path}/unpublish`)
      .set(owner.headers)
      .send({ expectedVersion: 1 })
      .expect(200);
    await expect(
      f.app.get(InvitationPublicationService).finalize({
        jobId,
        leaseOwner: lease,
        asOf: '2026-01-01T00:00:00Z',
        visibleAssetIds: [],
        hasVisibleRsvp: false,
      }),
    ).rejects.toMatchObject({
      response: 'VERSION_CONFLICT',
    });
    expect(
      await f.db.query(
        'SELECT status,public_version FROM invitations WHERE id=$1',
        [id],
      ),
    ).toMatchObject([{ status: 'UNPUBLISHED', public_version: 1 }]);
  });
});
