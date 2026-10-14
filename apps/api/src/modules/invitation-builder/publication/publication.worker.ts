import { createHash, randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ASSET_STORE,
  type AssetStore,
  AssetObjectMissingError,
} from '../../invitation-assets/domain/asset-store.port';
import { AssetWriteService } from '../../invitation-assets/application/asset-write.service';
import type { Asset } from '../../invitation-assets/domain/entities';
import { resolveDesign } from '../domain/resolve-design';
import {
  ChromiumRenderer,
  TrustedRenderError,
  type RenderAsset,
} from './chromium-renderer';
import { TemplatePublicationService } from './template-publication.service';
import type { PublicationJob } from './entities';
import type { ValidationIssue } from '../domain/document.types';
import { InvitationPublicationService } from '../../invitations/application/invitation-publication.service';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';

export const PUBLICATION_WORKER = 'PUBLICATION_WORKER';
type ClaimedJob = { id: string; lease_owner: string };

/** Owns the database lease protocol. Rendering and finalization are deliberately outside SQL transactions. */
@Injectable()
export class PublicationWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private active = 0;

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(ASSET_STORE) private readonly store: AssetStore,
    @Inject(AssetWriteService) private readonly writes: AssetWriteService,
    @Inject(ChromiumRenderer) private readonly renderer: ChromiumRenderer,
    @Inject(TemplatePublicationService)
    private readonly finalizer: TemplatePublicationService,
    @Inject(InvitationPublicationService)
    private readonly invitationFinalizer: InvitationPublicationService,
  ) {}

  onModuleInit(): void {
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.BUILDER_ENABLE_PUBLICATION_WORKER !== 'true'
    )
      return;
    this.timer = setInterval(() => {
      void this.pump();
    }, 250);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    while (this.active > 0)
      await new Promise((resolve) => setTimeout(resolve, 20));
  }

  private async pump(): Promise<void> {
    if (this.stopped || this.active >= 2) return;
    this.active++;
    try {
      const claimed = await this.claim();
      if (claimed) await this.process(claimed);
      await this.reclaimExpired();
    } catch {
      /* A later tick retries transient database errors. */
    } finally {
      this.active--;
    }
  }

  private async process(claimed: ClaimedJob): Promise<void> {
    try {
      const jobs: PublicationJob[] = await this.db.query(
        "SELECT * FROM publication_jobs WHERE id=$1 AND status='RUNNING' AND lease_owner=$2",
        [claimed.id, claimed.lease_owner],
      );
      const job = jobs[0];
      if (
        !job?.candidate_document ||
        !job.candidate_data ||
        (!job.template_id && !job.invitation_id) ||
        !job.lease_expires_at
      )
        return;
      const asOf = job.template_id
        ? '2026-01-01T00:00:00.000Z'
        : new Date(job.created_at).toISOString();
      const resolved = resolveDesign(
        job.candidate_document,
        job.candidate_data,
        { mode: 'capture', asOf },
      );
      if (resolved.issues.length)
        throw new TrustedRenderError('CONTENT_OVERFLOW', resolved.issues);
      const assets: Asset[] = resolved.visibleAssetIds.length
        ? await this.db.query(
            "SELECT * FROM assets WHERE id=ANY($1::uuid[]) AND status='READY' ORDER BY id",
            [resolved.visibleAssetIds],
          )
        : [];
      if (assets.length !== resolved.visibleAssetIds.length)
        throw new TrustedRenderError('RENDER_UNAVAILABLE');
      const context = {
        deadline: Math.min(
          job.deadline_at.getTime(),
          job.lease_expires_at.getTime(),
        ),
      };
      const entries: [string, RenderAsset][] = await Promise.all(
        assets
          .filter((asset) => asset.kind !== 'AUDIO')
          .map(async (asset): Promise<[string, RenderAsset]> => {
            const object = await this.store.get(
              asset.object_key,
              asset.byte_size,
              context,
            );
            if (
              object.bytes.length !== asset.byte_size ||
              object.contentType !== asset.mime_type ||
              createHash('sha256').update(object.bytes).digest('hex') !==
                asset.sha256
            )
              throw new TrustedRenderError('RENDER_UNAVAILABLE');
            return [
              asset.id,
              {
                bytes: object.bytes,
                mimeType: asset.mime_type as 'image/webp' | 'image/png',
              },
            ];
          }),
      );
      const renderAssets: Record<string, RenderAsset> =
        Object.fromEntries(entries);
      const captured = await this.renderer.capture({
        scene: resolved.scene,
        candidateHash: job.candidate_hash.trim(),
        asOf,
        assets: renderAssets,
        hasVisibleRsvp: resolved.hasVisibleRsvp,
      });
      if (job.template_id) {
        const prepared = await this.writes.prepare(
          captured.png,
          'image/png',
          context,
          { id: job.id, leaseToken: claimed.lease_owner },
        );
        await this.finalizer.finalize({
          jobId: job.id,
          leaseOwner: claimed.lease_owner,
          thumbnail: prepared,
          asOf,
          visibleAssetIds: resolved.visibleAssetIds,
          hasVisibleRsvp: resolved.hasVisibleRsvp,
        });
      } else {
        await this.invitationFinalizer.finalize({
          jobId: job.id,
          leaseOwner: claimed.lease_owner,
          asOf,
          visibleAssetIds: resolved.visibleAssetIds,
          hasVisibleRsvp: resolved.hasVisibleRsvp,
        });
      }
    } catch (error) {
      const code =
        error instanceof TrustedRenderError
          ? error.code
          : error instanceof AssetObjectMissingError
            ? 'ASSET_UNAVAILABLE'
            : error instanceof BuilderProblemException
              ? error.problemCode
              : 'RENDER_UNAVAILABLE';
      await this.failOwned(
        claimed.id,
        claimed.lease_owner,
        code,
        error instanceof TrustedRenderError ? error.issues : [],
      );
    }
  }

  private async claim(): Promise<ClaimedJob | null> {
    const owner = randomUUID();
    return this.db.transaction(async (manager) => {
      const rows: ClaimedJob[] = await manager.query(
        `
        WITH candidate AS (
          SELECT id FROM publication_jobs
          WHERE status='PENDING' AND deadline_at>clock_timestamp() AND attempts<2
          ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
        ), claimed AS (
          UPDATE publication_jobs job SET status='RUNNING',attempts=job.attempts+1,lease_owner=$1,
            lease_expires_at=LEAST(clock_timestamp()+interval '45 seconds',job.deadline_at)
          FROM candidate WHERE job.id=candidate.id RETURNING job.id,job.lease_owner
        ) SELECT id,lease_owner FROM claimed`,
        [owner],
      );
      return rows[0] ?? null;
    });
  }

  /** Lease-token fencing makes late failures from an expired worker harmless. */
  async failOwned(
    jobId: string,
    leaseOwner: string,
    code: string,
    issues: ValidationIssue[] = [],
  ): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const owned: {
        lease_owner: string;
        status: string;
        lease_expires_at: Date;
        deadline_at: Date;
      }[] = await manager.query(
        `SELECT lease_owner,status,lease_expires_at,deadline_at FROM publication_jobs WHERE id=$1 FOR UPDATE`,
        [jobId],
      );
      if (
        !owned[0] ||
        owned[0].status !== 'RUNNING' ||
        owned[0].lease_owner !== leaseOwner ||
        owned[0].lease_expires_at <= new Date() ||
        owned[0].deadline_at <= new Date()
      )
        return false;
      const rows: { id: string }[] = await manager.query(
        `
        UPDATE publication_jobs SET status='FAILED',error_code=$3,issues=$4,completed_at=clock_timestamp(),
          candidate_document=NULL,candidate_data=NULL,staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL
        WHERE id=$1 AND status='RUNNING' AND lease_owner=$2
          AND lease_expires_at>clock_timestamp() AND deadline_at>clock_timestamp()
        RETURNING id`,
        [
          jobId,
          leaseOwner,
          /^[A-Z_]{3,40}$/.test(code) ? code : 'RENDER_UNAVAILABLE',
          JSON.stringify(
            issues
              .slice(0, 100)
              .map((issue) => ({
                path: issue.path,
                code: issue.code,
                ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
                ...(issue.sectionId ? { sectionId: issue.sectionId } : {}),
                ...(issue.layout ? { layout: issue.layout } : {}),
              }))
              .filter(
                (issue) =>
                  /^\/[a-zA-Z0-9/_-]{0,255}$/.test(issue.path) &&
                  /^[A-Z_]{3,40}$/.test(issue.code) &&
                  (!issue.nodeId || /^[0-9a-f-]{36}$/i.test(issue.nodeId)) &&
                  (!issue.sectionId ||
                    /^[0-9a-f-]{36}$/i.test(issue.sectionId)) &&
                  (!issue.layout ||
                    ['mobile', 'desktop'].includes(issue.layout)),
              ),
          ),
        ],
      );
      if (!rows.length) return false;
      await manager.query(
        'DELETE FROM publication_job_asset_refs WHERE job_id=$1',
        [jobId],
      );
      return true;
    });
  }

  /** Expired leases and jobs past their fixed deadline are terminal and release candidate refs. */
  async reclaimExpired(): Promise<number> {
    return this.db.transaction(async (manager) => {
      const rows: { id: string }[] = await manager.query(`
        WITH expired AS (
          UPDATE publication_jobs SET status='FAILED',error_code='RENDER_TIMEOUT',completed_at=clock_timestamp(),
            candidate_document=NULL,candidate_data=NULL,staged_thumbnail_key=NULL,lease_owner=NULL,lease_expires_at=NULL
          WHERE status IN ('PENDING','RUNNING') AND (deadline_at<=clock_timestamp()
            OR (status='RUNNING' AND lease_expires_at<=clock_timestamp()))
          RETURNING id
        ) SELECT id FROM expired`);
      if (rows.length)
        await manager.query(
          'DELETE FROM publication_job_asset_refs WHERE job_id=ANY($1::uuid[])',
          [rows.map((row) => row.id)],
        );
      return rows.length;
    });
  }
}
