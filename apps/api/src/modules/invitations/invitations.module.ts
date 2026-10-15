import { AdminInvitationController } from './http/admin-invitation.controller';
import { InvitationGuestsService } from './application/invitation-guests.service';
import {
  InvitationGuestsController,
  AdminInvitationGuestsController,
  PublicInvitationGuestsController,
} from './http/invitation-guests.controller';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvitationAssetsModule } from '../invitation-assets/invitation-assets.module';
import { InvitationBuilderModule } from '../invitation-builder/invitation-builder.module';
import { invitationEntities } from './domain/entities';
import { InvitationService } from './application/invitation.service';
import { InvitationController } from './http/invitation.controller';
import { PublicInvitationController } from './http/public-invitation.controller';

@Module({
  imports: [
    InvitationAssetsModule,
    InvitationBuilderModule,
    TypeOrmModule.forFeature(invitationEntities),
  ],
  controllers: [
    InvitationController,
    AdminInvitationController,
    PublicInvitationController,
    InvitationGuestsController,
    AdminInvitationGuestsController,
    PublicInvitationGuestsController,
  ],
  providers: [InvitationService, InvitationGuestsService],
  exports: [TypeOrmModule, InvitationService],
})
export class InvitationsModule {}
