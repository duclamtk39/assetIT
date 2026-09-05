import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { CreatePersonDto, ListPeopleDto, UpdatePersonDto } from './people.dto'
import { PeopleService } from './people.service'
type AuthRequest = Request & { authUser: { id: string; role: string; departmentId: string | null } }

@ApiTags('People directory')
@Controller('people')
export class PeopleLookupController {
  constructor(private readonly people: PeopleService) {}
  @Get() list(@Query() query: ListPeopleDto, @Req() req: AuthRequest) {
    return this.people.list(query, true, req.authUser)
  }
}

@ApiTags('People management')
@Controller('admin/people')
export class PeopleAdminController {
  constructor(private readonly people: PeopleService) {}
  @Get() list(@Query() query: ListPeopleDto, @Req() req: AuthRequest) {
    this.people.assertManager(req.authUser)
    return this.people.list(query)
  }
  @Post() create(@Body() body: CreatePersonDto, @Req() req: AuthRequest) {
    this.people.assertManager(req.authUser)
    return this.people.create(body, req.authUser)
  }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdatePersonDto, @Req() req: AuthRequest) {
    this.people.assertManager(req.authUser)
    return this.people.update(id, body, req.authUser)
  }
}
