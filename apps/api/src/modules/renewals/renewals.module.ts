import { Module } from '@nestjs/common'
import { RenewalsController } from './renewals.controller'
import { RenewalsService } from './renewals.service'
import { DirectoryModule } from '../directory/directory.module'
import { RenewalNotificationService } from './renewal-notification.service'
@Module({
  imports: [DirectoryModule],
  controllers: [RenewalsController],
  providers: [RenewalsService, RenewalNotificationService],
})
export class RenewalsModule {}
