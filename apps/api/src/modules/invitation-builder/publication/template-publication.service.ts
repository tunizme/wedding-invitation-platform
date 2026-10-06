import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import { AssetReferenceService, designAssetIds, weddingAssetIds } from '../../invitation-assets/application/asset-reference.service';
import { AssetWriteService, type PreparedAsset } from '../../invitation-assets/application/asset-write.service';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type { InvitationTemplate } from '../domain/entities';
import type { PublicationJob } from './entities';
import { resolveDesign } from '../domain/resolve-design';

@Injectable()
export class TemplatePublicationService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AssetReferenceService) private readonly references: AssetReferenceService,
    @Inject(AssetWriteService) private readonly writes: AssetWriteService,
  ) {}

  async finalize(input: { jobId: string; leaseOwner: string; thumbnail: PreparedAsset; asOf: string; visibleAssetIds: string[]; hasVisibleRsvp: boolean }) {
    return this.db.transaction(async (manager) => {
      const jobs: PublicationJob[] = await manager.query('SELECT * FROM publication_jobs WHERE id=$1 AND template_id IS NOT NULL', [input.jobId]);
      if (!jobs.length) throw new NotFoundException();
      const users: { id: string; role: string; status: string }[] = await manager.query('SELECT id,role,status FROM users WHERE id=$1 FOR UPDATE', [jobs[0].requested_by]);
      if (users[0]?.role !== 'ADMIN' || users[0]?.status !== 'ACTIVE') throw new NotFoundException();
      const templateRows: InvitationTemplate[] = await manager.query('SELECT * FROM invitation_templates WHERE id=$1 FOR UPDATE', [jobs[0].template_id]);
      const jobRows: PublicationJob[] = await manager.query('SELECT * FROM publication_jobs WHERE id=$1 FOR UPDATE', [input.jobId]);
      const job = jobRows[0], template = templateRows[0];
      const clock: { now: Date }[] = await manager.query('SELECT clock_timestamp() AS now');
      if (!template || !job || job.status !== 'RUNNING' || job.lease_owner !== input.leaseOwner ||
          !job.lease_expires_at || job.lease_expires_at <= clock[0].now || job.deadline_at <= clock[0].now)
        throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      if (job.requested_by !== users[0].id) throw new NotFoundException();
      if (template.edit_version !== job.expected_edit_version) throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      if (!job.candidate_document || !job.candidate_data) throw new BuilderProblemException(409, 'VERSION_CONFLICT');

      const resolved = resolveDesign(job.candidate_document, job.candidate_data, { mode: 'capture', asOf: input.asOf });
      if (resolved.issues.length || resolved.hasVisibleRsvp !== input.hasVisibleRsvp ||
          resolved.visibleAssetIds.join(',') !== [...input.visibleAssetIds].sort().join(','))
        throw new BuilderProblemException(422, 'BINDING_INVALID', resolved.issues);
      const referencedIds = [...new Set([...designAssetIds(job.candidate_document), ...weddingAssetIds(job.candidate_data)])].sort();
      const jobRefs: { asset_id: string }[] = await manager.query('SELECT asset_id FROM publication_job_asset_refs WHERE job_id=$1 ORDER BY asset_id', [job.id]);
      if (jobRefs.map((row) => row.asset_id).join(',') !== referencedIds.join(','))
        throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');

      const actor = { userId: users[0].id, role: 'ADMIN' } as AuthenticatedPrincipal;
      const assets = await this.references.lockReady(manager, referencedIds, { kind: 'template', actor });
      const thumbnail = await this.writes.finalize(manager, input.thumbnail, {
        scope: 'SYSTEM_THUMBNAIL', owner_user_id: null, uploaded_by: users[0].id,
        assistance_invitation_id: null, name: 'Template thumbnail', kind: 'THUMBNAIL', width: 390, height: 520,
      });
      const revisionNumber: { next: number }[] = await manager.query('SELECT COALESCE(max(revision_number),0)+1 AS next FROM template_design_revisions WHERE template_id=$1', [template.id]);
      const revisionId = randomUUID();
      await manager.query(`INSERT INTO template_design_revisions(id,template_id,revision_number,schema_version,document,sample_data,document_hash,renderer_contract_version,thumbnail_asset_id,created_by)
        VALUES($1,$2,$3,1,$4,$5,$6,1,$7,$8)`, [revisionId, template.id, revisionNumber[0].next, job.candidate_document, job.candidate_data, job.candidate_hash, thumbnail.id, users[0].id]);
      await this.references.replaceRevision(manager, revisionId, assets.map((asset) => asset.id), actor);
      const updated: InvitationTemplate[] = await manager.query(`WITH changed AS (
        UPDATE invitation_templates SET status='PUBLISHED',published_revision_id=$3,edit_version=edit_version+1,updated_at=clock_timestamp()
        WHERE id=$1 AND edit_version=$2 RETURNING *) SELECT * FROM changed`, [template.id, job.expected_edit_version, revisionId]);
      if (!updated.length) throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      const completed: { id: string }[] = await manager.query(`WITH done AS (
        UPDATE publication_jobs SET status='SUCCEEDED',completed_at=clock_timestamp(),result_revision_id=$3,
          candidate_document=NULL,candidate_data=NULL,staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL
        WHERE id=$1 AND status='RUNNING' AND lease_owner=$2 AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp() RETURNING id
      ) SELECT id FROM done`, [job.id, input.leaseOwner, revisionId]);
      if (completed.length !== 1) throw new BuilderProblemException(409, 'VERSION_CONFLICT');
      await manager.query('DELETE FROM publication_job_asset_refs WHERE job_id=$1', [job.id]);
      return { resourceId: template.id, editVersion: updated[0].edit_version, revisionId, thumbnailAssetId: thumbnail.id };
    });
  }
}
