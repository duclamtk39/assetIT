import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  AssetHistoryAction,
  DataSanitizationStatus,
  DisposalEvidenceType,
  DisposalStatus,
  DisposalType,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import {
  AddDisposalEvidenceDto,
  CompleteDisposalDto,
  CreateDisposalDto,
  ListDisposalsQuery,
  UpdateSanitizationDto,
  WorkflowNoteDto,
} from './disposals.dto'
import {
  assertAssetEligibleForDisposal,
  assertCanApprove,
  assertCanCancel,
  assertCanComplete,
  assertCanRecordExecution,
  assertCanReject,
  assertCanStart,
  assertCanSubmit,
  eligibleAssetStatuses,
} from './disposals.rules'

type Actor = { id: string; role: string; departmentId: string | null }
const activeStatuses = [DisposalStatus.SUBMITTED, DisposalStatus.APPROVED, DisposalStatus.IN_EXECUTION]
const listInclude = {
  requester: { select: { id: true, fullName: true } },
  approver: { select: { id: true, fullName: true } },
  _count: { select: { items: true, evidence: true } },
} as const
const detailInclude = {
  ...listInclude,
  executor: { select: { id: true, fullName: true } },
  items: {
    include: {
      asset: { include: { status: true, category: true, department: true, location: true, warehouse: true } },
      sanitizer: { select: { id: true, fullName: true } },
    },
  },
  evidence: {
    include: { uploader: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
  activities: { include: { actor: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' as const } },
} as const

@Injectable()
export class DisposalsService {
  constructor(private readonly prisma: PrismaService) {}

  private authorize(actor: Actor, adminOnly = false) {
    if (!['ADMIN', 'IT'].includes(actor.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được quản lý thanh lý và hủy bỏ tài sản')
    if (adminOnly && actor.role !== 'ADMIN')
      throw new ForbiddenException('Chỉ Admin được phê duyệt hoặc từ chối hồ sơ thanh lý')
  }
  private rule(action: () => void) {
    try {
      action()
    } catch (error: any) {
      const messages: Record<string, string> = {
        ASSET_ALREADY_DISPOSED: 'Tài sản đã ở trạng thái cuối và không thể thanh lý lần nữa',
        ASSET_NOT_ELIGIBLE_FOR_DISPOSAL:
          'Chỉ tài sản Sẵn sàng, Đã thu hồi hoặc Hỏng mới được đưa vào hồ sơ; phải thu hồi/đóng bảo trì trước',
        DISPOSAL_NOT_DRAFT: 'Chỉ hồ sơ Nháp mới được trình duyệt',
        DISPOSAL_REQUIRES_ASSETS: 'Hồ sơ phải có ít nhất một tài sản',
        DISPOSAL_NOT_SUBMITTED: 'Hồ sơ không ở trạng thái Chờ phê duyệt',
        SEGREGATION_OF_DUTIES: 'Người đề nghị không được tự phê duyệt hồ sơ',
        DISPOSAL_NOT_APPROVED: 'Chỉ hồ sơ đã phê duyệt mới được bắt đầu xử lý',
        DISPOSAL_NOT_EXECUTABLE: 'Hồ sơ chưa được phê duyệt để ghi nhận thực hiện',
        DISPOSAL_NOT_IN_EXECUTION: 'Phải bắt đầu thực hiện trước khi hoàn tất',
        DISPOSAL_EVIDENCE_REQUIRED: 'Phải có ít nhất một bằng chứng trước khi hoàn tất',
        DATA_SANITIZATION_REQUIRED: 'Mọi tài sản có dữ liệu phải được xác minh xóa dữ liệu trước khi hoàn tất',
        DISPOSAL_CANNOT_CANCEL: 'Không thể hủy hồ sơ ở trạng thái hiện tại',
      }
      throw new BadRequestException(messages[error?.message] || 'Chuyển trạng thái hồ sơ không hợp lệ')
    }
  }
  private reference() {
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    return `TL-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
  }
  private activity(tx: Prisma.TransactionClient, disposalId: string, actorId: string, action: string, note?: string) {
    return tx.disposalActivity.create({ data: { disposalId, actorId, action, note } })
  }
  private async record(id: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const value = await tx.disposalCase.findUnique({ where: { id }, include: detailInclude })
    if (!value) throw new NotFoundException('Không tìm thấy hồ sơ thanh lý/hủy bỏ')
    return value
  }
  private async status(tx: Prisma.TransactionClient, code: string) {
    const value = await tx.assetStatus.findUnique({ where: { code } })
    if (!value) throw new ConflictException(`Thiếu trạng thái hệ thống ${code}`)
    return value
  }

  async summary(actor: Actor) {
    this.authorize(actor)
    const [total, draft, pending, approved, executing, completed, cancelled, proceeds] = await Promise.all([
      this.prisma.disposalCase.count(),
      this.prisma.disposalCase.count({ where: { status: DisposalStatus.DRAFT } }),
      this.prisma.disposalCase.count({ where: { status: DisposalStatus.SUBMITTED } }),
      this.prisma.disposalCase.count({ where: { status: DisposalStatus.APPROVED } }),
      this.prisma.disposalCase.count({ where: { status: DisposalStatus.IN_EXECUTION } }),
      this.prisma.disposalCase.count({ where: { status: DisposalStatus.COMPLETED } }),
      this.prisma.disposalCase.count({
        where: { status: { in: [DisposalStatus.REJECTED, DisposalStatus.CANCELLED] } },
      }),
      this.prisma.disposalCase.aggregate({
        _sum: { actualProceeds: true },
        where: { status: DisposalStatus.COMPLETED },
      }),
    ])
    return {
      total,
      draft,
      pending,
      approved,
      executing,
      completed,
      cancelled,
      totalProceeds: Number(proceeds._sum.actualProceeds || 0),
    }
  }

  async eligibleAssets(actor: Actor) {
    this.authorize(actor)
    return this.prisma.asset.findMany({
      where: { deletedAt: null, status: { code: { in: eligibleAssetStatuses() } } },
      include: { status: true, category: true, department: true, location: true, warehouse: true },
      orderBy: { assetTag: 'asc' },
    })
  }

  async list(query: ListDisposalsQuery, actor: Actor) {
    this.authorize(actor)
    const where: Prisma.DisposalCaseWhereInput = {
      status: query.status,
      type: query.type,
      ...(query.search
        ? {
            OR: [
              { disposalNo: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              { reason: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    }
    const [items, total] = await Promise.all([
      this.prisma.disposalCase.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.disposalCase.count({ where }),
    ])
    return { items, total, page: query.page, limit: query.limit }
  }
  async get(id: string, actor: Actor) {
    this.authorize(actor)
    return this.record(id)
  }

  async create(body: CreateDisposalDto, actor: Actor) {
    this.authorize(actor)
    if (!body.items?.length) throw new BadRequestException('Hồ sơ phải có ít nhất một tài sản')
    const ids = body.items.map(item => item.assetId)
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Một tài sản không được xuất hiện nhiều lần trong cùng hồ sơ')
    return this.prisma.$transaction(
      async tx => {
        const assets = await tx.asset.findMany({
          where: { id: { in: ids }, deletedAt: null },
          include: { status: true, category: true, department: true, location: true, warehouse: true },
        })
        if (assets.length !== ids.length)
          throw new BadRequestException('Có tài sản không tồn tại hoặc đã ngừng theo dõi')
        for (const asset of assets) this.rule(() => assertAssetEligibleForDisposal(asset.status.code))
        const conflicts = await tx.disposalItem.findMany({
          where: { assetId: { in: ids }, disposal: { status: { in: activeStatuses } } },
          include: { disposal: { select: { disposalNo: true } } },
        })
        if (conflicts.length)
          throw new ConflictException(`Tài sản đã thuộc hồ sơ đang xử lý ${conflicts[0].disposal.disposalNo}`)
        const byId = new Map(assets.map(asset => [asset.id, asset]))
        const disposal = await tx.disposalCase.create({
          data: {
            disposalNo: this.reference(),
            title: body.title.trim(),
            type: body.type,
            reason: body.reason.trim(),
            policyReference: body.policyReference.trim(),
            recipient: body.recipient?.trim(),
            vendorReference: body.vendorReference?.trim(),
            estimatedProceeds: body.estimatedProceeds,
            currency: body.currency.toUpperCase(),
            requestedBy: actor.id,
            items: {
              create: body.items.map(item => {
                const asset = byId.get(item.assetId)!
                return {
                  assetId: item.assetId,
                  conditionAssessment: item.conditionAssessment.trim(),
                  requiresDataSanitization: item.requiresDataSanitization,
                  sanitizationStatus: item.requiresDataSanitization
                    ? DataSanitizationStatus.PENDING
                    : DataSanitizationStatus.NOT_REQUIRED,
                  assetSnapshot: {
                    assetTag: asset.assetTag,
                    name: asset.name,
                    serialNumber: asset.serialNumber,
                    statusCode: asset.status.code,
                    category: asset.category.name,
                    department: asset.department?.name || null,
                    location: asset.location?.name || null,
                    warehouse: asset.warehouse?.name || null,
                    purchaseCost: asset.purchaseCost ? Number(asset.purchaseCost) : null,
                  } as Prisma.InputJsonValue,
                }
              }),
            },
          },
        })
        await this.activity(tx, disposal.id, actor.id, 'CREATED', 'Tạo hồ sơ nháp')
        return this.record(disposal.id, tx)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async submit(id: string, actor: Actor) {
    this.authorize(actor)
    return this.prisma.$transaction(
      async tx => {
        const disposal = await this.record(id, tx)
        this.rule(() => assertCanSubmit(disposal.status, disposal.items.length))
        const reserved = await this.status(tx, 'RESERVED')
        for (const item of disposal.items) {
          this.rule(() => assertAssetEligibleForDisposal(item.asset.status.code))
          const conflict = await tx.disposalItem.findFirst({
            where: { assetId: item.assetId, disposalId: { not: id }, disposal: { status: { in: activeStatuses } } },
          })
          if (conflict) throw new ConflictException('Tài sản đã được giữ bởi một hồ sơ thanh lý khác')
          await tx.asset.update({ where: { id: item.assetId }, data: { statusId: reserved.id } })
        }
        await tx.disposalCase.update({
          where: { id },
          data: { status: DisposalStatus.SUBMITTED, submittedAt: new Date() },
        })
        await this.activity(tx, id, actor.id, 'SUBMITTED', 'Trình phê duyệt và giữ tài sản')
        return this.record(id, tx)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async approve(id: string, body: WorkflowNoteDto, actor: Actor) {
    this.authorize(actor, true)
    return this.prisma.$transaction(async tx => {
      const disposal = await this.record(id, tx)
      this.rule(() => assertCanApprove(disposal.status, disposal.requestedBy, actor.id))
      await tx.disposalCase.update({
        where: { id },
        data: {
          status: DisposalStatus.APPROVED,
          approvedBy: actor.id,
          approvedAt: new Date(),
          approvalNote: body.note.trim(),
        },
      })
      await this.activity(tx, id, actor.id, 'APPROVED', body.note.trim())
      return this.record(id, tx)
    })
  }

  async reject(id: string, body: WorkflowNoteDto, actor: Actor) {
    this.authorize(actor, true)
    return this.prisma.$transaction(async tx => {
      const disposal = await this.record(id, tx)
      this.rule(() => assertCanReject(disposal.status, disposal.requestedBy, actor.id))
      await this.restoreAssets(tx, disposal.items)
      await tx.disposalCase.update({
        where: { id },
        data: {
          status: DisposalStatus.REJECTED,
          approvedBy: actor.id,
          approvedAt: new Date(),
          rejectionReason: body.note.trim(),
        },
      })
      await this.activity(tx, id, actor.id, 'REJECTED', body.note.trim())
      return this.record(id, tx)
    })
  }

  async start(id: string, body: WorkflowNoteDto, actor: Actor) {
    this.authorize(actor)
    return this.prisma.$transaction(async tx => {
      const disposal = await this.record(id, tx)
      this.rule(() => assertCanStart(disposal.status))
      await tx.disposalCase.update({
        where: { id },
        data: { status: DisposalStatus.IN_EXECUTION, executedBy: actor.id, executionStartedAt: new Date() },
      })
      await this.activity(tx, id, actor.id, 'EXECUTION_STARTED', body.note.trim())
      return this.record(id, tx)
    })
  }

  async addEvidence(id: string, body: AddDisposalEvidenceDto, actor: Actor) {
    this.authorize(actor)
    return this.prisma.$transaction(async tx => {
      const disposal = await this.record(id, tx)
      this.rule(() => assertCanRecordExecution(disposal.status))
      const evidence = await tx.disposalEvidence.create({
        data: {
          disposalId: id,
          type: body.type,
          title: body.title.trim(),
          documentNo: body.documentNo?.trim(),
          documentDate: body.documentDate ? new Date(body.documentDate) : undefined,
          storagePath: body.storagePath.trim(),
          checksumSha256: body.checksumSha256?.toLowerCase(),
          note: body.note?.trim(),
          uploadedBy: actor.id,
        },
      })
      await this.activity(tx, id, actor.id, 'EVIDENCE_ADDED', `${body.type}: ${body.title.trim()}`)
      return evidence
    })
  }

  async updateSanitization(id: string, itemId: string, body: UpdateSanitizationDto, actor: Actor) {
    this.authorize(actor)
    return this.prisma.$transaction(async tx => {
      const disposal = await this.record(id, tx)
      this.rule(() => assertCanRecordExecution(disposal.status))
      const item = disposal.items.find(value => value.id === itemId)
      if (!item) throw new NotFoundException('Không tìm thấy tài sản trong hồ sơ')
      if (item.requiresDataSanitization && body.status === DataSanitizationStatus.NOT_REQUIRED)
        throw new BadRequestException('Tài sản đã đánh dấu có dữ liệu không thể chuyển thành Không yêu cầu')
      if (body.status === DataSanitizationStatus.VERIFIED && !body.method?.trim())
        throw new BadRequestException('Phải ghi phương pháp/tiêu chuẩn xóa dữ liệu khi xác minh')
      const result = await tx.disposalItem.update({
        where: { id: itemId },
        data: {
          sanitizationStatus: body.status,
          sanitizationMethod: body.method?.trim(),
          sanitizedBy: body.status === DataSanitizationStatus.VERIFIED ? actor.id : null,
          sanitizedAt: body.status === DataSanitizationStatus.VERIFIED ? new Date() : null,
        },
      })
      await this.activity(
        tx,
        id,
        actor.id,
        'SANITIZATION_UPDATED',
        `${item.asset.assetTag}: ${body.status}${body.method ? ` - ${body.method.trim()}` : ''}`,
      )
      return result
    })
  }

  async complete(id: string, body: CompleteDisposalDto, actor: Actor) {
    this.authorize(actor)
    return this.prisma.$transaction(
      async tx => {
        const disposal = await this.record(id, tx)
        this.rule(() => assertCanComplete(disposal.status, disposal.evidence.length, disposal.items))
        this.assertRequiredEvidence(
          disposal.type,
          disposal.evidence.map(value => value.type),
          disposal.items.some(item => item.requiresDataSanitization),
        )
        const target = await this.status(tx, 'DISPOSED')
        for (const item of disposal.items) {
          if (item.asset.status.code !== 'RESERVED')
            throw new ConflictException(`Tài sản ${item.asset.assetTag} không còn được giữ cho hồ sơ này`)
          if (await tx.assetAssignment.findFirst({ where: { assetId: item.assetId, status: 'OPEN' } }))
            throw new ConflictException(`Tài sản ${item.asset.assetTag} còn phiếu cấp phát/cho mượn đang mở`)
          if (await tx.maintenanceRecord.findFirst({ where: { assetId: item.assetId, status: 'OPEN' } }))
            throw new ConflictException(`Tài sản ${item.asset.assetTag} còn phiếu bảo trì đang mở`)
          await tx.asset.update({
            where: { id: item.assetId },
            data: {
              statusId: target.id,
              assignedUserId: null,
              currentCustodianId: null,
              departmentId: null,
              warehouseId: null,
              locationId: null,
            },
          })
          await tx.assetHistory.create({
            data: {
              assetId: item.assetId,
              action: AssetHistoryAction.DISPOSED,
              referenceType: 'DisposalCase',
              referenceId: id,
              description: `${disposal.type}: ${disposal.disposalNo} - ${body.note.trim()}`,
              performedBy: actor.id,
            },
          })
        }
        await tx.disposalCase.update({
          where: { id },
          data: {
            status: DisposalStatus.COMPLETED,
            completedAt: new Date(),
            completionNote: body.note.trim(),
            actualProceeds: body.actualProceeds,
            executedBy: disposal.executedBy || actor.id,
          },
        })
        await this.activity(tx, id, actor.id, 'COMPLETED', body.note.trim())
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'DISPOSAL_COMPLETED',
            entityType: 'DisposalCase',
            entityId: id,
            newValues: {
              disposalNo: disposal.disposalNo,
              type: disposal.type,
              assetIds: disposal.items.map(item => item.assetId),
            } as Prisma.InputJsonValue,
          },
        })
        return this.record(id, tx)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }

  async cancel(id: string, body: WorkflowNoteDto, actor: Actor) {
    this.authorize(actor)
    return this.prisma.$transaction(async tx => {
      const disposal = await this.record(id, tx)
      this.rule(() => assertCanCancel(disposal.status))
      if (disposal.status !== DisposalStatus.DRAFT) await this.restoreAssets(tx, disposal.items)
      await tx.disposalCase.update({
        where: { id },
        data: { status: DisposalStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: body.note.trim() },
      })
      await this.activity(tx, id, actor.id, 'CANCELLED', body.note.trim())
      return this.record(id, tx)
    })
  }

  private async restoreAssets(tx: Prisma.TransactionClient, items: Array<any>) {
    for (const item of items) {
      if (item.asset.status.code !== 'RESERVED')
        throw new ConflictException(`Tài sản ${item.asset.assetTag} không còn được giữ cho hồ sơ`)
      const snapshot = item.assetSnapshot as Record<string, unknown>
      const previous = String(snapshot.statusCode || 'READY')
      const status = await this.status(tx, previous)
      await tx.asset.update({ where: { id: item.assetId }, data: { statusId: status.id } })
    }
  }
  private assertRequiredEvidence(type: DisposalType, evidence: DisposalEvidenceType[], requiresSanitization: boolean) {
    const set = new Set(evidence)
    if (requiresSanitization && !set.has(DisposalEvidenceType.DATA_ERASURE_CERTIFICATE))
      throw new BadRequestException('Hồ sơ có tài sản dữ liệu phải kèm chứng nhận xóa dữ liệu')
    if (type === DisposalType.DESTRUCTION && !set.has(DisposalEvidenceType.DESTRUCTION_CERTIFICATE))
      throw new BadRequestException('Hủy bỏ vật lý phải có biên bản/chứng nhận tiêu hủy')
    if (
      type === DisposalType.SALE &&
      !set.has(DisposalEvidenceType.SALE_CONTRACT) &&
      !set.has(DisposalEvidenceType.HANDOVER_MINUTES)
    )
      throw new BadRequestException('Thanh lý bán phải có hợp đồng hoặc biên bản bàn giao')
    const handoverTypes: DisposalType[] = [DisposalType.DONATION, DisposalType.RETURN_TO_VENDOR, DisposalType.RECYCLE]
    if (handoverTypes.includes(type) && !set.has(DisposalEvidenceType.HANDOVER_MINUTES))
      throw new BadRequestException('Hình thức này phải có biên bản bàn giao')
  }
}
