import { Module } from '@nestjs/common'
import { AssetImportsController } from './asset-imports.controller'
import { AssetImportsService } from './asset-imports.service'

@Module({ controllers: [AssetImportsController], providers: [AssetImportsService] })
export class AssetImportsModule {}
