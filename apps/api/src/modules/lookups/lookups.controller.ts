import { Controller, Get, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { PrismaService } from '../../database/prisma.service'
type AuthRequest = Request & { authUser: { role: string; departmentId: string | null } }
@ApiTags('Reference Data')
@Controller()
export class LookupsController {
  constructor(private readonly db: PrismaService) {}
  @Get('categories') categories() {
    return this.db.assetCategory.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } })
  }
  @Get('manufacturers') manufacturers() {
    return this.db.manufacturer.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } })
  }
  @Get('models') models() {
    return this.db.assetModel.findMany({
      where: { status: 'ACTIVE' },
      include: { category: true, manufacturer: true },
      orderBy: { name: 'asc' },
    })
  }
  @Get('departments') departments() {
    return this.db.department.findMany({
      where: { status: 'ACTIVE' },
      include: { manager: { select: { id: true, employeeCode: true, fullName: true } } },
      orderBy: { name: 'asc' },
    })
  }
  @Get('locations') locations() {
    return this.db.location.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } })
  }
  @Get('warehouses') warehouses() {
    return this.db.warehouse.findMany({
      where: { status: 'ACTIVE' },
      include: { location: true },
      orderBy: { name: 'asc' },
    })
  }
  @Get('users') users(@Req() req: AuthRequest) {
    return this.db.user.findMany({
      where: {
        status: 'ACTIVE',
        ...(req.authUser.role === 'HCNS'
          ? { departmentId: req.authUser.departmentId || '__no_department_scope__' }
          : {}),
      },
      select: { id: true, employeeCode: true, username: true, fullName: true, email: true, department: true },
    })
  }
  @Get('asset-statuses') statuses() {
    return this.db.assetStatus.findMany({ orderBy: { sortOrder: 'asc' } })
  }
}
