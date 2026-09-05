import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../database/prisma.service'
import { hashPassword, isPasswordPolicyValid, verifyPassword } from './password'

const INITIAL_ADMIN = {
  employeeCode: 'ADMIN-001',
  username: 'admin',
  fullName: 'Quản trị viên',
  email: 'admin@localhost',
} as const
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 5
type RequestContext = { ipAddress?: string; userAgent?: string }
type LoginCounter = { failures: number; blockedUntil: number }

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name)
  private readonly sessionHours = Math.max(1, Number(process.env.SESSION_TTL_HOURS || 12))
  private readonly loginCounters = new Map<string, LoginCounter>()
  private dummyHash?: string
  constructor(private readonly prisma: PrismaService) {}
  async onModuleInit() {
    this.dummyHash = await hashPassword(randomBytes(24).toString('base64url'))
    await this.ensureInitialAdmin()
  }
  private secret(fileEnv: string, valueEnv: string) {
    const file = process.env[fileEnv]?.trim()
    if (file) return readFileSync(file, 'utf8').trim()
    return process.env[valueEnv]?.trim()
  }
  private async ensureInitialAdmin() {
    const existing = await this.prisma.user.findUnique({
      where: { username: INITIAL_ADMIN.username },
      select: { id: true },
    })
    if (existing) return
    const password = this.secret('INITIAL_ADMIN_PASSWORD_FILE', 'INITIAL_ADMIN_PASSWORD')
    if (!password) throw new Error('Fresh installation requires INITIAL_ADMIN_PASSWORD or INITIAL_ADMIN_PASSWORD_FILE')
    if (!isPasswordPolicyValid(password)) throw new Error('INITIAL_ADMIN_PASSWORD does not meet the password policy')
    try {
      await this.prisma.user.create({
        data: {
          ...INITIAL_ADMIN,
          passwordHash: await hashPassword(password),
          role: 'ADMIN',
          authSource: 'LOCAL',
          mustChangePassword: true,
        },
      })
      this.logger.warn('Initial local administrator created; password change is required at first sign-in.')
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error
    }
  }
  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }
  private loginKey(ipAddress?: string) {
    return createHash('sha256')
      .update(ipAddress || 'unknown')
      .digest('hex')
  }
  private pruneLoginCounters() {
    if (this.loginCounters.size < 10000) return
    const now = Date.now()
    for (const [key, value] of this.loginCounters)
      if (!value.blockedUntil || value.blockedUntil <= now) this.loginCounters.delete(key)
  }
  private contextData(context: RequestContext) {
    return { ipAddress: context.ipAddress?.slice(0, 100), userAgent: context.userAgent?.slice(0, 500) }
  }
  private async audit(
    action: string,
    userId: string | null,
    context: RequestContext,
    newValues?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditLog.create({
      data: { userId, action, entityType: 'Authentication', newValues, ...this.contextData(context) },
    })
  }
  toClientUser(user: {
    id: string
    username: string
    fullName: string
    email: string
    role: string
    mustChangePassword: boolean
    departmentId: string | null
  }) {
    const role = user.role === 'ADMIN' ? 'Admin' : user.role === 'HCNS' ? 'HCNS' : 'IT'
    return {
      id: user.id,
      username: user.username,
      name: user.fullName,
      email: user.email,
      role,
      departmentScope: user.role === 'ADMIN' ? ['*'] : user.departmentId ? [user.departmentId] : [],
      mustChangePassword: user.mustChangePassword,
    }
  }
  async login(rawUsername: string, password: string, context: RequestContext = {}) {
    this.pruneLoginCounters()
    const username = rawUsername.trim().toLowerCase(),
      key = this.loginKey(context.ipAddress),
      counter = this.loginCounters.get(key)
    if (counter?.blockedUntil && counter.blockedUntil > Date.now())
      throw new HttpException('Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS)
    const user = await this.prisma.user.findUnique({ where: { username } })
    const valid = Boolean(
      user &&
      user.status === 'ACTIVE' &&
      user.authSource === 'LOCAL' &&
      user.passwordHash &&
      (await verifyPassword(password, user.passwordHash)),
    )
    if (!user?.passwordHash) await verifyPassword(password, this.dummyHash!)
    if (!valid || !user) {
      const failures = (counter?.failures || 0) + 1
      this.loginCounters.set(key, {
        failures,
        blockedUntil: failures >= LOGIN_MAX_FAILURES ? Date.now() + LOGIN_WINDOW_MS : 0,
      })
      await this.audit('LOGIN_FAILED', user?.id || null, context, { username })
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng')
    }
    this.loginCounters.delete(key)
    const token = randomBytes(32).toString('base64url'),
      expiresAt = new Date(Date.now() + this.sessionHours * 60 * 60 * 1000)
    await this.prisma.$transaction(async tx => {
      await tx.authSession.create({ data: { tokenHash: this.tokenHash(token), userId: user.id, expiresAt } })
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_SUCCEEDED',
          entityType: 'Authentication',
          ...this.contextData(context),
        },
      })
    })
    return { token, expiresAt, user: this.toClientUser(user) }
  }
  async authenticate(token?: string) {
    if (!token) return null
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.tokenHash(token) },
      include: { user: true },
    })
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE')
      return null
    return session.user
  }
  async changePassword(userId: string, newPassword: string, currentPassword?: string, context: RequestContext = {}) {
    if (!isPasswordPolicyValid(newPassword))
      throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()
    if (
      !user.mustChangePassword &&
      (!currentPassword || !user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash)))
    )
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng')
    if (user.passwordHash && (await verifyPassword(newPassword, user.passwordHash)))
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại')
    const changedAt = new Date()
    await this.prisma.$transaction(async tx => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          passwordChangedAt: changedAt,
        },
      })
      await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: changedAt } })
      await tx.auditLog.create({
        data: { userId, action: 'PASSWORD_CHANGED', entityType: 'Authentication', ...this.contextData(context) },
      })
    })
  }
  async logout(token?: string) {
    if (token)
      await this.prisma.authSession.updateMany({
        where: { tokenHash: this.tokenHash(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
  }
}
