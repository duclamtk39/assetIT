import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  AcknowledgeNetworkAlertDto,
  DeviceHistoryQuery,
  LinkDeviceDto,
  ListDevicesQuery,
  SubnetDto,
  UpdateDeviceDto,
  UpdateSubnetDto,
} from './netmon.dto'
import { NetmonService } from './netmon.service'

type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }

@ApiTags('Network monitoring')
@Controller('netmon')
export class NetmonController {
  constructor(private readonly netmon: NetmonService) {}

  @Get('overview') overview(@Req() req: AuthRequest) {
    return this.netmon.overview(req.authUser)
  }

  @Get('subnets') listSubnets(@Req() req: AuthRequest) {
    return this.netmon.listSubnets(req.authUser)
  }
  @Post('subnets') createSubnet(@Body() body: SubnetDto, @Req() req: AuthRequest) {
    return this.netmon.createSubnet(body, req.authUser)
  }
  @Put('subnets/:id') updateSubnet(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSubnetDto,
    @Req() req: AuthRequest,
  ) {
    return this.netmon.updateSubnet(id, body, req.authUser)
  }
  @Delete('subnets/:id') removeSubnet(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.netmon.removeSubnet(id, req.authUser)
  }
  @Post('subnets/:id/scan') scan(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.netmon.scanSubnet(id, req.authUser)
  }
  @Get('subnets/:id/scans') scans(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.netmon.listScans(id, req.authUser)
  }

  @Get('devices') listDevices(@Query() query: ListDevicesQuery, @Req() req: AuthRequest) {
    return this.netmon.listDevices(query, req.authUser)
  }
  @Get('devices/:id') getDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeviceHistoryQuery,
    @Req() req: AuthRequest,
  ) {
    return this.netmon.getDevice(id, query, req.authUser)
  }
  @Get('devices/:id/suggestions') suggestions(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.netmon.suggestAssets(id, req.authUser)
  }
  @Patch('devices/:id') updateDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDeviceDto,
    @Req() req: AuthRequest,
  ) {
    return this.netmon.updateDevice(id, body, req.authUser)
  }
  @Post('devices/:id/link') link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LinkDeviceDto,
    @Req() req: AuthRequest,
  ) {
    return this.netmon.linkDevice(id, body, req.authUser)
  }
  @Post('devices/:id/unlink') unlink(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.netmon.unlinkDevice(id, req.authUser)
  }
  @Delete('devices/:id') removeDevice(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.netmon.removeDevice(id, req.authUser)
  }

  @Get('alerts') alerts(@Req() req: AuthRequest) {
    return this.netmon.listAlerts(req.authUser)
  }
  @Post('alerts/:id/acknowledge') acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AcknowledgeNetworkAlertDto,
    @Req() req: AuthRequest,
  ) {
    return this.netmon.acknowledgeAlert(id, body, req.authUser)
  }
}
