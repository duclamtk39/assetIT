import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { Public } from '../../auth/public.decorator'
import {
  AgentInventoryDto,
  CreateAssetFromDiscoveryDto,
  CreateEnrollmentTokenDto,
  IgnoreDiscoveryDto,
  LinkDiscoveryDto,
  ListDiscoveryQuery,
} from './discovery.dto'
import { DiscoveryService } from './discovery.service'

type AuthRequest = Request & { authUser: { id: string; role: string } }

@ApiTags('Endpoint agents')
@Controller('agents')
export class AgentIngestionController {
  constructor(private readonly discovery: DiscoveryService) {}
  @Public() @Post('enroll') enroll(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AgentInventoryDto,
  ) {
    return this.discovery.enroll(authorization, body)
  }
  @Public() @Post('inventory') inventory(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AgentInventoryDto,
  ) {
    return this.discovery.ingest(authorization, body)
  }
}

@ApiTags('Discovery inbox')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}
  @Get('summary') summary(@Req() req: AuthRequest) {
    return this.discovery.summary(req.authUser)
  }
  @Get('inbox') list(@Query() query: ListDiscoveryQuery, @Req() req: AuthRequest) {
    return this.discovery.list(query, req.authUser)
  }
  @Get('inbox/:id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.discovery.get(id, req.authUser)
  }
  @Post('inbox/:id/link') link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LinkDiscoveryDto,
    @Req() req: AuthRequest,
  ) {
    return this.discovery.link(id, body, req.authUser)
  }
  @Post('inbox/:id/create-asset') createAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateAssetFromDiscoveryDto,
    @Req() req: AuthRequest,
  ) {
    return this.discovery.createAsset(id, body, req.authUser)
  }
  @Post('inbox/:id/ignore') ignore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IgnoreDiscoveryDto,
    @Req() req: AuthRequest,
  ) {
    return this.discovery.ignore(id, body, req.authUser)
  }
  @Post('inbox/:id/reopen') reopen(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.discovery.reopen(id, req.authUser)
  }
  @Get('agent-downloads') downloads(@Req() req: AuthRequest) {
    this.discovery.assertOperator(req.authUser)
    return this.discovery.downloads()
  }
  @Get('agent-files/:filename') agentFile(
    @Param('filename') filename: string,
    @Req() req: AuthRequest,
    @Res() response: Response,
  ) {
    return response.download(this.discovery.agentFile(filename, req.authUser), filename)
  }
  @Get('enrollment-tokens') tokens(@Req() req: AuthRequest) {
    return this.discovery.listEnrollmentTokens(req.authUser)
  }
  @Post('enrollment-tokens') createToken(@Body() body: CreateEnrollmentTokenDto, @Req() req: AuthRequest) {
    return this.discovery.createEnrollmentToken(body, req.authUser)
  }
  @Delete('enrollment-tokens/:id') revokeToken(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.discovery.revokeEnrollmentToken(id, req.authUser)
  }
  @Delete('agents/:id') revokeAgent(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.discovery.revokeAgent(id, req.authUser)
  }
}
