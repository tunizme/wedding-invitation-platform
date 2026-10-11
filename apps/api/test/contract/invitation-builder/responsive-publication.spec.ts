import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  responsiveDatabase,
  responsiveDocument,
} from '../../fixtures/invitation-builder/responsive-seed';
import * as rendererContract from '../../../src/modules/invitation-builder/publication/chromium-renderer';
const assertV2Report = (
  rendererContract as unknown as {
    assertV2Report: (report: unknown, identity: unknown) => void;
  }
).assertV2Report;
type Fixture = Awaited<ReturnType<typeof responsiveDatabase>>;
describe.sequential('responsive publication contract', () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<Fixture['user']>>;
  beforeAll(async () => {
    f = await responsiveDatabase();
    admin = await f.user('ADMIN');
  });
  afterAll(async () => {
    await f?.close();
  });
  it('strictly validates report identity, width, pair, correlation and finite geometry', () => {
    const identity = {
      candidateHash: 'a'.repeat(64),
      containerWidth: 900 as const,
      scenePair: [2, 2] as const,
      correlationId: randomUUID(),
      hasVisibleRsvp: true,
    };
    const report = {
      protocolVersion: 2,
      candidateHash: identity.candidateHash,
      containerWidth: 900,
      scenePair: [2, 2],
      correlationId: identity.correlationId,
      ready: true,
      issues: [],
      rootRect: { x: 0, y: 0, width: 900, height: 1200 },
      captureRect: { x: 0, y: 0, width: 900, height: 520 },
      hasVisibleRsvp: true,
    };
    expect(() => assertV2Report(report, identity)).not.toThrow();
    expect(() =>
      assertV2Report(
        {
          ...report,
          ready: false,
          issues: [{ path: '/', code: 'HEIGHT_LIMIT' }],
          rootRect: { ...report.rootRect, height: 16000 },
        },
        identity,
      ),
    ).not.toThrow();
    for (const patch of [
      { protocolVersion: 1 },
      { candidateHash: 'b'.repeat(64) },
      { containerWidth: 390 },
      { scenePair: [1, 1] },
      { correlationId: randomUUID() },
      { hasVisibleRsvp: false },
      { unknown: true },
      { rootRect: { ...report.rootRect, width: 897 } },
      { rootRect: { ...report.rootRect, width: NaN } },
      { captureRect: { ...report.captureRect, height: 519 } },
      {
        issues: [{ path: '/', code: 'CONTENT_OVERFLOW', sectionId: 'invalid' }],
      },
    ])
      expect(() => assertV2Report({ ...report, ...patch }, identity)).toThrow(
        'RENDER_VERSION_MISMATCH',
      );
  });
  it('queues one immutable validated v2 candidate and preserves an existing v1 release', async () => {
    const template = await f.template(admin.principal);
    const revision = await f.revision(admin.principal, template.id);
    const document = responsiveDocument();
    await f.db.query<
      {
        candidate_document: unknown;
        candidate_data: { schemaVersion: number };
        published_revision_id: string;
      }[]
    >(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2,draft_document=$3 WHERE id=$1",
      [template.id, revision.id, document],
    );
    const key = randomUUID();
    const submit = () =>
      request(f.app.getHttpServer())
        .post(`/api/v1/admin/templates/${template.id}/publish`)
        .set(admin.headers)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 1 });
    const first = await submit().expect(202);
    const second = await submit().expect(202);
    expect((second.body as { id: string }).id).toBe(
      (first.body as { id: string }).id,
    );
    const [job] = await f.db.query<
      {
        candidate_document: unknown;
        candidate_data: { schemaVersion: number };
        published_revision_id: string;
      }[]
    >(
      'SELECT candidate_document,candidate_data,deadline_at-created_at AS budget FROM publication_jobs WHERE id=$1',
      [(first.body as { id: string }).id],
    );
    expect(job.candidate_document).toEqual(document);
    expect(job.candidate_data.schemaVersion).toBe(1);
    expect(
      (
        await f.db.query<
          {
            candidate_document: unknown;
            candidate_data: { schemaVersion: number };
            published_revision_id: string;
          }[]
        >(
          'SELECT published_revision_id FROM invitation_templates WHERE id=$1',
          [template.id],
        )
      )[0].published_revision_id,
    ).toBe(revision.id);
  });
});
