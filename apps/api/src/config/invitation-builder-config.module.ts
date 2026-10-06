import { Module } from '@nestjs/common';
import {
  INVITATION_BUILDER_CONFIG,
  validateInvitationBuilderEnvironment,
} from './invitation-builder.environment';

@Module({
  providers: [
    {
      provide: INVITATION_BUILDER_CONFIG,
      useFactory: () => validateInvitationBuilderEnvironment(process.env),
    },
  ],
  exports: [INVITATION_BUILDER_CONFIG],
})
export class InvitationBuilderConfigModule {}
