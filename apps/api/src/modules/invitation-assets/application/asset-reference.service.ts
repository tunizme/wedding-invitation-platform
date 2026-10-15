import {
  documentAssetIds,
  contentFieldAssetIds,
} from '../../invitation-builder/domain/editor-document';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { createHash } from 'node:crypto';
import { BuilderProblemException } from '../../../common/errors/public-problem.exception';
import type { AuthenticatedPrincipal } from '../../identity-access/authorization/principal';
import type {
  SupportedTemplateDesign,
  WeddingData,
} from '../../invitation-builder/domain/document.types';
import { UUID_EXPRESSION } from '../../invitation-builder/domain/validation-helpers';
import type { Asset } from '../domain/entities';
import { requireAssistedInvitation } from '../../invitations/authorization/invitation.policy';
import { detachImage } from './asset-detachment';
import {
  StorageUnavailableError,
  type AssetStore,
  type StorageContext,
} from '../domain/asset-store.port';

export type ReferenceScope =
  | { kind: 'template'; actor: AuthenticatedPrincipal }
  | { kind: 'customer'; actor: AuthenticatedPrincipal }
  | {
      kind: 'invitation';
      actor: AuthenticatedPrincipal;
      invitationId: string;
      assisted: boolean;
      allowTemplate: boolean;
    };

export function weddingAssetIds(data: WeddingData): string[] {
  return [
    ...new Set(
      [
        data.bride?.photo,
        data.groom?.photo,
        data.couple?.photo,
        ...contentFieldAssetIds(data.fields),
      ].filter((id): id is string => Boolean(id)),
    ),
  ].sort();
}
export function designAssetIds(design: SupportedTemplateDesign): string[] {
  return documentAssetIds(design);
}

export class AssetReferenceService {
  constructor(
    private readonly db: DataSource,
    private readonly store: AssetStore,
  ) {}
  private async predicate(
    manager: EntityManager,
    scope: ReferenceScope,
  ): Promise<(asset: Asset) => boolean> {
    if (scope.kind === 'template') {
      if (scope.actor.role !== 'ADMIN') throw new ForbiddenException();
      return (asset) => asset.scope === 'TEMPLATE';
    }
    if (scope.kind === 'customer') {
      if (scope.actor.role !== 'CUSTOMER') throw new ForbiddenException();
      return (asset) =>
        asset.scope === 'CUSTOMER' &&
        asset.owner_user_id === scope.actor.userId;
    }
    const invitations: {
      owner_user_id: string;
      design_revision_id: string;
      editing_mode: string;
    }[] = await manager.query(
      'SELECT owner_user_id,design_revision_id,editing_mode FROM invitations WHERE id=$1',
      [scope.invitationId],
    );
    const invitation = invitations[0];
    if (!invitation) throw new NotFoundException();
    if (scope.assisted) {
      if (scope.actor.role !== 'ADMIN') throw new ForbiddenException();
      // Mutation adapters lock these users BEFORE the invitation; this read also
      // prevents stale support scope from granting access during ordinary reads.
      const users: { id: string; role: string; status: string }[] =
        await manager.query(
          'SELECT id,role,status FROM users WHERE id=ANY($1::uuid[])',
          [[scope.actor.userId, invitation.owner_user_id]],
        );
      if (
        !users.some(
          (user) =>
            user.id === scope.actor.userId &&
            user.role === 'ADMIN' &&
            user.status === 'ACTIVE',
        ) ||
        !users.some(
          (user) =>
            user.id === invitation.owner_user_id &&
            user.role === 'CUSTOMER' &&
            user.status === 'ACTIVE',
        )
      )
        throw new ForbiddenException();
    } else if (
      scope.actor.role !== 'CUSTOMER' ||
      scope.actor.userId !== invitation.owner_user_id
    )
      throw new NotFoundException();
    const templateRows: { asset_id: string }[] = scope.allowTemplate
      ? await manager.query(
          'SELECT asset_id FROM template_revision_asset_refs WHERE revision_id=$1',
          [invitation.design_revision_id],
        )
      : [];
    const templateIds = new Set(templateRows.map((row) => row.asset_id));
    const existing: { asset_id: string }[] = scope.assisted
      ? await manager.query(
          'SELECT asset_id FROM invitation_asset_refs WHERE invitation_id=$1',
          [scope.invitationId],
        )
      : [];
    const existingIds = new Set(existing.map((row) => row.asset_id));
    return (asset) =>
      asset.scope === 'TEMPLATE'
        ? templateIds.has(asset.id) ||
          (scope.allowTemplate &&
            scope.assisted &&
            invitation.editing_mode === 'SERVICE_MANAGED')
        : asset.scope === 'CUSTOMER' &&
          asset.owner_user_id === invitation.owner_user_id &&
          (!scope.assisted ||
            existingIds.has(asset.id) ||
            asset.assistance_invitation_id === scope.invitationId);
  }
  /** Caller holds the resource lock; all asset locks use the same UUID order. */
  async lockReady(
    manager: EntityManager,
    ids: readonly string[],
    scope: ReferenceScope,
  ): Promise<Asset[]> {
    const unique = [...new Set(ids)].sort();
    if (unique.some((id) => !UUID_EXPRESSION.test(id)))
      throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');
    const allowed = await this.predicate(manager, scope);
    const assets: Asset[] = unique.length
      ? await manager.query(
          'SELECT * FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
          [unique],
        )
      : [];
    if (
      assets.length !== unique.length ||
      assets.some((asset) => asset.status !== 'READY' || !allowed(asset))
    )
      throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');
    return assets;
  }
  private async replace(
    manager: EntityManager,
    table:
      | 'template_draft_asset_refs'
      | 'template_revision_asset_refs'
      | 'invitation_asset_refs'
      | 'publication_job_asset_refs',
    field: 'template_id' | 'revision_id' | 'invitation_id' | 'job_id',
    id: string,
    ids: readonly string[],
    scope: ReferenceScope,
    slot?: 'DRAFT' | 'PUBLISHED',
  ): Promise<void> {
    if (ids.some((assetId) => !UUID_EXPRESSION.test(assetId)))
      throw new BuilderProblemException(422, 'ASSET_UNAVAILABLE');
    const existing: { asset_id: string }[] = await manager.query(
      `SELECT asset_id FROM ${table} WHERE ${field}=$1${slot ? ' AND slot=$2' : ''}`,
      slot ? [id, slot] : [id],
    );
    const all = [
      ...new Set([...ids, ...existing.map((row) => row.asset_id)]),
    ].sort();
    // Protect both removed and added references against concurrent tombstoning.
    if (all.length)
      await manager.query(
        'SELECT id FROM assets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [all],
      );
    await this.lockReady(manager, ids, scope);
    await manager.query(
      `DELETE FROM ${table} WHERE ${field}=$1${slot ? ' AND slot=$2' : ''}`,
      slot ? [id, slot] : [id],
    );
    if (ids.length)
      await manager.query(
        `INSERT INTO ${table}(${field},asset_id${slot ? ',slot' : ''}) SELECT $1,asset_id${slot ? ',$3' : ''} FROM unnest($2::uuid[]) AS asset_id`,
        slot
          ? [id, [...new Set(ids)].sort(), slot]
          : [id, [...new Set(ids)].sort()],
      );
  }
  replaceTemplateDraft(
    manager: EntityManager,
    id: string,
    document: SupportedTemplateDesign,
    sample: WeddingData,
    actor: AuthenticatedPrincipal,
  ): Promise<void> {
    return this.replace(
      manager,
      'template_draft_asset_refs',
      'template_id',
      id,
      [...new Set([...designAssetIds(document), ...weddingAssetIds(sample)])],
      { kind: 'template', actor },
    );
  }
  replaceRevision(
    manager: EntityManager,
    id: string,
    ids: readonly string[],
    actor: AuthenticatedPrincipal,
  ): Promise<void> {
    return this.replace(
      manager,
      'template_revision_asset_refs',
      'revision_id',
      id,
      ids,
      { kind: 'template', actor },
    );
  }
  replaceInvitation(
    manager: EntityManager,
    id: string,
    slot: 'DRAFT' | 'PUBLISHED',
    data: WeddingData,
    actor: AuthenticatedPrincipal,
    assisted = false,
    document?: SupportedTemplateDesign,
  ): Promise<void> {
    // Both retained data snapshots protect ALL their photo IDs, even when not
    // displayed. Public delivery must separately check the visible scene set.
    return this.replace(
      manager,
      'invitation_asset_refs',
      'invitation_id',
      id,
      [
        ...new Set([
          ...weddingAssetIds(data),
          ...(document ? designAssetIds(document) : []),
        ]),
      ],
      {
        kind: 'invitation',
        actor,
        invitationId: id,
        assisted,
        allowTemplate: !!document,
      },
      slot,
    );
  }
  replaceJob(
    manager: EntityManager,
    id: string,
    ids: readonly string[],
    scope: ReferenceScope,
  ): Promise<void> {
    return this.replace(
      manager,
      'publication_job_asset_refs',
      'job_id',
      id,
      ids,
      scope,
    );
  }
  async assertUnreferenced(manager: EntityManager, id: string): Promise<void> {
    const result: { used: boolean }[] = await manager.query(
      `SELECT EXISTS(SELECT 1 FROM template_draft_asset_refs WHERE asset_id=$1)
      OR EXISTS(SELECT 1 FROM template_revision_asset_refs WHERE asset_id=$1)
      OR EXISTS(SELECT 1 FROM invitation_asset_refs WHERE asset_id=$1)
      OR EXISTS(SELECT 1 FROM publication_job_asset_refs WHERE asset_id=$1)
      OR EXISTS(SELECT 1 FROM editor_preset_asset_refs WHERE asset_id=$1)
      OR EXISTS(SELECT 1 FROM invitation_templates WHERE cover_asset_id=$1)
      OR EXISTS(SELECT 1 FROM template_design_revisions WHERE thumbnail_asset_id=$1) AS used`,
      [id],
    );
    if (result[0].used) throw new BuilderProblemException(409, 'ASSET_IN_USE');
  }
  async authorizedRead(
    id: string,
    actor: AuthenticatedPrincipal,
  ): Promise<Asset> {
    const rows: Asset[] = await this.db.query(
      'SELECT * FROM assets WHERE id=$1 AND status=$2',
      [id, 'READY'],
    );
    const asset = rows[0];
    if (
      asset?.scope === 'CUSTOMER' &&
      asset.assistance_invitation_id &&
      actor.role === 'ADMIN'
    ) {
      const [customer]: { status: string }[] = await this.db.query(
        'SELECT status FROM users WHERE id=$1',
        [asset.owner_user_id],
      );
      if (customer?.status === 'ACTIVE') return asset;
    }
    if (
      !asset ||
      !(
        (actor.role === 'ADMIN' && asset.scope === 'TEMPLATE') ||
        (actor.role === 'CUSTOMER' &&
          asset.scope === 'CUSTOMER' &&
          asset.owner_user_id === actor.userId)
      )
    )
      throw new NotFoundException();
    return asset;
  }
  async bytes(asset: Asset, context: StorageContext): Promise<Buffer> {
    const stored = await this.store.get(
      asset.object_key,
      asset.byte_size,
      context,
    );
    if (
      stored.bytes.length !== asset.byte_size ||
      createHash('sha256').update(stored.bytes).digest('hex') !== asset.sha256
    )
      throw new StorageUnavailableError();
    return stored.bytes;
  }
  async beginDelete(
    manager: EntityManager,
    id: string,
    actor: AuthenticatedPrincipal,
  ): Promise<Asset> {
    if (actor.role === 'ADMIN') {
      const [candidate]: { assistance_invitation_id: string | null }[] =
        await manager.query(
          'SELECT assistance_invitation_id FROM assets WHERE id=$1',
          [id],
        );
      if (candidate?.assistance_invitation_id)
        await requireAssistedInvitation(
          manager,
          candidate.assistance_invitation_id,
          actor,
          true,
        );
    }
    const rows: Asset[] = await manager.query(
      'SELECT * FROM assets WHERE id=$1 FOR UPDATE',
      [id],
    );
    const asset = rows[0];
    if (
      !asset ||
      !(
        (actor.role === 'ADMIN' &&
          asset.scope === 'TEMPLATE' &&
          asset.uploaded_by === actor.userId) ||
        (actor.role === 'ADMIN' &&
          asset.scope === 'CUSTOMER' &&
          !!asset.assistance_invitation_id &&
          asset.uploaded_by === actor.userId) ||
        (actor.role === 'CUSTOMER' &&
          asset.scope === 'CUSTOMER' &&
          asset.owner_user_id === actor.userId)
      )
    )
      throw new NotFoundException();
    if (asset.status === 'READY') {
      await manager.query("UPDATE assets SET status='DELETING' WHERE id=$1", [
        id,
      ]);
      await detachImage(manager, id);
      await this.assertUnreferenced(manager, id);
      return { ...asset, status: 'DELETING' };
    }
    return asset;
  }
  async finishDelete(asset: Asset, context: StorageContext): Promise<void> {
    if (asset.status === 'DELETED') return;
    if (asset.status !== 'DELETING')
      throw new BuilderProblemException(409, 'ASSET_IN_USE');
    await this.store.delete(asset.object_key, context);
    await this.db.query(
      "UPDATE assets SET status='DELETED',deleted_at=clock_timestamp() WHERE id=$1 AND status='DELETING'",
      [asset.id],
    );
  }
  async delete(
    id: string,
    actor: AuthenticatedPrincipal,
    context: StorageContext,
  ): Promise<void> {
    let asset: Asset | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        asset = await this.db.transaction((manager) =>
          this.beginDelete(manager, id, actor),
        );
        break;
      } catch (error) {
        const code = (error as { driverError?: { code?: string } }).driverError
          ?.code;
        if (attempt === 2 || !['40P01', '40001'].includes(code ?? ''))
          throw error;
      }
    }
    if (!asset) throw new Error('Asset deletion did not complete');
    await this.finishDelete(asset, context);
  }
}
