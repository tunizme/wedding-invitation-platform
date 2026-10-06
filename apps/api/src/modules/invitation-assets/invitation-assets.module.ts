import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationBuilderConfigModule } from '../../config/invitation-builder-config.module';
import { invitationAssetEntities } from './domain/entities';
import { DataSource } from 'typeorm';
import {
  INVITATION_BUILDER_CONFIG,
  type InvitationBuilderEnvironment,
} from '../../config/invitation-builder.environment';
import { ASSET_STORE, type AssetStore } from './domain/asset-store.port';
import { S3AssetStore } from './infrastructure/s3-asset-store';
import { AssetWriteService } from './application/asset-write.service';
import { AssetReferenceService } from './application/asset-reference.service';
import { AssetsReadController } from './http/assets-read.controller';
import { AssetsController } from './http/assets.controller';
import { UploadService } from './application/upload.service';
import { AssetCleanupWorker } from './infrastructure/asset-cleanup.worker';
import { PublicAssetsController } from './http/public-assets.controller';

@Module({
  imports: [
    InvitationBuilderConfigModule,
    TypeOrmModule.forFeature(invitationAssetEntities),
  ],
  controllers: [AssetsReadController, AssetsController, PublicAssetsController],
  providers: [
    UploadService,
    AssetCleanupWorker,
    {
      provide: AssetReferenceService,
      inject: [DataSource, ASSET_STORE],
      useFactory: (db: DataSource, store: AssetStore) =>
        new AssetReferenceService(db, store),
    },
    {
      provide: ASSET_STORE,
      inject: [INVITATION_BUILDER_CONFIG],
      useFactory: (config: InvitationBuilderEnvironment) =>
        new S3AssetStore(config),
    },
    {
      provide: AssetWriteService,
      inject: [DataSource, ASSET_STORE],
      useFactory: (db: DataSource, store: AssetStore) =>
        new AssetWriteService(db, store),
    },
  ],
  exports: [
    TypeOrmModule,
    ASSET_STORE,
    AssetWriteService,
    AssetReferenceService,
  ],
})
export class InvitationAssetsModule {}
