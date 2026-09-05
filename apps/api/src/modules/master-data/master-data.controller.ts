import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { MasterDataDto } from './master-data.dto'
import { MasterDataService } from './master-data.service'
type AuthRequest = Request & { authUser: { id: string; role: string } }
@ApiTags('Master data')
@Controller('admin')
export class MasterDataController {
  constructor(private readonly service: MasterDataService) {}
  @Post('departments') createDepartment(@Body() body: MasterDataDto, @Req() req: AuthRequest) {
    return this.service.createDepartment(body, req.authUser)
  }
  @Patch('departments/:id') updateDepartment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MasterDataDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateDepartment(id, body, req.authUser)
  }
  @Delete('departments/:id') removeDepartment(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.removeDepartment(id, req.authUser)
  }
  @Post('locations') createLocation(@Body() body: MasterDataDto, @Req() req: AuthRequest) {
    return this.service.createLocation(body, req.authUser)
  }
  @Patch('locations/:id') updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MasterDataDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateLocation(id, body, req.authUser)
  }
  @Delete('locations/:id') removeLocation(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.removeLocation(id, req.authUser)
  }
}
