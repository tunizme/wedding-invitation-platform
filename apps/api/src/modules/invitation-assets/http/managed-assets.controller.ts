import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { Roles } from '../../identity-access/authorization/roles.guard';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { requireAssistedInvitation } from '../../invitations/authorization/invitation.policy';
import {
  closedObject,
  listLimit,
  queryString,
  newestCursor,
  encodeNewestCursor,
} from '../../invitation-builder/http/input';
import {
  builderMultipartLimits,
  audioMultipartLimits,
} from '../../../common/http/request-boundaries';
import { UploadService } from '../application/upload.service';
import { assetSummary } from './assets-read.controller';
import type { Asset } from '../domain/entities';
@Controller('admin/invitations/:id')
@Roles('ADMIN')
export class ManagedAssetsController {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(UploadService) private readonly uploads: UploadService,
  ) {}
  @Get('assets')
  async list(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    closedObject(query, ['limit', 'cursor', 'q', 'kind', 'category']);
    const limit = listLimit(query),
      cursor = newestCursor(queryString(query, 'cursor'));
    return this.db.transaction(async (manager) => {
      await requireAssistedInvitation(manager, id, req.principal, false);
      const rows: (Asset & { cursor_created_at: string })[] =
        await manager.query(
          `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at FROM assets
        WHERE status='READY' AND (scope='TEMPLATE' OR (scope='CUSTOMER' AND assistance_invitation_id=$1))
        AND ($2::text IS NULL OR kind=$2) AND ($3::text IS NULL OR strpos(lower(name),lower($3))>0)
        AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid))
        AND ($7::text IS NULL OR category=$7) ORDER BY created_at DESC,id DESC LIMIT $6`,
          [
            id,
            queryString(query, 'kind') ?? null,
            queryString(query, 'q') ?? null,
            cursor?.createdAt ?? null,
            cursor?.id ?? null,
            limit + 1,
            queryString(query, 'category') ?? null,
          ],
        );
      const page = rows.slice(0, limit),
        last = page.at(-1);
      return {
        items: page.map((asset) => assetSummary(asset)),
        nextCursor:
          rows.length > limit && last
            ? encodeNewestCursor(last.cursor_created_at, last.id)
            : null,
      };
    });
  }
  @Post('assets')
  @UseInterceptors(FileInterceptor('file', { limits: builderMultipartLimits }))
  image(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.upload(id, req, file, body, false);
  }
  @Post('audio')
  @UseInterceptors(FileInterceptor('file', { limits: audioMultipartLimits }))
  audio(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.upload(id, req, file, body, true);
  }
  private async upload(
    id: string,
    req: AuthenticatedRequest,
    file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    body: Record<string, unknown>,
    audio: boolean,
  ) {
    const invitation = await this.db.transaction((manager) =>
      requireAssistedInvitation(manager, id, req.principal, false),
    );
    const context = { deadline: Date.now() + 10000 },
      assistance = { invitationId: id, ownerId: invitation.owner_user_id };
    return assetSummary(
      await (audio
        ? this.uploads.uploadAudio(
            file,
            body,
            req.principal,
            context,
            assistance,
          )
        : this.uploads.upload(file, body, req.principal, context, assistance)),
    );
  }
}
