import { test, expect } from '@playwright/test';
import { seed, login, api, publish } from './responsive-product-fixtures';
import { randomUUID } from 'node:crypto';
test('real two-width publication, immutable revision, thumbnail, customer snapshot and v1 compatibility', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const s = seed();
  const token = await login(page, s.admin);
  const admin = api(page.request, token);
  const template = await admin(`/admin/templates/${s.templateId}`);
  expect(template.body.draftDocument.schemaVersion).toBe(2);
  const operation = await publish(
    admin,
    `/admin/templates/${s.templateId}/publish`,
    template.body.editVersion,
  );
  expect(operation.error).toBeNull();
  expect(operation.status).toBe('SUCCEEDED');
  expect(operation.elapsedMs).toBeLessThan(45000);
  const updated = await admin(`/admin/templates/${s.templateId}`);
  expect(updated.body.publishedRevisionId).toBe(operation.result.revisionId);
  const cover = await page.request.get(
    process.env.NEXT_PUBLIC_API_BASE_URL + `/templates/${s.templateId}/cover`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(cover.ok()).toBe(true);
  expect(cover.headers()['content-type']).toMatch(/image/);
  expect((await cover.body()).length).toBeGreaterThan(0);
  const customerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const customerPage = await customerContext.newPage();
  try {
    await customerPage.goto(
      page.url().replace(new URL(page.url()).pathname, '/login'),
    );
    const customerToken = await login(customerPage, s.customer);
    const customer = api(customerPage.request, customerToken);
    const revision = await customer(
      `/templates/${s.templateId}/revisions/${operation.result.revisionId}`,
    );
    expect(revision.status).toBe(200);
    expect(revision.body.document).toEqual(s.document);
    const created = await customer('/invitations', 'POST', {
      templateId: s.templateId,
      designRevisionId: operation.result.revisionId,
    });
    expect(created.status).toBe(201);
    const released = await publish(
      customer,
      `/invitations/${created.body.id}/publish`,
      created.body.editVersion,
    );
    expect(released.error).toBeNull();
    expect(released.status).toBe('SUCCEEDED');
    const detail = await customer(`/invitations/${created.body.id}`);
    expect(detail.body.designRevisionId).toBe(operation.result.revisionId);
    const publicResponse = await customerPage.request.get(
      process.env.NEXT_PUBLIC_API_BASE_URL +
        `/public/invitations/${detail.body.publicUrl.split('/').at(-1)}`,
    );
    expect(publicResponse.ok()).toBe(true);
    expect(publicResponse.headers()['cache-control']).toBe('no-store');
    const snapshot = await publicResponse.json();
    expect(snapshot.scene.schemaVersion).toBe(2);
    expect(snapshot.scene.rendererContractVersion).toBe(2);
    expect(snapshot.scene.sectionOrder).toHaveLength(4);
    for (const width of [390, 900]) {
      await customerPage.setViewportSize({ width, height: 900 });
      await customerPage.goto(new URL(detail.body.publicUrl, page.url()).href);
      await expect(
        customerPage.locator('[data-invitation-root]'),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (await customerPage.locator('[data-invitation-root]').boundingBox())
              ?.width,
        )
        .toBe(width);
    }
    const pinnedId = detail.body.designRevisionId;
    const publicUrl = detail.body.publicUrl;
    const broken = structuredClone(s.document) as {
      sections: Record<
        string,
        { mobile: { minHeight: number }; desktop: Record<string, unknown> }
      >;
    };
    for (const section of Object.values(broken.sections)) {
      section.mobile.minHeight = 4000;
      section.desktop.minHeight = 4000;
    }
    const saved = await admin(
      `/admin/templates/${s.templateId}/draft`,
      'PATCH',
      {
        expectedVersion: updated.body.editVersion,
        document: broken,
        sampleData: { schemaVersion: 1 },
      },
    );
    expect(saved.status).toBe(200);
    const failed = await publish(
      admin,
      `/admin/templates/${s.templateId}/publish`,
      saved.body.editVersion,
    );
    expect(failed.status).toBe('FAILED');
    expect(failed.error.code).toBe('CONTENT_OVERFLOW');
    expect(
      (await admin(`/admin/templates/${s.templateId}`)).body
        .publishedRevisionId,
    ).toBe(operation.result.revisionId);
    expect(
      (await customer(`/invitations/${created.body.id}`)).body.designRevisionId,
    ).toBe(pinnedId);
    const stillPublic = await customerPage.request.get(
      process.env.NEXT_PUBLIC_API_BASE_URL +
        `/public/invitations/${publicUrl.split('/').at(-1)}`,
    );
    expect((await stillPublic.json()).scene).toEqual(snapshot.scene);
    const restored = await admin(
      `/admin/templates/${s.templateId}/draft`,
      'PATCH',
      {
        expectedVersion: saved.body.editVersion,
        document: s.document,
        sampleData: { schemaVersion: 1 },
      },
    );
    expect(restored.status).toBe(200);
    const replacement = await publish(
      admin,
      `/admin/templates/${s.templateId}/publish`,
      restored.body.editVersion,
    );
    expect(replacement.status).toBe('SUCCEEDED');
    expect(replacement.result.revisionId).not.toBe(pinnedId);
    expect(
      (await customer(`/invitations/${created.body.id}`)).body.designRevisionId,
    ).toBe(pinnedId);
    const republished = await publish(
      customer,
      `/invitations/${created.body.id}/publish`,
      detail.body.editVersion,
    );
    expect(republished.status).toBe('SUCCEEDED');
    const oldAssetUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL +
      snapshot.context.assetUrls[s.assets[0]];
    expect((await customerPage.request.get(oldAssetUrl)).status()).toBe(404);
    const fresh = await customer(`/invitations/${created.body.id}`);
    expect(
      (
        await customer(`/invitations/${created.body.id}/unpublish`, 'POST', {
          expectedVersion: fresh.body.editVersion,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await customerPage.request.get(
          process.env.NEXT_PUBLIC_API_BASE_URL +
            `/public/invitations/${publicUrl.split('/').at(-1)}`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await customerContext.close();
  }
  const legacy = await admin('/admin/templates', 'POST', {
    name: `Legacy ${randomUUID()}`,
    category: 'Test',
    tags: [],
    sortOrder: 0,
  });
  expect(legacy.status).toBe(201);
  expect(legacy.body.draftDocument.schemaVersion).toBe(1);
  const old = await publish(
    admin,
    `/admin/templates/${legacy.body.id}/publish`,
    legacy.body.editVersion,
  );
  expect(old.error).toBeNull();
  expect(old.status).toBe('SUCCEEDED');
  console.log(
    JSON.stringify({
      gate: 'publication',
      mobileDesktopMs: operation.elapsedMs,
      legacyMs: old.elapsedMs,
      captureBudgetMs: 30000,
      leaseMs: 45000,
      jobMs: 90000,
    }),
  );
});
