import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AuthSource, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { CreatePersonDto, ListPeopleDto, UpdatePersonDto } from './people.dto'

type Actor = { id: string; role: string; departmentId?: string | null }
@Injectable()
export class PeopleService {
  constructor(private readonly db: PrismaService) {}
  assertManager(actor: Actor) {
    if (!['ADMIN', 'IT'].includes(actor.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được quản lý danh bạ người nhận tài sản')
  }
  private select = {
    id: true,
    employeeCode: true,
    fullName: true,
    email: true,
    phone: true,
    jobTitle: true,
    departmentId: true,
    locationId: true,
    linkedUserId: true,
    source: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    department: { select: { id: true, code: true, name: true } },
    location: { select: { id: true, code: true, name: true } },
    linkedUser: { select: { id: true, username: true, role: true } },
  } satisfies Prisma.PersonSelect
  private async validateReferences(body: Partial<CreatePersonDto>) {
    if (body.departmentId) {
      const department = await this.db.department.findFirst({ where: { id: body.departmentId, status: 'ACTIVE' } })
      if (!department) throw new BadRequestException('Phòng ban không tồn tại hoặc đã ngừng hoạt động')
    }
    if (body.locationId && !(await this.db.location.findFirst({ where: { id: body.locationId, status: 'ACTIVE' } })))
      throw new BadRequestException('Vị trí không tồn tại hoặc đã ngừng hoạt động')
    if (body.linkedUserId && !(await this.db.user.findUnique({ where: { id: body.linkedUserId } })))
      throw new BadRequestException('Tài khoản liên kết không tồn tại')
  }
  private conflict(error: any): never {
    if (error?.code === 'P2002')
      throw new ConflictException('Mã nhân viên, email hoặc tài khoản liên kết đã tồn tại trong danh bạ')
    throw error
  }
  async list(query: ListPeopleDto, activeOnly = false, actor?: Actor) {
    const departmentId = actor?.role === 'HCNS' ? actor.departmentId || '__no_department_scope__' : query.departmentId
    const where: Prisma.PersonWhereInput = {
      departmentId,
      status: activeOnly ? 'ACTIVE' : query.status,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { employeeCode: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { department: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const [items, total] = await this.db.$transaction([
      this.db.person.findMany({
        where,
        select: this.select,
        orderBy: { fullName: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.person.count({ where }),
    ])
    return { items, total, page: query.page, limit: query.limit }
  }
  async create(body: CreatePersonDto, actor: Actor) {
    await this.validateReferences(body)
    try {
      const person = await this.db.person.create({
        data: { ...body, email: body.email?.toLowerCase(), source: AuthSource.LOCAL },
        select: this.select,
      })
      await this.db.auditLog.create({
        data: {
          userId: actor.id,
          action: 'PERSON_CREATED',
          entityType: 'Person',
          entityId: person.id,
          newValues: {
            employeeCode: person.employeeCode,
            fullName: person.fullName,
            email: person.email,
            departmentId: person.departmentId,
            linkedUserId: person.linkedUserId,
          },
        },
      })
      return person
    } catch (error) {
      this.conflict(error)
    }
  }
  async update(id: string, body: UpdatePersonDto, actor: Actor) {
    const current = await this.db.person.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy người nhận tài sản')
    if (current.source !== AuthSource.LOCAL)
      throw new BadRequestException('Nhân sự đồng bộ phải được sửa tại LDAP hoặc Microsoft 365')
    await this.validateReferences(body)
    if (
      body.status === 'INACTIVE' &&
      (await this.db.asset.count({ where: { currentCustodianId: id, deletedAt: null } }))
    )
      throw new BadRequestException('Phải thu hồi toàn bộ tài sản trước khi vô hiệu hóa người nhận')
    try {
      const person = await this.db.person.update({
        where: { id },
        data: { ...body, email: body.email?.toLowerCase() },
        select: this.select,
      })
      await this.db.auditLog.create({
        data: {
          userId: actor.id,
          action: 'PERSON_UPDATED',
          entityType: 'Person',
          entityId: id,
          oldValues: {
            employeeCode: current.employeeCode,
            fullName: current.fullName,
            email: current.email,
            departmentId: current.departmentId,
            status: current.status,
          },
          newValues: body as Prisma.InputJsonValue,
        },
      })
      return person
    } catch (error) {
      this.conflict(error)
    }
  }

  /**
   * Removes a profile outright. Only one with nothing pointing at it can go: an asset handover, an
   * inventory line and a licence allocation all name the person, and those foreign keys are Restrict
   * precisely because deleting the row would leave records describing a handover to nobody. When a
   * profile is referenced the reply says what holds it, so the answer is Vô hiệu hóa rather than a
   * dead end - deactivating keeps the history readable and takes the person out of every picker.
   */
  async remove(id: string, actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được xóa hồ sơ người nhận tài sản')
    const person = await this.db.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            currentAssets: true,
            assignments: true,
            inventoryExpectedItems: true,
            inventoryObservedItems: true,
            digitalAssignments: true,
            managedDepartments: true,
          },
        },
      },
    })
    if (!person) throw new NotFoundException('Không tìm thấy người nhận tài sản')
    const held: string[] = []
    const counts = person._count
    if (counts.currentAssets) held.push(`${counts.currentAssets} tài sản đang giữ`)
    if (counts.assignments) held.push(`${counts.assignments} phiếu cấp phát`)
    if (counts.inventoryExpectedItems + counts.inventoryObservedItems)
      held.push(`${counts.inventoryExpectedItems + counts.inventoryObservedItems} dòng kiểm kê`)
    if (counts.digitalAssignments) held.push(`${counts.digitalAssignments} lượt cấp license`)
    if (counts.managedDepartments) held.push(`${counts.managedDepartments} phòng ban đang phụ trách`)
    if (held.length)
      throw new ConflictException(
        `Hồ sơ đang gắn với ${held.join(', ')}; xóa sẽ làm mất lịch sử đó. Hãy dùng Vô hiệu hóa để giữ lịch sử.`,
      )
    return this.db.$transaction(async tx => {
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'PERSON_DELETED',
          entityType: 'Person',
          entityId: id,
          oldValues: {
            employeeCode: person.employeeCode,
            fullName: person.fullName,
            email: person.email,
            jobTitle: person.jobTitle,
            departmentId: person.departmentId,
            source: person.source,
            status: person.status,
          } as Prisma.InputJsonValue,
        },
      })
      await tx.person.delete({ where: { id } })
      return { success: true }
    })
  }
}
