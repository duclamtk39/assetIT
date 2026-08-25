import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { CreateRiskAssessmentDto, CreateRiskControlDto, CreateRiskItemDto, CreateRiskTreatmentDto, ListRiskAssessmentsQuery, ListRisksQuery, ReviewRiskDto, UpdateRiskItemDto, UpdateRiskTreatmentDto } from './risks.dto'
import { RisksService } from './risks.service'

type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }

@ApiTags('IT Risk Assessment')
@Controller('risk-assessments')
export class RisksController {
  constructor(private readonly risks: RisksService) {}

  @Get('summary') summary(@Req() req: AuthRequest) { return this.risks.summary(req.authUser) }
  @Get('operators') operators(@Req() req: AuthRequest) { return this.risks.operators(req.authUser) }
  @Get('risks') listRisks(@Query() query: ListRisksQuery, @Req() req: AuthRequest) { return this.risks.listRisks(query, req.authUser) }
  @Get('risks/:id') getRisk(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.risks.getRisk(id, req.authUser) }
  @Patch('risks/:id') updateRisk(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateRiskItemDto, @Req() req: AuthRequest) { return this.risks.updateRisk(id, body, req.authUser) }
  @Post('risks/:id/controls') addControl(@Param('id', ParseUUIDPipe) id: string, @Body() body: CreateRiskControlDto, @Req() req: AuthRequest) { return this.risks.addControl(id, body, req.authUser) }
  @Post('risks/:id/treatments') addTreatment(@Param('id', ParseUUIDPipe) id: string, @Body() body: CreateRiskTreatmentDto, @Req() req: AuthRequest) { return this.risks.addTreatment(id, body, req.authUser) }
  @Patch('treatments/:id') updateTreatment(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateRiskTreatmentDto, @Req() req: AuthRequest) { return this.risks.updateTreatment(id, body, req.authUser) }
  @Post('risks/:id/reviews') reviewRisk(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReviewRiskDto, @Req() req: AuthRequest) { return this.risks.reviewRisk(id, body, req.authUser) }

  @Get() list(@Query() query: ListRiskAssessmentsQuery, @Req() req: AuthRequest) { return this.risks.list(query, req.authUser) }
  @Post() create(@Body() body: CreateRiskAssessmentDto, @Req() req: AuthRequest) { return this.risks.createAssessment(body, req.authUser) }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) { return this.risks.getAssessment(id, req.authUser) }
  @Post(':id/risks') createRisk(@Param('id', ParseUUIDPipe) id: string, @Body() body: CreateRiskItemDto, @Req() req: AuthRequest) { return this.risks.createRisk(id, body, req.authUser) }
  @Post(':id/reviews') review(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReviewRiskDto, @Req() req: AuthRequest) { return this.risks.reviewAssessment(id, body, req.authUser) }
}
