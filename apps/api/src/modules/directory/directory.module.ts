import { Module } from '@nestjs/common'
import { DirectoryController } from './directory.controller'
import { DirectoryCryptoService } from './directory-crypto.service'
import { DirectoryService } from './directory.service'

@Module({
  controllers: [DirectoryController],
  providers: [DirectoryCryptoService, DirectoryService],
  exports: [DirectoryCryptoService],
})
export class DirectoryModule {}
