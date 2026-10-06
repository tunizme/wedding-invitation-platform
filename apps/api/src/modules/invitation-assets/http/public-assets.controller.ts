import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../identity-access/authorization/auth.guard';
import { resourceId } from '../../invitation-builder/http/input';
import type { Invitation } from '../../invitations/domain/entities';
import { visibleSceneAssetIds } from '../../invitations/domain/visible-scene-assets';
import { AssetReferenceService } from '../application/asset-reference.service';
import type { Asset } from '../domain/entities';

@Controller('public/invitations')
@Public()
export class PublicAssetsController {
  constructor(@Inject(DataSource) private readonly db: DataSource,
    @Inject(AssetReferenceService) private readonly references: AssetReferenceService) {}

  @Get(':slug/releases/:version/assets/:assetId')
  async content(@Param('slug') rawSlug: string, @Param('version') rawVersion: string,
    @Param('assetId') rawAssetId: string, @Res() response: Response) {
    const slug = resourceId(rawSlug), assetId = resourceId(rawAssetId);
    if (!/^[1-9][0-9]*$/.test(rawVersion)) throw new NotFoundException();
    const version = Number(rawVersion);
    if (!Number.isSafeInteger(version)) throw new NotFoundException();
    const invitations: Invitation[] = await this.db.query(`SELECT * FROM invitations
      WHERE public_slug=$1 AND status='PUBLISHED' AND public_version=$2`, [slug, version]);
    const invitation = invitations[0];
    if (!invitation?.published_scene || !visibleSceneAssetIds(invitation.published_scene).includes(assetId))
      throw new NotFoundException();
    const rows: Asset[] = await this.db.query(`SELECT * FROM assets a WHERE a.id=$1 AND a.status='READY' AND (
      (a.scope='CUSTOMER' AND a.owner_user_id=$2 AND EXISTS (
        SELECT 1 FROM invitation_asset_refs refs WHERE refs.invitation_id=$3 AND refs.slot='PUBLISHED' AND refs.asset_id=a.id))
      OR (a.scope='TEMPLATE' AND EXISTS (
        SELECT 1 FROM template_revision_asset_refs refs WHERE refs.revision_id=$4 AND refs.asset_id=a.id)))`,
    [assetId, invitation.owner_user_id, invitation.id, invitation.design_revision_id]);
    if (!rows[0]) throw new NotFoundException();
    const abort = new AbortController(), cancel = () => abort.abort();
    response.once('close', cancel);
    try {
      const bytes = await this.references.bytes(rows[0], { deadline: Date.now() + 10000, signal: abort.signal });
      response.set({ 'Content-Type': rows[0].mime_type, 'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(bytes);
    } finally { response.off('close', cancel); }
  }
}
