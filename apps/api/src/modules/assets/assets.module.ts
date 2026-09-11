import { Module } from '@nestjs/common'
import { AssetImageStorage } from './asset-image.storage'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'

@Module({ controllers: [AssetsController], providers: [AssetsService, AssetImageStorage] })
export class AssetsModule {}
