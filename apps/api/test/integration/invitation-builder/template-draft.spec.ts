import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderDatabase } from '../../fixtures/invitation-builder/database';
import {
  blankDesign,
  emptyWedding,
} from '../../fixtures/invitation-builder/candidates';
import { TemplateDraftService } from '../../../src/modules/invitation-builder/application/template-draft.service';
describe.sequential('template persistence transactions', () => {
  let f: Awaited<ReturnType<typeof builderDatabase>>;
  beforeAll(async () => {
    f = await builderDatabase();
  });
  afterAll(async () => {
    await f?.close();
  });
  it('accepts exactly one competing save, keeps its references and isolates a duplicate', async () => {
    const admin = await f.user('ADMIN'),
      drafts = f.app.get(TemplateDraftService),
      template = await drafts.create(admin.principal, {
        name: 'Race',
        category: 'Wedding',
      });
    const a = await f.asset(admin.principal),
      b = await f.asset(admin.principal);
    const design = (assetId: string) => {
      const value = blankDesign();
      value.nodes.ROOT.props.canvas.background = {
        kind: 'asset',
        assetId,
        fit: 'cover',
        positionX: 0.5,
        positionY: 0.5,
      };
      return value;
    };
    const results = await Promise.allSettled(
      [a, b].map((asset) =>
        drafts.save(admin.principal, template.id, {
          expectedVersion: 1,
          document: design(asset.id),
          sampleData: emptyWedding(),
        }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ problemCode: 'VERSION_CONFLICT' });
    const loaded = await drafts.get(admin.principal, template.id);
    if (loaded.draftDocument.schemaVersion !== 1)
      throw new Error('Expected legacy fixture');
    const background = loaded.draftDocument.nodes.ROOT.props.canvas.background;
    if (background.kind !== 'asset')
      throw new Error('Expected committed photo');
    expect(
      await f.db.query(
        'SELECT asset_id FROM template_draft_asset_refs WHERE template_id=$1',
        [template.id],
      ),
    ).toEqual([{ asset_id: background.assetId }]);
    const copy = await drafts.duplicate(admin.principal, template.id, {
      expectedVersion: 2,
      name: 'Copy',
    });
    await drafts.save(admin.principal, copy.id, {
      expectedVersion: 1,
      document: blankDesign(),
      sampleData: emptyWedding(),
    });
    expect(
      (await drafts.get(admin.principal, template.id)).draftDocument,
    ).toEqual(loaded.draftDocument);
    expect(
      await f.db.query(
        'SELECT asset_id FROM template_draft_asset_refs WHERE template_id=$1',
        [copy.id],
      ),
    ).toEqual([]);
  });
});
