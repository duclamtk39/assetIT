import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AssetHistoryAction, InventoryResult, InventoryStatus, Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../database/prisma.service'
import { CreateInventoryDto, ScanInventoryDto } from './inventory.dto'
import { inventoryResult } from './inventory.rules'

type Actor = { id: string; role: string; departmentId: string | null }
const detailInclude = {
  creator: { select: { id: true, fullName: true } },
  scopeDepartment: true,
  scopeLocation: true,
  scopeWarehouse: true,
  scopeCategory: true,
  items: {
    include: {
      asset: { include: { status: true, category: true, location: true, warehouse: true, currentCustodian: true } },
      expectedLocation: true,
      observedLocation: true,
      expectedCustodian: true,
      observedCustodian: true,
      scanner: { select: { fullName: true } },
    },
    orderBy: { asset: { assetTag: 'asc' as const } },
  },
} as const

@Injectable()
export class InventoryService {
  constructor(private readonly db: PrismaService) {}
  private assertOperator(actor: Actor) {
    if (!['ADMIN', 'IT', 'HCNS'].includes(actor.role))
      throw new ForbiddenException('Tài khoản không có quyền kiểm kê tài sản')
  }
  private departmentScope(actor: Actor, requested?: string | null) {
    if (actor.role !== 'HCNS') return requested || undefined
    if (!actor.departmentId) throw new ForbiddenException('Tài khoản HCNS chưa được gán phòng ban')
    if (requested && requested !== actor.departmentId)
      throw new ForbiddenException('HCNS chỉ được kiểm kê phòng ban được phân quyền')
    return actor.departmentId
  }
  private assertSessionScope(session: { scopeDepartmentId: string | null }, actor: Actor) {
    if (actor.role === 'HCNS' && session.scopeDepartmentId !== actor.departmentId)
      throw new ForbiddenException('Đợt kiểm kê nằm ngoài phạm vi phòng ban')
  }
  private reference() {
    return `KK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`
  }
  private summary(items: Array<{ result: InventoryResult }>) {
    return items.reduce(
      (value, item) => ({ ...value, [item.result]: (value[item.result] || 0) + 1 }),
      {} as Record<string, number>,
    )
  }

  async list(actor: Actor) {
    this.assertOperator(actor)
    const departmentId = this.departmentScope(actor)
    const data = await this.db.inventorySession.findMany({
      where: departmentId ? { scopeDepartmentId: departmentId } : {},
      include: { creator: { select: { fullName: true } }, scopeDepartment: true, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { data }
  }

  async get(id: string, actor: Actor) {
    this.assertOperator(actor)
    const session = await this.db.inventorySession.findUnique({ where: { id }, include: detailInclude })
    if (!session) throw new NotFoundException('Không tìm thấy đợt kiểm kê')
    this.assertSessionScope(session, actor)
    return { ...session, summary: this.summary(session.items) }
  }

  async create(body: CreateInventoryDto, actor: Actor) {
    this.assertOperator(actor)
    const scopeDepartmentId = this.departmentScope(actor, body.departmentId)
    return this.db.$transaction(
      async tx => {
        if (body.locationId && !(await tx.location.findFirst({ where: { id: body.locationId, status: 'ACTIVE' } })))
          throw new BadRequestException('Vị trí kiểm kê không hợp lệ')
        if (body.warehouseId && !(await tx.warehouse.findFirst({ where: { id: body.warehouseId, status: 'ACTIVE' } })))
          throw new BadRequestException('Kho kiểm kê không hợp lệ')
        if (
          body.categoryId &&
          !(await tx.assetCategory.findFirst({ where: { id: body.categoryId, status: 'ACTIVE' } }))
        )
          throw new BadRequestException('Nhóm tài sản không hợp lệ')
        const assets = await tx.asset.findMany({
          where: {
            deletedAt: null,
            status: { isArchived: false },
            departmentId: scopeDepartmentId,
            locationId: body.locationId,
            warehouseId: body.warehouseId,
            categoryId: body.categoryId,
          },
          select: { id: true, locationId: true, currentCustodianId: true },
        })
        if (!assets.length) throw new BadRequestException('Không có tài sản trong phạm vi kiểm kê đã chọn')
        const session = await tx.inventorySession.create({
          data: {
            inventoryNo: this.reference(),
            name: body.name.trim(),
            scopeDepartmentId,
            scopeLocationId: body.locationId,
            scopeWarehouseId: body.warehouseId,
            scopeCategoryId: body.categoryId,
            createdBy: actor.id,
          },
        })
        await tx.inventoryItem.createMany({
          data: assets.map(asset => ({
            sessionId: session.id,
            assetId: asset.id,
            expectedLocationId: asset.locationId,
            expectedCustodianId: asset.currentCustodianId,
          })),
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'INVENTORY_CREATED',
            entityType: 'InventorySession',
            entityId: session.id,
            newValues: {
              inventoryNo: session.inventoryNo,
              assetCount: assets.length,
              scopeDepartmentId,
            } as Prisma.InputJsonValue,
          },
        })
        return { ...session, totalItems: assets.length }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async scan(id: string, body: ScanInventoryDto, actor: Actor) {
    this.assertOperator(actor)
    return this.db.$transaction(
      async tx => {
        const session = await tx.inventorySession.findUnique({ where: { id } })
        if (!session) throw new NotFoundException('Không tìm thấy đợt kiểm kê')
        this.assertSessionScope(session, actor)
        if (session.status !== InventoryStatus.OPEN)
          throw new BadRequestException('Chỉ đợt kiểm kê đang mở mới được quét')
        const equals = { equals: body.value, mode: 'insensitive' as const }
        const asset = await tx.asset.findFirst({
          where: {
            deletedAt: null,
            status: { isArchived: false },
            OR: [{ assetTag: equals }, { barcode: equals }, { serialNumber: equals }],
          },
        })
        if (!asset) throw new NotFoundException('Không tìm thấy tài sản theo mã, Barcode, QR hoặc serial')
        if (actor.role === 'HCNS' && asset.departmentId !== actor.departmentId)
          throw new ForbiddenException('Tài sản nằm ngoài phạm vi phòng ban')
        if (
          body.observedLocationId &&
          !(await tx.location.findFirst({ where: { id: body.observedLocationId, status: 'ACTIVE' } }))
        )
          throw new BadRequestException('Vị trí quan sát không hợp lệ')
        if (
          body.observedCustodianId &&
          !(await tx.person.findFirst({ where: { id: body.observedCustodianId, status: 'ACTIVE' } }))
        )
          throw new BadRequestException('Người đang giữ quan sát không hợp lệ')
        const current = await tx.inventoryItem.findUnique({
          where: { sessionId_assetId: { sessionId: id, assetId: asset.id } },
        })
        const observedLocationId = body.observedLocationId || asset.locationId,
          observedCustodianId = body.observedCustodianId || asset.currentCustodianId
        const result = inventoryResult(
          current?.expectedLocationId || null,
          current?.expectedCustodianId || null,
          observedLocationId,
          observedCustodianId,
          Boolean(current),
        )
        const data = {
          observedLocationId,
          observedCustodianId,
          scannedAt: new Date(),
          scannedBy: actor.id,
          result,
          note: body.note?.trim(),
        }
        const item = current
          ? await tx.inventoryItem.update({ where: { id: current.id }, data })
          : await tx.inventoryItem.create({
              data: { sessionId: id, assetId: asset.id, expectedLocationId: null, expectedCustodianId: null, ...data },
            })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'INVENTORY_ITEM_SCANNED',
            entityType: 'InventorySession',
            entityId: id,
            newValues: { assetId: asset.id, result } as Prisma.InputJsonValue,
          },
        })
        return { item, asset: { id: asset.id, assetTag: asset.assetTag, name: asset.name } }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async close(id: string, actor: Actor) {
    this.assertOperator(actor)
    return this.db.$transaction(
      async tx => {
        const session = await tx.inventorySession.findUnique({ where: { id }, include: { items: true } })
        if (!session) throw new NotFoundException('Không tìm thấy đợt kiểm kê')
        this.assertSessionScope(session, actor)
        if (session.status !== InventoryStatus.OPEN)
          throw new BadRequestException('Đợt kiểm kê không còn ở trạng thái mở')
        await tx.inventoryItem.updateMany({
          where: { sessionId: id, result: InventoryResult.PENDING },
          data: { result: InventoryResult.MISSING },
        })
        const closed = await tx.inventorySession.update({
          where: { id },
          data: { status: InventoryStatus.CLOSED, closedAt: new Date() },
        })
        await tx.assetHistory.createMany({
          data: session.items.map(item => ({
            assetId: item.assetId,
            action: AssetHistoryAction.INVENTORIED,
            referenceType: 'InventorySession',
            referenceId: id,
            description: `Kiểm kê ${session.inventoryNo}`,
            performedBy: actor.id,
          })),
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'INVENTORY_CLOSED',
            entityType: 'InventorySession',
            entityId: id,
            newValues: { inventoryNo: session.inventoryNo } as Prisma.InputJsonValue,
          },
        })
        return closed
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async cancel(id: string, actor: Actor) {
    this.assertOperator(actor)
    const session = await this.db.inventorySession.findUnique({ where: { id } })
    if (!session) throw new NotFoundException('Không tìm thấy đợt kiểm kê')
    this.assertSessionScope(session, actor)
    if (session.status !== InventoryStatus.OPEN) throw new BadRequestException('Chỉ đợt kiểm kê đang mở mới được hủy')
    return this.db.$transaction(async tx => {
      const cancelled = await tx.inventorySession.update({
        where: { id },
        data: { status: InventoryStatus.CANCELLED, cancelledAt: new Date() },
      })
      await tx.auditLog.create({
        data: { userId: actor.id, action: 'INVENTORY_CANCELLED', entityType: 'InventorySession', entityId: id },
      })
      return cancelled
    })
  }
}
