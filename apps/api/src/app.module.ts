import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    IdentityAccessModule,
  ],
})
export class AppModule {}
