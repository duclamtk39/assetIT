import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { CreateAssetCategoryDto, UpdateAssetCategoryDto } from './categories.dto'

type Actor = { id: string; role: string }

@Injectable()
export class CategoriesService {
  constructor(private readonly db: PrismaService) {}
  assertAdmin(actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ quản trị viên được quản lý danh mục tài sản')
  }

  list() {
    return this.db.assetCategory.findMany({
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { assets: true, children: true, models: true, inventorySessions: true } },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    })
  }

  async create(body: CreateAssetCategoryDto, actor: Actor) {
    if (body.parentId) {
      const parent = await this.db.assetCategory.findFirst({ where: { id: body.parentId, status: 'ACTIVE' } })
      if (!parent) throw new BadRequestException('Nhóm tài sản cha không tồn tại hoặc đã ngừng hoạt động')
    }
    const duplicate = await this.db.assetCategory.findFirst({
      where: {
        OR: [
          { code: { equals: body.code, mode: 'insensitive' } },
          { name: { equals: body.name, mode: 'insensitive' } },
        ],
      },
    })
    if (duplicate) throw new ConflictException('Mã hoặc tên nhóm tài sản đã tồn tại')
    try {
      return await this.db.$transaction(async tx => {
        const category = await tx.assetCategory.create({
          data: {
            code: body.code,
            name: body.name,
            parentId: body.parentId || null,
            description: body.description || null,
          },
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ASSET_CATEGORY_CREATED',
            entityType: 'AssetCategory',
            entityId: category.id,
            newValues: {
              code: category.code,
              name: category.name,
              parentId: category.parentId,
            } as Prisma.InputJsonValue,
          },
        })
        return category
      })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Mã nhóm tài sản đã tồn tại')
      throw error
    }
  }

  async update(id: string, body: UpdateAssetCategoryDto, actor: Actor) {
    const current = await this.db.assetCategory.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy nhóm tài sản')
    if (body.parentId === id) throw new BadRequestException('Nhóm tài sản không thể là nhóm cha của chính nó')
    if (body.parentId) {
      const parent = await this.db.assetCategory.findFirst({ where: { id: body.parentId, status: 'ACTIVE' } })
      if (!parent) throw new BadRequestException('Nhóm tài sản cha không tồn tại hoặc đã ngừng hoạt động')
    }
    if (body.code || body.name) {
      const duplicate = await this.db.assetCategory.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(body.code ? [{ code: { equals: body.code, mode: 'insensitive' as const } }] : []),
            ...(body.name ? [{ name: { equals: body.name, mode: 'insensitive' as const } }] : []),
          ],
        },
      })
      if (duplicate) throw new ConflictException('Mã hoặc tên nhóm tài sản đã tồn tại')
    }
    if (body.status === 'INACTIVE') {
      const activeChildren = await this.db.assetCategory.count({ where: { parentId: id, status: 'ACTIVE' } })
      if (activeChildren) throw new ConflictException('Hãy ngừng sử dụng các nhóm con trước')
    }
    try {
      return await this.db.$transaction(async tx => {
        const category = await tx.assetCategory.update({
          where: { id },
          data: {
            code: body.code,
            name: body.name,
            parentId: body.parentId,
            description: body.description,
            status: body.status,
          },
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ASSET_CATEGORY_UPDATED',
            entityType: 'AssetCategory',
            entityId: id,
            oldValues: {
              code: current.code,
              name: current.name,
              parentId: current.parentId,
              description: current.description,
              status: current.status,
            } as Prisma.InputJsonValue,
            newValues: {
              code: category.code,
              name: category.name,
              parentId: category.parentId,
              description: category.description,
              status: category.status,
            } as Prisma.InputJsonValue,
          },
        })
        return category
      })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Mã hoặc tên nhóm tài sản đã tồn tại')
      throw error
    }
  }

  async remove(id: string, actor: Actor) {
    const category = await this.db.assetCategory.findUnique({
      where: { id },
      include: { _count: { select: { assets: true, children: true, models: true, inventorySessions: true } } },
    })
    if (!category) throw new NotFoundException('Không tìm thấy nhóm tài sản')
    const references =
      category._count.assets + category._count.children + category._count.models + category._count.inventorySessions
    if (references)
      throw new ConflictException(
        'Nhóm đã phát sinh dữ liệu nên không thể xóa. Hãy chọn Ngừng sử dụng để bảo toàn lịch sử.',
      )
    await this.db.$transaction(async tx => {
      await tx.assetCategory.delete({ where: { id } })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'ASSET_CATEGORY_DELETED',
          entityType: 'AssetCategory',
          entityId: id,
          oldValues: { code: category.code, name: category.name, status: category.status } as Prisma.InputJsonValue,
        },
      })
    })
    return { success: true }
  }
}
