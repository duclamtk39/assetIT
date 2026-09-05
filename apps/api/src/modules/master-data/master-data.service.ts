import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { MasterDataDto } from './master-data.dto'

@Injectable()
export class MasterDataService {
  constructor(private readonly db: PrismaService) {}
  private admin(actor: { role: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được quản lý danh mục hệ thống')
  }
  private fail(error: any): never {
    if (error?.code === 'P2002') throw new ConflictException('Mã danh mục đã tồn tại')
    throw error
  }
  async createDepartment(body: MasterDataDto, actor: { id: string; role: string }) {
    this.admin(actor)
    if (body.managerPersonId)
      throw new BadRequestException('Hãy tạo phòng ban và nhân sự trước khi chỉ định người phụ trách')
    try {
      return await this.db.department.create({
        data: {
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          isIncidentResponseTeam: body.isIncidentResponseTeam || false,
        },
      })
    } catch (error) {
      this.fail(error)
    }
  }
  async updateDepartment(id: string, body: MasterDataDto, actor: { role: string }) {
    this.admin(actor)
    if (!(await this.db.department.findUnique({ where: { id } }))) throw new NotFoundException()
    if (
      body.managerPersonId &&
      !(await this.db.person.findFirst({ where: { id: body.managerPersonId, departmentId: id, status: 'ACTIVE' } }))
    )
      throw new BadRequestException('Người phụ trách phải là nhân sự đang hoạt động thuộc chính phòng ban này')
    try {
      return await this.db.department.update({
        where: { id },
        data: {
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          managerPersonId: body.managerPersonId,
          isIncidentResponseTeam: body.isIncidentResponseTeam,
        },
        include: { manager: { select: { id: true, employeeCode: true, fullName: true } } },
      })
    } catch (error) {
      this.fail(error)
    }
  }
  async removeDepartment(id: string, actor: { role: string }) {
    this.admin(actor)
    if (
      (await this.db.asset.count({ where: { departmentId: id, deletedAt: null } })) ||
      (await this.db.person.count({ where: { departmentId: id, status: 'ACTIVE' } }))
    )
      throw new BadRequestException('Không thể ngừng phòng ban đang có người dùng hoặc tài sản')
    await this.db.department.update({ where: { id }, data: { status: 'INACTIVE' } })
    return { success: true }
  }
  async createLocation(body: MasterDataDto, actor: { id: string; role: string }) {
    this.admin(actor)
    try {
      return await this.db.$transaction(async tx => {
        const location = await tx.location.create({
          data: {
            code: body.code.trim().toUpperCase(),
            name: body.name.trim(),
            address: body.address?.trim(),
            type: 'SITE',
          },
        })
        await tx.warehouse.create({
          data: {
            code: `KHO-${body.code.trim().toUpperCase()}`.slice(0, 50),
            name: `Kho ${body.name.trim()}`,
            locationId: location.id,
            description: 'Kho mặc định của site',
          },
        })
        return location
      })
    } catch (error) {
      this.fail(error)
    }
  }
  async updateLocation(id: string, body: MasterDataDto, actor: { role: string }) {
    this.admin(actor)
    if (!(await this.db.location.findUnique({ where: { id } }))) throw new NotFoundException()
    try {
      return await this.db.location.update({
        where: { id },
        data: { code: body.code.trim().toUpperCase(), name: body.name.trim(), address: body.address?.trim() },
      })
    } catch (error) {
      this.fail(error)
    }
  }
  async removeLocation(id: string, actor: { role: string }) {
    this.admin(actor)
    if (
      (await this.db.asset.count({ where: { locationId: id, deletedAt: null } })) ||
      (await this.db.warehouse.count({ where: { locationId: id, assets: { some: { deletedAt: null } } } }))
    )
      throw new BadRequestException('Không thể ngừng site đang có kho chứa tài sản')
    await this.db.$transaction([
      this.db.warehouse.updateMany({ where: { locationId: id }, data: { status: 'INACTIVE' } }),
      this.db.location.update({ where: { id }, data: { status: 'INACTIVE' } }),
    ])
    return { success: true }
  }
}
