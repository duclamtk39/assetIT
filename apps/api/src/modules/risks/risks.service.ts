import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, RiskAssessmentStatus, RiskItemStatus, RiskReviewDecision, RiskTreatmentStatus } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../database/prisma.service'
import { CreateRiskAssessmentDto, CreateRiskControlDto, CreateRiskItemDto, CreateRiskTreatmentDto, ListRiskAssessmentsQuery, ListRisksQuery, ReviewRiskDto, UpdateRiskItemDto, UpdateRiskTreatmentDto } from './risks.dto'
import { assessmentStatusAfterDecision, calculateRiskScore } from './risks.rules'

type Actor = { id: string; role: string; departmentId: string | null }

const riskInclude = {
  assessment: { select: { id: true, assessmentNo: true, title: true, status: true } },
  owner: { select: { id: true, employeeCode: true, fullName: true, email: true } },
  department: { select: { id: true, code: true, name: true } },
  assets: { include: { asset: { select: { id: true, assetTag: true, name: true, serialNumber: true } } } },
  incidents: { include: { incident: { select: { id: true, incidentNo: true, title: true, status: true } } } },
  controls: { orderBy: { createdAt: 'asc' as const } },
  treatments: { include: { assignee: { select: { id: true, fullName: true, email: true } } }, orderBy: { dueDate: 'asc' as const } },
  reviews: { include: { reviewer: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' as const } },
} as const

@Injectable()
export class RisksService {
  constructor(private readonly db: PrismaService) {}

  private assertOperator(actor: Actor) {
    if (!['ADMIN', 'IT'].includes(actor.role)) throw new ForbiddenException('Chỉ Admin hoặc IT được quản lý đánh giá rủi ro CNTT')
  }

  private reference(prefix: 'DGRR' | 'RR') {
    return `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`
  }

  private clean(value?: string) { const text = value?.trim(); return text || null }
  private date(value?: string) { return value ? new Date(value) : null }

  private async assertUser(id: string, label: string) {
    const user = await this.db.user.findFirst({ where: { id, status: 'ACTIVE', role: { in: ['ADMIN', 'IT'] } }, select: { id: true } })
    if (!user) throw new BadRequestException(`${label} phải là tài khoản Admin/IT đang hoạt động`)
  }

  async operators(actor: Actor) {
    this.assertOperator(actor)
    return this.db.user.findMany({ where: { status: 'ACTIVE', role: { in: ['ADMIN', 'IT'] } }, select: { id: true, employeeCode: true, fullName: true, email: true, role: true, department: { select: { id: true, code: true, name: true } } }, orderBy: { fullName: 'asc' } })
  }

  private async validateAssessmentReferences(body: CreateRiskAssessmentDto) {
    await this.assertUser(body.ownerId, 'Chủ sở hữu đợt đánh giá')
    if (body.approverId) {
      await this.assertUser(body.approverId, 'Người phê duyệt')
      if (body.approverId === body.ownerId) throw new BadRequestException('Người phê duyệt phải độc lập với chủ sở hữu đợt đánh giá')
    }
    if (body.departmentId && !await this.db.department.findFirst({ where: { id: body.departmentId, status: 'ACTIVE' }, select: { id: true } })) throw new BadRequestException('Phòng ban trong phạm vi đánh giá không hợp lệ')
    const start = new Date(body.startDate), target = this.date(body.targetDate), review = this.date(body.nextReviewAt)
    if (target && target < start) throw new BadRequestException('Ngày hoàn thành dự kiến không được trước ngày bắt đầu')
    if (review && review < start) throw new BadRequestException('Ngày rà soát tiếp theo không được trước ngày bắt đầu')
  }

  async summary(actor: Actor) {
    this.assertOperator(actor)
    const now = new Date()
    const openStatuses: RiskItemStatus[] = ['IDENTIFIED', 'ASSESSED', 'TREATMENT_PLANNED', 'TREATING', 'MONITORING']
    const risks = await this.db.riskItem.findMany({
      where: { status: { in: openStatuses } },
      select: { likelihood: true, impact: true, inherentLevel: true, residualLevel: true, status: true, dueDate: true, nextReviewAt: true, category: true },
    })
    const countBy = (values: Array<string | null>) => Object.entries(values.reduce((acc, value) => { if (value) acc[value] = (acc[value] || 0) + 1; return acc }, {} as Record<string, number>)).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
    const matrix = Array.from({ length: 5 }, (_, impactIndex) => Array.from({ length: 5 }, (_, likelihoodIndex) => ({
      impact: 5 - impactIndex,
      likelihood: likelihoodIndex + 1,
      count: risks.filter(item => item.impact === 5 - impactIndex && item.likelihood === likelihoodIndex + 1).length,
    }))).flat()
    return {
      totalOpen: risks.length,
      critical: risks.filter(item => (item.residualLevel || item.inherentLevel) === 'CRITICAL').length,
      high: risks.filter(item => (item.residualLevel || item.inherentLevel) === 'HIGH').length,
      overdue: risks.filter(item => item.dueDate && item.dueDate < now).length,
      reviewDue: risks.filter(item => item.nextReviewAt && item.nextReviewAt < now).length,
      treatments: risks.filter(item => item.status === 'TREATMENT_PLANNED' || item.status === 'TREATING').length,
      byCategory: countBy(risks.map(item => item.category)),
      byLevel: countBy(risks.map(item => item.residualLevel || item.inherentLevel)),
      matrix,
    }
  }

  async list(query: ListRiskAssessmentsQuery, actor: Actor) {
    this.assertOperator(actor)
    const term = query.search?.trim(), text = term ? { contains: term, mode: 'insensitive' as const } : undefined
    const where: Prisma.RiskAssessmentWhereInput = { status: query.status, departmentId: query.departmentId, OR: text ? [{ assessmentNo: text }, { title: text }, { scope: text }] : undefined }
    const [data, total] = await this.db.$transaction([
      this.db.riskAssessment.findMany({ where, include: { owner: { select: { id: true, fullName: true } }, approver: { select: { id: true, fullName: true } }, department: { select: { id: true, code: true, name: true } }, _count: { select: { risks: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.db.riskAssessment.count({ where }),
    ])
    return { data, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } }
  }

  async getAssessment(id: string, actor: Actor) {
    this.assertOperator(actor)
    const assessment = await this.db.riskAssessment.findUnique({ where: { id }, include: { owner: { select: { id: true, fullName: true, email: true } }, approver: { select: { id: true, fullName: true, email: true } }, department: { select: { id: true, code: true, name: true } }, risks: { include: riskInclude, orderBy: [{ inherentScore: 'desc' }, { createdAt: 'desc' }] }, reviews: { include: { reviewer: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' } } } })
    if (!assessment) throw new NotFoundException('Không tìm thấy đợt đánh giá rủi ro')
    return assessment
  }

  async createAssessment(body: CreateRiskAssessmentDto, actor: Actor) {
    this.assertOperator(actor)
    await this.validateAssessmentReferences(body)
    return this.db.$transaction(async tx => {
      const assessment = await tx.riskAssessment.create({ data: { assessmentNo: this.reference('DGRR'), title: body.title.trim(), description: this.clean(body.description), scope: body.scope.trim(), methodology: body.methodology.trim(), ownerId: body.ownerId, approverId: body.approverId, departmentId: body.departmentId, startDate: new Date(body.startDate), targetDate: this.date(body.targetDate), nextReviewAt: this.date(body.nextReviewAt), createdBy: actor.id } })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_ASSESSMENT_CREATED', entityType: 'RiskAssessment', entityId: assessment.id, newValues: { assessmentNo: assessment.assessmentNo, ownerId: assessment.ownerId, approverId: assessment.approverId } as Prisma.InputJsonValue } })
      return assessment
    })
  }

  async listRisks(query: ListRisksQuery, actor: Actor) {
    this.assertOperator(actor)
    const term = query.search?.trim(), text = term ? { contains: term, mode: 'insensitive' as const } : undefined
    const where: Prisma.RiskItemWhereInput = { assessmentId: query.assessmentId, departmentId: query.departmentId, ownerId: query.ownerId, status: query.status, AND: [text ? { OR: [{ riskNo: text }, { title: text }, { scenario: text }, { threat: text }, { vulnerability: text }, { assets: { some: { asset: { OR: [{ assetTag: text }, { name: text }, { serialNumber: text }] } } } }] } : {}, query.level ? { OR: [{ residualLevel: query.level }, { residualLevel: null, inherentLevel: query.level }] } : {}] }
    const [data, total] = await this.db.$transaction([
      this.db.riskItem.findMany({ where, include: riskInclude, orderBy: [{ inherentScore: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.db.riskItem.count({ where }),
    ])
    return { data, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } }
  }

  async getRisk(id: string, actor: Actor) {
    this.assertOperator(actor)
    const risk = await this.db.riskItem.findUnique({ where: { id }, include: riskInclude })
    if (!risk) throw new NotFoundException('Không tìm thấy hồ sơ rủi ro')
    return risk
  }

  private async validateRiskReferences(body: CreateRiskItemDto | UpdateRiskItemDto) {
    if (body.ownerId) await this.assertUser(body.ownerId, 'Chủ sở hữu rủi ro')
    if (body.departmentId && !await this.db.department.findFirst({ where: { id: body.departmentId, status: 'ACTIVE' }, select: { id: true } })) throw new BadRequestException('Phòng ban chịu ảnh hưởng không hợp lệ')
    if ('assetIds' in body && body.assetIds.length) {
      const count = await this.db.asset.count({ where: { id: { in: body.assetIds }, deletedAt: null } })
      if (count !== new Set(body.assetIds).size) throw new BadRequestException('Danh sách tài sản liên quan có dữ liệu không hợp lệ')
    }
    if ('incidentIds' in body && body.incidentIds.length) {
      const count = await this.db.incident.count({ where: { id: { in: body.incidentIds } } })
      if (count !== new Set(body.incidentIds).size) throw new BadRequestException('Danh sách sự cố liên quan có dữ liệu không hợp lệ')
    }
  }

  async createRisk(assessmentId: string, body: CreateRiskItemDto, actor: Actor) {
    this.assertOperator(actor)
    await this.validateRiskReferences(body)
    const assessment = await this.db.riskAssessment.findUnique({ where: { id: assessmentId }, select: { id: true, status: true } })
    if (!assessment) throw new NotFoundException('Không tìm thấy đợt đánh giá rủi ro')
    if (['CLOSED', 'CANCELLED'].includes(assessment.status)) throw new BadRequestException('Đợt đánh giá đã đóng hoặc hủy, không thể thêm rủi ro')
    const inherent = calculateRiskScore(body.likelihood, body.impact)
    const residual = body.residualLikelihood && body.residualImpact ? calculateRiskScore(body.residualLikelihood, body.residualImpact) : null
    if (body.treatmentStrategy === 'ACCEPT' && (!body.acceptanceRationale || !residual)) throw new BadRequestException('Chấp nhận rủi ro phải có lý do và điểm rủi ro còn lại')
    return this.db.$transaction(async tx => {
      const risk = await tx.riskItem.create({ data: { riskNo: this.reference('RR'), assessmentId, title: body.title.trim(), category: body.category.trim(), scenario: body.scenario.trim(), threat: body.threat.trim(), vulnerability: body.vulnerability.trim(), existingControls: this.clean(body.existingControls), source: body.source, likelihood: body.likelihood, impact: body.impact, inherentScore: inherent.score, inherentLevel: inherent.level, residualLikelihood: body.residualLikelihood, residualImpact: body.residualImpact, residualScore: residual?.score, residualLevel: residual?.level, treatmentStrategy: body.treatmentStrategy, acceptanceRationale: this.clean(body.acceptanceRationale), ownerId: body.ownerId, departmentId: body.departmentId, dueDate: this.date(body.dueDate), nextReviewAt: this.date(body.nextReviewAt), createdBy: actor.id } })
      if (body.assetIds.length) await tx.riskAsset.createMany({ data: [...new Set(body.assetIds)].map(assetId => ({ riskId: risk.id, assetId })) })
      if (body.incidentIds.length) await tx.riskIncident.createMany({ data: [...new Set(body.incidentIds)].map(incidentId => ({ riskId: risk.id, incidentId })) })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_CREATED', entityType: 'RiskItem', entityId: risk.id, newValues: { riskNo: risk.riskNo, assessmentId, inherentScore: inherent.score, inherentLevel: inherent.level, assetIds: body.assetIds, incidentIds: body.incidentIds } as Prisma.InputJsonValue } })
      return tx.riskItem.findUniqueOrThrow({ where: { id: risk.id }, include: riskInclude })
    })
  }

  async updateRisk(id: string, body: UpdateRiskItemDto, actor: Actor) {
    this.assertOperator(actor)
    await this.validateRiskReferences(body)
    const current = await this.db.riskItem.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy hồ sơ rủi ro')
    if (current.status === 'CLOSED') throw new BadRequestException('Rủi ro đã đóng chỉ được phép đọc và rà soát lịch sử')
    const likelihood = body.likelihood ?? current.likelihood, impact = body.impact ?? current.impact
    const inherent = calculateRiskScore(likelihood, impact)
    const residualLikelihood = body.residualLikelihood ?? current.residualLikelihood, residualImpact = body.residualImpact ?? current.residualImpact
    const residual = residualLikelihood && residualImpact ? calculateRiskScore(residualLikelihood, residualImpact) : null
    const strategy = body.treatmentStrategy ?? current.treatmentStrategy, rationale = body.acceptanceRationale ?? current.acceptanceRationale
    if (body.status === 'ACCEPTED') {
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được phê duyệt chấp nhận rủi ro còn lại')
      if (strategy !== 'ACCEPT' || !rationale || !residual) throw new BadRequestException('Chấp nhận rủi ro phải có chiến lược ACCEPT, lý do và điểm rủi ro còn lại')
    }
    const data: Prisma.RiskItemUpdateInput = { title: body.title?.trim(), category: body.category?.trim(), scenario: body.scenario?.trim(), threat: body.threat?.trim(), vulnerability: body.vulnerability?.trim(), existingControls: body.existingControls === undefined ? undefined : this.clean(body.existingControls), status: body.status, likelihood, impact, inherentScore: inherent.score, inherentLevel: inherent.level, residualLikelihood, residualImpact, residualScore: residual?.score ?? null, residualLevel: residual?.level ?? null, treatmentStrategy: strategy, acceptanceRationale: body.acceptanceRationale === undefined ? undefined : this.clean(body.acceptanceRationale), owner: body.ownerId ? { connect: { id: body.ownerId } } : undefined, department: body.departmentId ? { connect: { id: body.departmentId } } : undefined, dueDate: body.dueDate === undefined ? undefined : this.date(body.dueDate), nextReviewAt: body.nextReviewAt === undefined ? undefined : this.date(body.nextReviewAt) }
    return this.db.$transaction(async tx => {
      const updated = await tx.riskItem.update({ where: { id }, data, include: riskInclude })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_UPDATED', entityType: 'RiskItem', entityId: id, oldValues: { status: current.status, inherentScore: current.inherentScore, residualScore: current.residualScore, ownerId: current.ownerId } as Prisma.InputJsonValue, newValues: { status: updated.status, inherentScore: updated.inherentScore, residualScore: updated.residualScore, ownerId: updated.ownerId } as Prisma.InputJsonValue } })
      return updated
    })
  }

  async addControl(riskId: string, body: CreateRiskControlDto, actor: Actor) {
    this.assertOperator(actor)
    if (!await this.db.riskItem.findUnique({ where: { id: riskId }, select: { id: true } })) throw new NotFoundException('Không tìm thấy hồ sơ rủi ro')
    return this.db.$transaction(async tx => {
      const control = await tx.riskControl.create({ data: { riskId, controlCode: this.clean(body.controlCode), title: body.title.trim(), description: this.clean(body.description), framework: this.clean(body.framework), status: body.status, effectiveness: body.effectiveness, evidence: this.clean(body.evidence) } })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_CONTROL_ADDED', entityType: 'RiskItem', entityId: riskId, newValues: { controlId: control.id, controlCode: control.controlCode, status: control.status } as Prisma.InputJsonValue } })
      return control
    })
  }

  async addTreatment(riskId: string, body: CreateRiskTreatmentDto, actor: Actor) {
    this.assertOperator(actor)
    await this.assertUser(body.assigneeId, 'Người chịu trách nhiệm xử lý')
    const risk = await this.db.riskItem.findUnique({ where: { id: riskId }, select: { id: true, status: true } })
    if (!risk) throw new NotFoundException('Không tìm thấy hồ sơ rủi ro')
    if (['ACCEPTED', 'CLOSED'].includes(risk.status)) throw new BadRequestException('Rủi ro đã chấp nhận hoặc đóng, không thể thêm hành động xử lý')
    return this.db.$transaction(async tx => {
      const treatment = await tx.riskTreatmentAction.create({ data: { riskId, title: body.title.trim(), description: this.clean(body.description), assigneeId: body.assigneeId, dueDate: new Date(body.dueDate), createdBy: actor.id } })
      await tx.riskItem.update({ where: { id: riskId }, data: { status: 'TREATMENT_PLANNED' } })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_TREATMENT_CREATED', entityType: 'RiskItem', entityId: riskId, newValues: { treatmentId: treatment.id, assigneeId: treatment.assigneeId, dueDate: treatment.dueDate } as Prisma.InputJsonValue } })
      return treatment
    })
  }

  async updateTreatment(id: string, body: UpdateRiskTreatmentDto, actor: Actor) {
    this.assertOperator(actor)
    const current = await this.db.riskTreatmentAction.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy hành động xử lý rủi ro')
    if (actor.role !== 'ADMIN' && current.assigneeId !== actor.id) throw new ForbiddenException('Chỉ người được giao hoặc Admin được cập nhật hành động xử lý')
    const status = body.status ?? current.status, progress = status === 'COMPLETED' ? 100 : body.progress ?? current.progress
    if (status === 'COMPLETED' && !body.outcome && !current.outcome) throw new BadRequestException('Hoàn tất hành động xử lý phải ghi nhận kết quả')
    return this.db.$transaction(async tx => {
      const updated = await tx.riskTreatmentAction.update({ where: { id }, data: { status, progress, outcome: body.outcome === undefined ? undefined : this.clean(body.outcome), completedAt: status === RiskTreatmentStatus.COMPLETED ? new Date() : null } })
      const open = await tx.riskTreatmentAction.count({ where: { riskId: current.riskId, status: { in: ['PLANNED', 'IN_PROGRESS'] } } })
      await tx.riskItem.update({ where: { id: current.riskId }, data: { status: open ? 'TREATING' : 'MONITORING' } })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_TREATMENT_UPDATED', entityType: 'RiskItem', entityId: current.riskId, oldValues: { treatmentId: id, status: current.status, progress: current.progress } as Prisma.InputJsonValue, newValues: { status: updated.status, progress: updated.progress } as Prisma.InputJsonValue } })
      return updated
    })
  }

  async reviewAssessment(id: string, body: ReviewRiskDto, actor: Actor) {
    this.assertOperator(actor)
    const current = await this.db.riskAssessment.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy đợt đánh giá rủi ro')
    if (body.decision === RiskReviewDecision.APPROVE && current.status === 'IN_REVIEW') {
      if (current.approverId && current.approverId !== actor.id) throw new ForbiddenException('Đợt đánh giá phải được người phê duyệt đã chỉ định xử lý')
      if (current.ownerId === actor.id) throw new ForbiddenException('Chủ sở hữu đợt đánh giá không được tự phê duyệt')
    }
    let status: RiskAssessmentStatus
    try { status = assessmentStatusAfterDecision(current.status, body.decision) } catch { throw new BadRequestException('Quyết định phê duyệt không phù hợp với trạng thái hiện tại') }
    const now = new Date()
    return this.db.$transaction(async tx => {
      const updated = await tx.riskAssessment.update({ where: { id }, data: { status, submittedAt: body.decision === 'SUBMIT' ? now : undefined, approvedAt: body.decision === 'APPROVE' ? now : undefined, closedAt: body.decision === 'CLOSE' ? now : undefined } })
      await tx.riskReview.create({ data: { assessmentId: id, decision: body.decision, note: body.note.trim(), reviewedBy: actor.id } })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_ASSESSMENT_REVIEWED', entityType: 'RiskAssessment', entityId: id, oldValues: { status: current.status } as Prisma.InputJsonValue, newValues: { status, decision: body.decision } as Prisma.InputJsonValue } })
      return updated
    })
  }

  async reviewRisk(id: string, body: ReviewRiskDto, actor: Actor) {
    this.assertOperator(actor)
    const current = await this.db.riskItem.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy hồ sơ rủi ro')
    const allowedDecisions: RiskReviewDecision[] = [RiskReviewDecision.ACCEPT_RESIDUAL, RiskReviewDecision.CLOSE]
    if (!allowedDecisions.includes(body.decision)) throw new BadRequestException('Quyết định rà soát rủi ro không hợp lệ')
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được chấp nhận rủi ro còn lại hoặc đóng hồ sơ')
    if (current.ownerId === actor.id) throw new ForbiddenException('Chủ sở hữu rủi ro không được tự chấp nhận rủi ro còn lại')
    if (body.decision === RiskReviewDecision.ACCEPT_RESIDUAL && (!current.residualScore || !current.acceptanceRationale)) throw new BadRequestException('Chưa có điểm rủi ro còn lại hoặc lý do chấp nhận')
    const status = body.decision === RiskReviewDecision.ACCEPT_RESIDUAL ? RiskItemStatus.ACCEPTED : RiskItemStatus.CLOSED
    return this.db.$transaction(async tx => {
      const updated = await tx.riskItem.update({ where: { id }, data: { status } })
      await tx.riskReview.create({ data: { riskId: id, decision: body.decision, note: body.note.trim(), reviewedBy: actor.id } })
      await tx.auditLog.create({ data: { userId: actor.id, action: 'RISK_REVIEWED', entityType: 'RiskItem', entityId: id, oldValues: { status: current.status } as Prisma.InputJsonValue, newValues: { status, decision: body.decision } as Prisma.InputJsonValue } })
      return updated
    })
  }
}
