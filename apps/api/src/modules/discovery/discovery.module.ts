import { Module } from '@nestjs/common'
import { AgentIngestionController, DiscoveryController } from './discovery.controller'
import { DiscoveryService } from './discovery.service'

@Module({ controllers: [AgentIngestionController, DiscoveryController], providers: [DiscoveryService] })
export class DiscoveryModule {}
