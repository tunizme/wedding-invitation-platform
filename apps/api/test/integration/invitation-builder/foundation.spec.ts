import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';
import {
  builderDatabase,
  waitForBlocked,
} from '../../fixtures/invitation-builder/database';
import {
  blankDesign,
  emptyScene,
  emptyWedding,
} from '../../fixtures/invitation-builder/candidates';
import {
  requireTemplate,
  assertVersion,
} from '../../../src/modules/invitation-builder/authorization/template.policy';
import {
  requireOwnedInvitation,
  requireAssistedInvitation,
} from '../../../src/modules/invitations/authorization/invitation.policy';
import {
  designAssetIds,
  weddingAssetIds,
} from '../../../src/modules/invitation-assets/application/asset-reference.service';
import { encodeNewestCursor } from '../../../src/modules/invitation-builder/http/input';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
type Account = Awaited<ReturnType<Fixture['user']>>;
const budget = () => ({ deadline: Date.now() + 5000 });
const settled = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value, error: undefined }),
    (error) => ({ value: undefined, error: error as unknown }),
  );

describe.sequential(
  'builder persistence, authorization and reference boundaries',
  () => {
    let f: Fixture,
      admin: Account,
      otherAdmin: Account,
      owner: Account,
      other: Account;
    beforeAll(async () => {
      f = await builderDatabase();
      admin = await f.user('ADMIN');
      otherAdmin = await f.user('ADMIN');
      owner = await f.user();
      other = await f.user();
      it('upgrades an IAM-only baseline without rewriting users, then reverses and reapplies from empty', async () => {
        const before = await f.db.query<
          {
            id: string;
            email: string;
            role: string;
            credential_version: number;
          }[]
        >('SELECT id,email,role,credential_version FROM users ORDER BY id');
        for (;;) {
          const latest = await f.db.query<{ name: string }[]>(
            'SELECT name FROM foundation_migrations ORDER BY id DESC LIMIT 1',
          );
          if (latest[0].name === 'IdentityAccess20260926000100') break;
          await f.db.undoLastMigration();
        }
        expect(
          await f.db.query(
            "SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename IN ('assets','invitations','invitation_templates','publication_jobs')",
          ),
        ).toEqual([]);
        expect(
          await f.db.query(
            'SELECT id,email,role,credential_version FROM users ORDER BY id',
          ),
        ).toEqual(before);
        expect((await f.db.runMigrations()).length).toBeGreaterThanOrEqual(2);
        expect(
          await f.db.query(
            'SELECT id,email,role,credential_version FROM users ORDER BY id',
          ),
        ).toEqual(before);
        expect(await f.db.runMigrations()).toEqual([]);
        for (let remaining = f.db.migrations.length; remaining > 0; remaining--)
          await f.db.undoLastMigration();
        expect(
          await f.db.query('SELECT name FROM foundation_migrations'),
        ).toEqual([]);
        expect((await f.db.runMigrations()).length).toBe(
          f.db.migrations.length,
        );
        expect(await f.db.runMigrations()).toEqual([]);
        expect(f.db.options.synchronize).toBe(false);
      });
    });
    afterAll(async () => {
      await f?.close();
    });

    it('enforces document versions, limits, metadata and FK constraints in migrated SQL', async () => {
      const template = await f.template(admin.principal);
      for (const [field, value] of [
        ['draft_document', {}],
        ['draft_sample_data', { schemaVersion: 3 }],
        ['edit_version', 0],
        ['tags', ['a', 'a']],
        ['sort_order', 1000001],
      ] as const) {
        await expect(
          f.db.query(
            `UPDATE invitation_templates SET ${field}=$2 WHERE id=$1`,
            [
              template.id,
              typeof value === 'object' ? JSON.stringify(value) : value,
            ],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
      await expect(
        f.db.query(
          'UPDATE invitation_templates SET cover_asset_id=$2 WHERE id=$1',
          [template.id, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        f.db.query(
          'UPDATE invitation_templates SET draft_document=$2 WHERE id=$1',
          [template.id, { schemaVersion: 1, large: 'a'.repeat(1048576) }],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const bytes = await f.db.query<{ size: string }[]>(
        'SELECT builder_json_bytes($1::jsonb) AS size',
        [{ a: 'Việt Nam', b: [1, true, null] }],
      );
      expect(Number(bytes[0].size)).toBe(
        Buffer.byteLength(
          JSON.stringify({ a: 'Việt Nam', b: [1, true, null] }),
        ),
      );
    });

    it('keeps revisions, revision references, invitation owner/design/slug immutable', async () => {
      const template = await f.template(admin.principal),
        revision = await f.revision(admin.principal, template.id);
      const invitation = await f.invitation(owner.principal, revision.id),
        asset = await f.asset(admin.principal);
      await f.db.transaction((manager) =>
        f.refs.replaceRevision(
          manager,
          revision.id,
          [asset.id],
          admin.principal,
        ),
      );
      for (const sql of [
        'UPDATE template_design_revisions SET revision_number=2 WHERE id=$1',
        'DELETE FROM template_design_revisions WHERE id=$1',
      ])
        await expect(f.db.query(sql, [revision.id])).rejects.toMatchObject({
          code: '23514',
        });
      await expect(
        f.db.query(
          'DELETE FROM template_revision_asset_refs WHERE revision_id=$1',
          [revision.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        f.db.query('UPDATE invitations SET owner_user_id=$2 WHERE id=$1', [
          invitation.id,
          other.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      const otherRevision = await f.revision(admin.principal, template.id);
      await expect(
        f.db.query('UPDATE invitations SET design_revision_id=$2 WHERE id=$1', [
          invitation.id,
          otherRevision.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      const slug = randomUUID();
      await f.db.query(
        "UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,published_wedding_data=$3,published_scene=$4,published_at=clock_timestamp() WHERE id=$1",
        [invitation.id, slug, emptyWedding(), emptyScene()],
      );
      await expect(
        f.db.query('UPDATE invitations SET public_slug=$2 WHERE id=$1', [
          invitation.id,
          randomUUID(),
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        f.db.query(
          'UPDATE invitations SET published_wedding_data=$2 WHERE id=$1',
          [invitation.id, { schemaVersion: 1, bride: { name: 'Changed' } }],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('rejects inconsistent asset ownership, mutation of immutable keys and reverse tombstones', async () => {
      const asset = await f.asset(admin.principal);
      for (const [field, value] of [
        ['object_key', randomUUID() + '.webp'],
        ['owner_user_id', other.id],
        ['scope', 'CUSTOMER'],
        ['sha256', 'a'.repeat(64)],
      ] as const)
        await expect(
          f.db.query(`UPDATE assets SET ${field}=$2 WHERE id=$1`, [
            asset.id,
            value,
          ]),
        ).rejects.toMatchObject({ code: '23514' });
      await f.db.transaction((manager) =>
        f.refs.beginDelete(manager, asset.id, admin.principal),
      );
      await expect(
        f.db.query("UPDATE assets SET status='READY' WHERE id=$1", [asset.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await f.refs.delete(asset.id, admin.principal, budget());
      await f.refs.delete(asset.id, admin.principal, budget());
      expect(await f.store.head(asset.object_key, budget())).toBeNull();
      expect(
        (
          await f.db.query<{ status: string }[]>(
            'SELECT status FROM assets WHERE id=$1',
            [asset.id],
          )
        )[0].status,
      ).toBe('DELETED');
    });

    it('enforces publication target XOR, one active job, lease limits and terminal receipt immutability', async () => {
      const template = await f.template(admin.principal),
        second = await f.template(admin.principal);
      const insert = async (target: string | null, key = randomUUID()) => {
        const id = randomUUID();
        await f.db.query(
          `INSERT INTO publication_jobs(id,template_id,requested_by,request_key,request_hash,expected_edit_version,candidate_document,candidate_data,candidate_hash,created_at,deadline_at)
        VALUES($1,$2,$3,$4,$5,1,$6,$7,$5,statement_timestamp(),statement_timestamp()+interval '90 seconds')`,
          [
            id,
            target,
            admin.id,
            key,
            'b'.repeat(64),
            blankDesign(),
            emptyWedding(),
          ],
        );
        return id;
      };
      await expect(insert(null)).rejects.toMatchObject({ code: '23514' });
      const key = randomUUID(),
        id = await insert(template.id, key);
      const pendingAsset = await f.asset(admin.principal);
      await f.db.transaction((manager) =>
        f.refs.replaceJob(manager, id, [pendingAsset.id], {
          kind: 'template',
          actor: admin.principal,
        }),
      );
      await expect(
        f.refs.assertUnreferenced(f.db.manager, pendingAsset.id),
      ).rejects.toMatchObject({ problemCode: 'ASSET_IN_USE' });
      await expect(insert(template.id)).rejects.toMatchObject({
        code: '23505',
      });
      await expect(insert(second.id, key)).rejects.toMatchObject({
        code: '23505',
      });
      await expect(
        f.db.query('UPDATE publication_jobs SET attempts=3 WHERE id=$1', [id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        f.db.query("UPDATE publication_jobs SET status='RUNNING' WHERE id=$1", [
          id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        f.db.query(
          'UPDATE publication_jobs SET candidate_data=$2 WHERE id=$1',
          [id, { schemaVersion: 1, bride: { name: 'Changed' } }],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await f.db.query(
        "UPDATE publication_jobs SET status='FAILED',error_code='DOCUMENT_INVALID',candidate_document=NULL,candidate_data=NULL,completed_at=clock_timestamp() WHERE id=$1",
        [id],
      );
      await expect(
        f.db.query(
          "UPDATE publication_jobs SET error_code='RENDER_TIMEOUT' WHERE id=$1",
          [id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await insert(template.id);
    });

    it('derives ownership from the database, denies wrong roles and preserves ordinary token semantics', async () => {
      const template = await f.template(admin.principal),
        revision = await f.revision(admin.principal, template.id),
        invitation = await f.invitation(owner.principal, revision.id);
      await expect(
        requireOwnedInvitation(f.db.manager, invitation.id, other.principal),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        requireOwnedInvitation(f.db.manager, invitation.id, admin.principal),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        requireTemplate(f.db.manager, template.id, owner.principal),
      ).rejects.toMatchObject({ status: 403 });
      await f.db.query("UPDATE users SET status='LOCKED' WHERE id=$1", [
        owner.id,
      ]);
      try {
        expect(
          (
            await requireOwnedInvitation(
              f.db.manager,
              invitation.id,
              owner.principal,
            )
          ).id,
        ).toBe(invitation.id);
        await expect(
          f.db.transaction((manager) =>
            requireAssistedInvitation(manager, invitation.id, admin.principal),
          ),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        await f.db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [
          owner.id,
        ]);
      }
      await f.db.query("UPDATE users SET status='LOCKED' WHERE id=$1", [
        admin.id,
      ]);
      try {
        expect(
          (await requireTemplate(f.db.manager, template.id, admin.principal))
            .id,
        ).toBe(template.id);
        await expect(
          f.db.transaction((manager) =>
            requireAssistedInvitation(manager, invitation.id, admin.principal),
          ),
        ).rejects.toMatchObject({ status: 403 });
      } finally {
        await f.db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [
          admin.id,
        ]);
      }
      expect(
        (
          await f.db.transaction((manager) =>
            requireAssistedInvitation(manager, invitation.id, admin.principal),
          )
        ).owner_user_id,
      ).toBe(owner.id);
      expect(() => assertVersion(2, 1)).toThrow(
        expect.objectContaining({ problemCode: 'VERSION_CONFLICT' }),
      );
      expect(() => assertVersion(2, 2)).not.toThrow();
    });

    it('locks active assistance users before resources, serializing customer status changes', async () => {
      const template = await f.template(admin.principal),
        revision = await f.revision(admin.principal, template.id),
        invitation = await f.invitation(owner.principal, revision.id);
      const support = f.db.createQueryRunner(),
        status = f.db.createQueryRunner();
      await support.connect();
      await status.connect();
      await support.startTransaction();
      await status.startTransaction();
      try {
        await requireAssistedInvitation(
          support.manager,
          invitation.id,
          admin.principal,
        );
        const mutation = settled(
          status.query("UPDATE users SET status='LOCKED' WHERE id=$1", [
            owner.id,
          ]),
        );
        await waitForBlocked(f.db, status);
        await support.commitTransaction();
        expect((await mutation).error).toBeUndefined();
        await status.rollbackTransaction();
      } finally {
        for (const runner of [support, status]) {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
        }
      }
    });

    it('retains all saved photo refs while assisting only referenced or specifically uploaded customer assets', async () => {
      const template = await f.template(admin.principal),
        revision = await f.revision(admin.principal, template.id),
        invitation = await f.invitation(owner.principal, revision.id);
      const photo = await f.asset(owner.principal),
        unrelated = await f.asset(owner.principal),
        foreign = await f.asset(other.principal);
      const data = { schemaVersion: 1 as const, bride: { photo: photo.id } };
      expect(weddingAssetIds(data)).toEqual([photo.id]);
      await f.db.transaction(async (manager) => {
        await requireOwnedInvitation(
          manager,
          invitation.id,
          owner.principal,
          true,
        );
        await f.refs.replaceInvitation(
          manager,
          invitation.id,
          'DRAFT',
          data,
          owner.principal,
        );
        await f.refs.replaceInvitation(
          manager,
          invitation.id,
          'PUBLISHED',
          data,
          owner.principal,
        );
      });
      // Retained data is indexed even when emptyScene has no visible photo.
      await expect(
        f.refs.assertUnreferenced(f.db.manager, photo.id),
      ).rejects.toMatchObject({ problemCode: 'ASSET_IN_USE' });
      const scope = {
        kind: 'invitation' as const,
        actor: admin.principal,
        invitationId: invitation.id,
        assisted: true,
        allowTemplate: false,
      };
      const check = (id: string) =>
        f.db.transaction(async (manager) => {
          await requireAssistedInvitation(
            manager,
            invitation.id,
            admin.principal,
          );
          return f.refs.lockReady(manager, [id], scope);
        });
      expect(await check(photo.id)).toHaveLength(1);
      const assisted = await f.asset(
        owner.principal,
        'CUSTOMER',
        invitation.id,
        admin.id,
      );
      expect(await check(assisted.id)).toHaveLength(1);
      await expect(check(unrelated.id)).rejects.toMatchObject({
        problemCode: 'ASSET_UNAVAILABLE',
      });
      await expect(check(foreign.id)).rejects.toMatchObject({
        problemCode: 'ASSET_UNAVAILABLE',
      });
      await expect(
        f.refs.authorizedRead(photo.id, admin.principal),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        f.db.transaction((manager) =>
          f.refs.lockReady(manager, [photo.id], {
            kind: 'template',
            actor: admin.principal,
          }),
        ),
      ).rejects.toMatchObject({ problemCode: 'ASSET_UNAVAILABLE' });
    });

    it('protects metadata covers and immutable thumbnails independently of ref tables', async () => {
      const template = await f.template(admin.principal),
        cover = await f.asset(admin.principal),
        revision = await f.revision(admin.principal, template.id);
      await f.db.transaction(async (manager) => {
        await requireTemplate(manager, template.id, admin.principal, true);
        await f.refs.lockReady(manager, [cover.id], {
          kind: 'template',
          actor: admin.principal,
        });
        await manager.query(
          'UPDATE invitation_templates SET cover_asset_id=$2 WHERE id=$1',
          [template.id, cover.id],
        );
      });
      await f.refs.delete(cover.id, admin.principal, budget());
      await expect(
        f.refs.assertUnreferenced(f.db.manager, revision.thumbnail_asset_id!),
      ).rejects.toMatchObject({ problemCode: 'ASSET_IN_USE' });
      const reusable = await f.asset(admin.principal);
      expect(
        await f.db.transaction((manager) =>
          f.refs.lockReady(manager, [reusable.id], {
            kind: 'template',
            actor: otherAdmin.principal,
          }),
        ),
      ).toHaveLength(1);
      await expect(
        f.refs.delete(reusable.id, otherAdmin.principal, budget()),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('serializes reference insertion before deletion and deletion before insertion', async () => {
      for (const first of ['reference', 'delete'] as const) {
        const template = await f.template(admin.principal),
          asset = await f.asset(admin.principal);
        const document = blankDesign();
        document.nodes.ROOT.props.canvas.background = {
          kind: 'asset',
          assetId: asset.id,
          fit: 'cover',
          positionX: 0.5,
          positionY: 0.5,
        };
        expect(designAssetIds(document)).toEqual([asset.id]);
        const saving = f.db.createQueryRunner(),
          deleting = f.db.createQueryRunner();
        await saving.connect();
        await deleting.connect();
        await saving.startTransaction();
        await deleting.startTransaction();
        const save = async (runner: QueryRunner) => {
          await requireTemplate(
            runner.manager,
            template.id,
            admin.principal,
            true,
          );
          await f.refs.replaceTemplateDraft(
            runner.manager,
            template.id,
            document,
            emptyWedding(),
            admin.principal,
          );
        };
        try {
          if (first === 'reference') {
            await save(saving);
            const deletion = settled(
              f.refs.beginDelete(deleting.manager, asset.id, admin.principal),
            );
            await waitForBlocked(f.db, deleting);
            await saving.commitTransaction();
            expect((await deletion).error).toBeUndefined();
            await deleting.commitTransaction();
            expect(
              await f.db.query(
                'SELECT asset_id FROM template_draft_asset_refs WHERE asset_id=$1',
                [asset.id],
              ),
            ).toEqual([]);
          } else {
            await f.refs.beginDelete(
              deleting.manager,
              asset.id,
              admin.principal,
            );
            const insertion = settled(save(saving));
            await waitForBlocked(f.db, saving);
            await deleting.commitTransaction();
            expect((await insertion).error).toMatchObject({
              problemCode: 'ASSET_UNAVAILABLE',
            });
          }
        } finally {
          for (const runner of [saving, deleting]) {
            if (runner.isTransactionActive) await runner.rollbackTransaction();
            await runner.release();
          }
        }
      }
    });

    it('serves normalized bytes only to the authorized scope and exposes closed summaries', async () => {
      const templateAsset = await f.asset(admin.principal),
        privateAsset = await f.asset(owner.principal);
      const server = f.app.getHttpServer();
      await request(server).get('/api/v1/admin/template-assets').expect(401);
      await request(server)
        .get('/api/v1/admin/template-assets')
        .set(owner.headers)
        .expect(403);
      const list = await request(server)
        .get('/api/v1/admin/template-assets?limit=1&mine=true')
        .set(admin.headers)
        .expect(200);
      const page = list.body as {
        items: Record<string, unknown>[];
        nextCursor: string | null;
      };
      expect(Object.keys(page.items[0]).sort()).toEqual(
        [
          'id',
          'name',
          'kind',
          'mimeType',
          'byteSize',
          'width',
          'height',
          'category',
          'durationMs',
          'createdAt',
          'previewUrl',
        ].sort(),
      );
      expect(page.nextCursor).not.toBeNull();
      expect(JSON.stringify(page)).not.toMatch(
        /object_key|owner_user_id|uploaded_by|s3|secret/i,
      );
      const content = '/api/v1/assets/' + templateAsset.id + '/content';
      await request(server).get(content).expect(401);
      await request(server)
        .get('/api/v1/assets/invalid-id/content')
        .set(admin.headers)
        .expect(400);
      await request(server).get(content).set(owner.headers).expect(404);
      const response = await request(server)
        .get(content)
        .set(admin.headers)
        .expect(200)
        .expect('Content-Type', 'image/webp')
        .expect('Cache-Control', 'no-store')
        .expect('X-Content-Type-Options', 'nosniff');
      expect(response.body).toEqual(
        (
          await f.store.get(
            templateAsset.object_key,
            templateAsset.byte_size,
            budget(),
          )
        ).bytes,
      );
      const privateContent = '/api/v1/assets/' + privateAsset.id + '/content';
      await request(server).get(privateContent).set(admin.headers).expect(404);
      await request(server).get(privateContent).set(other.headers).expect(404);
      await request(server).get(privateContent).set(owner.headers).expect(200);
      for (const query of [
        'limit=0',
        'limit=1e1',
        'q=a&q=b',
        'mine=yes',
        'kind=THUMBNAIL',
        'cursor=invalid',
        'unknown=true',
      ])
        await request(server)
          .get('/api/v1/admin/template-assets?' + query)
          .set(admin.headers)
          .expect(422);
    });

    it('does not skip assets sharing milliseconds in a microsecond keyset cursor', async () => {
      const first = await f.asset(admin.principal),
        second = await f.asset(admin.principal),
        third = await f.asset(admin.principal);
      for (const [asset, fraction] of [
        [first, '123456'],
        [second, '123455'],
        [third, '123454'],
      ] as const)
        await f.db.query(
          "UPDATE assets SET name='cursor probe',created_at=$2::timestamptz WHERE id=$1",
          [asset.id, `2026-10-01T00:00:00.${fraction}Z`],
        );
      const server = f.app.getHttpServer(),
        ids: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 3; i++) {
        const response = await request(server)
          .get('/api/v1/admin/template-assets')
          .query({ q: 'cursor probe', limit: 1, ...(cursor ? { cursor } : {}) })
          .set(admin.headers)
          .expect(200);
        const body = response.body as {
          items: { id: string }[];
          nextCursor: string | null;
        };
        ids.push(body.items[0].id);
        cursor = body.nextCursor;
      }
      expect(ids).toEqual([first.id, second.id, third.id]);
      expect(cursor).toBeNull();
      await request(server)
        .get('/api/v1/admin/template-assets')
        .query({
          cursor: encodeNewestCursor(
            '2026-02-31T00:00:00.000000Z',
            randomUUID(),
          ),
        })
        .set(admin.headers)
        .expect(422);
    });
  },
);
