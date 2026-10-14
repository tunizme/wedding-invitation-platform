import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import { AssetReferenceService } from '../../invitation-assets/application/asset-reference.service';
import {
  validateEditorDocument,
  documentAssetIds,
  type EditorDocument,
} from '../domain/editor-document';
import {
  closedObject,
  listLimit,
  positiveVersion,
  resourceId,
  queryString,
} from '../http/input';
import { assertVersion } from '../authorization/template.policy';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';

type Preset = {
  id: string;
  name: string;
  category: string;
  edit_version: number;
  document: EditorDocument;
};
const summary = (p: Preset) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  editVersion: p.edit_version,
  document: p.document,
});
export class EditorPresetService {
  constructor(
    private readonly db: DataSource,
    private readonly assets: AssetReferenceService,
  ) {}
  async list(actor: AuthenticatedPrincipal, query: Record<string, unknown>) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    closedObject(query, ['limit', 'cursor', 'q', 'category']);
    const limit = listLimit(query),
      cursor = queryString(query, 'cursor'),
      q = queryString(query, 'q') ?? '',
      category = queryString(query, 'category');
    if (q.length > 120 || (category && category.length > 64))
      throw new UnprocessableEntityException();
    if (cursor) resourceId(cursor);
    const rows: Preset[] = await this.db.query(
      `SELECT p.*,r.document FROM editor_presets p JOIN editor_preset_revisions r ON r.preset_id=p.id AND r.revision=p.edit_version WHERE ($1::uuid IS NULL OR p.id>$1) AND strpos(lower(p.name),lower($2))>0 AND ($3::text IS NULL OR p.category=$3) ORDER BY p.id LIMIT $4`,
      [cursor ?? null, q, category ?? null, limit + 1],
    );
    return {
      items: rows.slice(0, limit).map(summary),
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    };
  }
  async save(actor: AuthenticatedPrincipal, body: unknown, id?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    const input = closedObject(
      body,
      id
        ? ['name', 'category', 'document', 'expectedVersion']
        : ['name', 'category', 'document'],
    );
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 120 ||
      typeof input.category !== 'string' ||
      !input.category.trim() ||
      input.category.length > 64
    )
      throw new UnprocessableEntityException();
    const name = input.name.trim(),
      category = input.category.trim();
    const checked = validateEditorDocument(input.document);
    if (!checked.valid)
      throw new BuilderProblemException(422, checked.code, checked.issues);
    return this.db.transaction(async (manager) => {
      const presetId = id ? resourceId(id) : randomUUID();
      let version = 1;
      if (id) {
        const rows: Preset[] = await manager.query(
          'SELECT * FROM editor_presets WHERE id=$1 FOR UPDATE',
          [id],
        );
        if (!rows[0]) throw new NotFoundException();
        assertVersion(
          rows[0].edit_version,
          positiveVersion(input.expectedVersion),
        );
        version = rows[0].edit_version + 1;
        await manager.query(
          'UPDATE editor_presets SET name=$2,category=$3,edit_version=$4,updated_at=clock_timestamp() WHERE id=$1',
          [id, name, category, version],
        );
      } else
        await manager.query(
          'INSERT INTO editor_presets(id,name,category,created_by) VALUES($1,$2,$3,$4)',
          [presetId, name, category, actor.userId],
        );
      const ids = documentAssetIds(checked.value);
      await this.assets.lockReady(manager, ids, { kind: 'template', actor });
      const revision = randomUUID();
      await manager.query(
        'INSERT INTO editor_preset_revisions(id,preset_id,revision,document) VALUES($1,$2,$3,$4)',
        [revision, presetId, version, checked.value],
      );
      if (ids.length)
        await manager.query(
          'INSERT INTO editor_preset_asset_refs(revision_id,asset_id) SELECT $1,unnest($2::uuid[])',
          [revision, ids],
        );
      return {
        id: presetId,
        name,
        category,
        editVersion: version,
        document: checked.value,
      };
    });
  }
  async remove(actor: AuthenticatedPrincipal, id: string, body: unknown) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    resourceId(id);
    const input = closedObject(body, ['expectedVersion']);
    return this.db.transaction(async (manager) => {
      const rows: Preset[] = await manager.query(
        'SELECT * FROM editor_presets WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!rows[0]) throw new NotFoundException();
      assertVersion(
        rows[0].edit_version,
        positiveVersion(input.expectedVersion),
      );
      const refs: { asset_id: string }[] = await manager.query(
        'SELECT DISTINCT a.asset_id FROM editor_preset_asset_refs a JOIN editor_preset_revisions r ON r.id=a.revision_id WHERE r.preset_id=$1 ORDER BY a.asset_id',
        [id],
      );
      if (refs.length)
        await manager.query(
          'SELECT id FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [refs.map((a) => a.asset_id)],
        );
      await manager.query('DELETE FROM editor_presets WHERE id=$1', [id]);
    });
  }
}
