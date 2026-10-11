import { validateSupportedTemplateDesign } from '../domain/document.validator';
import { randomUUID } from 'node:crypto';
import { Inject, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type { Asset } from '../../invitation-assets/domain/entities';
import { templateDetail } from '../application/template-draft.service';
import type { InvitationTemplate } from '../domain/entities';
import type { PublicationJob } from './entities';
import { canonicalHash } from '../domain/validation-helpers';
import { positiveVersion, resourceId } from '../http/input';
import { resolveDesign } from '../domain/resolve-design';
import {
  designAssetIds,
  weddingAssetIds,
} from '../../invitation-assets/application/asset-reference.service';
import type { Invitation } from '../../invitations/domain/entities';
import { invitationSummary } from '../../invitations/application/invitation-summary';
import { requireOwnedInvitation } from '../../invitations/authorization/invitation.policy';
import type { TemplateDesignRevision } from '../domain/entities';

type OperationResult = {
  resourceId: string;
  editVersion: number;
  revisionId?: string;
  publicVersion?: number;
  publicUrl?: string;
};
type OperationError = {
  code: string;
  issues: { path: string; nodeId?: string; code: string }[];
};
export type PublicationOperation = {
  id: string;
  status: PublicationJob['status'];
  createdAt: string;
  result: OperationResult | null;
  error: OperationError | null;
};

function operation(row: PublicationJob): PublicationOperation {
  const result: OperationResult | null =
    row.status === 'SUCCEEDED'
      ? {
          resourceId: row.template_id ?? row.invitation_id!,
          editVersion: row.expected_edit_version + 1,
          ...(row.result_revision_id
            ? { revisionId: row.result_revision_id }
            : {}),
          ...(row.result_public_version
            ? { publicVersion: row.result_public_version }
            : {}),
        }
      : null;
  return {
    id: row.id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    result,
    error:
      row.status === 'FAILED'
        ? {
            code: row.error_code ?? 'RENDER_UNAVAILABLE',
            issues: row.issues ?? [],
          }
        : null,
  };
}

export class PublicationService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async enqueueTemplate(
    actor: AuthenticatedPrincipal,
    rawId: string,
    rawExpectedVersion: unknown,
    rawKey: string,
  ): Promise<PublicationOperation> {
    if (actor.role !== 'ADMIN') throw new NotFoundException();
    const templateId = resourceId(rawId),
      expectedVersion = positiveVersion(rawExpectedVersion);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        rawKey,
      )
    )
      throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    const requestHash = canonicalHash({
      resourceKind: 'TEMPLATE',
      resourceId: templateId,
      expectedVersion,
    });
    return this.db.transaction(async (manager) => {
      const rows: InvitationTemplate[] = await manager.query(
        'SELECT * FROM invitation_templates WHERE id=$1 FOR UPDATE',
        [templateId],
      );
      const template = rows[0];
      if (!template) throw new NotFoundException();

      // Serialize the global admission budget and requester-key uniqueness across resources.
      await manager.query(
        'SELECT pg_advisory_xact_lock($1,$2)',
        [1346459220, 1],
      );

      // A matching requester receipt is replayed before checking editVersion or queue state.
      const receipts: PublicationJob[] = await manager.query(
        'SELECT * FROM publication_jobs WHERE requested_by=$1 AND request_key=$2',
        [actor.userId, rawKey],
      );
      const prior = receipts[0];
      if (prior) {
        if (
          prior.template_id !== templateId ||
          prior.request_hash.trim() !== requestHash
        )
          throw new BuilderProblemException(409, 'IDEMPOTENCY_CONFLICT');
        return operation(prior);
      }
      if (template.edit_version !== expectedVersion)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      const active: { id: string }[] = await manager.query(
        "SELECT id FROM publication_jobs WHERE template_id=$1 AND status IN ('PENDING','RUNNING') FOR UPDATE",
        [templateId],
      );
      if (active.length)
        throw new BuilderProblemException(409, 'PUBLICATION_IN_PROGRESS');
      const counts: { count: number }[] = await manager.query(
        "SELECT count(*)::int AS count FROM publication_jobs WHERE status IN ('PENDING','RUNNING')",
      );
      if (counts[0].count >= 12)
        throw new BuilderProblemException(503, 'RENDER_QUEUE_FULL', [], 5);

      const validated = validateSupportedTemplateDesign(
        template.draft_document,
      );
      if (!validated.valid)
        throw new BuilderProblemException(
          422,
          validated.code,
          validated.issues,
        );
      const document = validated.value,
        data = template.draft_sample_data;
      const resolved = resolveDesign(document, data, {
        mode: 'capture',
        asOf: '2026-01-01T00:00:00Z',
      });
      if (resolved.issues.length)
        throw new BuilderProblemException(
          422,
          'BINDING_INVALID',
          resolved.issues,
        );
      const assetIds = [
        ...new Set([...designAssetIds(document), ...weddingAssetIds(data)]),
      ].sort();
      if (assetIds.length) {
        const referenced: Asset[] = await manager.query(
          'SELECT * FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [assetIds],
        );
        if (
          referenced.length !== assetIds.length ||
          referenced.some(
            (asset) => asset.scope !== 'TEMPLATE' || asset.status !== 'READY',
          )
        )
          throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');
      }
      const id = randomUUID(),
        candidateHash = canonicalHash({ document, data });
      const inserted: PublicationJob[] = await manager.query(
        `WITH clock AS (SELECT clock_timestamp() AS now)
        INSERT INTO publication_jobs(id,template_id,invitation_id,requested_by,request_key,request_hash,expected_edit_version,
          candidate_document,candidate_data,candidate_hash,status,attempts,created_at,deadline_at,issues)
        SELECT $1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,'PENDING',0,clock.now,clock.now+interval '90 seconds','[]'::jsonb FROM clock RETURNING *`,
        [
          id,
          templateId,
          actor.userId,
          rawKey,
          requestHash,
          expectedVersion,
          document,
          data,
          candidateHash,
        ],
      );
      for (const assetId of assetIds)
        await manager.query(
          'INSERT INTO publication_job_asset_refs(job_id,asset_id) VALUES($1,$2)',
          [id, assetId],
        );
      return operation(inserted[0]);
    });
  }

  async unpublishTemplate(
    actor: AuthenticatedPrincipal,
    rawId: string,
    rawExpectedVersion: unknown,
  ) {
    if (actor.role !== 'ADMIN') throw new NotFoundException();
    const id = resourceId(rawId),
      expected = positiveVersion(rawExpectedVersion);
    return this.db.transaction(async (manager) => {
      const rows: InvitationTemplate[] = await manager.query(
        'SELECT * FROM invitation_templates WHERE id=$1 FOR UPDATE',
        [id],
      );
      const template = rows[0];
      if (!template) throw new NotFoundException();
      if (template.edit_version !== expected)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      if (template.status === 'DRAFT')
        throw new BuilderProblemException(409, 'NOT_PUBLISHED');
      const active: { id: string }[] = await manager.query(
        "SELECT id FROM publication_jobs WHERE template_id=$1 AND status IN ('PENDING','RUNNING')",
        [id],
      );
      if (template.status === 'UNPUBLISHED' && !active.length)
        return templateDetail(template);
      const updated: InvitationTemplate[] = await manager.query(
        `
        WITH changed AS (UPDATE invitation_templates SET status='UNPUBLISHED',edit_version=edit_version+1,updated_at=clock_timestamp()
        WHERE id=$1 AND edit_version=$2 RETURNING *) SELECT * FROM changed`,
        [id, expected],
      );
      return templateDetail(updated[0]);
    });
  }

  async enqueueInvitation(
    actor: AuthenticatedPrincipal,
    rawId: string,
    rawExpectedVersion: unknown,
    rawKey: string,
  ): Promise<PublicationOperation> {
    const invitationId = resourceId(rawId),
      expectedVersion = positiveVersion(rawExpectedVersion);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        rawKey,
      )
    )
      throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    const requestHash = canonicalHash({
      resourceKind: 'INVITATION',
      resourceId: invitationId,
      expectedVersion,
    });
    return this.db.transaction(async (manager) => {
      const invitation = await requireOwnedInvitation(
        manager,
        invitationId,
        actor,
        true,
      );
      await manager.query(
        'SELECT pg_advisory_xact_lock($1,$2)',
        [1346459220, 1],
      );
      const receipts: PublicationJob[] = await manager.query(
        'SELECT * FROM publication_jobs WHERE requested_by=$1 AND request_key=$2',
        [actor.userId, rawKey],
      );
      const prior = receipts[0];
      if (prior) {
        if (
          prior.invitation_id !== invitationId ||
          prior.request_hash.trim() !== requestHash
        )
          throw new BuilderProblemException(409, 'IDEMPOTENCY_CONFLICT');
        return operation(prior);
      }
      if (invitation.edit_version !== expectedVersion)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      const active: { id: string }[] = await manager.query(
        "SELECT id FROM publication_jobs WHERE invitation_id=$1 AND status IN ('PENDING','RUNNING') FOR UPDATE",
        [invitationId],
      );
      if (active.length)
        throw new BuilderProblemException(409, 'PUBLICATION_IN_PROGRESS');
      const counts: { count: number }[] = await manager.query(
        "SELECT count(*)::int AS count FROM publication_jobs WHERE status IN ('PENDING','RUNNING')",
      );
      if (counts[0].count >= 12)
        throw new BuilderProblemException(503, 'RENDER_QUEUE_FULL', [], 5);
      const revisions: TemplateDesignRevision[] = await manager.query(
        'SELECT * FROM template_design_revisions WHERE id=$1',
        [invitation.design_revision_id],
      );
      const revision = revisions[0];
      if (!revision)
        throw new BuilderProblemException(409, 'TEMPLATE_UNAVAILABLE');
      const clock: { now: Date }[] = await manager.query(
        'SELECT clock_timestamp() AS now',
      );
      const enqueuedAt = new Date(clock[0].now);
      const validated = validateSupportedTemplateDesign(revision.document);
      if (!validated.valid)
        throw new BuilderProblemException(
          422,
          validated.code,
          validated.issues,
        );
      if (
        revision.schema_version !== validated.value.schemaVersion ||
        revision.renderer_contract_version !== validated.value.schemaVersion
      )
        throw new BuilderProblemException(422, 'UNSUPPORTED_SCHEMA');
      const document = validated.value,
        data = invitation.draft_wedding_data;
      const resolved = resolveDesign(document, data, {
        mode: 'capture',
        asOf: enqueuedAt.toISOString(),
      });
      if (resolved.issues.length)
        throw new BuilderProblemException(
          422,
          resolved.issues.some((issue) => issue.code === 'BINDING_REQUIRED')
            ? 'REQUIRED_DATA_MISSING'
            : 'BINDING_INVALID',
          resolved.issues,
        );
      const templateIds = designAssetIds(document),
        customerIds = weddingAssetIds(data);
      const allIds = [...new Set([...templateIds, ...customerIds])].sort();
      if (allIds.length) {
        const assets: Asset[] = await manager.query(
          'SELECT * FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [allIds],
        );
        const byId = new Map(assets.map((asset) => [asset.id, asset]));
        const revisionRefs: { asset_id: string }[] = await manager.query(
          'SELECT asset_id FROM template_revision_asset_refs WHERE revision_id=$1',
          [revision.id],
        );
        const allowedTemplate = new Set(
          revisionRefs.map((row) => row.asset_id),
        );
        if (
          templateIds.some(
            (id) =>
              !allowedTemplate.has(id) ||
              byId.get(id)?.scope !== 'TEMPLATE' ||
              byId.get(id)?.status !== 'READY',
          ) ||
          customerIds.some(
            (id) =>
              byId.get(id)?.scope !== 'CUSTOMER' ||
              byId.get(id)?.owner_user_id !== actor.userId ||
              byId.get(id)?.status !== 'READY',
          )
        )
          throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');
      }
      const id = randomUUID(),
        candidateHash = canonicalHash({ document, data });
      const inserted: PublicationJob[] = await manager.query(
        `WITH clock AS (SELECT $10::timestamptz AS now)
        INSERT INTO publication_jobs(id,template_id,invitation_id,requested_by,request_key,request_hash,expected_edit_version,
          candidate_document,candidate_data,candidate_hash,status,attempts,created_at,deadline_at,issues)
        SELECT $1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',0,clock.now,clock.now+interval '90 seconds','[]'::jsonb FROM clock RETURNING *`,
        [
          id,
          invitationId,
          actor.userId,
          rawKey,
          requestHash,
          expectedVersion,
          document,
          data,
          candidateHash,
          enqueuedAt,
        ],
      );
      for (const assetId of allIds)
        await manager.query(
          'INSERT INTO publication_job_asset_refs(job_id,asset_id) VALUES($1,$2)',
          [id, assetId],
        );
      return operation(inserted[0]);
    });
  }

  async unpublishInvitation(
    actor: AuthenticatedPrincipal,
    rawId: string,
    rawExpectedVersion: unknown,
  ) {
    const id = resourceId(rawId),
      expected = positiveVersion(rawExpectedVersion);
    return this.db.transaction(async (manager) => {
      const invitation: Invitation = await requireOwnedInvitation(
        manager,
        id,
        actor,
        true,
      );
      if (invitation.edit_version !== expected)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      if (invitation.status === 'DRAFT')
        throw new BuilderProblemException(409, 'NOT_PUBLISHED');
      const active: { id: string }[] = await manager.query(
        "SELECT id FROM publication_jobs WHERE invitation_id=$1 AND status IN ('PENDING','RUNNING')",
        [id],
      );
      if (invitation.status === 'UNPUBLISHED' && !active.length)
        return invitationSummary(invitation);
      const rows: Invitation[] = await manager.query(
        `WITH changed AS (
        UPDATE invitations SET status='UNPUBLISHED',edit_version=edit_version+1,updated_by=$2,updated_at=clock_timestamp()
        WHERE id=$1 AND edit_version=$3 RETURNING *) SELECT * FROM changed`,
        [id, actor.userId, expected],
      );
      return invitationSummary(rows[0]);
    });
  }

  async getOperation(
    actor: AuthenticatedPrincipal,
    rawId: string,
  ): Promise<PublicationOperation> {
    const id = resourceId(rawId);
    const rows: PublicationJob[] = await this.db.query(
      'SELECT * FROM publication_jobs WHERE id=$1 AND requested_by=$2',
      [id, actor.userId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException();
    if (row.template_id) {
      const visible: { id: string }[] = await this.db.query(
        'SELECT id FROM invitation_templates WHERE id=$1',
        [row.template_id],
      );
      if (!visible.length) throw new NotFoundException();
    } else {
      const visible: { id: string }[] = await this.db.query(
        'SELECT id FROM invitations WHERE id=$1 AND owner_user_id=$2',
        [row.invitation_id, actor.userId],
      );
      if (!visible.length) throw new NotFoundException();
    }
    return operation(row);
  }

  async listOperations(
    actor: AuthenticatedPrincipal,
    input: { resourceKind: string; resourceId: string; limit: number },
  ) {
    const resourceIdValue = resourceId(input.resourceId),
      limit = Math.max(1, Math.min(20, Math.trunc(input.limit)));
    if (
      input.resourceKind !== 'TEMPLATE' &&
      input.resourceKind !== 'INVITATION'
    )
      throw new BuilderProblemException(422, 'DOCUMENT_INVALID');
    const column =
      input.resourceKind === 'TEMPLATE' ? 'template_id' : 'invitation_id';
    const visible: { id: string }[] =
      input.resourceKind === 'TEMPLATE'
        ? await this.db.query(
            'SELECT id FROM invitation_templates WHERE id=$1',
            [resourceIdValue],
          )
        : await this.db.query(
            'SELECT id FROM invitations WHERE id=$1 AND owner_user_id=$2',
            [resourceIdValue, actor.userId],
          );
    if (!visible.length) throw new NotFoundException();
    const rows: PublicationJob[] = await this.db.query(
      `SELECT * FROM publication_jobs WHERE ${column}=$1 AND requested_by=$2 ORDER BY created_at DESC,id DESC LIMIT $3`,
      [resourceIdValue, actor.userId, limit],
    );
    return { items: rows.map(operation) };
  }
}
