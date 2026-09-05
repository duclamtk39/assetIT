import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { DigitalEntitlementType } from '@prisma/client'
import type { Request } from 'express'
import {
  AcknowledgeAlertDto,
  AlertPolicyDto,
  AssignEntitlementDto,
  CreateEntitlementDto,
  ListEntitlementsQuery,
  RenewEntitlementDto,
  RevokeAssignmentDto,
  RenewalEmailConfigurationDto,
  TestRenewalEmailDto,
  UpdateEntitlementContractDto,
} from './renewals.dto'
import { RenewalsService } from './renewals.service'
import { RenewalNotificationService } from './renewal-notification.service'
type AuthRequest = Request & { authUser: { id: string; role: string } }
@ApiTags('Licenses and Renewals')
@Controller('renewals')
export class RenewalsController {
  constructor(
    private readonly service: RenewalsService,
    private readonly notifications: RenewalNotificationService,
  ) {}
  @Get() list(@Query() query: ListEntitlementsQuery, @Req() req: AuthRequest) {
    return this.service.list(query, req.authUser)
  }
  @Get('summary') summary(@Req() req: AuthRequest) {
    return this.service.summary(req.authUser)
  }
  @Get('alerts') alerts(@Req() req: AuthRequest) {
    return this.service.alerts(req.authUser)
  }
  @Get('policies') policies(@Req() req: AuthRequest) {
    return this.service.policies(req.authUser)
  }
  @Put('policies/:type') policy(
    @Param('type', new ParseEnumPipe(DigitalEntitlementType)) type: DigitalEntitlementType,
    @Body() body: AlertPolicyDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.savePolicy(type, body, req.authUser)
  }
  @Post('alerts/:id/acknowledge') acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AcknowledgeAlertDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.acknowledge(id, body, req.authUser)
  }
  @Get('notifications/email') emailConfig(@Req() req: AuthRequest) {
    return this.notifications.get(req.authUser)
  }
  @Put('notifications/email') saveEmailConfig(@Body() body: RenewalEmailConfigurationDto, @Req() req: AuthRequest) {
    return this.notifications.save(body, req.authUser)
  }
  @Post('notifications/email/test') testEmail(@Body() body: TestRenewalEmailDto, @Req() req: AuthRequest) {
    return this.notifications.test(body.recipient, req.authUser)
  }
  @Get('notifications/status') notificationStatus(@Req() req: AuthRequest) {
    return this.notifications.status(req.authUser)
  }
  @Post() create(@Body() body: CreateEntitlementDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.authUser)
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.get(id, req.authUser)
  }
  @Patch(':id/contract') updateContract(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEntitlementContractDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateContract(id, body, req.authUser)
  }
  @Post(':id/assignments') assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignEntitlementDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.assign(id, body, req.authUser)
  }
  @Post('assignments/:id/revoke') revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RevokeAssignmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.revoke(id, body, req.authUser)
  }
  @Post(':id/renew') renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenewEntitlementDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.renew(id, body, req.authUser)
  }
}
