import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { DigitalEntitlementType, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import {
  AcknowledgeAlertDto,
  AlertPolicyDto,
  AssignEntitlementDto,
  CreateEntitlementDto,
  ListEntitlementsQuery,
  RenewEntitlementDto,
  RevokeAssignmentDto,
  UpdateEntitlementContractDto,
} from './renewals.dto'
import { assertTypeFields, daysUntil, entitlementStatus } from './renewals.rules'
type Actor = { id: string; role: string }
const detailInclude = {
  vendor: true,
  ownerDepartment: true,
  owner: { select: { id: true, fullName: true, email: true } },
  assignments: {
    include: {
      person: { select: { id: true, employeeCode: true, fullName: true, email: true } },
      asset: { select: { id: true, assetTag: true, name: true } },
      department: { select: { id: true, code: true, name: true } },
      actor: { select: { fullName: true } },
      revoker: { select: { fullName: true } },
    },
    orderBy: { assignedAt: 'desc' as const },
  },
  microsoftAssignments: {
    include: { person: { select: { id: true, employeeCode: true, fullName: true, email: true } } },
    orderBy: { userPrincipalName: 'asc' as const },
  },
  renewals: {
    include: { actor: { select: { fullName: true } }, approver: { select: { fullName: true } } },
    orderBy: { renewalDate: 'desc' as const },
  },
  alerts: { where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] as any } }, orderBy: { thresholdDays: 'asc' as const } },
} as const
@Injectable()
export class RenewalsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout
  constructor(private readonly db: PrismaService) {}
  private manage(actor: Actor) {
    if (!['ADMIN', 'IT'].includes(actor.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được quản lý license và gia hạn')
  }
  private admin(actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được thay đổi chính sách cảnh báo')
  }
  private text(value?: string) {
    return value?.trim() || null
  }
  onModuleInit() {
    this.timer = setInterval(() => void this.syncAlerts().catch(() => undefined), 6 * 60 * 60 * 1000)
    this.timer.unref()
    setTimeout(() => void this.syncAlerts().catch(() => undefined), 5000).unref()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }
  async syncAlerts() {
    const now = new Date(),
      policies = await this.db.renewalAlertPolicy.findMany({ where: { enabled: true } })
    for (const policy of policies) {
      const max = Math.max(...policy.warningDays, 0),
        items = await this.db.digitalEntitlement.findMany({
          where: {
            type: policy.type,
            status: { notIn: ['RETIRED', 'SUSPENDED'] },
            expiryDate: { not: null, lte: new Date(now.getTime() + max * 86400000) },
          },
        })
      for (const item of items) {
        if (!item.expiryDate) continue
        const remaining = daysUntil(item.expiryDate, now)
        for (const threshold of policy.warningDays.filter(day => remaining <= day))
          await this.db.renewalAlert.upsert({
            where: {
              entitlementId_dueDate_thresholdDays: {
                entitlementId: item.id,
                dueDate: item.expiryDate,
                thresholdDays: threshold,
              },
            },
            create: { entitlementId: item.id, policyId: policy.id, dueDate: item.expiryDate, thresholdDays: threshold },
            update: { lastTriggeredAt: now },
          })
      }
    }
    const active = await this.db.digitalEntitlement.findMany({
      where: { status: { in: ['ACTIVE', 'EXPIRING', 'EXPIRED'] }, expiryDate: { not: null } },
    })
    for (const item of active) {
      if (!item.expiryDate) continue
      const status = entitlementStatus(item.expiryDate, now)
      if (item.status !== status) await this.db.digitalEntitlement.update({ where: { id: item.id }, data: { status } })
    }
  }
  async list(query: ListEntitlementsQuery, actor: Actor) {
    this.manage(actor)
    await this.syncAlerts()
    const due = query.dueWithinDays === undefined ? undefined : new Date(Date.now() + query.dueWithinDays * 86400000),
      term = query.search?.trim()
    const rows = await this.db.digitalEntitlement.findMany({
      where: {
        type: query.type,
        status: query.status,
        expiryDate: due ? { not: null, lte: due } : undefined,
        OR: term
          ? [
              { code: { contains: term, mode: 'insensitive' } },
              { name: { contains: term, mode: 'insensitive' } },
              { productName: { contains: term, mode: 'insensitive' } },
              { domainName: { contains: term, mode: 'insensitive' } },
              { commonName: { contains: term, mode: 'insensitive' } },
              { subscriptionIdentifier: { contains: term, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: {
        vendor: { select: { id: true, name: true } },
        ownerDepartment: { select: { id: true, name: true } },
        owner: { select: { id: true, fullName: true } },
        assignments: { where: { status: 'ACTIVE' }, select: { quantity: true } },
        alerts: {
          where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          select: { id: true, status: true, thresholdDays: true, dueDate: true },
        },
      },
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    })
    return rows.map(row => ({
      ...row,
      assignedQuantity: row.assignments.reduce((sum, item) => sum + item.quantity, 0),
      remainingDays: row.expiryDate ? daysUntil(row.expiryDate) : null,
    }))
  }
  async get(id: string, actor: Actor) {
    this.manage(actor)
    const item = await this.db.digitalEntitlement.findUnique({ where: { id }, include: detailInclude })
    if (!item) throw new NotFoundException('Không tìm thấy license/chứng thư/domain')
    return item
  }
  async updateContract(id: string, body: UpdateEntitlementContractDto, actor: Actor) {
    this.manage(actor)
    const current = await this.db.digitalEntitlement.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy license/chứng thư/domain')
    const expiryDate = new Date(body.expiryDate)
    const updated = await this.db.digitalEntitlement.update({
      where: { id },
      data: {
        expiryDate,
        status: entitlementStatus(expiryDate),
        renewalCost: body.renewalCost,
        autoRenew: body.autoRenew,
      },
    })
    await this.db.auditLog.create({
      data: {
        userId: actor.id,
        action: 'DIGITAL_ENTITLEMENT_CONTRACT_UPDATED',
        entityType: 'DigitalEntitlement',
        entityId: id,
        oldValues: { expiryDate: current.expiryDate, renewalCost: current.renewalCost } as Prisma.InputJsonValue,
        newValues: { expiryDate, renewalCost: body.renewalCost } as Prisma.InputJsonValue,
      },
    })
    await this.syncAlerts()
    return updated
  }
  async create(body: CreateEntitlementDto, actor: Actor) {
    this.manage(actor)
    try {
      assertTypeFields(body.type, body)
    } catch {
      throw new BadRequestException('Domain hoặc SSL phải có domain/common name')
    }
    const expiryDate = new Date(body.expiryDate),
      startDate = body.startDate ? new Date(body.startDate) : null
    if (startDate && expiryDate < startDate) throw new BadRequestException('Ngày hết hạn phải sau ngày bắt đầu')
    try {
      const item = await this.db.digitalEntitlement.create({
        data: {
          ...body,
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          status: entitlementStatus(expiryDate),
          expiryDate,
          startDate,
          cancellationDeadline: body.cancellationDeadline ? new Date(body.cancellationDeadline) : null,
          productName: this.text(body.productName),
          edition: this.text(body.edition),
          subscriptionIdentifier: this.text(body.subscriptionIdentifier),
          domainName: this.text(body.domainName)?.toLowerCase(),
          commonName: this.text(body.commonName)?.toLowerCase(),
          registrar: this.text(body.registrar),
          issuer: this.text(body.issuer),
          licenseMetric: this.text(body.licenseMetric),
          purchaseOrderNo: this.text(body.purchaseOrderNo),
          contractNo: this.text(body.contractNo),
          managementUrl: this.text(body.managementUrl),
          accountName: this.text(body.accountName),
          secretReference: this.text(body.secretReference),
          technicalContact: this.text(body.technicalContact),
          businessOwner: this.text(body.businessOwner),
          notes: this.text(body.notes),
          currency: body.currency.toUpperCase(),
          createdBy: actor.id,
        },
        include: detailInclude,
      })
      await this.db.auditLog.create({
        data: {
          userId: actor.id,
          action: 'DIGITAL_ENTITLEMENT_CREATED',
          entityType: 'DigitalEntitlement',
          entityId: item.id,
          newValues: {
            code: item.code,
            type: item.type,
            expiryDate: item.expiryDate,
            totalQuantity: item.totalQuantity,
          } as Prisma.InputJsonValue,
        },
      })
      await this.syncAlerts()
      return item
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Mã license/domain/SSL đã tồn tại')
      throw error
    }
  }
  async assign(id: string, body: AssignEntitlementDto, actor: Actor) {
    this.manage(actor)
    if ([body.personId, body.assetId, body.departmentId].filter(Boolean).length !== 1)
      throw new BadRequestException('Chỉ chọn một đối tượng nhận: người dùng, tài sản hoặc phòng ban')
    return this.db.$transaction(
      async tx => {
        const item = await tx.digitalEntitlement.findUnique({ where: { id } })
        if (!item) throw new NotFoundException('Không tìm thấy license')
        if (item.externalProvider)
          throw new BadRequestException('License đồng bộ ngoài chỉ được cấp/thu hồi tại hệ thống nguồn')
        if (item.type !== 'LICENSE' || !['ACTIVE', 'EXPIRING'].includes(item.status))
          throw new BadRequestException('Chỉ license còn hiệu lực mới được cấp phát')
        const used =
          (
            await tx.digitalAssignment.aggregate({
              where: { entitlementId: id, status: 'ACTIVE' },
              _sum: { quantity: true },
            })
          )._sum.quantity || 0
        if (used + body.quantity > item.totalQuantity)
          throw new ConflictException(`Không đủ seat. Còn ${Math.max(0, item.totalQuantity - used)} seat`)
        const assignment = await tx.digitalAssignment.create({
          data: {
            entitlementId: id,
            personId: body.personId,
            assetId: body.assetId,
            departmentId: body.departmentId,
            quantity: body.quantity,
            expectedEndAt: body.expectedEndAt ? new Date(body.expectedEndAt) : null,
            assignmentNote: this.text(body.note),
            assignedBy: actor.id,
          },
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'DIGITAL_LICENSE_ASSIGNED',
            entityType: 'DigitalAssignment',
            entityId: assignment.id,
            newValues: {
              entitlementId: id,
              personId: body.personId,
              assetId: body.assetId,
              departmentId: body.departmentId,
              quantity: body.quantity,
            } as Prisma.InputJsonValue,
          },
        })
        return assignment
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }
  async revoke(id: string, body: RevokeAssignmentDto, actor: Actor) {
    this.manage(actor)
    return this.db.$transaction(async tx => {
      const current = await tx.digitalAssignment.findUnique({ where: { id } })
      if (!current) throw new NotFoundException('Không tìm thấy giao dịch cấp phát')
      if (current.status !== 'ACTIVE') throw new BadRequestException('License đã được thu hồi')
      const item = await tx.digitalAssignment.update({
        where: { id },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedBy: actor.id, revokeReason: body.reason.trim() },
      })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'DIGITAL_LICENSE_REVOKED',
          entityType: 'DigitalAssignment',
          entityId: id,
          oldValues: { status: current.status } as Prisma.InputJsonValue,
          newValues: { status: item.status, reason: body.reason } as Prisma.InputJsonValue,
        },
      })
      return item
    })
  }
  async renew(id: string, body: RenewEntitlementDto, actor: Actor) {
    this.manage(actor)
    return this.db.$transaction(
      async tx => {
        const current = await tx.digitalEntitlement.findUnique({ where: { id } })
        if (!current) throw new NotFoundException('Không tìm thấy đối tượng cần gia hạn')
        if (!current.expiryDate) throw new BadRequestException('Phải khai báo hạn hợp đồng hiện tại trước khi gia hạn')
        const next = new Date(body.newExpiryDate)
        if (next <= current.expiryDate) throw new BadRequestException('Hạn mới phải sau hạn hiện tại')
        const renewal = await tx.digitalRenewal.create({
          data: {
            entitlementId: id,
            previousExpiryDate: current.expiryDate,
            newExpiryDate: next,
            amount: body.amount,
            currency: body.currency.toUpperCase(),
            purchaseOrderNo: this.text(body.purchaseOrderNo),
            invoiceNo: this.text(body.invoiceNo),
            approvedBy: body.approvedBy,
            renewedBy: actor.id,
            notes: this.text(body.notes),
          },
        })
        await tx.digitalEntitlement.update({
          where: { id },
          data: { expiryDate: next, status: entitlementStatus(next), renewalCost: body.amount ?? current.renewalCost },
        })
        await tx.renewalAlert.updateMany({
          where: { entitlementId: id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          data: { status: 'RESOLVED', resolvedAt: new Date(), note: 'Đã hoàn tất gia hạn' },
        })
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: 'DIGITAL_ENTITLEMENT_RENEWED',
            entityType: 'DigitalEntitlement',
            entityId: id,
            oldValues: { expiryDate: current.expiryDate } as Prisma.InputJsonValue,
            newValues: { expiryDate: next, renewalId: renewal.id, amount: body.amount } as Prisma.InputJsonValue,
          },
        })
        return renewal
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  }
  async summary(actor: Actor) {
    this.manage(actor)
    await this.syncAlerts()
    const [items, assignments, alerts] = await Promise.all([
      this.db.digitalEntitlement.findMany({
        where: { status: { not: 'RETIRED' } },
        select: {
          type: true,
          status: true,
          expiryDate: true,
          totalQuantity: true,
          renewalCost: true,
          externalAssignedQuantity: true,
        },
      }),
      this.db.digitalAssignment.aggregate({ where: { status: 'ACTIVE' }, _sum: { quantity: true } }),
      this.db.renewalAlert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
    ])
    const withExpiry = items.filter((x): x is typeof x & { expiryDate: Date } => Boolean(x.expiryDate))
    return {
      total: items.length,
      licenses: items.filter(x => x.type === 'LICENSE').length,
      certificates: items.filter(x => x.type === 'SSL_CERTIFICATE').length,
      domains: items.filter(x => x.type === 'DOMAIN').length,
      expiring30: withExpiry.filter(x => {
        const d = daysUntil(x.expiryDate)
        return d >= 0 && d <= 30
      }).length,
      expired: withExpiry.filter(x => daysUntil(x.expiryDate) < 0).length,
      assignedSeats:
        (assignments._sum.quantity || 0) + items.reduce((sum, x) => sum + (x.externalAssignedQuantity || 0), 0),
      totalSeats: items.filter(x => x.type === 'LICENSE').reduce((s, x) => s + x.totalQuantity, 0),
      openAlerts: alerts,
      forecastCost: withExpiry
        .filter(x => daysUntil(x.expiryDate) >= 0 && daysUntil(x.expiryDate) <= 90)
        .reduce((s, x) => s + Number(x.renewalCost || 0), 0),
    }
  }
  policies(actor: Actor) {
    this.manage(actor)
    return this.db.renewalAlertPolicy.findMany({ orderBy: { type: 'asc' } })
  }
  async savePolicy(type: DigitalEntitlementType, body: AlertPolicyDto, actor: Actor) {
    this.admin(actor)
    const clean = (values: number[]) => [...new Set(values)].sort((a, b) => b - a)
    const policy = await this.db.renewalAlertPolicy.upsert({
      where: { type },
      create: {
        type,
        enabled: body.enabled,
        warningDays: clean(body.warningDays),
        overdueEscalationDays: clean(body.overdueEscalationDays),
        recipients: [...new Set(body.recipients.map(x => x.toLowerCase()))],
        notifyOwner: body.notifyOwner,
        updatedBy: actor.id,
      },
      update: {
        enabled: body.enabled,
        warningDays: clean(body.warningDays),
        overdueEscalationDays: clean(body.overdueEscalationDays),
        recipients: [...new Set(body.recipients.map(x => x.toLowerCase()))],
        notifyOwner: body.notifyOwner,
        updatedBy: actor.id,
      },
    })
    await this.syncAlerts()
    return policy
  }
  async alerts(actor: Actor) {
    this.manage(actor)
    await this.syncAlerts()
    return this.db.renewalAlert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      include: {
        entitlement: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            expiryDate: true,
            owner: { select: { fullName: true, email: true } },
          },
        },
        policy: true,
        acknowledger: { select: { fullName: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { thresholdDays: 'asc' }],
    })
  }
  async acknowledge(id: string, body: AcknowledgeAlertDto, actor: Actor) {
    this.manage(actor)
    return this.db.renewalAlert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedBy: actor.id,
        note: this.text(body.note),
      },
    })
  }
}
