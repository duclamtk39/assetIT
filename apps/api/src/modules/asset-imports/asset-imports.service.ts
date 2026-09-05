import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AssetHistoryAction, AssetImportRowStatus, AssetImportStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { StageAssetImportDto } from './asset-imports.dto'
import { isUuid, validateImportPayload } from './asset-imports.rules'

type Actor = { id: string; role: string; departmentId: string | null }
type Payload = Record<string, unknown>
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const optionalText = (value: unknown) => text(value) || null

@Injectable()
export class AssetImportsService {
  constructor(private readonly db: PrismaService) {}
  private assertAdmin(actor: Actor) {
    if (!['ADMIN', 'IT'].includes(actor.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được import và rollback tài sản')
  }
  async list(actor: Actor) {
    this.assertAdmin(actor)
    return {
      data: await this.db.assetImportBatch.findMany({
        include: { creator: { select: { fullName: true } }, _count: { select: { rows: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    }
  }
  async get(id: string, actor: Actor) {
    this.assertAdmin(actor)
    const batch = await this.db.assetImportBatch.findUnique({
      where: { id },
      include: { creator: { select: { fullName: true } }, rows: { orderBy: { rowNumber: 'asc' } } },
    })
    if (!batch) throw new NotFoundException('Không tìm thấy lô import')
    return batch
  }

  async stage(body: StageAssetImportDto, actor: Actor) {
    this.assertAdmin(actor)
    const seenRows = new Set<number>(),
      seenIdentity = new Map<string, number>(),
      prepared = body.rows.map(row => ({
        rowNumber: row.rowNumber,
        payload: row.payload,
        errors: validateImportPayload(row.payload),
      }))
    for (const row of prepared) {
      if (seenRows.has(row.rowNumber)) row.errors.push('rowNumber bị trùng')
      seenRows.add(row.rowNumber)
      for (const field of ['assetTag', 'barcode', 'serialNumber']) {
        const value = text(row.payload[field]).toLowerCase()
        if (!value) continue
        const key = `${field}:${value}`,
          prior = seenIdentity.get(key)
        if (prior) row.errors.push(`${field} bị trùng với dòng ${prior}`)
        else seenIdentity.set(key, row.rowNumber)
      }
    }
    const identities = prepared.flatMap(row =>
      ['assetTag', 'barcode', 'serialNumber'].map(field => text(row.payload[field])).filter(Boolean),
    )
    const existing = identities.length
      ? await this.db.asset.findMany({
          where: {
            deletedAt: null,
            OR: [
              { assetTag: { in: identities, mode: 'insensitive' } },
              { barcode: { in: identities, mode: 'insensitive' } },
              { serialNumber: { in: identities, mode: 'insensitive' } },
            ],
          },
          select: { assetTag: true, barcode: true, serialNumber: true },
        })
      : []
    const occupied = new Set(
      existing.flatMap(asset =>
        [asset.assetTag, asset.barcode, asset.serialNumber].filter(Boolean).map(value => value!.toLowerCase()),
      ),
    )
    for (const row of prepared)
      for (const field of ['assetTag', 'barcode', 'serialNumber'])
        if (occupied.has(text(row.payload[field]).toLowerCase())) row.errors.push(`${field} đã tồn tại trong hệ thống`)
    const categoryIds = [...new Set(prepared.map(row => text(row.payload.categoryId)).filter(isUuid))],
      warehouseIds = [...new Set(prepared.map(row => text(row.payload.warehouseId)).filter(isUuid))]
    const [categories, warehouses] = await Promise.all([
      this.db.assetCategory.findMany({ where: { id: { in: categoryIds }, status: 'ACTIVE' }, select: { id: true } }),
      this.db.warehouse.findMany({ where: { id: { in: warehouseIds }, status: 'ACTIVE' }, select: { id: true } }),
    ])
    const validCategories = new Set(categories.map(value => value.id)),
      validWarehouses = new Set(warehouses.map(value => value.id))
    for (const row of prepared) {
      if (isUuid(text(row.payload.categoryId)) && !validCategories.has(text(row.payload.categoryId)))
        row.errors.push('categoryId không tồn tại hoặc ngừng hoạt động')
      if (isUuid(text(row.payload.warehouseId)) && !validWarehouses.has(text(row.payload.warehouseId)))
        row.errors.push('warehouseId không tồn tại hoặc ngừng hoạt động')
    }
    const validRows = prepared.filter(row => !row.errors.length).length
    return this.db.$transaction(
      async tx => {
        const batch = await tx.assetImportBatch.create({
          data: {
            sourceFileName: body.sourceFileName.trim(),
            totalRows: prepared.length,
            validRows,
            invalidRows: prepared.length - validRows,
            createdBy: actor.id,
          },
        })
        await tx.assetImportRow.createMany({
          data: prepared.map(row => ({
            batchId: batch.id,
            rowNumber: row.rowNumber,
            payload: row.payload as Prisma.InputJsonValue,
            status: row.errors.length ? AssetImportRowStatus.INVALID : AssetImportRowStatus.VALID,
            errors: row.errors as Prisma.InputJsonValue,
          })),
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ASSET_IMPORT_STAGED',
            entityType: 'AssetImportBatch',
            entityId: batch.id,
            newValues: {
              totalRows: prepared.length,
              validRows,
              invalidRows: prepared.length - validRows,
            } as Prisma.InputJsonValue,
          },
        })
        return { ...batch, validRows, invalidRows: prepared.length - validRows }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 120000 },
    )
  }

  async commit(id: string, actor: Actor) {
    this.assertAdmin(actor)
    try {
      return await this.db.$transaction(
        async tx => {
          const batch = await tx.assetImportBatch.findUnique({
            where: { id },
            include: { rows: { orderBy: { rowNumber: 'asc' } } },
          })
          if (!batch) throw new NotFoundException('Không tìm thấy lô import')
          if (batch.status !== AssetImportStatus.STAGED)
            throw new BadRequestException('Chỉ lô đang staging mới được commit')
          if (batch.invalidRows || !batch.rows.length)
            throw new BadRequestException('Lô import còn dòng lỗi; phải sửa và stage lại trước khi commit')
          const status = await tx.assetStatus.findUnique({ where: { code: 'READY' } })
          if (!status) throw new BadRequestException('Thiếu trạng thái READY')
          const created = []
          for (const row of batch.rows) {
            const p = row.payload as Payload,
              warehouse = await tx.warehouse.findFirst({ where: { id: text(p.warehouseId), status: 'ACTIVE' } })
            if (!warehouse) throw new BadRequestException(`Dòng ${row.rowNumber}: kho không hợp lệ`)
            const asset = await tx.asset.create({
              data: {
                assetTag: text(p.assetTag),
                name: text(p.name),
                serialNumber: optionalText(p.serialNumber),
                barcode: text(p.barcode),
                categoryId: text(p.categoryId),
                modelId: optionalText(p.modelId),
                manufacturerId: optionalText(p.manufacturerId),
                statusId: status.id,
                warehouseId: warehouse.id,
                locationId: warehouse.locationId,
                purchaseDate: p.purchaseDate ? new Date(text(p.purchaseDate)) : undefined,
                purchaseCost: p.purchaseCost === undefined ? undefined : Number(p.purchaseCost),
                warrantyMonths: p.warrantyMonths === undefined ? undefined : Number(p.warrantyMonths),
                cpu: optionalText(p.cpu),
                ram: optionalText(p.ram),
                storage: optionalText(p.storage),
                operatingSystem: optionalText(p.operatingSystem),
                ipAddress: optionalText(p.ipAddress),
                macAddress: optionalText(p.macAddress),
                notes: optionalText(p.notes),
              },
            })
            await tx.assetHistory.create({
              data: {
                assetId: asset.id,
                action: AssetHistoryAction.CREATED,
                toLocationId: warehouse.locationId,
                referenceType: 'AssetImportBatch',
                referenceId: id,
                description: `Nhập kho từ ${batch.sourceFileName}`,
                performedBy: actor.id,
              },
            })
            await tx.assetImportRow.update({
              where: { id: row.id },
              data: { status: AssetImportRowStatus.COMMITTED, assetId: asset.id },
            })
            created.push(asset.id)
          }
          await tx.assetImportBatch.update({
            where: { id },
            data: { status: AssetImportStatus.COMMITTED, committedRows: created.length, committedAt: new Date() },
          })
          await tx.auditLog.create({
            data: {
              userId: actor.id,
              action: 'ASSET_IMPORT_COMMITTED',
              entityType: 'AssetImportBatch',
              entityId: id,
              newValues: { assetIds: created } as Prisma.InputJsonValue,
            },
          })
          return { id, status: AssetImportStatus.COMMITTED, committedRows: created.length }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 120000 },
      )
    } catch (error: any) {
      if (error?.code === 'P2002')
        throw new ConflictException('Dữ liệu đã thay đổi sau khi staging; mã tài sản, barcode hoặc serial bị trùng')
      throw error
    }
  }

  async rollback(id: string, actor: Actor) {
    this.assertAdmin(actor)
    return this.db.$transaction(
      async tx => {
        const batch = await tx.assetImportBatch.findUnique({
          where: { id },
          include: {
            rows: {
              where: { status: AssetImportRowStatus.COMMITTED },
              include: {
                asset: {
                  include: {
                    status: true,
                    _count: {
                      select: {
                        assignments: true,
                        returns: true,
                        transfers: true,
                        maintenanceRecords: true,
                        inventoryItems: true,
                        histories: true,
                      },
                    },
                  },
                },
              },
            },
          },
        })
        if (!batch) throw new NotFoundException('Không tìm thấy lô import')
        if (batch.status !== AssetImportStatus.COMMITTED)
          throw new BadRequestException('Chỉ lô đã commit mới được rollback')
        if (batch.rows.length !== batch.committedRows)
          throw new ConflictException('Lô import không đầy đủ; dừng rollback để tránh xóa một phần')
        for (const row of batch.rows) {
          const asset = row.asset
          if (
            !asset ||
            asset.deletedAt ||
            asset.status.code !== 'READY' ||
            asset.currentCustodianId ||
            asset._count.assignments ||
            asset._count.returns ||
            asset._count.transfers ||
            asset._count.maintenanceRecords ||
            asset._count.inventoryItems ||
            asset._count.histories !== 1
          )
            throw new ConflictException(
              `Không thể rollback: tài sản dòng ${row.rowNumber} đã phát sinh nghiệp vụ hoặc thay đổi trạng thái`,
            )
        }
        const now = new Date()
        for (const row of batch.rows) {
          await tx.assetHistory.create({
            data: {
              assetId: row.assetId!,
              action: AssetHistoryAction.UPDATED,
              referenceType: 'AssetImportBatch',
              referenceId: id,
              description: `Rollback lô import ${batch.sourceFileName}`,
              performedBy: actor.id,
            },
          })
          await tx.asset.update({
            where: { id: row.assetId! },
            data: {
              assetTag: `ROLLED-BACK-${row.assetId}`,
              barcode: `ROLLED-BACK-${row.assetId}`,
              serialNumber: null,
              deletedAt: now,
            },
          })
          await tx.assetImportRow.update({ where: { id: row.id }, data: { status: AssetImportRowStatus.ROLLED_BACK } })
        }
        await tx.assetImportBatch.update({
          where: { id },
          data: { status: AssetImportStatus.ROLLED_BACK, rolledBackAt: now },
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ASSET_IMPORT_ROLLED_BACK',
            entityType: 'AssetImportBatch',
            entityId: id,
            newValues: { rolledBackRows: batch.rows.length } as Prisma.InputJsonValue,
          },
        })
        return { id, status: AssetImportStatus.ROLLED_BACK, rolledBackRows: batch.rows.length }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 120000 },
    )
  }
}
