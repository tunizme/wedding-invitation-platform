import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../../identity-access/authorization/auth.guard';
import { resourceId } from '../../invitation-builder/http/input';
import type { Invitation } from '../domain/entities';
import { visibleSceneAssetIds } from '../domain/visible-scene-assets';

@Controller('public/invitations')
@Public()
export class PublicInvitationController {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  @Get(':slug')
  async get(
    @Param('slug') rawSlug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const slug = resourceId(rawSlug);
    const rows: Invitation[] = await this.db.query(
      `SELECT * FROM invitations
      WHERE public_slug=$1 AND status='PUBLISHED'`,
      [slug],
    );
    const row = rows[0];
    if (!row || !row.published_scene) throw new NotFoundException();
    if (!(
      row.published_scene.schemaVersion === 3 &&
      row.published_scene.rendererContractVersion ===
        row.published_scene.schemaVersion
    ))
      throw new NotFoundException();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const assetUrls = Object.fromEntries(
      visibleSceneAssetIds(row.published_scene).map((id) => [
        id,
        `/api/v1/public/invitations/${slug}/releases/${row.public_version}/assets/${id}`,
      ]),
    );
    return {
      publicVersion: row.public_version,
      scene: row.published_scene,
      context: {
        mode: 'public',
        asOf: new Date().toISOString(),
        invitation: {
          slug,
          publicVersion: row.public_version,
          rsvpOpen: row.rsvp_open,
        },
        assetUrls,
      },
    };
  }
}
