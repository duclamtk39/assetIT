import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { AuthService } from './auth.service'
import { IS_PUBLIC_KEY } from './public.decorator'

export function readSessionCookie(request: Request) {
  const raw = request.headers.cookie || ''
  for (const item of raw.split(';')) {
    const [name, ...value] = item.trim().split('=')
    if (name === 'assetflow_session' || name === '__Host-assetflow_session')
      try {
        return decodeURIComponent(value.join('='))
      } catch {
        return undefined
      }
  }
  return undefined
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]))
      return true
    const request = context.switchToHttp().getRequest<Request & { authUser?: any; sessionToken?: string }>()
    const token = readSessionCookie(request)
    const user = await this.auth.authenticate(token)
    if (!user) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn')
    request.authUser = user
    request.sessionToken = token
    if (
      user.mustChangePassword &&
      !request.path.endsWith('/auth/change-password') &&
      !request.path.endsWith('/auth/logout') &&
      !request.path.endsWith('/auth/me')
    ) {
      throw new ForbiddenException('Phải đổi mật khẩu khởi tạo trước khi sử dụng hệ thống')
    }
    return true
  }
}
