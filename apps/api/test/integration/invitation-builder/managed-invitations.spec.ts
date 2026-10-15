import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import {
  blankDesign,
  fixtureBytes,
} from '../../fixtures/invitation-builder/candidates';
import { InvitationPublicationService } from '../../../src/modules/invitations/application/invitation-publication.service';
import { PublicationService } from '../../../src/modules/invitation-builder/publication/publication.service';
import { resolveDesign } from '../../../src/modules/invitation-builder/domain/resolve-design';
import { CredentialCrypto } from '../../../src/modules/identity-access/infrastructure/credential-crypto';
import { CustomerInvitationService } from '../../../src/modules/identity-access/admin/customer-invitation.service';
import { ChallengeService } from '../../../src/modules/identity-access/verification/challenge.service';
import type { PublicationJob } from '../../../src/modules/invitation-builder/publication/entities';
import type { Asset } from '../../../src/modules/invitation-assets/domain/entities';
import type { EditorDocument } from '../../../src/modules/invitation-builder/domain/editor-document';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
describe.sequential('managed invitation service and guest lifecycle', () => {
  let f: Fixture,
    admin: Awaited<ReturnType<Fixture['user']>>,
    customer: Awaited<ReturnType<Fixture['user']>>,
    other: Awaited<ReturnType<Fixture['user']>>;
  let templateId: string;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    customer = await f.user();
    other = await f.user();
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    templateId = template.id;
    await f.db.query(
      "UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$2 WHERE id=$1",
      [template.id, revision.id],
    );
  });
  afterAll(async () => {
    await f?.close();
  });
  const create = async () => {
    const response = await request(f.app.getHttpServer())
      .post('/api/v1/admin/invitations')
      .set(admin.headers)
      .send({ customerId: customer.id, templateId, title: 'Thiệp Mai & Nam' })
      .expect(201);
    return response.body as {
      id: string;
      editVersion: number;
      document: EditorDocument;
      draftWeddingData: unknown;
    };
  };
  async function publish(id: string, expectedVersion: number) {
    const accepted = await f.app
      .get(PublicationService)
      .enqueueInvitation(admin.principal, id, expectedVersion, randomUUID());
    const lease = randomUUID();
    const [job]: PublicationJob[] = await f.db.query(
      `WITH changed AS (UPDATE publication_jobs SET status='RUNNING',attempts=1,lease_owner=$2,
      lease_expires_at=LEAST(deadline_at,clock_timestamp()+interval '30 seconds') WHERE id=$1 RETURNING *) SELECT * FROM changed`,
      [accepted.id, lease],
    );
    const asOf = job.created_at.toISOString(),
      resolved = resolveDesign(job.candidate_document!, job.candidate_data!, {
        mode: 'capture',
        asOf,
      });
    expect(resolved.issues).toEqual([]);
    return f.app.get(InvitationPublicationService).finalize({
      jobId: job.id,
      leaseOwner: lease,
      asOf,
      visibleAssetIds: resolved.visibleAssetIds,
      hasVisibleRsvp: resolved.hasVisibleRsvp,
    });
  }
  it('copies design independently, blocks customer editing/publishing and rejects stale saves', async () => {
    const a = await create(),
      b = await create(),
      document = blankDesign();
    document.nodes.ROOT.props.canvas.background = {
      kind: 'solid',
      color: '#FEE2E2FF',
    };
    await request(f.app.getHttpServer())
      .patch(`/api/v1/admin/invitations/${a.id}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: 1,
        document,
        weddingData: { schemaVersion: 2, fields: {} },
      })
      .expect(200);
    const unchanged = await request(f.app.getHttpServer())
      .get(`/api/v1/admin/invitations/${b.id}`)
      .set(admin.headers)
      .expect(200);
    expect((unchanged.body as { document: unknown }).document).toEqual(
      b.document,
    );
    await request(f.app.getHttpServer())
      .patch(`/api/v1/invitations/${a.id}/draft`)
      .set(customer.headers)
      .send({
        expectedVersion: 2,
        weddingData: { schemaVersion: 2, fields: {} },
      })
      .expect(403);
    await request(f.app.getHttpServer())
      .post(`/api/v1/invitations/${a.id}/publish`)
      .set(customer.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 2 })
      .expect(403);
    await request(f.app.getHttpServer())
      .get(`/api/v1/invitations/${a.id}`)
      .set(other.headers)
      .expect(404);
    await request(f.app.getHttpServer())
      .patch(`/api/v1/admin/invitations/${a.id}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: 1,
        document,
        weddingData: { schemaVersion: 2, fields: {} },
      })
      .expect(409);
  });
  it('requires payment and keeps public snapshot/link while admin edits and republishes', async () => {
    const a = await create(),
      base = `/api/v1/admin/invitations/${a.id}`;
    const blocked = await request(f.app.getHttpServer())
      .post(`${base}/publish`)
      .set(admin.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedVersion: 1 })
      .expect(409);
    expect((blocked.body as { code: string }).code).toBe('PAYMENT_REQUIRED');
    await request(f.app.getHttpServer())
      .post(`${base}/payment`)
      .set(admin.headers)
      .send({ expectedVersion: 1, note: 'Chuyển khoản' })
      .expect(201);
    const first = await publish(a.id, 2),
      slug = first.publicUrl.split('/').at(-1)!;
    const old = await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug}`)
      .expect(200);
    const document = blankDesign();
    document.nodes.ROOT.props.canvas.background = {
      kind: 'solid',
      color: '#ECFDF5FF',
    };
    await request(f.app.getHttpServer())
      .patch(`${base}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: 3,
        document,
        weddingData: { schemaVersion: 2, fields: {} },
      })
      .expect(200);
    const during = await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug}`)
      .expect(200);
    expect((during.body as { scene: unknown }).scene).toEqual(
      (old.body as { scene: unknown }).scene,
    );
    const second = await publish(a.id, 4);
    expect(second.publicUrl).toBe(first.publicUrl);
    expect(second.publicVersion).toBe(2);
    const [row]: {
      owner_user_id: string;
      updated_by: string;
      paid_by: string;
    }[] = await f.db.query(
      'SELECT owner_user_id,updated_by,paid_by FROM invitations WHERE id=$1',
      [a.id],
    );
    expect(row).toEqual({
      owner_user_id: customer.id,
      updated_by: admin.id,
      paid_by: admin.id,
    });
  });
  it('stores admin uploads as customer media and publishes media added outside source revision', async () => {
    const a = await create(),
      base = `/api/v1/admin/invitations/${a.id}`;
    const upload = await request(f.app.getHttpServer())
      .post(`${base}/assets`)
      .set(admin.headers)
      .field('name', 'Ảnh khách')
      .field('kind', 'IMAGE')
      .attach('file', fixtureBytes(), {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(201);
    const assetId = (upload.body as { id: string }).id;
    const [asset]: Asset[] = await f.db.query(
      'SELECT * FROM assets WHERE id=$1',
      [assetId],
    );
    expect(asset.scope).toBe('CUSTOMER');
    expect(asset.owner_user_id).toBe(customer.id);
    expect(asset.uploaded_by).toBe(admin.id);
    expect(asset.assistance_invitation_id).toBe(a.id);
    await request(f.app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/content`)
      .set(admin.headers)
      .expect(200);
    await request(f.app.getHttpServer())
      .get(`/api/v1/assets/${assetId}/content`)
      .set(other.headers)
      .expect(404);
    const document = blankDesign();
    document.settings.shareImageId = assetId;
    await request(f.app.getHttpServer())
      .patch(`${base}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: 1,
        document,
        weddingData: { schemaVersion: 2, fields: {} },
      })
      .expect(200);
    await request(f.app.getHttpServer())
      .post(`${base}/payment`)
      .set(admin.headers)
      .send({ expectedVersion: 2 })
      .expect(201);
    const result = await publish(a.id, 3),
      slug = result.publicUrl.split('/').at(-1)!;
    await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug}/releases/1/assets/${assetId}`)
      .expect(200);
    const shared = await f.asset(admin.principal);
    document.settings.shareImageId = shared.id;
    await request(f.app.getHttpServer())
      .patch(`${base}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: 4,
        document,
        weddingData: { schemaVersion: 2, fields: {} },
      })
      .expect(200);
    await publish(a.id, 5);
    await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug}/releases/2/assets/${shared.id}`)
      .expect(200);
  });
  it('accepts MP3 frames near 20 MiB on the managed route and rejects an oversized file', async () => {
    const invitation = await create();
    const frameLength = Math.floor((144000 * 320) / 44100);
    const bytes = Buffer.alloc(
      Math.floor((20 * 1024 * 1024) / frameLength) * frameLength,
    );
    for (let offset = 0; offset < bytes.length; offset += frameLength)
      bytes.writeUInt32BE(0xfffbe000, offset);
    const base = `/api/v1/admin/invitations/${invitation.id}/audio`;
    const response = await request(f.app.getHttpServer())
      .post(base)
      .set(admin.headers)
      .field('name', 'Nhạc sát giới hạn')
      .field('kind', 'AUDIO')
      .attach('file', bytes, {
        filename: 'near-limit.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(201);
    const [asset]: Asset[] = await f.db.query(
      'SELECT * FROM assets WHERE id=$1',
      [(response.body as { id: string }).id],
    );
    expect(asset.owner_user_id).toBe(customer.id);
    expect(asset.assistance_invitation_id).toBe(invitation.id);
    await request(f.app.getHttpServer())
      .post(base)
      .set(admin.headers)
      .field('name', 'Nhạc vượt giới hạn')
      .field('kind', 'AUDIO')
      .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1), {
        filename: 'oversized.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(413);
  });
  it('allows both owners and admin to import guests, deduplicates retries and revokes personal links', async () => {
    const a = await create(),
      base = `/api/v1/invitations/${a.id}`,
      adminBase = `/api/v1/admin/invitations/${a.id}`,
      key = randomUUID();
    const body = {
      guests: [
        { name: 'Cô Mai', group: 'Gia đình' },
        { name: 'Cô Mai', group: 'Bạn bè' },
      ],
    };
    await request(f.app.getHttpServer())
      .post(`${base}/guests/import`)
      .set(customer.headers)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    await request(f.app.getHttpServer())
      .post(`${adminBase}/guests/import`)
      .set(admin.headers)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    await request(f.app.getHttpServer())
      .post(`${base}/guests/import`)
      .set(customer.headers)
      .set('Idempotency-Key', key)
      .send({ guests: [{ name: 'Khác' }] })
      .expect(409);
    await request(f.app.getHttpServer())
      .get(`${base}/guests`)
      .set(other.headers)
      .expect(404);
    await request(f.app.getHttpServer())
      .post(`${adminBase}/payment`)
      .set(admin.headers)
      .send({ expectedVersion: 1 })
      .expect(201);
    const published = await publish(a.id, 2);
    const page = await request(f.app.getHttpServer())
      .get(`${base}/guests`)
      .set(customer.headers)
      .expect(200);
    expect(
      (page.body as { items: { id: string; publicUrl: string }[] }).items,
    ).toHaveLength(2);
    const guest = (page.body as { items: { id: string; publicUrl: string }[] })
        .items[0],
      url = new URL(guest.publicUrl, 'https://example.test'),
      token = url.searchParams.get('g')!,
      slug = published.publicUrl.split('/').at(-1)!;
    const publicBase = `/api/v1/public/invitations/${slug}/guests/${token}`;
    const visible = await request(f.app.getHttpServer())
      .get(publicBase)
      .expect(200);
    expect(visible.body).toEqual({ name: 'Cô Mai' });
    const eventId = randomUUID();
    await request(f.app.getHttpServer())
      .post(`${publicBase}/open`)
      .send({ eventId })
      .expect(201);
    await request(f.app.getHttpServer())
      .post(`${publicBase}/open`)
      .send({ eventId })
      .expect(201);
    const counted = await request(f.app.getHttpServer())
      .get(`${base}/guests`)
      .set(customer.headers)
      .expect(200);
    expect((counted.body as { totals: { opened: number } }).totals.opened).toBe(
      1,
    );
    expect(
      (counted.body as { items: { openCount: number }[] }).items[0].openCount,
    ).toBe(1);
    await request(f.app.getHttpServer())
      .post(`${base}/guests/${guest.id}/revoke`)
      .set(customer.headers)
      .expect(201);
    await request(f.app.getHttpServer()).get(publicBase).expect(404);
    await request(f.app.getHttpServer())
      .post(`${adminBase}/guests/${guest.id}/rotate`)
      .set(admin.headers)
      .expect(201);
    await request(f.app.getHttpServer()).get(publicBase).expect(404);
  });
  it('links RSVP to its issued guest token, updates latest attendance and rejects tokens from another invitation', async () => {
    const a = await create(),
      document = blankDesign(),
      nodeId = randomUUID();
    document.nodes[nodeId] = {
      type: { resolvedName: 'RSVP' },
      displayName: 'RSVP',
      isCanvas: false,
      props: {
        box: { x: 0, y: 0, width: 400, height: 400, rotation: 0 },
        appearance: {
          opacity: 1,
          background: { kind: 'solid', color: '#FFFFFF00' },
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          border: { width: 0, color: '#000000FF', style: 'solid' },
          shadow: null,
          borderRadius: 0,
        },
        content: {
          textStyle: {
            fontId: 'noto-sans-v1',
            fontSize: 16,
            fontWeight: 400,
            italic: false,
            underline: false,
            color: '#000000FF',
            letterSpacing: 0,
            lineHeight: 1.5,
            textAlign: 'left',
            textTransform: 'none',
          },
          title: 'Xác nhận',
          closedLabel: 'Đã đóng',
          successLabel: 'Cảm ơn',
        },
        bindings: [],
      },
      custom: { layerName: 'RSVP', locked: false, optional: false },
      hidden: false,
      parent: 'ROOT',
      nodes: [],
      linkedNodes: {},
    };
    document.nodes.ROOT.nodes = [nodeId];
    await request(f.app.getHttpServer())
      .patch(`/api/v1/admin/invitations/${a.id}/draft`)
      .set(admin.headers)
      .send({
        expectedVersion: 1,
        document,
        weddingData: { schemaVersion: 2, fields: {} },
      })
      .expect(200);
    await request(f.app.getHttpServer())
      .post(`/api/v1/admin/invitations/${a.id}/payment`)
      .set(admin.headers)
      .send({ expectedVersion: 2 })
      .expect(201);
    const publication = await publish(a.id, 3),
      slug = publication.publicUrl.split('/').at(-1)!;
    await request(f.app.getHttpServer())
      .post(`/api/v1/invitations/${a.id}/guests/import`)
      .set(customer.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ guests: [{ name: 'Cô Mai' }] })
      .expect(201);
    await request(f.app.getHttpServer())
      .get(`/api/v1/admin/invitations/${a.id}/guests`)
      .set(customer.headers)
      .expect(403);
    const [guest]: { id: string; token: string }[] = await f.db.query(
      'SELECT id,token FROM invitation_guests WHERE invitation_id=$1',
      [a.id],
    );
    const payload = {
        name: 'Cô Mai',
        attendance: 'ATTENDING',
        partySize: 2,
        message: '',
        guestToken: guest.token,
      },
      key = randomUUID();
    const accepted = await request(f.app.getHttpServer())
      .post(`/api/v1/public/invitations/${slug}/rsvps`)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);
    await request(f.app.getHttpServer())
      .post(`/api/v1/public/invitations/${slug}/rsvps`)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(200);
    await request(f.app.getHttpServer())
      .post(`/api/v1/public/invitations/${slug}/rsvps`)
      .set('Idempotency-Key', randomUUID())
      .send({ ...payload, attendance: 'DECLINED', partySize: 0 })
      .expect(201);
    const [latest]: { attendance: string; party_size: number }[] =
      await f.db.query(
        'SELECT attendance,party_size FROM invitation_guests WHERE id=$1',
        [guest.id],
      );
    expect(latest).toEqual({ attendance: 'DECLINED', party_size: 0 });
    const [response]: { guest_id: string }[] = await f.db.query(
      'SELECT guest_id FROM rsvp_responses WHERE id=$1',
      [(accepted.body as { receiptId: string }).receiptId],
    );
    expect(response.guest_id).toBe(guest.id);
    await request(f.app.getHttpServer())
      .post(`/api/v1/public/invitations/${slug}/rsvps`)
      .set('Idempotency-Key', randomUUID())
      .send({ ...payload, guestToken: randomUUID() })
      .expect(404);
    await request(f.app.getHttpServer())
      .get(`/api/v1/admin/invitations/${a.id}/rsvps`)
      .set(admin.headers)
      .expect(200);
  });
  it('imports 1000 guests once and rejects larger batches without adding rows', async () => {
    const invitation = await create();
    const guests = Array.from({ length: 1000 }, (_, index) => ({
      name: `Khách ${index} ${'Á'.repeat(90)}`,
      group: 'Nhóm gia đình '.repeat(6),
    }));
    const base = `/api/v1/invitations/${invitation.id}/guests/import`;
    const key = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request(f.app.getHttpServer())
        .post(base)
        .set(customer.headers)
        .set('Idempotency-Key', key)
        .send({ guests });
      expect([200, 201]).toContain(response.status);
    }
    await request(f.app.getHttpServer())
      .post(base)
      .set(customer.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ guests: [...guests, { name: 'Khách vượt giới hạn' }] })
      .expect(422);
    const [count]: { count: string }[] = await f.db.query(
      'SELECT count(*) FROM invitation_guests WHERE invitation_id=$1',
      [invitation.id],
    );
    expect(Number(count.count)).toBe(1000);
  });
  it('invites pending customers with expiring email challenge and activation sets their own password', async () => {
    const email = `invited-${randomUUID()}@example.test`;
    const response = await request(f.app.getHttpServer())
      .post('/api/v1/admin/customers/invite')
      .set(admin.headers)
      .send({ email })
      .expect(201);
    const userId = (response.body as { id: string }).id;
    const [outbox]: {
      id: string;
      payload_ciphertext: Buffer;
      encryption_key_version: number;
    }[] = await f.db.query(
      'SELECT * FROM email_outbox WHERE recipient_email=$1',
      [email],
    );
    const proof = f.app.get(CredentialCrypto).decrypt(
      {
        ciphertext: outbox.payload_ciphertext,
        keyVersion: outbox.encryption_key_version,
      },
      `outbox:${outbox.id}`,
    );
    await f.db.query(
      "UPDATE auth_challenges SET status='ACTIVE',activated_at=now() WHERE user_id=$1",
      [userId],
    );
    await f.db.query(
      "UPDATE auth_challenges SET created_at=now()-interval '1 hour',activated_at=now()-interval '1 minute',expires_at=now()-interval '1 second' WHERE user_id=$1",
      [userId],
    );
    await request(f.app.getHttpServer())
      .post('/api/v1/auth/customer-activation/confirm')
      .set('Origin', 'http://localhost:3000')
      .send({ proof, newPassword: 'My private password 123!' })
      .expect(400);
    await f.db.query(
      "UPDATE auth_challenges SET expires_at=now()+interval '30 minutes' WHERE user_id=$1",
      [userId],
    );
    await request(f.app.getHttpServer())
      .post('/api/v1/auth/customer-activation/confirm')
      .set('Origin', 'http://localhost:3000')
      .send({ proof, newPassword: 'My private password 123!' })
      .expect(204);
    const [user]: {
      email_verified_at: Date;
      invitation_pending: boolean;
      password_hash: string;
    }[] = await f.db.query('SELECT * FROM users WHERE id=$1', [userId]);
    expect(user.email_verified_at).toBeTruthy();
    expect(user.invitation_pending).toBe(false);
    expect(
      await f.app
        .get(CredentialCrypto)
        .verifyPassword(user.password_hash, 'My private password 123!'),
    ).toBe(true);
    await expect(
      f.app
        .get(CustomerInvitationService)
        .activate(proof, 'Another private password 123!'),
    ).rejects.toThrow();
    const existing = await request(f.app.getHttpServer())
      .post('/api/v1/admin/customers/invite')
      .set(admin.headers)
      .send({ email })
      .expect(201);
    expect((existing.body as { id: string }).id).toBe(userId);
    expect(
      (existing.body as { invitationQueued: boolean }).invitationQueued,
    ).toBe(false);
    expect(
      await f.app.get(ChallengeService).identify(f.db.manager, proof),
    ).toMatchObject({ status: 'CONSUMED' });
  });
});
