import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  AssignAssetDto,
  CompleteMaintenanceDto,
  OpenMaintenanceDto,
  ReturnAssetDto,
  TransferAssetDto,
} from './lifecycle.dto'
import { LifecycleService } from './lifecycle.service'

type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }
@ApiTags('Asset lifecycle')
@Controller()
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}
  @Get('asset-history') allHistory(@Req() req: AuthRequest) {
    return this.lifecycle.allHistory(req.authUser)
  }
  @Get('assets/:id/lifecycle') history(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.lifecycle.history(id, req.authUser)
  }
  @Post('assets/:id/assignments') assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignAssetDto,
    @Req() req: AuthRequest,
  ) {
    return this.lifecycle.assign(id, body, req.authUser)
  }
  @Post('assets/:id/returns') returnAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReturnAssetDto,
    @Req() req: AuthRequest,
  ) {
    return this.lifecycle.returnAsset(id, body, req.authUser)
  }
  @Post('assets/:id/transfers') transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TransferAssetDto,
    @Req() req: AuthRequest,
  ) {
    return this.lifecycle.transfer(id, body, req.authUser)
  }
  @Post('assets/:id/maintenance') openMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpenMaintenanceDto,
    @Req() req: AuthRequest,
  ) {
    return this.lifecycle.openMaintenance(id, body, req.authUser)
  }
  @Post('maintenance/:id/complete') completeMaintenance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CompleteMaintenanceDto,
    @Req() req: AuthRequest,
  ) {
    return this.lifecycle.completeMaintenance(id, body, req.authUser)
  }
}
