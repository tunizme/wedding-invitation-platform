import {
  createBlankDocument,
  validateEditorDocument,
  type EditorDocument,
} from '../domain/editor-document';
import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import { AssetReferenceService } from '../../invitation-assets/application/asset-reference.service';
import type { Asset } from '../../invitation-assets/domain/entities';
import type { InvitationTemplate } from '../domain/entities';
import type {} from '../domain/document.types';
import { validateWeddingData } from '../../invitations/domain/wedding-data.validator';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import {
  assertVersion,
  requireTemplate,
} from '../authorization/template.policy';
import {
  closedObject,
  listLimit,
  positiveVersion,
  queryString,
  resourceId,
} from '../http/input';

export const blankDesign = createBlankDocument;
function text(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    [...value.trim()].length > max
  )
    throw new UnprocessableEntityException();
  return value.trim();
}
function metadata(body: unknown, create = false) {
  const input = closedObject(
    body,
    create
      ? ['name', 'category', 'tags', 'sortOrder']
      : [
          'expectedVersion',
          'name',
          'category',
          'tags',
          'sortOrder',
          'coverAssetId',
        ],
  );
  const output: {
    name?: string;
    category?: string;
    tags?: string[];
    sortOrder?: number;
    coverAssetId?: string | null;
  } = {};
  for (const key of ['name', 'category'] as const)
    if (create || Object.hasOwn(input, key))
      output[key] = text(input[key], key === 'name' ? 120 : 64);
  if (Object.hasOwn(input, 'tags')) {
    if (!Array.isArray(input.tags) || input.tags.length > 20)
      throw new UnprocessableEntityException();
    output.tags = input.tags.map((tag: unknown) => text(tag, 32));
    if (new Set(output.tags).size !== output.tags.length)
      throw new UnprocessableEntityException();
  }
  if (Object.hasOwn(input, 'sortOrder')) {
    if (
      typeof input.sortOrder !== 'number' ||
      !Number.isInteger(input.sortOrder) ||
      Math.abs(input.sortOrder) > 1000000
    )
      throw new UnprocessableEntityException();
    output.sortOrder = input.sortOrder;
  }
  if (Object.hasOwn(input, 'coverAssetId')) {
    if (input.coverAssetId !== null && typeof input.coverAssetId !== 'string')
      throw new UnprocessableEntityException();
    output.coverAssetId =
      input.coverAssetId === null ? null : resourceId(input.coverAssetId);
  }
  return {
    value: output,
    expected: create ? undefined : positiveVersion(input.expectedVersion),
  };
}
export function templateSummary(row: InvitationTemplate) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    tags: row.tags,
    status: row.status,
    sortOrder: row.sort_order,
    coverUrl:
      row.cover_asset_id || row.published_revision_id
        ? `/api/v1/templates/${row.id}/cover`
        : null,
    publishedRevisionId: row.published_revision_id,
    editVersion: row.edit_version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
export function templateDetail(row: InvitationTemplate) {
  return {
    ...templateSummary(row),
    draftDocument: row.draft_document,
    draftSampleData: row.draft_sample_data,
    coverAssetId: row.cover_asset_id,
    createdBy: row.created_by,
  };
}

export class TemplateDraftService {
  constructor(
    private readonly db: DataSource,
    private readonly refs: AssetReferenceService,
  ) {}
  async create(actor: AuthenticatedPrincipal, body: unknown) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    const { value } = metadata(body, true);
    const rows: InvitationTemplate[] = await this.db.query(
      `INSERT INTO invitation_templates(id,name,category,tags,sort_order,draft_document,draft_sample_data,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        randomUUID(),
        value.name,
        value.category,
        JSON.stringify(value.tags ?? []),
        value.sortOrder ?? 0,
        createBlankDocument(),
        { schemaVersion: 2, fields: {} },
        actor.userId,
      ],
    );
    return templateDetail(rows[0]);
  }
  async get(actor: AuthenticatedPrincipal, id: string) {
    return templateDetail(await requireTemplate(this.db.manager, id, actor));
  }
  async save(actor: AuthenticatedPrincipal, id: string, body: unknown) {
    const input = closedObject(body, [
        'expectedVersion',
        'document',
        'sampleData',
      ]),
      expected = positiveVersion(input.expectedVersion);
    return this.db.transaction(async (manager) => {
      const row = await requireTemplate(manager, id, actor, true);
      assertVersion(row.edit_version, expected);
      const design = validateEditorDocument(input.document),
        sample = validateWeddingData(input.sampleData);
      if (!design.valid)
        throw new BuilderProblemException(422, design.code, design.issues);
      if (!sample.valid)
        throw new BuilderProblemException(422, sample.code, sample.issues);
      await this.refs.replaceTemplateDraft(
        manager,
        id,
        design.value,
        sample.value,
        actor,
      );
      const rows: InvitationTemplate[] = await manager.query(
        `WITH saved AS (UPDATE invitation_templates SET draft_document=$2,draft_sample_data=$3,edit_version=edit_version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *) SELECT * FROM saved`,
        [id, design.value, sample.value],
      );
      return templateDetail(rows[0]);
    });
  }
  async update(actor: AuthenticatedPrincipal, id: string, body: unknown) {
    const { value, expected } = metadata(body);
    if (!Object.keys(value).length) throw new UnprocessableEntityException();
    return this.db.transaction(async (manager) => {
      const row = await requireTemplate(manager, id, actor, true);
      assertVersion(row.edit_version, expected!);
      const assets = [row.cover_asset_id, value.coverAssetId]
        .filter((id): id is string => !!id)
        .sort();
      if (assets.length)
        await manager.query(
          'SELECT id FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [assets],
        );
      if (value.coverAssetId)
        await this.refs.lockReady(manager, [value.coverAssetId], {
          kind: 'template',
          actor,
        });
      const rows: InvitationTemplate[] = await manager.query(
        `WITH saved AS (UPDATE invitation_templates SET name=$2,category=$3,tags=$4,sort_order=$5,cover_asset_id=$6,edit_version=edit_version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *) SELECT * FROM saved`,
        [
          id,
          value.name ?? row.name,
          value.category ?? row.category,
          JSON.stringify(value.tags ?? row.tags),
          value.sortOrder ?? row.sort_order,
          value.coverAssetId === undefined
            ? row.cover_asset_id
            : value.coverAssetId,
        ],
      );
      return templateDetail(rows[0]);
    });
  }
  async duplicate(actor: AuthenticatedPrincipal, id: string, body: unknown) {
    const input = closedObject(body, ['expectedVersion', 'name']),
      expected = positiveVersion(input.expectedVersion),
      name = text(input.name, 120);
    return this.db.transaction(async (manager) => {
      const original = await requireTemplate(manager, id, actor, true);
      assertVersion(original.edit_version, expected);
      const validation = validateEditorDocument(original.draft_document);
      if (!validation.valid)
        throw new BuilderProblemException(
          422,
          validation.code,
          validation.issues,
        );
      const document = structuredClone(validation.value);
      const newId = randomUUID();
      if (document.schemaVersion === 3) {
        const ids = new Map(
          document.nodes.ROOT.nodes.map((id) => [id, randomUUID()]),
        );
        const nodes: EditorDocument['nodes'] = { ROOT: document.nodes.ROOT };
        const opts: EditorDocument['nodeOptions'] = {};
        const groups = new Map<string, string>();
        for (const [old, fresh] of ids) {
          nodes[fresh] = document.nodes[old];
          if (document.nodeOptions[old]) {
            opts[fresh] = structuredClone(document.nodeOptions[old]);
            const option = opts[fresh];
            if (option.groupId) {
              if (!groups.has(option.groupId))
                groups.set(option.groupId, randomUUID());
              option.groupId = groups.get(option.groupId)!;
            }
            if (option.action?.kind === 'scroll')
              option.action.value =
                ids.get(option.action.value) ?? option.action.value;
          }
        }
        nodes.ROOT.nodes = [...ids.values()];
        document.nodes = nodes;
        document.nodeOptions = opts;
      }
      const rows: InvitationTemplate[] = await manager.query(
        `INSERT INTO invitation_templates(id,name,category,tags,sort_order,cover_asset_id,draft_document,draft_sample_data,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          newId,
          name,
          original.category,
          JSON.stringify(original.tags),
          original.sort_order,
          original.cover_asset_id,
          document,
          original.draft_sample_data,
          actor.userId,
        ],
      );
      // The original resource lock protects its cover/reference set throughout.
      await this.refs.replaceTemplateDraft(
        manager,
        newId,
        document,
        original.draft_sample_data,
        actor,
      );
      return templateDetail(rows[0]);
    });
  }
  async list(actor: AuthenticatedPrincipal, query: Record<string, unknown>) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    closedObject(query, ['q', 'category', 'tag', 'status', 'limit', 'cursor']);
    const limit = listLimit(query);
    const strings = ['q', 'category', 'tag', 'status'].map((key) =>
      queryString(query, key),
    );
    const [q, category, tag, status] = strings;
    for (const [value, max] of [
      [q, 120],
      [category, 64],
      [tag, 32],
    ] as const)
      if (value !== undefined) text(value, max);
    if (
      status !== undefined &&
      !['DRAFT', 'PUBLISHED', 'UNPUBLISHED'].includes(status)
    )
      throw new UnprocessableEntityException();
    let cursor: { sortOrder: number; id: string } | undefined;
    const raw = queryString(query, 'cursor');
    if (raw !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,256}$/.test(raw)) throw new Error();
        const bytes = Buffer.from(raw, 'base64url');
        if (bytes.toString('base64url') !== raw) throw new Error();
        const decoded = closedObject(JSON.parse(bytes.toString()) as unknown, [
          'sortOrder',
          'id',
        ]);
        if (
          typeof decoded.sortOrder !== 'number' ||
          !Number.isInteger(decoded.sortOrder) ||
          Math.abs(decoded.sortOrder) > 1000000 ||
          typeof decoded.id !== 'string'
        )
          throw new Error();
        cursor = { sortOrder: decoded.sortOrder, id: resourceId(decoded.id) };
      } catch {
        throw new UnprocessableEntityException();
      }
    }
    const rows: InvitationTemplate[] = await this.db.query(
      `SELECT * FROM invitation_templates WHERE ($1::text IS NULL OR strpos(lower(name),lower($1))>0) AND ($2::text IS NULL OR category=$2) AND ($3::text IS NULL OR tags ? $3) AND ($4::text IS NULL OR status=$4) AND ($5::integer IS NULL OR (sort_order,id)>($5,$6::uuid)) ORDER BY sort_order,id LIMIT $7`,
      [
        q?.trim() ?? null,
        category?.trim() ?? null,
        tag?.trim() ?? null,
        status ?? null,
        cursor?.sortOrder ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );
    const page = rows.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map(templateSummary),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({ sortOrder: last.sort_order, id: last.id }),
            ).toString('base64url')
          : null,
    };
  }
  async cover(actor: AuthenticatedPrincipal, id: string): Promise<Asset> {
    resourceId(id);
    const rows: Asset[] = await this.db.query(
      `SELECT a.* FROM invitation_templates t LEFT JOIN template_design_revisions r ON r.id=t.published_revision_id JOIN assets a ON a.id=COALESCE(t.cover_asset_id,r.thumbnail_asset_id) WHERE t.id=$1 AND a.status='READY' AND ($2='ADMIN' OR t.status='PUBLISHED')`,
      [id, actor.role],
    );
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }
}
