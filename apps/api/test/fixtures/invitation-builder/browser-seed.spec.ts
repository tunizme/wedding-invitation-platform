import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { fixtureBytes } from './candidates';
import { randomUUID } from 'node:crypto';
import { it } from 'vitest';
import { builderDatabase } from './database';
import { canonicalHash } from '../../../src/modules/invitation-builder/domain/validation-helpers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  Binding,
  ElementNode,
  TemplateDesign,
} from '../../../src/modules/invitation-builder/domain/document.types';
it('seeds owned browser accounts and READY fixture assets', async () => {
  const f = await builderDatabase();
  try {
    const admin = await f.user('ADMIN');
    const second = await f.user('ADMIN');
    const publication = await f.user('ADMIN');
    const customerFlowAdmin = await f.user('ADMIN');
    const customer = await f.user('CUSTOMER');
    const casCustomer = await f.user('CUSTOMER');
    const casAdmin = await f.user('ADMIN');
    const [casCustomerUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [casCustomer.id],
    );
    const [casAdminUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [casAdmin.id],
    );
    const casPhoto = await f.asset(casCustomer.principal);
    const convergenceCustomer = await f.user('CUSTOMER');
    const convergenceAdmin = await f.user('ADMIN');
    const phase11Admin = await f.user('ADMIN');
    const [phase11AdminUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [phase11Admin.id],
    );
    const customerPhotoA = await f.asset(customer.principal);
    const customerPhotoB = await f.asset(customer.principal);
    await f.asset(admin.principal);
    const sampleB = await sharp(fixtureBytes())
      .tint({ r: 180, g: 100, b: 170 })
      .webp()
      .toBuffer();
    await f.writer.upload(
      sampleB,
      'image/webp',
      {
        scope: 'TEMPLATE',
        owner_user_id: admin.id,
        uploaded_by: admin.id,
        assistance_invitation_id: null,
        name: 'Ảnh mẫu B',
        kind: 'IMAGE',
        width: 80,
        height: 60,
      },
      { deadline: Date.now() + 10000 },
    );
    const template = await f.template(admin.principal);
    const thumbnail = await f.asset(admin.principal, 'SYSTEM_THUMBNAIL');
    const bindingFixture = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../../../specs/004-invitation-builder/contracts/fixtures/binding-optional-fallback.json',
        ),
        'utf8',
      ),
    ) as { document: TemplateDesign };
    const imageFixture = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../../../specs/004-invitation-builder/contracts/fixtures/all-elements.json',
        ),
        'utf8',
      ),
    ) as TemplateDesign;
    const imageId = imageFixture.nodes.ROOT.nodes.find(
      (id) => imageFixture.nodes[id].type.resolvedName === 'Image',
    );
    if (!imageId) throw new Error('Image fixture is missing.');
    const imageNode = structuredClone(
      imageFixture.nodes[imageId],
    ) as ElementNode;
    if (imageNode.type.resolvedName !== 'Image')
      throw new Error('Image fixture has wrong type.');
    imageNode.custom.optional = true;
    const imageProps = imageNode.props as unknown as {
      content: { assetId: string | null };
      bindings: Binding[];
    };
    imageProps.content.assetId = null;
    imageProps.bindings = [{ target: 'assetId', source: 'bride.photo' }];
    bindingFixture.document.nodes[imageId] = imageNode;
    bindingFixture.document.nodes.ROOT.nodes.push(imageId);
    await f.db.query(
      'UPDATE invitation_templates SET draft_document=$2,draft_sample_data=$3 WHERE id=$1',
      [template.id, bindingFixture.document, { schemaVersion: 1 }],
    );
    const revisionId = randomUUID();
    await f.db.query(
      `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,
      document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by)
      VALUES($1,$2,1,1,$3,$4,$5,1,$6,$7)`,
      [
        revisionId,
        template.id,
        bindingFixture.document,
        { schemaVersion: 1 },
        canonicalHash(bindingFixture.document),
        thumbnail.id,
        admin.id,
      ],
    );
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revisionId],
    );
    const casTemplate = await f.template(casAdmin.principal);
    const casThumbnail = await f.asset(casAdmin.principal, 'SYSTEM_THUMBNAIL');
    const casRevisionId = randomUUID();
    await f.db.query(
      `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,
      document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by)
      VALUES($1,$2,1,1,$3,$4,$5,1,$6,$7)`,
      [
        casRevisionId,
        casTemplate.id,
        bindingFixture.document,
        { schemaVersion: 1 },
        canonicalHash(bindingFixture.document),
        casThumbnail.id,
        casAdmin.id,
      ],
    );
    await f.db.query(
      "UPDATE invitation_templates SET name='Mẫu CAS',draft_document=$3,status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [casTemplate.id, casRevisionId, bindingFixture.document],
    );
    const [user] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [admin.id],
    );
    const [secondUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [second.id],
    );
    const [publicationUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [publication.id],
    );
    const [customerUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [customer.id],
    );
    const [customerFlowAdminUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [customerFlowAdmin.id],
    );
    const [convergenceCustomerUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [convergenceCustomer.id],
    );
    const [convergenceAdminUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [convergenceAdmin.id],
    );
    const rsvpCustomer = await f.user('CUSTOMER');
    const rsvpOther = await f.user('CUSTOMER');
    const rsvpAdmin = await f.user('ADMIN');
    const [rsvpOtherUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [rsvpOther.id],
    );
    const [rsvpAdminUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [rsvpAdmin.id],
    );
    const [rsvpCustomerUser] = await f.db.query<{ email: string }[]>(
      'SELECT email FROM users WHERE id=$1',
      [rsvpCustomer.id],
    );
    const rsvpTemplate = await f.template(admin.principal),
      rsvpThumbnail = await f.asset(admin.principal, 'SYSTEM_THUMBNAIL'),
      rsvpRevisionId = randomUUID();
    const rsvpNodeId = imageFixture.nodes.ROOT.nodes.find(
      (id) => imageFixture.nodes[id].type.resolvedName === 'RSVP',
    )!;
    const rsvpDocument = structuredClone(imageFixture);
    rsvpDocument.nodes = {
      ROOT: structuredClone(imageFixture.nodes.ROOT),
      [rsvpNodeId]: structuredClone(imageFixture.nodes[rsvpNodeId]),
    };
    rsvpDocument.nodes.ROOT.nodes = [rsvpNodeId];
    (
      rsvpDocument.nodes.ROOT.props as { canvas: { height: number } }
    ).canvas.height = 720;
    (rsvpDocument.nodes[rsvpNodeId].props as { box: { y: number } }).box.y = 20;
    await f.db.query(
      'UPDATE invitation_templates SET name=$2,draft_document=$3 WHERE id=$1',
      [rsvpTemplate.id, 'Mẫu RSVP', rsvpDocument],
    );
    await f.db.query(
      `INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by)
    VALUES($1,$2,1,1,$3,$4,$5,1,$6,$7)`,
      [
        rsvpRevisionId,
        rsvpTemplate.id,
        rsvpDocument,
        { schemaVersion: 1 },
        canonicalHash(rsvpDocument),
        rsvpThumbnail.id,
        admin.id,
      ],
    );
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [rsvpTemplate.id, rsvpRevisionId],
    );
    await writeFile(
      join(process.env.BUILDER_TEST_SCRATCH!, 'browser-seed.json'),
      JSON.stringify({
        phase11Admin: {
          email: phase11AdminUser.email,
          password: 'Builder test passphrase 123!',
        },
        admin: { email: user.email, password: 'Builder test passphrase 123!' },
        secondAdmin: {
          email: secondUser.email,
          password: 'Builder test passphrase 123!',
        },
        publicationAdmin: {
          email: publicationUser.email,
          password: 'Builder test passphrase 123!',
        },
        customer: {
          email: customerUser.email,
          password: 'Builder test passphrase 123!',
        },
        customerFlowAdmin: {
          email: customerFlowAdminUser.email,
          password: 'Builder test passphrase 123!',
        },
        convergenceCustomer: {
          email: convergenceCustomerUser.email,
          password: 'Builder test passphrase 123!',
        },
        convergenceAdmin: {
          email: convergenceAdminUser.email,
          password: 'Builder test passphrase 123!',
        },
        customerPhotos: [customerPhotoA.id, customerPhotoB.id],
        casCustomer: {
          email: casCustomerUser.email,
          password: 'Builder test passphrase 123!',
        },
        casAdmin: {
          email: casAdminUser.email,
          password: 'Builder test passphrase 123!',
        },
        casPhoto: casPhoto.id,
        publishedTemplate: { id: template.id, revisionId },
        rsvpOther: {
          email: rsvpOtherUser.email,
          password: 'Builder test passphrase 123!',
        },
        rsvpAdmin: {
          email: rsvpAdminUser.email,
          password: 'Builder test passphrase 123!',
        },
        rsvpCustomer: {
          email: rsvpCustomerUser.email,
          password: 'Builder test passphrase 123!',
        },
        rsvpTemplate: { id: rsvpTemplate.id, revisionId: rsvpRevisionId },
      }),
      { mode: 0o600 },
    );
  } finally {
    await f.app.close();
    await f.db.destroy();
  }
});
