import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  responsiveDatabase,
  responsiveDocument,
} from '../../fixtures/invitation-builder/responsive-seed';
import { designAssetIds } from '../../../src/modules/invitation-assets/application/asset-reference.service';
type Fixture = Awaited<ReturnType<typeof responsiveDatabase>>;
describe.sequential(
  'nested authored references retain assets under deletion races',
  () => {
    let f: Fixture;
    let admin: Awaited<ReturnType<Fixture['user']>>;
    beforeAll(async () => {
      f = await responsiveDatabase();
      admin = await f.user('ADMIN');
    });
    afterAll(async () => {
      await f?.close();
    });
    it('retains hidden image, fallback and section/root backgrounds and blocks delete after commit', async () => {
      const assets = await Promise.all(
        Array.from({ length: 4 }, () => f.asset(admin.principal)),
      );
      const document = responsiveDocument([assets[0].id, assets[1].id]);
      document.background = {
        kind: 'asset',
        assetId: assets[2].id,
        fit: 'cover',
        positionX: 0.5,
        positionY: 0.5,
      };
      const section = document.sections[document.sectionOrder[2]];
      section.hidden = true;
      section.background = {
        kind: 'asset',
        assetId: assets[3].id,
        fit: 'cover',
        positionX: 0.5,
        positionY: 0.5,
      };
      const image = document.nodes[section.flowNodeIds[0]];
      image.bindings = [
        { target: 'assetId', source: 'bride.photo', fallback: assets[1].id },
      ];
      expect(designAssetIds(document)).toEqual(assets.map((a) => a.id).sort());
      const template = await f.template(admin.principal);
      await f.db.transaction(async (manager) => {
        await manager.query(
          'UPDATE invitation_templates SET draft_document=$2 WHERE id=$1',
          [template.id, document],
        );
        await f.refs.replaceTemplateDraft(
          manager,
          template.id,
          document,
          { schemaVersion: 1 },
          admin.principal,
        );
      });
      expect(
        (
          await f.db.query<{ asset_id: string }[]>(
            'SELECT asset_id FROM template_draft_asset_refs WHERE template_id=$1 ORDER BY asset_id',
            [template.id],
          )
        ).map((a) => a.asset_id),
      ).toEqual(assets.map((a) => a.id).sort());
      for (const asset of assets)
        await request(f.app.getHttpServer())
          .delete(`/api/v1/assets/${asset.id}`)
          .set(admin.headers)
          .expect(409);
    });
    it('retains revision and candidate-only references after the editable draft drops them', async () => {
      const revisionAsset = await f.asset(admin.principal),
        jobAsset = await f.asset(admin.principal);
      const template = await f.template(admin.principal);
      const revisionDocument = responsiveDocument();
      revisionDocument.background = {
        kind: 'asset',
        assetId: revisionAsset.id,
        fit: 'cover',
        positionX: 0.5,
        positionY: 0.5,
      };
      const revisionId = randomUUID(),
        thumbnail = await f.asset(admin.principal, 'SYSTEM_THUMBNAIL');
      await f.db.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by) VALUES($1,$2,1,2,$3,$4,$5,2,$6,$7)`,
          [
            revisionId,
            template.id,
            revisionDocument,
            { schemaVersion: 1 },
            canonicalHash(revisionDocument),
            thumbnail.id,
            admin.id,
          ],
        );
        await f.refs.replaceRevision(
          manager,
          revisionId,
          designAssetIds(revisionDocument),
          admin.principal,
        );
      });
      const candidate = responsiveDocument();
      candidate.sections[candidate.sectionOrder[0]].background = {
        kind: 'asset',
        assetId: jobAsset.id,
        fit: 'cover',
        positionX: 0.5,
        positionY: 0.5,
      };
      const jobId = randomUUID(),
        created = new Date();
      await f.db.query<Record<string, unknown>[]>(
        `INSERT INTO publication_jobs(id,template_id,requested_by,request_key,request_hash,expected_edit_version,candidate_document,candidate_data,candidate_hash,created_at,deadline_at) VALUES($1,$2,$3,$4,$5,1,$6,$7,$5,$8::timestamptz,$8::timestamptz+interval '90 seconds')`,
        [
          jobId,
          template.id,
          admin.id,
          randomUUID(),
          canonicalHash(candidate),
          candidate,
          { schemaVersion: 1 },
          created,
        ],
      );
      await f.db.query<Record<string, unknown>[]>(
        'INSERT INTO publication_job_asset_refs(job_id,asset_id) VALUES($1,$2)',
        [jobId, jobAsset.id],
      );
      for (const asset of [revisionAsset, jobAsset])
        await request(f.app.getHttpServer())
          .delete(`/api/v1/assets/${asset.id}`)
          .set(admin.headers)
          .expect(409);
    });
    it('serializes a nested retained-reference write against asset deletion', async () => {
      const asset = await f.asset(admin.principal);
      const template = await f.template(admin.principal);
      const document = responsiveDocument();
      document.sections[document.sectionOrder[0]].background = {
        kind: 'asset',
        assetId: asset.id,
        fit: 'cover',
        positionX: 0.5,
        positionY: 0.5,
      };
      const holder = f.db.createQueryRunner();
      await holder.connect();
      await holder.startTransaction();
      try {
        await holder.manager.query(
          'SELECT id FROM assets WHERE id=$1 FOR UPDATE',
          [asset.id],
        );
        await holder.manager.query(
          'UPDATE invitation_templates SET draft_document=$2 WHERE id=$1',
          [template.id, document],
        );
        await f.refs.replaceTemplateDraft(
          holder.manager,
          template.id,
          document,
          { schemaVersion: 1 },
          admin.principal,
        );
        const [{ pid }] = (await holder.query(
          'SELECT pg_backend_pid() AS pid',
        )) as { pid: number }[];
        const deletion = request(f.app.getHttpServer())
          .delete(`/api/v1/assets/${asset.id}`)
          .set(admin.headers)
          .then((result) => result);
        // PostgreSQL contention, rather than a guessed elapsed delay, is the race evidence.
        const deadline = Date.now() + 3000;
        while (true) {
          const rows = await f.db.query<{ blocked: boolean }[]>(
            'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND  $1=ANY(pg_blocking_pids(pid))) AS blocked',
            [pid],
          );
          if (rows[0].blocked) break;
          if (Date.now() > deadline)
            throw new Error('Expected deletion contention');
          await new Promise((accept) => setTimeout(accept, 10));
        }
        await holder.commitTransaction();
        expect((await deletion).status).toBe(409);
        expect(
          (
            await f.db.query<Record<string, unknown>[]>(
              'SELECT status FROM assets WHERE id=$1',
              [asset.id],
            )
          )[0].status,
        ).toBe('READY');
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
      }
    });
  },
);
