import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { CreateLocalUserDto, ListManagedUsersDto, ResetLocalPasswordDto, UpdateLocalUserDto } from './users.dto'
import { UsersService } from './users.service'

type AuthRequest = Request & { authUser: { id: string; role: string } }
@ApiTags('User management')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() list(@Query() query: ListManagedUsersDto, @Req() req: AuthRequest) {
    this.users.assertAdmin(req.authUser)
    return this.users.list(query)
  }
  @Post() create(@Body() body: CreateLocalUserDto, @Req() req: AuthRequest) {
    this.users.assertAdmin(req.authUser)
    return this.users.create(body, req.authUser)
  }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateLocalUserDto, @Req() req: AuthRequest) {
    this.users.assertAdmin(req.authUser)
    return this.users.update(id, body, req.authUser)
  }
  @Post(':id/reset-password') resetPassword(
    @Param('id') id: string,
    @Body() body: ResetLocalPasswordDto,
    @Req() req: AuthRequest,
  ) {
    this.users.assertAdmin(req.authUser)
    return this.users.resetPassword(id, body, req.authUser)
  }
}
