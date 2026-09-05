import { Module } from '@nestjs/common'
import { MasterDataController } from './master-data.controller'
import { MasterDataService } from './master-data.service'
@Module({ controllers: [MasterDataController], providers: [MasterDataService] })
export class MasterDataModule {}
