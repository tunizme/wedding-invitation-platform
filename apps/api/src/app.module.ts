import { InvitationRsvpModule } from './modules/invitation-rsvp/invitation-rsvp.module';
import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';
import { InvitationAssetsModule } from './modules/invitation-assets/invitation-assets.module';
import { InvitationBuilderModule } from './modules/invitation-builder/invitation-builder.module';
import { InvitationsModule } from './modules/invitations/invitations.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    IdentityAccessModule,
    InvitationAssetsModule,
    InvitationBuilderModule,
    InvitationsModule,
    InvitationRsvpModule,
  ],
})
export class AppModule {}
