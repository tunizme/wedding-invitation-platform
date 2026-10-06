import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;
describe.sequential('RSVP HTTP contract', () => {
  let f: Fixture;
  let owner: Awaited<ReturnType<Fixture['user']>>;
  let other: typeof owner;
  let admin: typeof owner;
  let id: string;
  let slug: string;
  beforeAll(async () => {
    f = await builderDatabase();
    owner = await f.user();
    other = await f.user();
    admin = await f.user('ADMIN');
  });
  afterAll(async () => {
    await f?.close();
  });
  async function published() {
    const t = await f.template(admin.principal),
      r = await f.revision(admin.principal, t.id);
    const i = await f.invitation(owner.principal, r.id);
    id = i.id;
    slug = randomUUID();
    await f.db.query(
      `UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,published_at=clock_timestamp(),
      published_wedding_data=draft_wedding_data,published_scene=$3,published_has_visible_rsvp=true WHERE id=$1`,
      [
        id,
        slug,
        {
          schemaVersion: 1,
          rendererContractVersion: 1,
          canvas: { width: 390, height: 520 },
          elements: [],
        },
      ],
    );
    return `/api/v1/public/invitations/${slug}`;
  }
  const payload = {
    name: ' Khách 😀 ',
    attendance: 'ATTENDING',
    partySize: 2,
    message: ' <script>text</script> ',
  };
  it('stores one normalized receipt per key, permits new-key duplicate names and owner-only newest pages', async () => {
    const path = await published(),
      key = randomUUID();
    const accepted = await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);
    expect(Object.keys(accepted.body as object).sort()).toEqual([
      'acceptedAt',
      'receiptId',
    ]);
    const replay = await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', key)
      .send({
        ...payload,
        name: payload.name.trim(),
        message: payload.message.trim(),
      })
      .expect(200);
    expect(replay.body).toEqual(accepted.body);
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', key)
      .send({ ...payload, partySize: 3 })
      .expect(409);
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(201);
    const list = await request(f.app.getHttpServer())
      .get(`/api/v1/invitations/${id}/rsvps?limit=1`)
      .set(owner.headers)
      .expect(200);
    expect(list.body).toMatchObject({
      items: [
        { name: 'Khách 😀', message: '<script>text</script>', partySize: 2 },
      ],
      nextCursor: expect.any(String) as string,
    });
    const next = await request(f.app.getHttpServer())
      .get(
        `/api/v1/invitations/${id}/rsvps?limit=1&cursor=${(list.body as { nextCursor: string }).nextCursor}`,
      )
      .set(owner.headers)
      .expect(200);
    expect(next.body).toMatchObject({
      items: [{ id: (accepted.body as { receiptId: string }).receiptId }],
      nextCursor: null,
    });
    for (const [headers, status] of [
      [admin.headers, 403],
      [other.headers, 404],
      [{}, 401],
    ] as const)
      await request(f.app.getHttpServer())
        .get(`/api/v1/invitations/${id}/rsvps`)
        .set(headers)
        .expect(status);
  });
  it('validates code points, declined party size, fields and request keys', async () => {
    const path = await published();
    for (const body of [
      { ...payload, name: '' },
      { ...payload, name: '😀'.repeat(121) },
      { ...payload, message: '😀'.repeat(1001) },
      { ...payload, attendance: 'DECLINED', partySize: 1 },
      { ...payload, partySize: 0 },
      { ...payload, partySize: 21 },
      { ...payload, partySize: 1.5 },
      { ...payload, ownerId: owner.id },
    ])
      await request(f.app.getHttpServer())
        .post(path + '/rsvps')
        .set('Idempotency-Key', randomUUID())
        .send(body)
        .expect(422);
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .send(payload)
      .expect(400);
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', randomUUID())
      .send({
        name: '😀'.repeat(120),
        message: '😀'.repeat(1000),
        attendance: 'DECLINED',
        partySize: 0,
      })
      .expect(201);
  });
  it('controls immediately with separate CAS, preserves receipts after close/unpublish and hides nonpublic state', async () => {
    const path = await published(),
      key = randomUUID();
    const accepted = await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);
    await request(f.app.getHttpServer())
      .get(path + '/rsvp-state')
      .expect(200, { open: true, available: true });
    const control = `/api/v1/invitations/${id}/rsvp-state`;
    await request(f.app.getHttpServer())
      .patch(control)
      .set(admin.headers)
      .send({ expectedControlVersion: 1, open: false })
      .expect(403);
    await request(f.app.getHttpServer())
      .patch(control)
      .set(other.headers)
      .send({ expectedControlVersion: 1, open: false })
      .expect(404);
    await request(f.app.getHttpServer())
      .patch(control)
      .set(owner.headers)
      .send({ expectedControlVersion: 1, open: false })
      .expect(200, { controlVersion: 2, rsvpOpen: false });
    await request(f.app.getHttpServer())
      .patch(control)
      .set(owner.headers)
      .send({ expectedControlVersion: 1, open: true })
      .expect(409);
    await request(f.app.getHttpServer())
      .patch(control)
      .set(owner.headers)
      .send({ expectedControlVersion: 2, open: false })
      .expect(200, { controlVersion: 2, rsvpOpen: false });
    await request(f.app.getHttpServer())
      .get(path + '/rsvp-state')
      .expect(200, { open: false, available: true });
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(409);
    expect(
      (
        await request(f.app.getHttpServer())
          .post(path + '/rsvps')
          .set('Idempotency-Key', key)
          .send(payload)
          .expect(200)
      ).body,
    ).toEqual(accepted.body);
    await request(f.app.getHttpServer())
      .post(`/api/v1/invitations/${id}/unpublish`)
      .set(owner.headers)
      .send({ expectedVersion: 1 })
      .expect(200);
    await request(f.app.getHttpServer())
      .get(path + '/rsvp-state')
      .expect(404);
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(404);
    expect(
      (
        await request(f.app.getHttpServer())
          .post(path + '/rsvps')
          .set('Idempotency-Key', key)
          .send(payload)
          .expect(200)
      ).body,
    ).toEqual(accepted.body);
    expect(
      await f.db.query(
        'SELECT edit_version,control_version,rsvp_open FROM invitations WHERE id=$1',
        [id],
      ),
    ).toMatchObject([
      { edit_version: 2, control_version: 2, rsvp_open: false },
    ]);
    await f.db.query(
      "UPDATE invitations SET status='PUBLISHED',published_has_visible_rsvp=false,public_version=public_version+1,edit_version=edit_version+1 WHERE id=$1",
      [id],
    );
    await request(f.app.getHttpServer())
      .patch(control)
      .set(owner.headers)
      .send({ expectedControlVersion: 2, open: true })
      .expect(200);
    await request(f.app.getHttpServer())
      .get(path + '/rsvp-state')
      .expect(200, { open: true, available: false });
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(409);
  });
  it('limits sixth new acceptance, ignores forged forwarding and allows replay without quota', async () => {
    const path = await published(),
      key = randomUUID();
    for (let n = 0; n < 5; n++)
      await request(f.app.getHttpServer())
        .post(path + '/rsvps')
        .set('X-Forwarded-For', `192.0.2.${n}`)
        .set('Idempotency-Key', n === 0 ? key : randomUUID())
        .send(payload)
        .expect(201);
    const denied = await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', randomUUID())
      .send(payload)
      .expect(429);
    expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
    await request(f.app.getHttpServer())
      .post(path + '/rsvps')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(200);
  });
});
