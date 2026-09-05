import { Module } from '@nestjs/common'
import { LookupsController } from './lookups.controller'
@Module({ controllers: [LookupsController] })
export class LookupsModule {}
