import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import {
  blankDesign,
  emptyWedding,
} from '../../fixtures/invitation-builder/candidates';
import { resolveDesign } from '../../../src/modules/invitation-builder/domain/resolve-design';

type Fixture = Awaited<ReturnType<typeof builderDatabase>>;

describe.sequential('public invitation projection contract', () => {
  let f: Fixture;
  let admin: Awaited<ReturnType<Fixture['user']>>;
  let owner: Awaited<ReturnType<Fixture['user']>>;
  beforeAll(async () => {
    f = await builderDatabase();
    admin = await f.user('ADMIN');
    owner = await f.user();
  });
  afterAll(async () => {
    await f?.close();
  });

  it('serves only the current published scene and removes access immediately on unpublish', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    const invitation = await f.invitation(owner.principal, revision.id),
      slug = randomUUID();
    const data = emptyWedding(),
      scene = resolveDesign(blankDesign(), data, {
        mode: 'capture',
        asOf: '2026-01-01T00:00:00.000Z',
      }).scene;
    await f.db.query(
      `UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,
      published_wedding_data=$3,published_scene=$4,published_at=clock_timestamp() WHERE id=$1`,
      [invitation.id, slug, data, scene],
    );
    const url = `/api/v1/public/invitations/${slug}`;
    const visible = await request(f.app.getHttpServer()).get(url).expect(200);
    expect(visible.headers['cache-control']).toContain('no-store');
    expect(visible.body).toMatchObject({ publicVersion: 1, scene });
    expect(visible.body).not.toHaveProperty('draftWeddingData');
    expect(visible.body).not.toHaveProperty('publishedWeddingData');
    expect(visible.body).not.toHaveProperty('ownerUserId');
    await f.db.query(
      "UPDATE invitations SET status='UNPUBLISHED' WHERE id=$1",
      [invitation.id],
    );
    await request(f.app.getHttpServer()).get(url).expect(404);
    await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${randomUUID()}`)
      .expect(404);
  });

  it('delivers only visible assets for the current release and revokes old release URLs', async () => {
    const template = await f.template(admin.principal),
      revision = await f.revision(admin.principal, template.id);
    const image = await f.asset(admin.principal),
      otherImage = await f.asset(admin.principal);
    await f.db.query(
      'INSERT INTO template_revision_asset_refs(revision_id,asset_id) VALUES($1,$2)',
      [revision.id, image.id],
    );
    const invitation = await f.invitation(owner.principal, revision.id),
      slug = randomUUID();
    const scene = resolveDesign(blankDesign(), emptyWedding(), {
      mode: 'capture',
      asOf: '2026-01-01T00:00:00.000Z',
    }).scene;
    scene.canvas.background = {
      kind: 'asset',
      assetId: image.id,
      fit: 'cover',
      positionX: 0.5,
      positionY: 0.5,
    };
    await f.db.query(
      `UPDATE invitations SET status='PUBLISHED',public_slug=$2,public_version=1,
      published_wedding_data=$3,published_scene=$4,published_at=clock_timestamp() WHERE id=$1`,
      [invitation.id, slug, emptyWedding(), scene],
    );
    const url = `/api/v1/public/invitations/${slug}/releases/1/assets/${image.id}`;
    const publicScene = await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug}`)
      .expect(200);
    const projected = publicScene.body as {
      context: { assetUrls: Record<string, string> };
    };
    expect(projected.context.assetUrls[image.id]).toBe(url);
    const bytes = await request(f.app.getHttpServer()).get(url).expect(200);
    expect(bytes.headers['cache-control']).toContain('no-store');
    expect(bytes.body).toEqual(
      (
        await f.store.get(image.object_key, image.byte_size, {
          deadline: Date.now() + 5000,
        })
      ).bytes,
    );
    await request(f.app.getHttpServer())
      .get(
        `/api/v1/public/invitations/${slug}/releases/1/assets/${otherImage.id}`,
      )
      .expect(404);
    await f.db.query(
      "UPDATE invitations SET status='UNPUBLISHED' WHERE id=$1",
      [invitation.id],
    );
    await request(f.app.getHttpServer()).get(url).expect(404);
    await f.db.query(
      "UPDATE invitations SET status='PUBLISHED',public_version=2 WHERE id=$1",
      [invitation.id],
    );
    await request(f.app.getHttpServer()).get(url).expect(404);
    await request(f.app.getHttpServer())
      .get(`/api/v1/public/invitations/${slug}/releases/2/assets/${image.id}`)
      .expect(200);
  });
});
