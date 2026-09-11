import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { AssetAssignmentStatus, AssetHistoryAction, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { AssetImageStorage, type IncomingImage } from './asset-image.storage'
import { CreateAssetDto, ListAssetsQuery, UpdateAssetDto } from './assets.dto'

type Actor = { id: string; role: string; departmentId: string | null }
const include = {
  category: true,
  model: true,
  manufacturer: true,
  status: true,
  assignedUser: true,
  currentCustodian: { include: { department: true, location: true } },
  department: true,
  location: true,
  warehouse: true,
  assignments: { where: { status: 'OPEN' as const }, orderBy: { createdAt: 'desc' as const }, take: 1 },
} as const

@Injectable()
export class AssetsService {
  constructor(
    private readonly db: PrismaService,
    private readonly images: AssetImageStorage,
  ) {}
  private assertOperator(actor: Actor) {
    if (!['ADMIN', 'IT', 'HCNS'].includes(actor.role))
      throw new ForbiddenException('Tài khoản không có quyền quản lý tài sản')
  }
  private scopedDepartment(actor: Actor, requested?: string) {
    if (actor.role !== 'HCNS') return requested
    if (!actor.departmentId) throw new ForbiddenException('Tài khoản HCNS chưa được gán phòng ban')
    if (requested && requested !== actor.departmentId)
      throw new ForbiddenException('Không được truy cập tài sản ngoài phòng ban được phân quyền')
    return actor.departmentId
  }
  private assertAssetScope(actor: Actor, departmentId?: string | null) {
    if (actor.role === 'HCNS' && departmentId !== actor.departmentId)
      throw new ForbiddenException('Không được truy cập tài sản ngoài phòng ban được phân quyền')
  }

  async list(q: ListAssetsQuery, actor: Actor) {
    this.assertOperator(actor)
    const term = q.search?.trim(),
      text = term ? { contains: term, mode: 'insensitive' as const } : undefined,
      departmentId = this.scopedDepartment(actor, q.department)
    const search: Prisma.AssetWhereInput[] = text
      ? [
          { assetTag: text },
          { barcode: text },
          { name: text },
          { serialNumber: text },
          { systemUuid: text },
          { notes: text },
          { category: { is: { OR: [{ code: text }, { name: text }] } } },
          { model: { is: { OR: [{ name: text }, { modelNumber: text }] } } },
          { manufacturer: { is: { name: text } } },
          {
            assignedUser: {
              is: { OR: [{ employeeCode: text }, { username: text }, { fullName: text }, { email: text }] },
            },
          },
          { currentCustodian: { is: { OR: [{ employeeCode: text }, { fullName: text }, { email: text }] } } },
          { department: { is: { OR: [{ code: text }, { name: text }] } } },
          { location: { is: { OR: [{ code: text }, { name: text }, { address: text }] } } },
          { warehouse: { is: { OR: [{ code: text }, { name: text }] } } },
          { status: { is: { OR: [{ code: text }, { name: text }] } } },
          { histories: { some: { OR: [{ description: text }, { referenceType: text }] } } },
        ]
      : []
    const where: Prisma.AssetWhereInput = {
      deletedAt: null,
      categoryId: q.category,
      departmentId,
      locationId: q.location,
      status: q.status ? { code: q.status } : undefined,
      AND: [
        ...(search.length ? [{ OR: search }] : []),
        ...(q.assignedUser
          ? [{ OR: [{ assignedUserId: q.assignedUser }, { currentCustodianId: q.assignedUser }] }]
          : []),
      ],
    }
    const allowed = ['assetTag', 'name', 'createdAt', 'updatedAt', 'purchaseCost'],
      sort = allowed.includes(q.sort) ? q.sort : 'assetTag'
    const [data, total] = await this.db.$transaction([
      this.db.asset.findMany({
        where,
        include,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { [sort]: q.order },
      }),
      this.db.asset.count({ where }),
    ])
    return { data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } }
  }

  async get(id: string, actor: Actor) {
    this.assertOperator(actor)
    const value = await this.db.asset.findFirst({ where: { id, deletedAt: null }, include })
    if (!value) throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Không tìm thấy tài sản' })
    this.assertAssetScope(actor, value.departmentId)
    return value
  }
  async scan(rawValue: string, actor: Actor) {
    this.assertOperator(actor)
    const value = rawValue.trim(),
      departmentId = this.scopedDepartment(actor)
    const equals = { equals: value, mode: 'insensitive' as const }
    const asset = await this.db.asset.findFirst({
      where: {
        deletedAt: null,
        departmentId,
        OR: [{ assetTag: equals }, { barcode: equals }, { serialNumber: equals }],
      },
      include,
      orderBy: { createdAt: 'asc' },
    })
    if (!asset)
      throw new NotFoundException({
        code: 'ASSET_SCAN_NOT_FOUND',
        message: 'Không tìm thấy tài sản theo Barcode, QR, mã tài sản hoặc serial',
      })
    return asset
  }
  async summary(actor: Actor) {
    this.assertOperator(actor)
    const departmentId = this.scopedDepartment(actor),
      base = { deletedAt: null, departmentId }
    const [total, assigned, available, attention, due] = await Promise.all([
      this.db.asset.count({ where: base }),
      this.db.asset.count({ where: { ...base, currentCustodianId: { not: null } } }),
      this.db.asset.count({ where: { ...base, status: { code: 'READY' } } }),
      this.db.asset.count({ where: { ...base, status: { code: { in: ['MAINTENANCE', 'BROKEN', 'LOST'] } } } }),
      this.db.assetAssignment.count({
        where: { status: 'OPEN', expectedReturnDate: { lt: new Date() }, ...(departmentId ? { departmentId } : {}) },
      }),
    ])
    return { total, assigned, available, due, attention }
  }
  async history(id: string, actor: Actor) {
    await this.get(id, actor)
    return {
      data: await this.db.assetHistory.findMany({
        where: { assetId: id },
        include: { actor: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    }
  }

  async create(body: CreateAssetDto, actor: Actor) {
    if (!['ADMIN', 'IT'].includes(actor.role)) throw new ForbiddenException('Chỉ Admin hoặc IT được nhập kho tài sản')
    try {
      return await this.db.$transaction(async tx => {
        const status = await tx.assetStatus.findUnique({ where: { code: 'READY' } })
        if (!status) throw new BadRequestException('Thiếu trạng thái READY; hãy chạy migration mới nhất')
        const warehouse = await tx.warehouse.findFirst({ where: { id: body.warehouseId, status: 'ACTIVE' } })
        if (!warehouse) throw new BadRequestException('Kho nhập không hợp lệ')
        if (body.locationId && body.locationId !== warehouse.locationId)
          throw new BadRequestException('Vị trí nhập phải thuộc kho đã chọn')
        const asset = await tx.asset.create({
          data: {
            assetTag: body.assetTag.trim(),
            name: body.name.trim(),
            serialNumber: body.serialNumber?.trim() || null,
            systemUuid: body.systemUuid?.trim() || null,
            barcode: body.barcode.trim(),
            categoryId: body.categoryId,
            modelId: body.modelId,
            manufacturerId: body.manufacturerId,
            statusId: status.id,
            warehouseId: warehouse.id,
            locationId: warehouse.locationId,
            purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
            purchaseCost: body.purchaseCost,
            warrantyMonths: body.warrantyMonths,
            cpu: body.cpu?.trim(),
            ram: body.ram?.trim(),
            storage: body.storage?.trim(),
            operatingSystem: body.operatingSystem?.trim(),
            ipAddress: body.ipAddress?.trim(),
            macAddress: body.macAddress?.trim(),
            notes: body.notes?.trim(),
          },
          include,
        })
        await tx.assetHistory.create({
          data: {
            assetId: asset.id,
            action: AssetHistoryAction.CREATED,
            toLocationId: warehouse.locationId,
            description: `Nhập kho ${warehouse.name}`,
            performedBy: actor.id,
          },
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ASSET_RECEIVED',
            entityType: 'Asset',
            entityId: asset.id,
            newValues: {
              assetTag: asset.assetTag,
              status: 'READY',
              warehouseId: warehouse.id,
            } as Prisma.InputJsonValue,
          },
        })
        return asset
      })
    } catch (error: any) {
      if (error?.code === 'P2002')
        throw new ConflictException({
          code: 'ASSET_IDENTITY_EXISTS',
          message: 'Mã tài sản, barcode hoặc serial đã tồn tại',
        })
      throw error
    }
  }

  /**
   * Resolves the status an administrator asked for. Status normally moves through lifecycle commands
   * only; this is the correction path for a record that is simply wrong, so it is restricted to
   * administrators and the change is recorded as its own history and audit entry rather than being
   * folded into the metadata update.
   */
  private async resolveStatus(statusCode: string, actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được điều chỉnh trạng thái tài sản trực tiếp')
    const status = await this.db.assetStatus.findUnique({ where: { code: statusCode.trim().toUpperCase() } })
    if (!status) throw new BadRequestException(`Trạng thái ${statusCode} không tồn tại trong hệ thống`)
    return status
  }

  async update(id: string, body: UpdateAssetDto, actor: Actor) {
    const current = await this.get(id, actor)
    const { statusCode, ...fields } = body
    const status = statusCode ? await this.resolveStatus(statusCode, actor) : undefined
    const changesStatus = Boolean(status && status.id !== current.statusId)
    const normalized = {
      ...fields,
      ...(status ? { statusId: status.id } : {}),
      assetTag: body.assetTag?.trim(),
      name: body.name?.trim(),
      barcode: body.barcode?.trim(),
      serialNumber: body.serialNumber?.trim() || undefined,
      systemUuid: body.systemUuid?.trim() || undefined,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
      cpu: body.cpu?.trim(),
      ram: body.ram?.trim(),
      storage: body.storage?.trim(),
      operatingSystem: body.operatingSystem?.trim(),
      ipAddress: body.ipAddress?.trim(),
      macAddress: body.macAddress?.trim(),
    }
    try {
      return await this.db.$transaction(async tx => {
        const asset = await tx.asset.update({ where: { id }, data: normalized, include })
        await tx.assetHistory.create({
          data: {
            assetId: id,
            action: AssetHistoryAction.UPDATED,
            description: changesStatus
              ? `Điều chỉnh trạng thái ${current.status.code} → ${status!.code}`
              : 'Cập nhật thông tin tài sản',
            performedBy: actor.id,
          },
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: changesStatus ? 'ASSET_STATUS_CORRECTED' : 'ASSET_METADATA_UPDATED',
            entityType: 'Asset',
            entityId: id,
            oldValues: {
              assetTag: current.assetTag,
              name: current.name,
              serialNumber: current.serialNumber,
              statusCode: current.status.code,
            } as Prisma.InputJsonValue,
            newValues: body as Prisma.InputJsonValue,
          },
        })
        return asset
      })
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Mã tài sản, barcode hoặc serial đã tồn tại')
      throw error
    }
  }

  /**
   * Replaces an asset's photograph. The previous file is removed after the row is updated, not
   * before: if the write fails the asset keeps the picture it had rather than losing both.
   */
  async setImage(id: string, file: IncomingImage, actor: Actor) {
    const asset = await this.get(id, actor)
    if (!['ADMIN', 'IT', 'HCNS'].includes(actor.role))
      throw new ForbiddenException('Tài khoản không có quyền đổi ảnh tài sản')
    const stored = await this.images.save(file)
    const previous = asset.imagePath
    try {
      await this.db.$transaction(async tx => {
        await tx.asset.update({ where: { id }, data: { imagePath: stored.storagePath } })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ASSET_IMAGE_UPDATED',
            entityType: 'Asset',
            entityId: id,
            oldValues: { imagePath: previous } as Prisma.InputJsonValue,
            newValues: { imagePath: stored.storagePath, fileSize: stored.fileSize } as Prisma.InputJsonValue,
          },
        })
      })
    } catch (error) {
      // The row did not take the new file, so the new file has no business staying on the volume.
      await this.images.remove(stored.storagePath)
      throw error
    }
    if (previous && previous !== stored.storagePath) await this.images.remove(previous)
    return { imagePath: stored.storagePath }
  }

  async clearImage(id: string, actor: Actor) {
    const asset = await this.get(id, actor)
    if (!['ADMIN', 'IT', 'HCNS'].includes(actor.role))
      throw new ForbiddenException('Tài khoản không có quyền đổi ảnh tài sản')
    if (!asset.imagePath) return { imagePath: null }
    await this.db.asset.update({ where: { id }, data: { imagePath: null } })
    await this.images.remove(asset.imagePath)
    return { imagePath: null }
  }

  /** Streams the stored photo. Scope is checked through get(), so a foreign asset is not readable. */
  async imageFor(id: string, actor: Actor) {
    const asset = await this.get(id, actor)
    if (!asset.imagePath) throw new NotFoundException('Tài sản chưa có ảnh')
    return { stream: this.images.stream(asset.imagePath), mimeType: this.images.mimeFor(asset.imagePath) }
  }

  async remove(id: string, actor: Actor) {
    const asset = await this.get(id, actor)
    if (!['ADMIN', 'IT'].includes(actor.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được ngừng theo dõi tài sản')
    // IT keeps the narrow path: only a record that is idle can be taken off the register. An
    // administrator may remove any record, because correcting test and mistaken data is theirs to do.
    // Either way the delete is a soft delete, so closed assignments go on pointing at a live row and
    // stay readable in reports; only an assignment still running has to be settled, below, so nobody
    // is left holding a record that has gone.
    if (actor.role !== 'ADMIN') {
      if (asset.status.code !== 'READY' || asset.currentCustodianId)
        throw new BadRequestException('Chỉ tài sản Sẵn sàng, chưa cấp phát mới được ngừng theo dõi')
      if (await this.db.assetAssignment.count({ where: { assetId: id, status: AssetAssignmentStatus.OPEN } }))
        throw new BadRequestException('Tài sản đang có phiếu cấp phát mở; hãy thu hồi trước khi ngừng theo dõi')
    }
    return this.db.$transaction(async tx => {
      const deletedAt = new Date(),
        tombstone = `DELETED-${id}`
      const openAssignments = await tx.assetAssignment.updateMany({
        where: { assetId: id, status: AssetAssignmentStatus.OPEN },
        data: { status: AssetAssignmentStatus.CANCELLED, closedAt: deletedAt },
      })
      await tx.assetHistory.create({
        data: {
          assetId: id,
          action: AssetHistoryAction.UPDATED,
          description: `Ngừng theo dõi tài sản ${asset.assetTag} (soft delete)`,
          performedBy: actor.id,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'ASSET_SOFT_DELETED',
          entityType: 'Asset',
          entityId: id,
          oldValues: {
            assetTag: asset.assetTag,
            barcode: asset.barcode,
            serialNumber: asset.serialNumber,
            systemUuid: asset.systemUuid,
            statusCode: asset.status.code,
            custodian: asset.currentCustodian?.fullName || null,
            cancelledAssignments: openAssignments.count,
          } as Prisma.InputJsonValue,
          newValues: { deletedAt: deletedAt.toISOString() } as Prisma.InputJsonValue,
        },
      })
      await tx.asset.update({
        where: { id },
        data: {
          archivedAssetTag: asset.assetTag,
          archivedBarcode: asset.barcode,
          archivedSerialNumber: asset.serialNumber,
          archivedSystemUuid: asset.systemUuid,
          assetTag: tombstone,
          barcode: tombstone,
          serialNumber: null,
          systemUuid: null,
          assignedUserId: null,
          currentCustodianId: null,
          deletedAt,
        },
      })
      return { success: true }
    })
  }
}
