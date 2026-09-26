import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './infrastructure/database/database.module';

@Module({ imports: [AppConfigModule, DatabaseModule, HealthModule] })
export class AppModule {}
