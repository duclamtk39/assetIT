import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { AssetsService } from './assets.service'
import { CreateAssetDto, ListAssetsQuery, ScanAssetQuery, UpdateAssetDto } from './assets.dto'

type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }
@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}
  @Get('scan') scan(@Query() query: ScanAssetQuery, @Req() req: AuthRequest) {
    return this.assets.scan(query.value, req.authUser)
  }
  @Get('summary') summary(@Req() req: AuthRequest) {
    return this.assets.summary(req.authUser)
  }
  @Get() list(@Query() query: ListAssetsQuery, @Req() req: AuthRequest) {
    return this.assets.list(query, req.authUser)
  }
  @Get(':id/history') history(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.assets.history(id, req.authUser)
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.assets.get(id, req.authUser)
  }
  @Post() create(@Body() body: CreateAssetDto, @Req() req: AuthRequest) {
    return this.assets.create(body, req.authUser)
  }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAssetDto, @Req() req: AuthRequest) {
    return this.assets.update(id, body, req.authUser)
  }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.assets.remove(id, req.authUser)
  }
}
