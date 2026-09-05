import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { DirectoryService } from './directory.service'
import { SaveDirectoryConfigurationDto } from './directory.dto'

type AuthRequest = Request & { authUser: { id: string; username: string; role: string } }
@ApiTags('Directory sync')
@Controller('directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}
  @Get('configs') list(@Req() request: AuthRequest) {
    this.directory.assertAdmin(request.authUser)
    return this.directory.list()
  }
  @Put('configs/:provider') save(
    @Param('provider') provider: string,
    @Body() body: SaveDirectoryConfigurationDto,
    @Req() request: AuthRequest,
  ) {
    this.directory.assertAdmin(request.authUser)
    return this.directory.save(provider, body, request.authUser.id)
  }
  @Post('configs/:provider/test') test(@Param('provider') provider: string, @Req() request: AuthRequest) {
    this.directory.assertAdmin(request.authUser)
    return this.directory.test(provider)
  }
  @Post('configs/m365/test-licenses') testLicenses(@Req() request: AuthRequest) {
    this.directory.assertAdmin(request.authUser)
    return this.directory.testMicrosoftLicenses()
  }
  @Post('configs/m365/sync-licenses') syncLicenses(@Req() request: AuthRequest) {
    this.directory.assertAdmin(request.authUser)
    return this.directory.syncMicrosoftLicenses(request.authUser)
  }
  @Post('configs/:provider/sync') sync(@Param('provider') provider: string, @Req() request: AuthRequest) {
    this.directory.assertAdmin(request.authUser)
    return this.directory.sync(provider, request.authUser.username)
  }
  @Get('runs') runs(@Query('limit') limit: string, @Req() request: AuthRequest) {
    this.directory.assertAdmin(request.authUser)
    return this.directory.runs(Number(limit) || 20)
  }
}
