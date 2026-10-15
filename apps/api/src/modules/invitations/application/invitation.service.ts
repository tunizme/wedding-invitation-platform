import { directEditorDocument } from '../../invitation-builder/domain/direct-editor-document';
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
import {
  requireInvitationAccess,
  requireActiveAssistanceUsers,
  assertInvitationDesignPermission,
} from '../authorization/invitation.policy';
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
    ...(row.editing_mode === 'SERVICE_MANAGED'
      ? {
          resourceKind: 'INVITATION',
          name: row.title || row.template_name,
          category: 'Thiệp khách hàng',
          tags: [],
          sortOrder: 0,
          coverUrl: null,
          coverAssetId: null,
          publishedRevisionId: null,
          draftDocument: row.document,
          draftSampleData: row.draft_wedding_data,
        }
      : {}),
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
      `SELECT i.*,COALESCE(i.draft_document,r.document) AS document,t.id AS template_id,t.name AS template_name FROM invitations i
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
    const blank = validateWeddingData({ schemaVersion: 2, fields: {} });
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
      await requireInvitationAccess(manager, id, actor);
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
    const input = closedObject(
      body,
      actor.role === 'ADMIN'
        ? ['expectedVersion', 'weddingData', 'document', 'title']
        : ['expectedVersion', 'weddingData'],
    );
    const expectedVersion = positiveVersion(input.expectedVersion),
      validated = validateWeddingData(input.weddingData);
    if (!validated.valid)
      throw new BuilderProblemException(422, validated.code, validated.issues);
    return this.db.transaction(async (manager) => {
      const row = await requireInvitationAccess(manager, id, actor, true);
      assertInvitationDesignPermission(row, actor);
      let document = row.draft_document;
      if (input.document !== undefined) {
        if (row.editing_mode !== 'SERVICE_MANAGED')
          throw new ForbiddenException();
        const checked = validateSupportedTemplateDesign(input.document);
        if (!checked.valid)
          throw new BuilderProblemException(422, checked.code, checked.issues);
        document = checked.value;
      }
      const title = input.title === undefined ? (row.title ?? '') : input.title;
      if (
        typeof title !== 'string' ||
        title.length > 200 ||
        title.includes('\0')
      )
        throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
      if (row.edit_version !== expectedVersion)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      await this.refs.replaceInvitation(
        manager,
        id,
        'DRAFT',
        validated.value,
        actor,
        actor.role === 'ADMIN',
        document ?? undefined,
      );
      await manager.query(
        `UPDATE invitations SET draft_wedding_data=$2,draft_document=$4,title=$5,edit_version=edit_version+1,
        updated_by=$3,updated_at=clock_timestamp() WHERE id=$1`,
        [id, validated.value, actor.userId, document ?? null, title.trim()],
      );
      return detail(await this.detailRow(manager, id));
    });
  }
  async createManaged(actor: AuthenticatedPrincipal, body: unknown) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    const input = closedObject(body, ['customerId', 'templateId', 'title']);
    const customerId = resourceId(input.customerId as string),
      templateId = resourceId(input.templateId as string);
    const title = input.title ?? '';
    if (typeof title !== 'string' || title.length > 200 || title.includes('\0'))
      throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    return this.db.transaction(async (manager) => {
      await requireActiveAssistanceUsers(manager, customerId, actor);
      const [revision]: TemplateDesignRevision[] = await manager.query(
        `SELECT r.* FROM invitation_templates t JOIN template_design_revisions r ON r.id=t.published_revision_id
         WHERE t.id=$1 AND t.status='PUBLISHED' FOR SHARE OF t`,
        [templateId],
      );
      if (!revision)
        throw new BuilderProblemException(409, 'TEMPLATE_UNAVAILABLE');
      const checked = validateSupportedTemplateDesign(revision.document);
      if (!checked.valid)
        throw new BuilderProblemException(422, checked.code, checked.issues);
      const document =
        checked.value.schemaVersion === 3
          ? directEditorDocument(checked.value, revision.sample_data)
          : checked.value;
      const id = randomUUID(),
        data = { schemaVersion: 2, fields: {} };
      await manager.query(
        `INSERT INTO invitations(id,owner_user_id,design_revision_id,draft_wedding_data,draft_document,editing_mode,title,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,'SERVICE_MANAGED',$6,$7,$7)`,
        [
          id,
          customerId,
          revision.id,
          data,
          document,
          title.trim(),
          actor.userId,
        ],
      );
      await this.refs.replaceInvitation(
        manager,
        id,
        'DRAFT',
        data as import('../../invitation-builder/domain/document.types').WeddingData,
        actor,
        true,
        document,
      );
      return detail(await this.detailRow(manager, id));
    });
  }
  async listManaged(
    actor: AuthenticatedPrincipal,
    query: Record<string, unknown>,
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    closedObject(query, ['limit', 'cursor', 'customerId']);
    const limit = listLimit(query),
      cursor = newestCursor(queryString(query, 'cursor'));
    const customerId = queryString(query, 'customerId');
    if (customerId) resourceId(customerId);
    const rows: (Invitation & { email: string; cursor_created_at: string })[] =
      await this.db.query(
        `SELECT i.*,u.email,to_char(i.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
       FROM invitations i JOIN users u ON u.id=i.owner_user_id WHERE i.editing_mode='SERVICE_MANAGED'
       AND ($1::uuid IS NULL OR i.owner_user_id=$1)
       AND ($2::timestamptz IS NULL OR (i.created_at,i.id)<($2::timestamptz,$3::uuid))
       ORDER BY i.created_at DESC,i.id DESC LIMIT $4`,
        [
          customerId ?? null,
          cursor?.createdAt ?? null,
          cursor?.id ?? null,
          limit + 1,
        ],
      );
    const page = rows.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map((row) => ({
        ...invitationSummary(row),
        customerEmail: row.email,
        ownerId: row.owner_user_id,
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeNewestCursor(last.cursor_created_at, last.id)
          : null,
    };
  }
  async confirmPayment(
    actor: AuthenticatedPrincipal,
    id: string,
    body: unknown,
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException();
    const input = closedObject(body, ['expectedVersion', 'note']),
      version = positiveVersion(input.expectedVersion),
      note = input.note ?? '';
    if (typeof note !== 'string' || note.length > 1000 || note.includes('\0'))
      throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    return this.db.transaction(async (manager) => {
      const row = await requireInvitationAccess(manager, id, actor, true);
      if (row.editing_mode !== 'SERVICE_MANAGED')
        throw new ForbiddenException();
      if (row.edit_version !== version)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      if (!row.paid_at)
        await manager.query(
          `UPDATE invitations SET paid_at=clock_timestamp(),paid_by=$2,payment_note=$3,
        edit_version=edit_version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$1`,
          [id, actor.userId, note.trim()],
        );
      return detail(await this.detailRow(manager, id));
    });
  }
}
