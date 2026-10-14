import {
  Module,
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InvitationBuilderConfigModule } from '../../config/invitation-builder-config.module';
import { InteractionsService } from './interactions.service';
import {
  PublicInteractionsController,
  OwnerInteractionsController,
  AdminInteractionsController,
} from './interactions.controller';
@Injectable()
class InteractionRetention implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    @Inject(InteractionsService) private readonly service: InteractionsService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(
      () => void this.service.cleanup().catch(() => {}),
      3600000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
@Module({
  imports: [InvitationBuilderConfigModule],
  providers: [InteractionsService, InteractionRetention],
  controllers: [
    PublicInteractionsController,
    OwnerInteractionsController,
    AdminInteractionsController,
  ],
  exports: [InteractionsService],
})
export class InvitationInteractionsModule {}
