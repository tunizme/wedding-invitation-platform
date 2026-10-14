import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import { InteractionsService } from '../../../src/modules/invitation-interactions/interactions.service';
import {
  createBlankDocument,
  resolveEditorDocument,
  validateEditorDocument,
  type AdvancedNode,
} from '../../../src/modules/invitation-builder/domain/editor-document';
import { ExpandedInvitationEditor20261012000100 } from '../../../src/infrastructure/database/migrations/20261012000100-ExpandedInvitationEditor';
import { EditorPresetService } from '../../../src/modules/invitation-builder/application/editor-preset.service';
import { UploadService } from '../../../src/modules/invitation-assets/application/upload.service';
type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
describe.sequential('expanded editor PostgreSQL contracts', () => {
  let f: Fixture,
    owner: Awaited<ReturnType<Fixture['user']>>,
    admin: typeof owner,
    other: typeof owner,
    service: InteractionsService;
  beforeAll(async () => {
    f = await builderDatabase();
    owner = await f.user();
    admin = await f.user('ADMIN');
    other = await f.user();
    service = f.app.get(InteractionsService);
  });
  afterAll(async () => {
    await f?.close();
  });
  async function published() {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id),
      invitation = await f.invitation(owner.principal, revision.id),
      document = createBlankDocument(),
      nodeId = randomUUID(),
      slug = randomUUID();
    const node: AdvancedNode = {
      type: { resolvedName: 'CustomForm' },
      isCanvas: false,
      displayName: 'CustomForm',
      parent: 'ROOT',
      hidden: false,
      nodes: [],
      linkedNodes: {},
      custom: { layerName: 'Phản hồi', locked: false, optional: false },
      props: {
        box: { x: 20, y: 20, width: 440, height: 440, rotation: 0 },
        appearance: {
          opacity: 1,
          border: { width: 0, color: '#000000FF', style: 'solid' },
          shadow: null,
          borderRadius: 0,
          background: { kind: 'solid', color: '#FFFFFF00' },
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        bindings: [],
        content: {
          label: 'Phản hồi',
          field: null,
          fields: [
            {
              id: 'name',
              label: 'Họ tên',
              type: 'text',
              required: true,
              options: [],
            },
          ],
        },
      },
    };
    document.nodes[nodeId] = node;
    document.nodes.ROOT.nodes = [nodeId];
    document.settings.toolbar.wishes = true;
    document.settings.toolbar.likes = true;
    expect(validateEditorDocument(document).valid).toBe(true);
    const scene = resolveEditorDocument(
      document,
      { schemaVersion: 1 },
      { mode: 'capture', asOf: '2026-01-01T00:00:00Z' },
    ).scene;
    await f.db.query(
      "UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,published_at=clock_timestamp(),published_wedding_data=draft_wedding_data,published_scene=$3 WHERE id=$1",
      [invitation.id, slug, scene],
    );
    return { id: invitation.id, slug, nodeId, document, scene };
  }
  it('serves published editor-document through the public projection without draft fields', async () => {
    const i = await published();
    const response = await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${i.slug}`)
      .expect(200);
    const body = response.body as {
      scene: { schemaVersion: number };
      context: { mode: string };
      draftWeddingData?: unknown;
    };
    expect(body.scene.schemaVersion).toBe(3);
    expect(body.context.mode).toBe('public');
    expect(body.draftWeddingData).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('refuses retired public scene contracts without falling back to another renderer', async () => {
    const i = await published();
    for (const version of [1, 2]) {
      await f.db.query(
        'UPDATE invitations SET published_scene=$2,public_version=public_version+1,published_at=clock_timestamp() WHERE id=$1',
        [
          i.id,
          version === 1
            ? {
                schemaVersion: 1,
                rendererContractVersion: 1,
                canvas: i.scene.canvas,
                elements: [],
              }
            : {
                schemaVersion: 2,
                rendererContractVersion: 2,
                sectionOrder: [],
                sections: {},
                nodes: {},
              },
        ],
      );
      await request(f.app.getHttpServer())
        .get(`/api/v1/public/invitations/${i.slug}`)
        .expect(404);
      await request(f.app.getHttpServer())
        .get(
          `/api/v1/public/invitations/${i.slug}/releases/${version + 1}/assets/${randomUUID()}`,
        )
        .expect(404);
    }
    await f.db.query(
      'UPDATE invitations SET published_scene=$2,public_version=public_version+1,published_at=clock_timestamp() WHERE id=$1',
      [i.id, i.scene],
    );
    await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${i.slug}`)
      .expect(200);
  });
  it('creates one500 editor, rejects version selection/old drafts and removes conversion', async () => {
    const t = await request(f.app.getHttpServer())
      .post('/api/v1/admin/templates')
      .set(admin.headers)
      .send({ name: 'Canvas500', category: 'Wedding' })
      .expect(201);
    const created = t.body as {
      id: string;
      editVersion: number;
      draftDocument: {
        schemaVersion: number;
        nodes: { ROOT: { props: { canvas: { width: number } } } };
      };
      draftSampleData: unknown;
    };
    expect(created.draftDocument.schemaVersion).toBe(3);
    expect(created.draftSampleData).toEqual({ schemaVersion: 2, fields: {} });
    await request(f.app.getHttpServer())
      .patch(`/api/v1/admin/templates/${created.id}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: created.editVersion,
        document: created.draftDocument,
        sampleData: created.draftSampleData,
      })
      .expect(200);

    expect(created.draftDocument.nodes.ROOT.props.canvas.width).toBe(500);
    for (const schemaVersion of [1, 2, 3])
      await request(f.app.getHttpServer())
        .post('/api/v1/admin/templates')
        .set(admin.headers)
        .send({ name: 'Rejected', category: 'Wedding', schemaVersion })
        .expect(422);
    await request(f.app.getHttpServer())
      .post(`/api/v1/admin/templates/${created.id}/convert-500`)
      .set(admin.headers)
      .send({ expectedVersion: created.editVersion })
      .expect(404);
    const legacy = await f.template(admin.principal);
    await request(f.app.getHttpServer())
      .patch(`/api/v1/admin/templates/${created.id}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: created.editVersion + 1,
        document: { ...legacy.draft_document, schemaVersion: 1 },
        sampleData: created.draftSampleData,
      })
      .expect(422);
  });
  it('moderates wishes, audits, retries once and preserves private projections', async () => {
    const i = await published(),
      key = randomUUID(),
      body = { name: 'Khách', message: 'Chúc hạnh phúc' };
    const values = await Promise.all([
      service.submit(i.slug, key, body, '127.0.0.1'),
      service.submit(i.slug, key, body, '127.0.0.1'),
    ]);
    expect(values[0].receipt.receiptId).toBe(values[1].receipt.receiptId);
    expect((await service.wishes(i.slug, {})).items).toHaveLength(0);
    await expect(
      service.submit(
        i.slug,
        key,
        { ...body, message: 'Đổi lời chúc' },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
    await service.moderate(
      admin.principal,
      i.id,
      values[0].receipt.receiptId,
      { status: 'APPROVED' },
      true,
    );
    expect((await service.wishes(i.slug, {})).items).toHaveLength(1);
    expect(
      await f.db.query(
        'SELECT * FROM invitation_moderation_events WHERE invitation_id=$1',
        [i.id],
      ),
    ).toHaveLength(1);
    await expect(
      service.ownerList(other.principal, i.id, {}),
    ).rejects.toThrow();
  });
  it('makes browser likes concurrent/idempotent and removable', async () => {
    const i = await published(),
      browser = randomUUID();
    await Promise.all([
      service.likes(i.slug, browser, true, '127.0.0.1'),
      service.likes(i.slug, browser, true, '127.0.0.1'),
    ]);
    expect(await service.likes(i.slug, browser)).toEqual({
      count: 1,
      liked: true,
    });
    expect(await service.likes(i.slug, browser, false, '127.0.0.1')).toEqual({
      count: 0,
      liked: false,
    });
  });
  it('validates published form and only owner reads answers; retry survives republish', async () => {
    const i = await published(),
      key = randomUUID(),
      body = { answers: { name: 'Khách' } };
    const first = await service.submit(
      i.slug,
      key,
      body,
      '127.0.0.1',
      i.nodeId,
    );
    await expect(
      service.submit(
        i.slug,
        randomUUID(),
        { answers: { other: 'private' } },
        '127.0.0.1',
        i.nodeId,
      ),
    ).rejects.toThrow();
    expect(
      (await service.ownerList(owner.principal, i.id, {}, true)).items,
    ).toHaveLength(1);
    await expect(
      service.ownerList(admin.principal, i.id, {}, true, true),
    ).rejects.toThrow();
    await expect(
      service.ownerList(other.principal, i.id, {}, true),
    ).rejects.toThrow();
    await f.db.query(
      "UPDATE invitations SET status='UNPUBLISHED' WHERE id=$1",
      [i.id],
    );
    const replay = await service.submit(
      i.slug,
      key,
      body,
      '127.0.0.1',
      i.nodeId,
    );
    expect(replay.receipt).toEqual(first.receipt);
    await expect(
      service.submit(i.slug, randomUUID(), body, '127.0.0.1', i.nodeId),
    ).rejects.toThrow();
  });
  it('enforces bounded new writes and expires source hashes without deleting responses', async () => {
    const i = await published();
    for (let n = 0; n < 5; n++)
      await service.submit(
        i.slug,
        randomUUID(),
        { name: 'Khách', message: String(n) },
        '127.0.0.1',
      );
    await expect(
      service.submit(
        i.slug,
        randomUUID(),
        { name: 'Khách', message: '6' },
        '127.0.0.1',
      ),
    ).rejects.toThrow();
    await f.db.query(
      "UPDATE invitation_wishes SET created_at=clock_timestamp()-interval '25 hours' WHERE invitation_id=$1",
      [i.id],
    );
    await service.cleanup();
    const rows = await f.db.query<{ source_hash: Buffer | null }[]>(
      'SELECT source_hash FROM invitation_wishes WHERE invitation_id=$1',
      [i.id],
    );
    expect(rows).toHaveLength(5);
    expect(
      rows.every((r: { source_hash: unknown }) => r.source_hash === null),
    ).toBe(true);
  });
  it('retains preset-only media and rejects foreign owner assets', async () => {
    const asset = await f.asset(admin.principal),
      document = createBlankDocument();
    document.settings.shareImageId = asset.id;
    const presets = f.app.get(EditorPresetService),
      preset = await presets.save(admin.principal, {
        name: 'Preset',
        category: 'Ảnh',
        document,
      });
    await expect(
      f.refs.delete(asset.id, admin.principal, {
        deadline: Date.now() + 10000,
      }),
    ).rejects.toThrow();
    await presets.remove(admin.principal, preset.id, {
      expectedVersion: preset.editVersion,
    });
    await f.refs.delete(asset.id, admin.principal, {
      deadline: Date.now() + 10000,
    });
  });
  it('validates MP3 metadata and prevents unsafe downgrade before DDL', async () => {
    const frame = Buffer.alloc(417);
    frame.writeUInt32BE(0xfffb9000);
    const bytes = Buffer.concat([frame, frame, frame]);
    const asset = await f.app
      .get(UploadService)
      .uploadAudio(
        { buffer: bytes, size: bytes.length, mimetype: 'audio/mpeg' },
        { name: 'Audio', kind: 'AUDIO' },
        admin.principal,
        { deadline: Date.now() + 10000 },
      );
    expect(asset.mime_type).toBe('audio/mpeg');
    expect(asset.duration_ms).toBeGreaterThan(0);
    const runner = f.db.createQueryRunner();
    try {
      await expect(
        new ExpandedInvitationEditor20261012000100().down(runner),
      ).rejects.toThrow('Cannot downgrade');
      expect(
        (
          await f.db.query<{ table: string | null }[]>(
            "SELECT to_regclass('invitation_wishes') AS table",
          )
        )[0].table,
      ).not.toBeNull();
    } finally {
      await runner.release();
    }
  });
});
