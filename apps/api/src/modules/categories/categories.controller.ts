import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { CreateAssetCategoryDto, UpdateAssetCategoryDto } from './categories.dto'
import { CategoriesService } from './categories.service'

type AuthRequest = Request & { authUser: { id: string; role: string } }

@ApiTags('Asset categories')
@Controller('admin/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Get() list(@Req() req: AuthRequest) {
    this.categories.assertAdmin(req.authUser)
    return this.categories.list()
  }
  @Post() create(@Body() body: CreateAssetCategoryDto, @Req() req: AuthRequest) {
    this.categories.assertAdmin(req.authUser)
    return this.categories.create(body, req.authUser)
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAssetCategoryDto,
    @Req() req: AuthRequest,
  ) {
    this.categories.assertAdmin(req.authUser)
    return this.categories.update(id, body, req.authUser)
  }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    this.categories.assertAdmin(req.authUser)
    return this.categories.remove(id, req.authUser)
  }
}
