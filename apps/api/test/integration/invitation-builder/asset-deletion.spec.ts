import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import {
  blankDesign,
  emptyScene,
} from '../../fixtures/invitation-builder/candidates';
import {
  AssetObjectMissingError,
  StorageUnavailableError,
} from '../../../src/modules/invitation-assets/domain/asset-store.port';
import { AssetCleanupWorker } from '../../../src/modules/invitation-assets/infrastructure/asset-cleanup.worker';
import { validateEditorDocument } from '../../../src/modules/invitation-builder/domain/editor-document';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
import { resolveDesign } from '../../../src/modules/invitation-builder/domain/resolve-design';
import { UploadService } from '../../../src/modules/invitation-assets/application/upload.service';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
type Account = Awaited<ReturnType<Fixture['user']>>;
const context = () => ({ deadline: Date.now() + 10_000 });

describe.sequential('cascading image deletion', () => {
  let f: Fixture;
  let admin: Account;
  let customer: Account;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    customer = await f.user();
  });
  afterAll(async () => {
    await f?.close();
  });
  it('deletes referenced music from drafts and published revisions and storage', async () => {
    const frame = Buffer.alloc(417);
    frame.writeUInt32BE(0xfffb9000);
    const bytes = Buffer.concat([frame, frame, frame]);
    const asset = await f.app
      .get(UploadService)
      .uploadAudio(
        { buffer: bytes, size: bytes.length, mimetype: 'audio/mpeg' },
        { name: 'Music delete', kind: 'AUDIO' },
        admin.principal,
        context(),
      );
    const template = await f.template(admin.principal),
      document = blankDesign();
    document.settings.audio.assetId = asset.id;
    await f.db.query(
      'UPDATE invitation_templates SET draft_document=$2 WHERE id=$1',
      [template.id, document],
    );
    await f.db.transaction((m) =>
      f.refs.replaceTemplateDraft(
        m,
        template.id,
        document,
        { schemaVersion: 1 },
        admin.principal,
      ),
    );
    const revision = await f.revision(admin.principal, template.id, {
      document,
      sampleData: { schemaVersion: 1 },
    });
    await f.db.transaction((m) =>
      f.refs.replaceRevision(m, revision.id, [asset.id], admin.principal),
    );
    await request(f.app.getHttpServer())
      .delete(`/api/v1/assets/${asset.id}`)
      .set(admin.headers)
      .expect(204);
    const [draft] = await f.db.query<{ draft_document: typeof document }[]>(
      'SELECT draft_document FROM invitation_templates WHERE id=$1',
      [template.id],
    );
    const [published] = await f.db.query<{ document: typeof document }[]>(
      'SELECT document FROM template_design_revisions WHERE id=$1',
      [revision.id],
    );
    expect(draft.draft_document.settings.audio.assetId).toBeNull();
    expect(published.document.settings.audio.assetId).toBeNull();
    expect(await f.store.head(asset.object_key, context())).toBeNull();
  });

  it('deletes the physical storage object only after committing the tombstone', async () => {
    const asset = await f.asset(admin.principal);
    await f.refs.delete(asset.id, admin.principal, context());
    expect(await f.store.head(asset.object_key, context())).toBeNull();
    await expect(
      f.store.get(asset.object_key, asset.byte_size, context()),
    ).rejects.toBeInstanceOf(AssetObjectMissingError);
    expect(
      (
        await f.db.query<{ status: string }[]>(
          'SELECT status FROM assets WHERE id=$1',
          [asset.id],
        )
      )[0].status,
    ).toBe('DELETED');
  });

  it('redacts all templates, revisions, public snapshots, presets and publication candidates', async () => {
    const asset = await f.asset(admin.principal),
      keep = await f.asset(admin.principal);
    const document = blankDesign(),
      image = randomUUID(),
      text = randomUUID(),
      album = randomUUID();
    const appearance = {
      opacity: 1,
      border: { width: 0, color: '#000000FF', style: 'solid' as const },
      shadow: null,
      borderRadius: 0,
    };
    document.nodes[image] = {
      type: { resolvedName: 'Image' },
      isCanvas: false,
      displayName: 'Image',
      custom: { layerName: 'Image', locked: false, optional: false },
      hidden: false,
      parent: 'ROOT',
      nodes: [],
      linkedNodes: {},
      props: {
        box: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
        appearance,
        content: {
          assetId: asset.id,
          fit: 'cover',
          positionX: 0.5,
          positionY: 0.5,
        },
        bindings: [],
      },
    };
    document.nodes[text] = structuredClone(document.nodes[image]);
    document.nodes[text].props.content.assetId = keep.id;
    document.nodes[text].props.appearance.background = {
      kind: 'asset',
      assetId: asset.id,
      fit: 'cover',
      positionX: 0.5,
      positionY: 0.5,
    };
    document.nodes[album] = {
      type: { resolvedName: 'Album' },
      isCanvas: false,
      displayName: 'Album',
      custom: { layerName: 'Album', locked: false, optional: false },
      hidden: false,
      parent: 'ROOT',
      nodes: [],
      linkedNodes: {},
      props: {
        box: { x: 0, y: 200, width: 100, height: 100, rotation: 0 },
        appearance: {
          ...structuredClone(appearance),
          background: { kind: 'solid', color: '#FFFFFF00' },
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        },
        content: { label: 'Album', field: null, assetIds: [asset.id, keep.id] },
        bindings: [],
      },
    };
    document.nodes.ROOT.nodes = [image, text, album];
    document.nodes.ROOT.props.canvas.background = {
      kind: 'asset',
      assetId: asset.id,
      fit: 'cover',
      positionX: 0.5,
      positionY: 0.5,
    };
    document.settings.shareImageId = asset.id;
    document.nodeOptions[image] = { mask: 'circle' };
    document.nodeOptions[text] = { action: { kind: 'scroll', value: image } };
    const data = {
      schemaVersion: 2,
      fields: {
        gallery: { assetIds: [asset.id, keep.id], posterId: asset.id },
        caption: { text: asset.id },
      },
    };
    const templates = await Promise.all([
      f.template(admin.principal),
      f.template(admin.principal),
    ]);
    for (const t of templates) {
      await f.db.query(
        'UPDATE invitation_templates SET draft_document=$2,draft_sample_data=$3,cover_asset_id=$4 WHERE id=$1',
        [t.id, document, data, asset.id],
      );
      await f.db.transaction((m) =>
        f.refs.replaceTemplateDraft(
          m,
          t.id,
          document,
          data as never,
          admin.principal,
        ),
      );
    }
    const revision = await f.revision(admin.principal, templates[0].id, {
      document,
      sampleData: data as never,
    });
    await f.db.transaction((m) =>
      f.refs.replaceRevision(
        m,
        revision.id,
        [asset.id, keep.id],
        admin.principal,
      ),
    );
    const invitation = await f.invitation(customer.principal, revision.id),
      unpublished = await f.invitation(customer.principal, revision.id);
    const scene = emptyScene();
    scene.canvas.background = structuredClone(
      document.nodes.ROOT.props.canvas.background,
    );
    scene.settings.shareImageId = asset.id;
    scene.elements = [
      {
        id: image,
        type: 'Image',
        ...structuredClone(document.nodes[image].props),
      },
    ];
    scene.nodeOptions[image] = { mask: 'circle' };
    for (const row of [invitation, unpublished]) {
      await f.db.query(
        `UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,published_wedding_data=$3,published_scene=$4,published_at=clock_timestamp() WHERE id=$1`,
        [row.id, randomUUID(), { schemaVersion: 2, fields: {} }, scene],
      );
    }
    await f.db.query(
      "UPDATE invitations SET status='UNPUBLISHED' WHERE id=$1",
      [unpublished.id],
    );
    const preset = randomUUID(),
      presetRevision = randomUUID();
    await f.db.query(
      "INSERT INTO editor_presets(id,name,category,created_by) VALUES($1,'Delete test','Images',$2)",
      [preset, admin.id],
    );
    await f.db.query(
      'INSERT INTO editor_preset_revisions(id,preset_id,revision,document) VALUES($1,$2,1,$3)',
      [presetRevision, preset, document],
    );
    await f.db.query(
      'INSERT INTO editor_preset_asset_refs(revision_id,asset_id) VALUES($1,$2),($1,$3)',
      [presetRevision, asset.id, keep.id],
    );
    // Queue a valid publication while the image is still READY.
    expect(
      validateEditorDocument(document).valid,
      JSON.stringify(validateEditorDocument(document)),
    ).toBe(true);
    expect(
      resolveDesign(document, data as never, {
        mode: 'capture',
        asOf: '2026-01-01T00:00:00Z',
      }).issues,
    ).toEqual([]);
    const job = await request(f.app.getHttpServer())
      .post(`/api/v1/admin/templates/${templates[0].id}/publish`)
      .set(admin.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1 });
    expect(job.status, JSON.stringify(job.body)).toBe(202);
    await f.refs.delete(asset.id, admin.principal, context());
    for (const t of templates) {
      const [row] = await f.db.query<
        {
          draft_document: typeof document;
          draft_sample_data: typeof data;
          cover_asset_id: string | null;
          edit_version: number;
        }[]
      >('SELECT * FROM invitation_templates WHERE id=$1', [t.id]);
      expect(row.cover_asset_id).toBeNull();
      expect(row.edit_version).toBe(2);
      expect(validateEditorDocument(row.draft_document).valid).toBe(true);
      expect(row.draft_document.nodes[image]).toBeUndefined();
      expect(row.draft_document.nodes[text]).toBeTruthy();
      expect(row.draft_document.nodeOptions[text].action).toBeUndefined();
      expect(row.draft_document.nodes.ROOT.props.canvas.background.kind).toBe(
        'solid',
      );
      expect(row.draft_document.settings.shareImageId).toBeNull();
      expect(row.draft_sample_data.fields.gallery.assetIds).toEqual([keep.id]);
      expect(row.draft_sample_data.fields.caption.text).toBe(asset.id); // Literal text is not a reference.
    }
    const [publishedRevision] = await f.db.query<
      {
        document: unknown;
        sample_data: unknown;
        document_hash: string;
        thumbnail_asset_id: string | null;
      }[]
    >('SELECT * FROM template_design_revisions WHERE id=$1', [revision.id]);
    expect(publishedRevision.thumbnail_asset_id).toBeNull();
    expect(publishedRevision.document_hash).toBe(
      canonicalHash({
        document: publishedRevision.document,
        data: publishedRevision.sample_data,
      }),
    );
    for (const row of [invitation, unpublished]) {
      const [updated] = await f.db.query<
        {
          status: string;
          public_version: number;
          published_scene: typeof scene;
        }[]
      >('SELECT * FROM invitations WHERE id=$1', [row.id]);
      expect(updated.status).toBe(
        row.id === invitation.id ? 'PUBLISHED' : 'UNPUBLISHED',
      );
      expect(updated.public_version).toBe(2);
      expect(updated.published_scene.elements).toEqual([]);
      expect(updated.published_scene.settings.shareImageId).toBeNull();
    }
    for (const table of [
      'template_draft_asset_refs',
      'template_revision_asset_refs',
      'invitation_asset_refs',
      'editor_preset_asset_refs',
      'publication_job_asset_refs',
    ])
      expect(
        await f.db.query(`SELECT asset_id FROM ${table} WHERE asset_id=$1`, [
          asset.id,
        ]),
      ).toEqual([]);
    const [savedPreset] = await f.db.query<
      { edit_version: number; document: typeof document }[]
    >(
      'SELECT p.edit_version,r.document FROM editor_presets p JOIN editor_preset_revisions r ON r.preset_id=p.id AND r.revision=p.edit_version WHERE p.id=$1',
      [preset],
    );
    expect(savedPreset.edit_version).toBe(2);
    expect(savedPreset.document.nodes[image]).toBeUndefined();
    expect(
      (
        await f.db.query<{ status: string; error_code: string }[]>(
          'SELECT status,error_code FROM publication_jobs WHERE id=$1',
          [(job.body as { id: string }).id],
        )
      )[0],
    ).toMatchObject({ status: 'FAILED', error_code: 'ASSET_UNAVAILABLE' });
    expect(await f.store.head(asset.object_key, context())).toBeNull();
    expect(await f.store.head(keep.object_key, context())).toBeTruthy();
    await expect(
      f.db.query(
        "UPDATE template_design_revisions SET sample_data='{}'::jsonb WHERE id=$1",
        [revision.id],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await request(f.app.getHttpServer())
      .patch(`/api/v1/admin/templates/${templates[0].id}/draft`)
      .set(admin.headers)
      .send({ expectedVersion: 2, document, sampleData: data })
      .expect(422);
  });

  it('clears customer draft and published data while preserving other customers and supports storage retry', async () => {
    const own = await f.asset(customer.principal),
      other = await f.user(),
      otherAsset = await f.asset(other.principal);
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id),
      invitation = await f.invitation(customer.principal, revision.id);
    const data = {
      schemaVersion: 2,
      bride: { photo: own.id },
      fields: { photos: { assetIds: [own.id], posterId: own.id } },
    };
    const scene = emptyScene();
    scene.settings.shareImageId = own.id;
    await f.db.query(
      `UPDATE invitations SET draft_wedding_data=$2,published_wedding_data=$2,published_scene=$3,status='PUBLISHED',public_slug=$4,public_version=1,published_at=clock_timestamp() WHERE id=$1`,
      [invitation.id, data, scene, randomUUID()],
    );
    await f.db.query(
      "INSERT INTO invitation_asset_refs(invitation_id,slot,asset_id) VALUES($1,'DRAFT',$2),($1,'PUBLISHED',$2)",
      [invitation.id, own.id],
    );
    await request(f.app.getHttpServer())
      .delete(`/api/v1/assets/${own.id}`)
      .set(other.headers)
      .expect(404);
    const remove = f.store.delete.bind(f.store);
    f.store.delete = () => Promise.reject(new StorageUnavailableError());
    try {
      await request(f.app.getHttpServer())
        .delete(`/api/v1/assets/${own.id}`)
        .set(customer.headers)
        .expect(503);
    } finally {
      f.store.delete = remove;
    }
    const [row] = await f.db.query<
      {
        draft_wedding_data: typeof data;
        published_wedding_data: typeof data;
        published_scene: typeof scene;
      }[]
    >('SELECT * FROM invitations WHERE id=$1', [invitation.id]);
    expect(row.draft_wedding_data.bride.photo).toBeUndefined();
    expect(row.published_wedding_data.fields.photos.assetIds).toEqual([]);
    expect(row.published_scene.settings.shareImageId).toBeNull();
    expect(await f.store.head(own.object_key, context())).toBeTruthy();
    expect(await f.app.get(AssetCleanupWorker).runBatch()).toMatchObject({
      tombstones: 1,
    });
    expect(await f.store.head(own.object_key, context())).toBeNull();
    expect(await f.store.head(otherAsset.object_key, context())).toBeTruthy();
    await request(f.app.getHttpServer())
      .delete(`/api/v1/assets/${own.id}`)
      .set(customer.headers)
      .expect(204);
  });
});
