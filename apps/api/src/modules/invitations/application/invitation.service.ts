import { validateSupportedTemplateDesign } from '../../invitation-builder/domain/document.validator';
import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import { AssetReferenceService } from '../../invitation-assets/application/asset-reference.service';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type { TemplateDesignRevision } from '../../invitation-builder/domain/entities';
import { formFieldsForDesign } from '../../invitation-builder/domain/binding-catalog';
import {
  closedObject,
  encodeNewestCursor,
  listLimit,
  newestCursor,
  positiveVersion,
  queryString,
  resourceId,
} from '../../invitation-builder/http/input';
import { requireOwnedInvitation } from '../authorization/invitation.policy';
import type { Invitation } from '../domain/entities';
import { invitationSummary } from './invitation-summary';
import { validateWeddingData } from '../domain/wedding-data.validator';

type DetailRow = Invitation & {
  template_id: string;
  template_name: string;
  document: TemplateDesignRevision['document'];
};
const detail = (row: DetailRow) => {
  const checked = validateSupportedTemplateDesign(row.document);
  if (!checked.valid)
    throw new BuilderProblemException(422, checked.code, checked.issues);
  return {
    ...invitationSummary(row),
    ownerId: row.owner_user_id,
    createdBy: row.created_by,
    templateId: row.template_id,
    designRevisionId: row.design_revision_id,
    draftWeddingData: row.draft_wedding_data,
    templateName: row.template_name,
    document: row.document,
    formFields: formFieldsForDesign(row.document),
  };
};

@Injectable()
export class InvitationService {
  constructor(
    private readonly db: DataSource,
    private readonly refs: AssetReferenceService,
  ) {}

  private async detailRow(
    manager: EntityManager,
    id: string,
  ): Promise<DetailRow> {
    const rows: DetailRow[] = await manager.query(
      `SELECT i.*,r.document,t.id AS template_id,t.name AS template_name FROM invitations i
      JOIN template_design_revisions r ON r.id=i.design_revision_id
      JOIN invitation_templates t ON t.id=r.template_id WHERE i.id=$1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException();
    return rows[0];
  }

  async create(actor: AuthenticatedPrincipal, body: unknown) {
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();
    const input = closedObject(body, ['templateId', 'designRevisionId']);
    const templateId = resourceId(input.templateId as string),
      revisionId = resourceId(input.designRevisionId as string);
    const blank = validateWeddingData({ schemaVersion: 1 });
    if (!blank.valid)
      throw new BuilderProblemException(422, blank.code, blank.issues);
    return this.db.transaction(async (manager) => {
      const templates: {
        published_revision_id: string | null;
        status: string;
      }[] = await manager.query(
        'SELECT status,published_revision_id FROM invitation_templates WHERE id=$1 FOR SHARE',
        [templateId],
      );
      if (
        !templates[0] ||
        templates[0].status !== 'PUBLISHED' ||
        templates[0].published_revision_id !== revisionId
      )
        throw new BuilderProblemException(409, 'TEMPLATE_UNAVAILABLE');
      const id = randomUUID();
      await manager.query(
        `INSERT INTO invitations(id,owner_user_id,design_revision_id,draft_wedding_data,created_by,updated_by)
        VALUES($1,$2,$3,$4,$2,$2)`,
        [id, actor.userId, revisionId, blank.value],
      );
      return detail(await this.detailRow(manager, id));
    });
  }

  async get(actor: AuthenticatedPrincipal, id: string) {
    const row = await this.db.transaction(async (manager) => {
      await requireOwnedInvitation(manager, id, actor);
      return this.detailRow(manager, id);
    });
    return detail(row);
  }

  async list(actor: AuthenticatedPrincipal, query: Record<string, unknown>) {
    if (actor.role !== 'CUSTOMER') throw new ForbiddenException();
    closedObject(query, ['limit', 'cursor']);
    const limit = listLimit(query),
      cursor = newestCursor(queryString(query, 'cursor'));
    const rows: (Invitation & { cursor_created_at: string })[] =
      await this.db.query(
        `SELECT *,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM invitations WHERE owner_user_id=$1
      AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
      ORDER BY created_at DESC,id DESC LIMIT $4`,
        [
          actor.userId,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          limit + 1,
        ],
      );
    const page = rows.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map(invitationSummary),
      nextCursor:
        rows.length > limit && last
          ? encodeNewestCursor(last.cursor_created_at, last.id)
          : null,
    };
  }

  async save(actor: AuthenticatedPrincipal, id: string, body: unknown) {
    const input = closedObject(body, ['expectedVersion', 'weddingData']);
    const expectedVersion = positiveVersion(input.expectedVersion),
      validated = validateWeddingData(input.weddingData);
    if (!validated.valid)
      throw new BuilderProblemException(422, validated.code, validated.issues);
    return this.db.transaction(async (manager) => {
      const row = await requireOwnedInvitation(manager, id, actor, true);
      if (row.edit_version !== expectedVersion)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      await this.refs.replaceInvitation(
        manager,
        id,
        'DRAFT',
        validated.value,
        actor,
      );
      await manager.query(
        `UPDATE invitations SET draft_wedding_data=$2,edit_version=edit_version+1,
        updated_by=$3,updated_at=clock_timestamp() WHERE id=$1`,
        [id, validated.value, actor.userId],
      );
      return detail(await this.detailRow(manager, id));
    });
  }
}
