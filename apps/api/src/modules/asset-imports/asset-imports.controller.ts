import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { AssetImportsService } from './asset-imports.service'
import { StageAssetImportDto } from './asset-imports.dto'

type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }

@ApiTags('Asset imports')
@Controller('asset-imports')
export class AssetImportsController {
  constructor(private readonly imports: AssetImportsService) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.imports.list(req.authUser)
  }
  @Post('stage') stage(@Body() body: StageAssetImportDto, @Req() req: AuthRequest) {
    return this.imports.stage(body, req.authUser)
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.imports.get(id, req.authUser)
  }
  @Post(':id/commit') commit(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.imports.commit(id, req.authUser)
  }
  @Post(':id/rollback') rollback(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.imports.rollback(id, req.authUser)
  }
}
