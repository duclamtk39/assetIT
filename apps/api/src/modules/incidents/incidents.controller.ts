import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import {
  AddIncidentActivityDto,
  ChangeIncidentStatusDto,
  CreateIncidentDto,
  IncidentSummaryQuery,
  ListIncidentsQuery,
  UpdateIncidentDto,
} from './incidents.dto'
import { IncidentsService } from './incidents.service'
type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }
@ApiTags('Incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}
  @Get() list(@Query() query: ListIncidentsQuery, @Req() req: AuthRequest) {
    return this.incidents.list(query, req.authUser)
  }
  @Get('summary') summary(@Query() query: IncidentSummaryQuery, @Req() req: AuthRequest) {
    return this.incidents.summary(query, req.authUser)
  }
  @Get('operators') operators(@Req() req: AuthRequest) {
    return this.incidents.operators(req.authUser)
  }
  @Post() create(@Body() body: CreateIncidentDto, @Req() req: AuthRequest) {
    return this.incidents.create(body, req.authUser)
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.incidents.get(id, req.authUser)
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateIncidentDto,
    @Req() req: AuthRequest,
  ) {
    return this.incidents.update(id, body, req.authUser)
  }
  @Post(':id/status') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeIncidentStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.incidents.changeStatus(id, body, req.authUser)
  }
  @Post(':id/activities') activity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddIncidentActivityDto,
    @Req() req: AuthRequest,
  ) {
    return this.incidents.addActivity(id, body, req.authUser)
  }
}
