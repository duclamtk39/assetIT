import { Module } from '@nestjs/common'
import { IncidentsController } from './incidents.controller'
import { IncidentsService } from './incidents.service'
@Module({ controllers: [IncidentsController], providers: [IncidentsService] })
export class IncidentsModule {}
