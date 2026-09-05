import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Prisma } from '@prisma/client'
import type { Request } from 'express'
import { PrismaService } from '../../database/prisma.service'
import { VendorDto } from './vendors.dto'
type AuthRequest = Request & { authUser: { id: string; role: string } }
@ApiTags('Vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly db: PrismaService) {}
  private manage(req: AuthRequest) {
    if (!['ADMIN', 'IT'].includes(req.authUser.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được quản lý nhà cung cấp')
  }
  private data(body: VendorDto) {
    const evaluated = Boolean(body.lastEvaluation)
    const lifecycleStatus = body.lifecycleStatus || 'ACTIVE'
    if (!evaluated)
      return {
        ...body,
        lifecycleStatus,
        code: body.code.trim().toUpperCase(),
        status: 'Chưa đánh giá',
        lastEvaluation: null,
        score: 0,
        scores: {} as Prisma.InputJsonValue,
      }
    const weights = {
      quality: 25,
      delivery: 20,
      security: 20,
      compliance: 15,
      continuity: 10,
      sustainability: 10,
    } as const
    const scores = Object.fromEntries(Object.keys(weights).map(key => [key, Number(body.scores[key])]))
    if (Object.values(scores).some(value => !Number.isFinite(value) || value < 0 || value > 100))
      throw new BadRequestException('Điểm đánh giá nhà cung cấp phải đầy đủ và nằm trong khoảng 0–100')
    const score = Math.round(
      Object.entries(weights).reduce((total, [key, weight]) => total + (scores[key] * weight) / 100, 0),
    )
    const status = score >= 85 ? 'Đã phê duyệt' : score >= 70 ? 'Có điều kiện' : 'Cần cải thiện'
    return {
      ...body,
      lifecycleStatus,
      code: body.code.trim().toUpperCase(),
      status,
      lastEvaluation: new Date(body.lastEvaluation!),
      score,
      scores: scores as Prisma.InputJsonValue,
    }
  }
  @Get() list() {
    return this.db.vendor.findMany({ orderBy: { name: 'asc' } })
  }
  @Post() async create(@Body() body: VendorDto, @Req() req: AuthRequest) {
    this.manage(req)
    try {
      return await this.db.vendor.create({ data: this.data(body) })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Mã nhà cung cấp đã tồn tại')
      throw error
    }
  }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() body: VendorDto, @Req() req: AuthRequest) {
    this.manage(req)
    return this.db.vendor.update({ where: { id }, data: this.data(body) })
  }
  @Delete(':id') async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    this.manage(req)
    await this.db.vendor.delete({ where: { id } })
    return { success: true }
  }
}
