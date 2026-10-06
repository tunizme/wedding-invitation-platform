import { Controller, Get, Inject, NotFoundException, Param, Query, Req, Res, UnprocessableEntityException } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { AssetReferenceService } from '../../invitation-assets/application/asset-reference.service';
import type { Asset } from '../../invitation-assets/domain/entities';
import type { AuthenticatedRequest } from '../../identity-access/authorization/auth.guard';
import { Roles } from '../../identity-access/authorization/roles.guard';
import type { InvitationTemplate, TemplateDesignRevision } from '../domain/entities';
import { formFieldsForDesign } from '../domain/binding-catalog';
import { closedObject, listLimit, queryString, resourceId } from './input';

@Controller('templates')
export class TemplateCatalogController {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AssetReferenceService) private readonly assets: AssetReferenceService,
  ) {}

  @Get()
  @Roles('CUSTOMER')
  async list(@Query() query: Record<string, unknown>) {
    closedObject(query, ['q', 'category', 'tag', 'limit', 'cursor']);
    const limit = listLimit(query);
    const q = queryString(query, 'q')?.trim(), category = queryString(query, 'category')?.trim(),
      tag = queryString(query, 'tag')?.trim(), raw = queryString(query, 'cursor');
    if ((q && q.length > 120) || (category && category.length > 64) || (tag && tag.length > 32))
      throw new UnprocessableEntityException();
    let cursor: { sortOrder: number; id: string } | undefined;
    if (raw !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,256}$/.test(raw)) throw new Error();
        const bytes = Buffer.from(raw, 'base64url');
        if (bytes.toString('base64url') !== raw) throw new Error();
        const value = closedObject(JSON.parse(bytes.toString('utf8')) as unknown, ['sortOrder', 'id']);
        if (typeof value.sortOrder !== 'number' || !Number.isInteger(value.sortOrder) ||
            Math.abs(value.sortOrder) > 1000000 || typeof value.id !== 'string') throw new Error();
        cursor = { sortOrder: value.sortOrder, id: resourceId(value.id) };
      } catch { throw new UnprocessableEntityException(); }
    }
    const rows: InvitationTemplate[] = await this.db.query(`SELECT * FROM invitation_templates
      WHERE status='PUBLISHED' AND published_revision_id IS NOT NULL
        AND ($1::text IS NULL OR strpos(lower(name),lower($1))>0)
        AND ($2::text IS NULL OR category=$2) AND ($3::text IS NULL OR tags ? $3)
        AND ($4::integer IS NULL OR (sort_order,id)>($4,$5::uuid))
      ORDER BY sort_order,id LIMIT $6`, [q || null, category || null, tag || null,
      cursor?.sortOrder ?? null, cursor?.id ?? null, limit + 1]);
    const page = rows.slice(0, limit), last = page.at(-1);
    return {
      items: page.map((row) => ({ id: row.id, name: row.name, category: row.category,
        tags: row.tags, publishedRevisionId: row.published_revision_id,
        coverUrl: `/api/v1/templates/${row.id}/cover` })),
      nextCursor: rows.length > limit && last
        ? Buffer.from(JSON.stringify({ sortOrder: last.sort_order, id: last.id })).toString('base64url') : null,
    };
  }

  @Get(':id/revisions/:revisionId')
  @Roles('CUSTOMER')
  async revision(@Param('id') id: string, @Param('revisionId') revisionId: string) {
    resourceId(id); resourceId(revisionId);
    const rows: TemplateDesignRevision[] = await this.db.query(`SELECT r.* FROM template_design_revisions r
      JOIN invitation_templates t ON t.id=r.template_id
      WHERE t.id=$1 AND r.id=$2 AND t.status='PUBLISHED' AND t.published_revision_id=r.id`, [id, revisionId]);
    if (!rows[0]) throw new NotFoundException();
    return { id, revisionId, document: rows[0].document, sampleData: rows[0].sample_data,
      formFields: formFieldsForDesign(rows[0].document) };
  }

  @Get(':id/revisions/:revisionId/assets/:assetId')
  async revisionAsset(@Req() request: AuthenticatedRequest, @Param('id') id: string,
    @Param('revisionId') revisionId: string, @Param('assetId') assetId: string, @Res() response: Response) {
    resourceId(id); resourceId(revisionId); resourceId(assetId);
    const actor = request.principal;
    const rows: Asset[] = await this.db.query(`SELECT a.* FROM template_design_revisions r
      JOIN invitation_templates t ON t.id=r.template_id
      JOIN assets a ON a.id=$3 AND a.status='READY'
      WHERE t.id=$1 AND r.id=$2 AND (a.id=r.thumbnail_asset_id OR EXISTS (
        SELECT 1 FROM template_revision_asset_refs refs WHERE refs.revision_id=r.id AND refs.asset_id=a.id))
        AND ($4='ADMIN' OR (t.status='PUBLISHED' AND t.published_revision_id=r.id)
          OR EXISTS (SELECT 1 FROM invitations i WHERE i.design_revision_id=r.id AND i.owner_user_id=$5))`,
    [id, revisionId, assetId, actor.role, actor.userId]);
    if (!rows[0]) throw new NotFoundException();
    const abort = new AbortController(), cancel = () => abort.abort();
    response.once('close', cancel);
    try {
      const bytes = await this.assets.bytes(rows[0], { deadline: Date.now() + 10000, signal: abort.signal });
      response.set({ 'Content-Type': rows[0].mime_type, 'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(bytes);
    } finally { response.off('close', cancel); }
  }
}
