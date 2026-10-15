import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationBuilderConfigModule } from '../../config/invitation-builder-config.module';
import { rsvpEntities } from './domain/entities';
import { RsvpService } from './application/rsvp.service';
import { RsvpControlService } from './application/rsvp-control.service';
import { RsvpRetentionWorker } from './infrastructure/rsvp-retention.worker';
import {
  OwnerRsvpController,
  AdminRsvpController,
  PublicRsvpController,
} from './http/rsvp.controller';
@Module({
  imports: [
    InvitationBuilderConfigModule,
    TypeOrmModule.forFeature(rsvpEntities),
  ],
  controllers: [OwnerRsvpController, PublicRsvpController, AdminRsvpController],
  providers: [RsvpService, RsvpControlService, RsvpRetentionWorker],
  exports: [RsvpService, RsvpControlService],
})
export class InvitationRsvpModule {}
