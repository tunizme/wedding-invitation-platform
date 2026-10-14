import { scalePrimitiveDocument } from '../../../src/modules/invitation-builder/domain/editor-document';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { builderDatabase } from './database';
import { resolveDesign } from '../../../src/modules/invitation-builder/domain/resolve-design';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  TemplateDesign,
  WeddingData,
} from '../../../src/modules/invitation-builder/domain/document.types';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
it('seeds disposable frontend principals and private resources', async () => {
  if (!process.env.FRONTEND_TEST_SEED)
    throw new Error('Set runner-owned FRONTEND_TEST_SEED.');
  const f = await builderDatabase();
  try {
    const accounts = [];
    for (const role of ['CUSTOMER', 'CUSTOMER', 'ADMIN', 'ADMIN'] as const) {
      const user = await f.user(role);
      const [row] = await f.db.query<{ email: string }[]>(
        'SELECT email FROM users WHERE id=$1',
        [user.id],
      );
      accounts.push({ ...user, email: row.email });
    }
    const [customerA, customerB, adminA, adminB] = accounts;
    const template = await f.template(adminA.principal);
    const representative = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../../../specs/004-invitation-builder/contracts/fixtures/binding-optional-present.json',
        ),
        'utf8',
      ),
    ) as { document: TemplateDesign; weddingData: WeddingData };
    const design = scalePrimitiveDocument(representative.document);
    const weddingData = representative.weddingData;
    await f.db.query(
      'UPDATE invitation_templates SET draft_document=$2,draft_sample_data=$3 WHERE id=$1',
      [template.id, design, weddingData],
    );
    const revision = await f.revision(adminA.principal, template.id, {
      document: design,
      sampleData: weddingData,
    });
    expect(revision.document).toEqual(design);
    expect(revision.sample_data).toEqual(weddingData);
    expect(revision.document_hash).toBe(canonicalHash(design));
    // Exercise the real PostgreSQL constraint, without disabling the trigger.
    await expect(
      f.db.query(
        'UPDATE template_design_revisions SET document=document WHERE id=$1',
        [revision.id],
      ),
    ).rejects.toThrow('Template design revisions are immutable');
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2,name='Frontend owned template' WHERE id=$1",
      [template.id, revision.id],
    );
    const invitationA = await f.invitation(customerA.principal, revision.id);
    const invitationB = await f.invitation(customerB.principal, revision.id);
    const publicSlug = randomUUID();
    const resolved = resolveDesign(design, weddingData, {
      mode: 'capture',
      asOf: new Date().toISOString(),
    });
    if (resolved.issues.length)
      throw new Error('Invalid public invitation fixture');
    await f.db.query(
      `UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,
        published_wedding_data=$3,published_scene=$4,published_has_visible_rsvp=$5,
        published_at=clock_timestamp() WHERE id=$1`,
      [
        invitationA.id,
        publicSlug,
        weddingData,
        resolved.scene,
        resolved.hasVisibleRsvp,
      ],
    );
    await f.db.query(
      'UPDATE invitations SET draft_wedding_data=$2 WHERE id=ANY($1::uuid[])',
      [[invitationA.id, invitationB.id], weddingData],
    );
    // Actual pagination fixtures, all inside the runner-owned disposable schema.
    for (const account of [customerA, customerB])
      for (let i = 0; i < 21; i++)
        await f.invitation(account.principal, revision.id);
    await f.db.query(
      "UPDATE invitations SET created_at=created_at-interval '1 day' WHERE id<>ALL($1::uuid[])",
      [[invitationA.id, invitationB.id]],
    );
    await f.db.query(
      `INSERT INTO users(id,email,password_hash,login_method,role,status,email_verified_at,created_at,updated_at)
      SELECT gen_random_uuid(), 'frontend-page-' || n || '-' || $2 || '@example.test', password_hash, 'LOCAL','CUSTOMER','ACTIVE',now(),now(),now()
      FROM users CROSS JOIN generate_series(1,22) AS n WHERE id=$1`,
      [customerA.id, randomUUID()],
    );
    const templateB = await f.template(adminB.principal);
    const assetA = await f.asset(adminA.principal),
      assetB = await f.asset(adminB.principal);
    const responsiveTemplate = await f.template(adminA.principal);
    const responsiveAsset = await f.asset(adminA.principal);
    const responsiveThumbnail = await f.asset(
      adminA.principal,
      'SYSTEM_THUMBNAIL',
    );
    const responsiveDocument = structuredClone(design);
    const responsiveSample = {
      ...weddingData,
      bride: { name: 'Ngọc Anh' },
      groom: { name: 'Minh Quân' },
    };
    const responsiveRevisionId = randomUUID();
    await f.db.query(
      `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by)
      VALUES($1,$2,1,3,$3,$4,$5,3,$6,$7)`,
      [
        responsiveRevisionId,
        responsiveTemplate.id,
        responsiveDocument,
        responsiveSample,
        canonicalHash(responsiveDocument),
        responsiveThumbnail.id,
        adminA.id,
      ],
    );
    await f.db.query(
      'INSERT INTO template_revision_asset_refs(revision_id,asset_id) VALUES($1,$2),($1,$3)',
      [responsiveRevisionId, assetA.id, responsiveAsset.id],
    );
    await f.db.query(
      `UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2,name='Frontend responsive template',draft_document=$3,draft_sample_data=$4 WHERE id=$1`,
      [
        responsiveTemplate.id,
        responsiveRevisionId,
        responsiveDocument,
        responsiveSample,
      ],
    );
    const editorTemplate = await f.template(adminA.principal);
    const editorDocument = structuredClone(design);
    const originalId = editorDocument.nodes.ROOT.nodes[0];
    const groomId = randomUUID();
    const groomNode = structuredClone(editorDocument.nodes[originalId]);
    if (!('bindings' in groomNode.props) || !('box' in groomNode.props))
      throw new Error('Expected an editor text fixture');
    groomNode.props.bindings = [{ source: 'groom.name', target: 'text' }];
    groomNode.props.box = { ...groomNode.props.box, y: 120 };
    editorDocument.nodes[groomId] = groomNode;
    editorDocument.nodes.ROOT.nodes.push(groomId);
    for (const [source, y] of [
      ['wedding.date', 220],
      ['venue.name', 320],
      ['venue.address', 420],
    ] as const) {
      const nodeId = randomUUID();
      const node = structuredClone(groomNode);
      if (!('bindings' in node.props) || !('box' in node.props))
        throw new Error('Expected an editor event text');
      node.props.bindings = [{ source, target: 'text', eventKey: 'ceremony' }];
      node.props.box = { ...node.props.box, y };
      editorDocument.nodes[nodeId] = node;
      editorDocument.nodes.ROOT.nodes.push(nodeId);
    }
    const editorSample = {
      ...weddingData,
      groom: { name: 'Minh Quân' },
      events: {
        ...weddingData.events,
        ceremony: {
          datetime: '2026-12-20T17:00:00+07:00',
          timeZone: 'Asia/Ho_Chi_Minh',
          venue: {
            name: 'The Secret Garden',
            address: '12 Nguyễn Thị Minh Khai',
          },
        },
      },
    };
    const editorRevision = await f.revision(
      adminA.principal,
      editorTemplate.id,
      { document: editorDocument, sampleData: editorSample },
    );
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2,name='Frontend editor template' WHERE id=$1",
      [editorTemplate.id, editorRevision.id],
    );
    const editorInvitation = await f.invitation(
      customerA.principal,
      editorRevision.id,
    );
    await f.db.query(
      'UPDATE invitations SET draft_wedding_data=$2 WHERE id=$1',
      [editorInvitation.id, editorSample],
    );
    const safe = (a: typeof customerA) => ({
      id: a.id,
      email: a.email,
      password: 'Builder test passphrase 123!',
    });
    await writeFile(
      process.env.FRONTEND_TEST_SEED,
      JSON.stringify({
        customerA: safe(customerA),
        customerB: safe(customerB),
        adminA: safe(adminA),
        adminB: safe(adminB),
        invitationA: invitationA.id,
        publicSlug,
        invitationB: invitationB.id,
        templateA: template.id,
        templateB: templateB.id,
        assetA: assetA.id,
        assetB: assetB.id,
        scene: resolved.scene,
        design,
        designRevisionId: revision.id,
        editorInvitation: editorInvitation.id,
        editorTemplateId: editorTemplate.id,
        editorRevisionId: editorRevision.id,
        responsiveTemplateId: responsiveTemplate.id,
        responsiveRevisionId,
      }),
      { mode: 0o600 },
    );
  } finally {
    // Keep the seeded accounts for the browser run: f.close() would TRUNCATE
    // users. The runner drops the whole owned schema during its own cleanup.
    await f.app.close();
    await f.db.destroy();
  }
});
