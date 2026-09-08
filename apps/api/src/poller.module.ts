import { Module } from '@nestjs/common'
import { DatabaseModule } from './database/database.module'
import { NetmonPoller } from './modules/netmon/netmon.poller'
import { NetmonService } from './modules/netmon/netmon.service'

/**
 * The module graph the network image boots: the database and the two netmon providers, and nothing
 * else. It deliberately does not import NetmonModule, because that carries the HTTP controller - the
 * poller serves no requests, so the controller has no business being instantiated here.
 *
 * The rest of the application (assets, compliance, renewals and their background timers) is absent
 * too. That is the point of a separate image: the network container starts a database connection and
 * a probe loop, so its behaviour and its blast radius are both what its name says.
 */
@Module({ imports: [DatabaseModule], providers: [NetmonService, NetmonPoller] })
export class PollerModule {}
