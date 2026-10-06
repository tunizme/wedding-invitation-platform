import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import {
  closedObject,
  encodeNewestCursor,
  listLimit,
  newestCursor,
  queryString,
  resourceId,
} from '../../invitation-builder/http/input';
import { AssetReferenceService } from '../application/asset-reference.service';
import type { Asset } from '../domain/entities';

export function assetSummary(
  asset: Asset,
  previewUrl = `/api/v1/assets/${asset.id}/content`,
) {
  return {
    id: asset.id,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
    byteSize: asset.byte_size,
    width: asset.width,
    height: asset.height,
    createdAt: asset.created_at.toISOString(),
    previewUrl,
  };
}

@Controller()
export class AssetsReadController {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AssetReferenceService)
    private readonly assets: AssetReferenceService,
  ) {}

  @Get('admin/template-assets')
  @Roles('ADMIN')
  async library(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    closedObject(query, ['limit', 'cursor', 'q', 'kind', 'mine']);
    const limit = listLimit(query),
      cursor = newestCursor(queryString(query, 'cursor'));
    const q = queryString(query, 'q')?.trim(),
      kind = queryString(query, 'kind'),
      mine = queryString(query, 'mine');
    if (
      (q !== undefined && (!q || [...q].length > 120)) ||
      (kind !== undefined &&
        !['IMAGE', 'DECORATION', 'BACKGROUND'].includes(kind)) ||
      (mine !== undefined && !['true', 'false'].includes(mine))
    )
      throw new UnprocessableEntityException();
    const rows: (Asset & { cursor_created_at: string })[] = await this.db.query(
      `SELECT *,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM assets WHERE scope='TEMPLATE' AND status='READY'
      AND ($1::text IS NULL OR strpos(lower(name),lower($1))>0)
      AND ($2::text IS NULL OR kind=$2) AND ($3::uuid IS NULL OR uploaded_by=$3)
      AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid))
      ORDER BY created_at DESC,id DESC LIMIT $6`,
      [
        q ?? null,
        kind ?? null,
        mine === 'true' ? request.principal.userId : null,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        limit + 1,
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
  }

  @Get('assets')
  @Roles('CUSTOMER')
  async mine(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    closedObject(query, ['limit', 'cursor', 'q', 'kind']);
    const limit = listLimit(query), cursor = newestCursor(queryString(query, 'cursor'));
    const q = queryString(query, 'q')?.trim(), kind = queryString(query, 'kind');
    if ((q !== undefined && (!q || [...q].length > 120)) ||
        (kind !== undefined && kind !== 'IMAGE'))
      throw new UnprocessableEntityException();
    const rows: (Asset & { cursor_created_at: string })[] = await this.db.query(
      `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM assets WHERE scope='CUSTOMER' AND status='READY' AND owner_user_id=$1
      AND ($2::text IS NULL OR strpos(lower(name),lower($2))>0)
      AND ($3::text IS NULL OR kind=$3)
      AND ($4::timestamptz IS NULL OR (created_at,id)<($4::timestamptz,$5::uuid))
      ORDER BY created_at DESC,id DESC LIMIT $6`,
      [request.principal.userId, q ?? null, kind ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );
    const page = rows.slice(0, limit), last = page.at(-1);
    return { items: page.map((asset) => assetSummary(asset)), nextCursor:
      rows.length > limit && last ? encodeNewestCursor(last.cursor_created_at, last.id) : null };
  }

  @Get('assets/:id/content')
  async content(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const asset = await this.assets.authorizedRead(
      resourceId(id),
      request.principal,
    );
    const abort = new AbortController();
    const cancel = () => abort.abort();
    response.once('close', cancel);
    try {
      const bytes = await this.assets.bytes(asset, {
        deadline: Date.now() + 10000,
        signal: abort.signal,
      });
      response
        .set({
          'Content-Type': asset.mime_type,
          'Content-Length': String(bytes.length),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        .send(bytes);
    } finally {
      response.off('close', cancel);
    }
  }
}
