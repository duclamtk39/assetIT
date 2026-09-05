import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { CreateInventoryDto, ScanInventoryDto } from './inventory.dto'
import { InventoryService } from './inventory.service'

type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }

@ApiTags('Inventory')
@Controller('inventories')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.inventory.list(req.authUser)
  }
  @Post() create(@Body() body: CreateInventoryDto, @Req() req: AuthRequest) {
    return this.inventory.create(body, req.authUser)
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.inventory.get(id, req.authUser)
  }
  @Post(':id/scan') scan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScanInventoryDto,
    @Req() req: AuthRequest,
  ) {
    return this.inventory.scan(id, body, req.authUser)
  }
  @Post(':id/close') close(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.inventory.close(id, req.authUser)
  }
  @Post(':id/cancel') cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.inventory.cancel(id, req.authUser)
  }
}
