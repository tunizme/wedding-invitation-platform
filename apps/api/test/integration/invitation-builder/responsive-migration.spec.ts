import { randomUUID } from 'node:crypto';
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from 'vitest';
import { builderDatabase as responsiveDatabase } from '../../fixtures/invitation-builder/database';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const fixture = <T>(feature: string, name: string): T =>
  JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../../specs',
        feature,
        'contracts/fixtures',
        name,
      ),
      'utf8',
    ),
  ) as T;
const responsiveDocument = () =>
  fixture<Record<string, unknown>>(
    '007-responsive-invitation-layout',
    'valid-v2.json',
  );
const blankDesign = () =>
  fixture<
    import('../../../src/modules/invitation-builder/domain/document.types').TemplateDesign
  >('004-invitation-builder', 'blank.json');
const emptyScene = () => ({
  schemaVersion: 1,
  rendererContractVersion: 1,
  canvas: blankDesign().nodes.ROOT.props.canvas,
  elements: [],
});
import { ResponsiveInvitationDocuments20261011000100 } from '../../../src/infrastructure/database/migrations/20261011000100-ResponsiveInvitationDocuments';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
type Fixture = Awaited<ReturnType<typeof responsiveDatabase>>;
describe.sequential(
  'responsive version constraints and guarded migration',
  () => {
    let f: Fixture;
    let admin: Awaited<ReturnType<Fixture['user']>>;
    const historicalTemplate = async () => {
      const [row] = await f.db.query<
        Awaited<ReturnType<Fixture['template']>>[]
      >(
        `INSERT INTO invitation_templates(id,name,category,draft_document,draft_sample_data,created_by) VALUES($1,'Migration fixture','Wedding',$2,$3,$4) RETURNING *`,
        [randomUUID(), blankDesign(), { schemaVersion: 1 }, admin.id],
      );
      return row;
    };
    const historicalRevision = async (templateId: string) => {
      const thumbnail = await f.asset(admin.principal, 'SYSTEM_THUMBNAIL');
      const [row] = await f.db.query<
        Awaited<ReturnType<Fixture['revision']>>[]
      >(
        `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by) VALUES($1,$2,1,1,$3,$4,$5,1,$6,$7) RETURNING *`,
        [
          randomUUID(),
          templateId,
          blankDesign(),
          { schemaVersion: 1 },
          canonicalHash(blankDesign()),
          thumbnail.id,
          admin.id,
        ],
      );
      return row;
    };
    let constraints: {
      table_name: string;
      constraint_name: string;
      definition: string;
    }[];
    beforeEach(async () => {
      await f.db.query(
        'TRUNCATE invitation_templates, invitations, editor_presets CASCADE',
      );
      constraints = await f.db.query(
        `SELECT e.table_name,e.constraint_name,pg_get_constraintdef(c.oid) AS definition FROM editor_legacy_constraints e JOIN pg_constraint c ON c.conrelid=to_regclass(e.table_name) AND c.conname=e.constraint_name`,
      );
      const legacy: typeof constraints = await f.db.query(
        'SELECT * FROM editor_legacy_constraints',
      );
      for (const c of legacy)
        await f.db.query(
          `ALTER TABLE ${c.table_name} DROP CONSTRAINT ${c.constraint_name}, ADD CONSTRAINT ${c.constraint_name} ${c.definition}`,
        );
    });
    afterEach(async () => {
      for (const c of constraints)
        await f.db.query(
          `ALTER TABLE ${c.table_name} DROP CONSTRAINT ${c.constraint_name}, ADD CONSTRAINT ${c.constraint_name} ${c.definition}`,
        );
    });
    beforeAll(async () => {
      f = await responsiveDatabase();
      admin = await f.user('ADMIN');
    });
    afterAll(async () => {
      await f?.close();
    });
    it('upgrades v1 rows without changing document bytes/hash/revision and refuses an unsafe down before DDL', async () => {
      const migration = new ResponsiveInvitationDocuments20261011000100();
      const runner = f.db.createQueryRunner();
      try {
        await migration.down(runner);
        const template = await historicalTemplate();
        const revision = await historicalRevision(template.id);
        const owner = await f.user(),
          invitation = await f.invitation(owner.principal, revision.id);
        await f.db.query<Record<string, unknown>[]>(
          "UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,published_wedding_data=$3,published_scene=$4,published_at=clock_timestamp() WHERE id=$1",
          [invitation.id, randomUUID(), { schemaVersion: 1 }, emptyScene()],
        );
        const jobId = randomUUID(),
          created = new Date();
        await f.db.query<Record<string, unknown>[]>(
          `INSERT INTO publication_jobs(id,template_id,requested_by,request_key,request_hash,expected_edit_version,candidate_document,candidate_data,candidate_hash,created_at,deadline_at) VALUES($1,$2,$3,$4,$5,1,$6,$7,$5,$8::timestamptz,$8::timestamptz+interval '90 seconds')`,
          [
            jobId,
            template.id,
            admin.id,
            randomUUID(),
            canonicalHash(blankDesign()),
            blankDesign(),
            { schemaVersion: 1 },
            created,
          ],
        );
        const priorDraft = await f.db.query<Record<string, unknown>[]>(
          'SELECT draft_document::text,draft_sample_data::text,edit_version FROM invitation_templates WHERE id=$1',
          [template.id],
        );
        const priorPublic = await f.db.query<Record<string, unknown>[]>(
          'SELECT published_scene::text,public_version,design_revision_id FROM invitations WHERE id=$1',
          [invitation.id],
        );
        const priorJob = await f.db.query<Record<string, unknown>[]>(
          'SELECT candidate_document::text,candidate_hash,status FROM publication_jobs WHERE id=$1',
          [jobId],
        );
        const before = await f.db.query<Record<string, unknown>[]>(
          'SELECT document::text,document_hash,revision_number,schema_version,renderer_contract_version FROM template_design_revisions WHERE id=$1',
          [revision.id],
        );
        await migration.up(runner);
        expect(
          await f.db.query<Record<string, unknown>[]>(
            'SELECT draft_document::text,draft_sample_data::text,edit_version FROM invitation_templates WHERE id=$1',
            [template.id],
          ),
        ).toEqual(priorDraft);
        expect(
          await f.db.query<Record<string, unknown>[]>(
            'SELECT published_scene::text,public_version,design_revision_id FROM invitations WHERE id=$1',
            [invitation.id],
          ),
        ).toEqual(priorPublic);
        expect(
          await f.db.query<Record<string, unknown>[]>(
            'SELECT candidate_document::text,candidate_hash,status FROM publication_jobs WHERE id=$1',
            [jobId],
          ),
        ).toEqual(priorJob);
        expect(
          await f.db.query<Record<string, unknown>[]>(
            'SELECT document::text,document_hash,revision_number,schema_version,renderer_contract_version FROM template_design_revisions WHERE id=$1',
            [revision.id],
          ),
        ).toEqual(before);
        await f.db.query<Record<string, unknown>[]>(
          'UPDATE invitation_templates SET draft_document=$2 WHERE id=$1',
          [template.id, responsiveDocument()],
        );
        const constraints = await f.db.query<Record<string, unknown>[]>(
          "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('invitation_templates'::regclass,'template_design_revisions'::regclass,'invitations'::regclass,'publication_jobs'::regclass) ORDER BY conname",
        );
        await expect(migration.down(runner)).rejects.toThrow('v2');
        expect(
          await f.db.query<Record<string, unknown>[]>(
            "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('invitation_templates'::regclass,'template_design_revisions'::regclass,'invitations'::regclass,'publication_jobs'::regclass) ORDER BY conname",
          ),
        ).toEqual(constraints);
      } finally {
        await runner.release();
      }
    });
    it('enforces numeric supported versions and revision JSON/metadata/pair agreement', async () => {
      const template = await historicalTemplate();
      const document = responsiveDocument();
      const thumbnail = await f.asset(admin.principal, 'SYSTEM_THUMBNAIL');
      const insert = (schema: number, renderer: number, doc: unknown) =>
        f.db.query<Record<string, unknown>[]>(
          `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by) VALUES($1,$2,(SELECT COALESCE(max(revision_number),0)+1 FROM template_design_revisions WHERE template_id=$2),$3,$4,'{"schemaVersion":1}',$5,$6,$7,$8)`,
          [
            randomUUID(),
            template.id,
            schema,
            doc,
            canonicalHash(doc),
            renderer,
            thumbnail.id,
            admin.id,
          ],
        );
      await insert(2, 2, document);
      for (const [schema, renderer, doc] of [
        [2, 1, document],
        [1, 2, document],
        [1, 1, document],
        [3, 3, { schemaVersion: 3 }],
        [2, 2, { schemaVersion: '2' }],
      ] as const)
        await expect(insert(schema, renderer, doc)).rejects.toThrow();
      for (const version of [0, 3, '2', null])
        await expect(
          f.db.query<Record<string, unknown>[]>(
            'UPDATE invitation_templates SET draft_document=$2 WHERE id=$1',
            [template.id, { ...document, schemaVersion: version }],
          ),
        ).rejects.toThrow();
    });
    it('enforces full public scene pairs and candidate document versions without weakening data1', async () => {
      const template = await historicalTemplate();
      const revision = await historicalRevision(template.id);
      const owner = await f.user();
      const invitation = await f.invitation(owner.principal, revision.id);
      const scene = {
        schemaVersion: 2,
        rendererContractVersion: 2,
        viewport: {
          mobileMaxWidth: 480,
          desktopMinWidth: 768,
          desktopMaxWidth: 900,
        },
        background: { kind: 'solid', color: '#FFFFFFFF' },
        sectionOrder: [],
        sections: {},
        nodes: {},
      };
      const update = (value: unknown) =>
        f.db.query<Record<string, unknown>[]>(
          "UPDATE invitations SET published_scene=$2,published_wedding_data='{}',status='PUBLISHED',public_slug=$3,public_version=1,published_at=clock_timestamp() WHERE id=$1",
          [invitation.id, value, randomUUID()],
        );
      // Existing data1 constraints must reject missing version; valid data1 is required separately.
      await expect(update(scene)).rejects.toThrow();
      for (const pair of [
        [1, 2],
        [2, 1],
        [3, 3],
      ])
        await expect(
          f.db.query<Record<string, unknown>[]>(
            "UPDATE invitations SET published_scene=$2,published_wedding_data=$3,status='PUBLISHED',public_slug=$4,public_version=1,published_at=clock_timestamp() WHERE id=$1",
            [
              invitation.id,
              {
                ...scene,
                schemaVersion: pair[0],
                rendererContractVersion: pair[1],
              },
              { schemaVersion: 1 },
              randomUUID(),
            ],
          ),
        ).rejects.toThrow();
      await f.db.query<Record<string, unknown>[]>(
        "UPDATE invitations SET published_scene=$2,published_wedding_data=$3,status='PUBLISHED',public_slug=$4,public_version=1,published_at=clock_timestamp() WHERE id=$1",
        [invitation.id, scene, { schemaVersion: 1 }, randomUUID()],
      );
      expect(
        (
          await f.db.query<Record<string, unknown>[]>(
            'SELECT published_scene FROM invitations WHERE id=$1',
            [invitation.id],
          )
        )[0].published_scene,
      ).toEqual(scene);
    });
    it('rejects unsupported candidate and data versions under direct SQL', async () => {
      const template = await historicalTemplate(),
        document = responsiveDocument(),
        created = new Date();
      const job = (candidate: unknown, data: unknown) =>
        f.db.query<Record<string, unknown>[]>(
          `INSERT INTO publication_jobs(id,template_id,requested_by,request_key,request_hash,expected_edit_version,candidate_document,candidate_data,candidate_hash,created_at,deadline_at) VALUES($1,$2,$3,$4,$5,1,$6,$7,$5,$8::timestamptz,$8::timestamptz+interval '90 seconds')`,
          [
            randomUUID(),
            template.id,
            admin.id,
            randomUUID(),
            canonicalHash(candidate),
            candidate,
            data,
            created,
          ],
        );
      await job(document, { schemaVersion: 1 });
      for (const version of [3, '2', null])
        await expect(
          job({ ...document, schemaVersion: version }, { schemaVersion: 1 }),
        ).rejects.toThrow();
      await expect(job(document, { schemaVersion: 2 })).rejects.toThrow();
    });
  },
);
