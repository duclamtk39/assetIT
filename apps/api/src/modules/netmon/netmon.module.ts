import { Module } from '@nestjs/common'
import { NetmonController } from './netmon.controller'
import { NetmonPoller } from './netmon.poller'
import { NetmonService } from './netmon.service'

@Module({ controllers: [NetmonController], providers: [NetmonService, NetmonPoller] })
export class NetmonModule {}
