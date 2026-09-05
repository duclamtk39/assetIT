import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AuthSource, Prisma, RecordStatus, UserRole } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { hashPassword, isPasswordPolicyValid } from '../../auth/password'
import { CreateLocalUserDto, ListManagedUsersDto, ResetLocalPasswordDto, UpdateLocalUserDto } from './users.dto'

type Actor = { id: string; role: string }

@Injectable()
export class UsersService {
  constructor(private readonly db: PrismaService) {}
  assertAdmin(actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ quản trị viên được quản lý người dùng')
  }

  private publicSelect = {
    id: true,
    employeeCode: true,
    username: true,
    fullName: true,
    email: true,
    phone: true,
    role: true,
    authSource: true,
    externalId: true,
    mustChangePassword: true,
    lastLoginAt: true,
    departmentId: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    department: { select: { id: true, code: true, name: true } },
  } satisfies Prisma.UserSelect
  private passwordError() {
    return new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt')
  }
  private async ensureDepartment(id: string) {
    const department = await this.db.department.findFirst({ where: { id, status: 'ACTIVE' } })
    if (!department) throw new BadRequestException('Phòng ban không tồn tại hoặc đã ngừng hoạt động')
  }
  private conflict(error: any): never {
    if (error?.code === 'P2002') throw new ConflictException('Mã nhân viên, tên đăng nhập hoặc email đã tồn tại')
    throw error
  }
  private async protectLastAdmin(userId: string, nextRole?: UserRole, nextStatus?: RecordStatus) {
    const current = await this.db.user.findUnique({ where: { id: userId } })
    if (!current) throw new NotFoundException('Không tìm thấy người dùng')
    if (current.role === 'ADMIN' && ((nextRole && nextRole !== 'ADMIN') || (nextStatus && nextStatus !== 'ACTIVE'))) {
      const activeAdmins = await this.db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })
      if (activeAdmins <= 1) throw new BadRequestException('Hệ thống phải còn ít nhất một quản trị viên đang hoạt động')
    }
    return current
  }

  async list(query: ListManagedUsersDto) {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      status: query.status,
      departmentId: query.departmentId,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { username: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { employeeCode: { contains: query.search, mode: 'insensitive' } },
              { department: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }
    const skip = (query.page - 1) * query.limit
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({
        where,
        select: this.publicSelect,
        orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.db.user.count({ where }),
    ])
    return { items, total, page: query.page, limit: query.limit }
  }

  async create(body: CreateLocalUserDto, actor: Actor) {
    if (!isPasswordPolicyValid(body.temporaryPassword)) throw this.passwordError()
    await this.ensureDepartment(body.departmentId)
    try {
      const user = await this.db.user.create({
        data: {
          fullName: body.fullName,
          employeeCode: body.employeeCode,
          username: body.username,
          email: body.email,
          phone: body.phone || null,
          departmentId: body.departmentId,
          role: body.role,
          authSource: AuthSource.LOCAL,
          status: RecordStatus.ACTIVE,
          passwordHash: await hashPassword(body.temporaryPassword),
          mustChangePassword: true,
        },
        select: this.publicSelect,
      })
      await this.db.auditLog.create({
        data: {
          userId: actor.id,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: user.id,
          newValues: {
            employeeCode: user.employeeCode,
            username: user.username,
            email: user.email,
            role: user.role,
            departmentId: user.departmentId,
            authSource: user.authSource,
          },
        },
      })
      return user
    } catch (error) {
      this.conflict(error)
    }
  }

  async update(id: string, body: UpdateLocalUserDto, actor: Actor) {
    const current = await this.protectLastAdmin(id, body.role, body.status)
    if (current.authSource !== AuthSource.LOCAL)
      throw new BadRequestException('Người dùng đồng bộ phải được sửa tại LDAP hoặc Microsoft 365')
    if (id === actor.id && ((body.status && body.status !== 'ACTIVE') || (body.role && body.role !== 'ADMIN')))
      throw new BadRequestException('Không thể tự hạ quyền hoặc vô hiệu hóa tài khoản đang đăng nhập')
    if (body.departmentId) await this.ensureDepartment(body.departmentId)
    try {
      const user = await this.db.user.update({ where: { id }, data: body, select: this.publicSelect })
      if (body.status && body.status !== 'ACTIVE')
        await this.db.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        })
      await this.db.auditLog.create({
        data: {
          userId: actor.id,
          action: 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          oldValues: {
            employeeCode: current.employeeCode,
            username: current.username,
            email: current.email,
            role: current.role,
            departmentId: current.departmentId,
            status: current.status,
          },
          newValues: body as Prisma.InputJsonValue,
        },
      })
      return user
    } catch (error) {
      this.conflict(error)
    }
  }

  async resetPassword(id: string, body: ResetLocalPasswordDto, actor: Actor) {
    if (!isPasswordPolicyValid(body.temporaryPassword)) throw this.passwordError()
    const user = await this.db.user.findUnique({ where: { id } })
    if (!user) throw new NotFoundException('Không tìm thấy người dùng')
    if (user.authSource !== AuthSource.LOCAL)
      throw new BadRequestException('Mật khẩu của người dùng đồng bộ được quản lý tại directory')
    await this.db.$transaction([
      this.db.user.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(body.temporaryPassword),
          mustChangePassword: true,
          passwordChangedAt: null,
        },
      }),
      this.db.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.db.auditLog.create({
        data: { userId: actor.id, action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: id },
      }),
    ])
    return { ok: true, mustChangePassword: true }
  }
}
