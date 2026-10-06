import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationBuilderConfigModule } from '../../config/invitation-builder-config.module';
import { InvitationAssetsModule } from '../invitation-assets/invitation-assets.module';
import { invitationBuilderEntities } from './domain/entities';
import { publicationEntities } from './publication/entities';
import { DataSource } from 'typeorm';
import { AssetReferenceService } from '../invitation-assets/application/asset-reference.service';
import { TemplateDraftService } from './application/template-draft.service';
import { PublicationService } from './publication/publication.service';
import { PUBLICATION_WORKER, PublicationWorker } from './publication/publication.worker';
import { ChromiumRenderer } from './publication/chromium-renderer';
import { TemplatePublicationService } from './publication/template-publication.service';
import { INVITATION_BUILDER_CONFIG, type InvitationBuilderEnvironment } from '../../config/invitation-builder.environment';
import { ASSET_STORE, type AssetStore } from '../invitation-assets/domain/asset-store.port';
import { AssetWriteService } from '../invitation-assets/application/asset-write.service';
import { PublicationCleanupWorker } from './publication/publication-cleanup.worker';
import { TemplatePublicationController, PublicationOperationsController } from './publication/publication.controller';
import {
  TemplateDraftController,
  TemplateCoverController,
} from './http/template-draft.controller';
import { TemplateCatalogController } from './http/template-catalog.controller';
import { InvitationPublicationService } from '../invitations/application/invitation-publication.service';

@Module({
  imports: [
    InvitationBuilderConfigModule,
    InvitationAssetsModule,
    TypeOrmModule.forFeature([
      ...invitationBuilderEntities,
      ...publicationEntities,
    ]),
  ],
  controllers: [TemplateDraftController, TemplateCoverController, TemplateCatalogController, TemplatePublicationController, PublicationOperationsController],
  providers: [
    {
      provide: TemplateDraftService,
      inject: [DataSource, AssetReferenceService],
      useFactory: (db: DataSource, refs: AssetReferenceService) =>
        new TemplateDraftService(db, refs),
    },
    {
      provide: PublicationService,
      inject: [DataSource],
      useFactory: (db: DataSource) => new PublicationService(db),
    },
    {
      provide: ChromiumRenderer,
      inject: [INVITATION_BUILDER_CONFIG],
      useFactory: (config: InvitationBuilderEnvironment) => new ChromiumRenderer(config),
    },
    {
      provide: TemplatePublicationService,
      inject: [DataSource, AssetReferenceService, AssetWriteService],
      useFactory: (db: DataSource, refs: AssetReferenceService, writes: AssetWriteService) => new TemplatePublicationService(db, refs, writes),
    },
    InvitationPublicationService,
    {
      provide: PUBLICATION_WORKER,
      inject: [DataSource, ASSET_STORE, AssetWriteService, ChromiumRenderer, TemplatePublicationService, InvitationPublicationService],
      useFactory: (db: DataSource, store: AssetStore, writes: AssetWriteService, renderer: ChromiumRenderer, finalizer: TemplatePublicationService, invitationFinalizer: InvitationPublicationService) =>
        new PublicationWorker(db, store, writes, renderer, finalizer, invitationFinalizer),
    },
    PublicationCleanupWorker,
  ],
  exports: [TypeOrmModule, TemplateDraftService, PublicationService, PUBLICATION_WORKER],
})
export class InvitationBuilderModule {}
