import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import { AssetReferenceService, designAssetIds, weddingAssetIds } from '../../invitation-assets/application/asset-reference.service';
import type { Asset } from '../../invitation-assets/domain/entities';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type { TemplateDesignRevision } from '../../invitation-builder/domain/entities';
import { resolveDesign } from '../../invitation-builder/domain/resolve-design';
import { canonicalHash } from '../../invitation-builder/domain/validation-helpers';
import type { PublicationJob } from '../../invitation-builder/publication/entities';
import type { Invitation } from '../domain/entities';

@Injectable()
export class InvitationPublicationService {
  constructor(private readonly db: DataSource, private readonly references: AssetReferenceService) {}

  async finalize(input: { jobId: string; leaseOwner: string; asOf: string; visibleAssetIds: string[]; hasVisibleRsvp: boolean }) {
    return this.db.transaction(async (manager) => {
      const lookup: PublicationJob[] = await manager.query('SELECT * FROM publication_jobs WHERE id=$1 AND invitation_id IS NOT NULL', [input.jobId]);
      if (!lookup[0]) throw new NotFoundException();
      const users: { id: string; role: string; status: string }[] = await manager.query(
        'SELECT id,role,status FROM users WHERE id=$1 FOR UPDATE', [lookup[0].requested_by]);
      if (users[0]?.role !== 'CUSTOMER' || users[0].status !== 'ACTIVE') throw new NotFoundException();
      const invitations: Invitation[] = await manager.query('SELECT * FROM invitations WHERE id=$1 FOR UPDATE', [lookup[0].invitation_id]);
      const jobs: PublicationJob[] = await manager.query('SELECT * FROM publication_jobs WHERE id=$1 FOR UPDATE', [input.jobId]);
      const invitation = invitations[0], job = jobs[0];
      const clock: { now: Date }[] = await manager.query('SELECT clock_timestamp() AS now');
      if (!invitation || invitation.owner_user_id !== users[0].id || !job || job.status !== 'RUNNING' ||
          job.lease_owner !== input.leaseOwner || !job.lease_expires_at ||
          job.lease_expires_at <= clock[0].now || job.deadline_at <= clock[0].now ||
          invitation.edit_version !== job.expected_edit_version || !job.candidate_document || !job.candidate_data)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      const revisions: TemplateDesignRevision[] = await manager.query(
        'SELECT * FROM template_design_revisions WHERE id=$1', [invitation.design_revision_id]);
      if (!revisions[0] || canonicalHash(revisions[0].document) !== canonicalHash(job.candidate_document) ||
          canonicalHash({ document: job.candidate_document, data: job.candidate_data }) !== job.candidate_hash.trim())
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      const resolved = resolveDesign(job.candidate_document, job.candidate_data, { mode: 'capture', asOf: input.asOf });
      if (resolved.issues.length || resolved.hasVisibleRsvp !== input.hasVisibleRsvp ||
          resolved.visibleAssetIds.join(',') !== [...input.visibleAssetIds].sort().join(','))
        throw new BuilderProblemException(422, 'BINDING_INVALID', resolved.issues);
      const templateIds = designAssetIds(job.candidate_document), customerIds = weddingAssetIds(job.candidate_data);
      const referencedIds = [...new Set([...templateIds, ...customerIds])].sort();
      const jobRefs: { asset_id: string }[] = await manager.query(
        'SELECT asset_id FROM publication_job_asset_refs WHERE job_id=$1 ORDER BY asset_id', [job.id]);
      if (jobRefs.map((row) => row.asset_id).join(',') !== referencedIds.join(','))
        throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');
      const assets: Asset[] = referencedIds.length ? await manager.query(
        'SELECT * FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [referencedIds]) : [];
      const byId = new Map(assets.map((asset) => [asset.id, asset]));
      const revisionRefs: { asset_id: string }[] = await manager.query(
        'SELECT asset_id FROM template_revision_asset_refs WHERE revision_id=$1', [revisions[0].id]);
      const allowedTemplate = new Set(revisionRefs.map((row) => row.asset_id));
      if (templateIds.some((id) => !allowedTemplate.has(id) || byId.get(id)?.scope !== 'TEMPLATE' || byId.get(id)?.status !== 'READY') ||
          customerIds.some((id) => byId.get(id)?.scope !== 'CUSTOMER' || byId.get(id)?.owner_user_id !== users[0].id || byId.get(id)?.status !== 'READY'))
        throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');
      const actor: AuthenticatedPrincipal = { userId: users[0].id, role: 'CUSTOMER' } as AuthenticatedPrincipal;
      await this.references.replaceInvitation(manager, invitation.id, 'PUBLISHED', job.candidate_data, actor);
      const slug = invitation.public_slug ?? randomUUID();
      const updated: Invitation[] = await manager.query(`WITH changed AS (
        UPDATE invitations SET status='PUBLISHED',public_slug=$3,public_version=public_version+1,
          published_wedding_data=$4,published_scene=$5,published_has_visible_rsvp=$6,
          published_at=clock_timestamp(),edit_version=edit_version+1,updated_by=$7,updated_at=clock_timestamp()
        WHERE id=$1 AND edit_version=$2 RETURNING *) SELECT * FROM changed`,
      [invitation.id, job.expected_edit_version, slug, job.candidate_data, resolved.scene,
        resolved.hasVisibleRsvp, users[0].id]);
      if (!updated[0]) throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      const completed: { id: string }[] = await manager.query(`WITH done AS (
        UPDATE publication_jobs SET status='SUCCEEDED',completed_at=clock_timestamp(),result_public_version=$3,
          candidate_document=NULL,candidate_data=NULL,staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL
        WHERE id=$1 AND status='RUNNING' AND lease_owner=$2 AND lease_expires_at>clock_timestamp()
          AND deadline_at>clock_timestamp() RETURNING id) SELECT id FROM done`,
      [job.id, input.leaseOwner, updated[0].public_version]);
      if (completed.length !== 1) throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      await manager.query('DELETE FROM publication_job_asset_refs WHERE job_id=$1', [job.id]);
      return { resourceId: invitation.id, editVersion: updated[0].edit_version,
        publicVersion: updated[0].public_version, publicUrl: `/i/${slug}` };
    });
  }
}
