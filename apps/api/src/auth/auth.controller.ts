import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { ChangePasswordDto, LoginDto } from './auth.dto'
import { Public } from './public.decorator'
const COOKIE = process.env.COOKIE_SECURE === 'true' ? '__Host-assetflow_session' : 'assetflow_session'
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/',
}
const requestContext = (request: Request) => ({ ipAddress: request.ip, userAgent: request.get('user-agent') })
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login') @HttpCode(200) async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.username, body.password, requestContext(request))
    response.cookie(COOKIE, result.token, { ...cookieOptions, expires: result.expiresAt })
    return { user: result.user }
  }
  @Get('me') me(@Req() request: Request & { authUser: any }) {
    return { user: this.auth.toClientUser(request.authUser) }
  }
  @Post('change-password') @HttpCode(204) async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() request: Request & { authUser: any },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(request.authUser.id, body.newPassword, body.currentPassword, requestContext(request))
    response.clearCookie(COOKIE, cookieOptions)
  }
  @Post('logout') @HttpCode(204) async logout(
    @Req() request: Request & { sessionToken?: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.sessionToken)
    response.clearCookie(COOKIE, cookieOptions)
  }
}
