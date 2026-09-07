import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ComplianceDocumentStatus, Prisma, SoaStatus } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { annexControls, annexThemes, evidenceSources, isAnnexControlCode } from './annex-a'
import { DocumentStorage, IncomingFile } from './document-storage'
import {
  CreateDocumentDto,
  CreateSoaVersionDto,
  IssueDocumentDto,
  IssueSoaDto,
  ListDocumentsQuery,
  UpdateDocumentDto,
  UpdateSoaEntryDto,
  WithdrawDocumentDto,
} from './compliance.dto'

export interface Actor {
  id: string
  role: string
  complianceAccess?: boolean
}

const documentInclude = {
  owner: { select: { id: true, fullName: true } },
  approver: { select: { id: true, fullName: true } },
  department: { select: { id: true, name: true } },
  controls: { select: { controlCode: true } },
  files: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
      checksumSha256: true,
      createdAt: true,
      uploader: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ComplianceDocumentInclude

@Injectable()
export class ComplianceService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: DocumentStorage,
  ) {}

  /**
   * ISMS documents are sensitive, so access is not implied by being an operator: an administrator
   * always has it, anyone else must have been granted it explicitly.
   */
  private authorize(actor: Actor) {
    if (actor.role === 'ADMIN' || actor.complianceAccess) return
    throw new ForbiddenException('Chỉ Admin hoặc tài khoản được phân quyền mới truy cập hồ sơ ISO')
  }

  private date(value?: string) {
    return value ? new Date(value) : undefined
  }

  private text(value?: string) {
    const trimmed = value?.trim()
    return trimmed ? trimmed : undefined
  }

  private assertControlCodes(codes: string[]) {
    const unknown = codes.filter(code => !isAnnexControlCode(code))
    if (unknown.length) throw new BadRequestException(`Mã kiểm soát không tồn tại: ${unknown.join(', ')}`)
    return [...new Set(codes)]
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    values: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action,
        entityType,
        entityId,
        newValues: values as Prisma.InputJsonValue,
      },
    })
  }

  // -------------------------------------------------------------------------
  // Annex A catalogue
  // -------------------------------------------------------------------------

  /**
   * The control set plus, for each control, whether the current SoA covers it and what already
   * evidences it. This is what makes the screen answer "show me A.5.11" in one step.
   */
  async catalogue(actor: Actor) {
    this.authorize(actor)
    const issued = await this.db.soaVersion.findFirst({
      where: { status: SoaStatus.ISSUED },
      orderBy: { issuedAt: 'desc' },
      include: { entries: true },
    })
    const entries = new Map((issued?.entries || []).map(entry => [entry.controlCode, entry]))
    const documents = await this.db.complianceDocumentControl.findMany({
      where: { document: { status: { in: [ComplianceDocumentStatus.ISSUED, ComplianceDocumentStatus.DRAFT] } } },
      select: {
        controlCode: true,
        document: { select: { id: true, documentCode: true, title: true, status: true } },
      },
    })
    const byControl = new Map<string, Array<(typeof documents)[number]['document']>>()
    for (const row of documents) {
      const list = byControl.get(row.controlCode) || []
      list.push(row.document)
      byControl.set(row.controlCode, list)
    }
    return {
      standard: 'ISO/IEC 27001:2022',
      themes: annexThemes,
      soa: issued ? { id: issued.id, version: issued.version, issuedAt: issued.issuedAt, status: issued.status } : null,
      controls: annexControls.map(control => {
        const entry = entries.get(control.code)
        return {
          ...control,
          decision: entry?.decision ?? null,
          justification: entry?.justification ?? null,
          implementation: entry?.implementation ?? null,
          evidenceSource: evidenceSources[control.code] ?? null,
          documents: byControl.get(control.code) || [],
        }
      }),
    }
  }

  // -------------------------------------------------------------------------
  // Statement of Applicability (ISO/IEC 27001:2022 §6.1.3(d))
  // -------------------------------------------------------------------------

  async listSoaVersions(actor: Actor) {
    this.authorize(actor)
    return this.db.soaVersion.findMany({
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        approver: { select: { id: true, fullName: true } },
        creator: { select: { id: true, fullName: true } },
        _count: { select: { entries: true } },
      },
    })
  }

  async getSoaVersion(id: string, actor: Actor) {
    this.authorize(actor)
    const version = await this.db.soaVersion.findUnique({
      where: { id },
      include: {
        approver: { select: { id: true, fullName: true } },
        creator: { select: { id: true, fullName: true } },
        entries: true,
      },
    })
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản Tuyên bố áp dụng')
    const entries = new Map(version.entries.map(entry => [entry.controlCode, entry]))
    return {
      ...version,
      entries: annexControls.map(control => ({
        ...control,
        entry: entries.get(control.code) ?? null,
        evidenceSource: evidenceSources[control.code] ?? null,
      })),
    }
  }

  async createSoaVersion(body: CreateSoaVersionDto, actor: Actor) {
    this.authorize(actor)
    const version = body.version.trim()
    if (await this.db.soaVersion.findUnique({ where: { version } }))
      throw new BadRequestException(`Phiên bản ${version} đã tồn tại`)
    const source = body.cloneFromId
      ? await this.db.soaVersion.findUnique({ where: { id: body.cloneFromId }, include: { entries: true } })
      : null
    if (body.cloneFromId && !source) throw new NotFoundException('Không tìm thấy phiên bản nguồn để sao chép')
    return this.db.$transaction(async tx => {
      const created = await tx.soaVersion.create({
        data: {
          version,
          scope: body.scope.trim(),
          note: this.text(body.note),
          createdBy: actor.id,
          entries: source
            ? {
                create: source.entries.map(entry => ({
                  controlCode: entry.controlCode,
                  decision: entry.decision,
                  justification: entry.justification,
                  implementation: entry.implementation,
                  implementationNote: entry.implementationNote,
                })),
              }
            : undefined,
        },
      })
      await this.audit(tx, actor.id, 'SOA_VERSION_CREATED', 'SoaVersion', created.id, {
        version,
        clonedFrom: source?.version ?? null,
      })
      return created
    })
  }

  async upsertSoaEntry(versionId: string, controlCode: string, body: UpdateSoaEntryDto, actor: Actor) {
    this.authorize(actor)
    if (!isAnnexControlCode(controlCode)) throw new BadRequestException('Mã kiểm soát không tồn tại')
    const version = await this.db.soaVersion.findUnique({ where: { id: versionId } })
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản Tuyên bố áp dụng')
    // An issued SoA is the document that was shown to the auditor; changing it would rewrite history.
    if (version.status !== SoaStatus.DRAFT)
      throw new BadRequestException('Chỉ sửa được Tuyên bố áp dụng ở trạng thái bản nháp. Hãy tạo phiên bản mới.')
    const data = {
      decision: body.decision,
      justification: body.justification.trim(),
      implementation: body.implementation,
      implementationNote: this.text(body.implementationNote),
    }
    return this.db.soaEntry.upsert({
      where: { soaVersionId_controlCode: { soaVersionId: versionId, controlCode } },
      create: { soaVersionId: versionId, controlCode, ...data },
      update: data,
    })
  }

  async issueSoaVersion(id: string, body: IssueSoaDto, actor: Actor) {
    this.authorize(actor)
    const version = await this.db.soaVersion.findUnique({ where: { id }, include: { entries: true } })
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản Tuyên bố áp dụng')
    if (version.status !== SoaStatus.DRAFT) throw new BadRequestException('Phiên bản này đã được ban hành')
    // §6.1.3(d) needs a decision and a reason for every control, not only the ones in use.
    const covered = new Set(version.entries.map(entry => entry.controlCode))
    const missing = annexControls.filter(control => !covered.has(control.code))
    if (missing.length)
      throw new BadRequestException(
        `Còn ${missing.length} kiểm soát chưa có quyết định áp dụng và lý do: ${missing
          .slice(0, 5)
          .map(control => control.code)
          .join(', ')}${missing.length > 5 ? '…' : ''}`,
      )
    return this.db.$transaction(async tx => {
      await tx.soaVersion.updateMany({
        where: { status: SoaStatus.ISSUED },
        data: { status: SoaStatus.SUPERSEDED },
      })
      const issued = await tx.soaVersion.update({
        where: { id },
        data: {
          status: SoaStatus.ISSUED,
          issuedAt: new Date(body.issuedAt),
          approvedBy: actor.id,
          approvedAt: new Date(),
          note: body.note.trim(),
        },
      })
      await this.audit(tx, actor.id, 'SOA_VERSION_ISSUED', 'SoaVersion', id, {
        version: issued.version,
        issuedAt: body.issuedAt,
      })
      return issued
    })
  }

  // -------------------------------------------------------------------------
  // Documented information (ISO/IEC 27001:2022 §7.5)
  // -------------------------------------------------------------------------

  async listDocuments(query: ListDocumentsQuery, actor: Actor) {
    this.authorize(actor)
    const term = query.search?.trim()
    const text = term ? { contains: term, mode: 'insensitive' as const } : undefined
    const where: Prisma.ComplianceDocumentWhereInput = {
      type: query.type,
      status: query.status,
      ownerId: query.ownerId,
      controls: query.controlCode ? { some: { controlCode: query.controlCode } } : undefined,
      nextReviewAt: query.reviewDue ? { lt: new Date() } : undefined,
      OR: text ? [{ documentCode: text }, { title: text }, { summary: text }] : undefined,
    }
    const [data, total] = await this.db.$transaction([
      this.db.complianceDocument.findMany({
        where,
        include: documentInclude,
        orderBy: [{ status: 'asc' }, { documentCode: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.complianceDocument.count({ where }),
    ])
    return { data, total, page: query.page, limit: query.limit }
  }

  async getDocument(id: string, actor: Actor) {
    this.authorize(actor)
    const document = await this.db.complianceDocument.findUnique({ where: { id }, include: documentInclude })
    if (!document) throw new NotFoundException('Không tìm thấy tài liệu')
    return document
  }

  async createDocument(body: CreateDocumentDto, actor: Actor) {
    this.authorize(actor)
    const codes = this.assertControlCodes(body.controlCodes || [])
    const documentCode = body.documentCode.trim().toUpperCase()
    if (await this.db.complianceDocument.findUnique({ where: { documentCode } }))
      throw new BadRequestException(`Mã tài liệu ${documentCode} đã tồn tại`)
    return this.db.$transaction(async tx => {
      const created = await tx.complianceDocument.create({
        data: {
          documentCode,
          title: body.title.trim(),
          type: body.type,
          version: body.version.trim(),
          summary: this.text(body.summary),
          ownerId: body.ownerId,
          departmentId: body.departmentId,
          issuedAt: this.date(body.issuedAt),
          effectiveFrom: this.date(body.effectiveFrom),
          nextReviewAt: this.date(body.nextReviewAt),
          supersedesId: body.supersedesId,
          createdBy: actor.id,
          controls: { create: codes.map(controlCode => ({ controlCode })) },
        },
        include: documentInclude,
      })
      await this.audit(tx, actor.id, 'COMPLIANCE_DOCUMENT_CREATED', 'ComplianceDocument', created.id, {
        documentCode,
        version: created.version,
      })
      return created
    })
  }

  async updateDocument(id: string, body: UpdateDocumentDto, actor: Actor) {
    this.authorize(actor)
    const current = await this.db.complianceDocument.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy tài liệu')
    if (current.status === ComplianceDocumentStatus.SUPERSEDED || current.status === ComplianceDocumentStatus.WITHDRAWN)
      throw new BadRequestException('Tài liệu đã hết hiệu lực chỉ được đọc. Hãy tạo phiên bản mới.')
    const codes = body.controlCodes ? this.assertControlCodes(body.controlCodes) : undefined
    return this.db.$transaction(async tx => {
      if (codes) {
        await tx.complianceDocumentControl.deleteMany({ where: { documentId: id } })
        if (codes.length)
          await tx.complianceDocumentControl.createMany({
            data: codes.map(controlCode => ({ documentId: id, controlCode })),
          })
      }
      const updated = await tx.complianceDocument.update({
        where: { id },
        data: {
          title: this.text(body.title),
          type: body.type,
          version: this.text(body.version),
          summary: this.text(body.summary),
          ownerId: body.ownerId,
          departmentId: body.departmentId,
          issuedAt: this.date(body.issuedAt),
          effectiveFrom: this.date(body.effectiveFrom),
          nextReviewAt: this.date(body.nextReviewAt),
        },
        include: documentInclude,
      })
      await this.audit(tx, actor.id, 'COMPLIANCE_DOCUMENT_UPDATED', 'ComplianceDocument', id, {
        documentCode: updated.documentCode,
      })
      return updated
    })
  }

  /**
   * Issuing puts a document in force. If it replaces an earlier issue, that one becomes SUPERSEDED
   * in the same transaction so two versions are never both current.
   */
  async issueDocument(id: string, body: IssueDocumentDto, actor: Actor) {
    this.authorize(actor)
    const current = await this.db.complianceDocument.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy tài liệu')
    if (current.status !== ComplianceDocumentStatus.DRAFT)
      throw new BadRequestException('Chỉ ban hành được tài liệu ở trạng thái bản nháp')
    const files = await this.db.complianceDocumentFile.count({ where: { documentId: id } })
    if (!files) throw new BadRequestException('Phải đính kèm ít nhất một tệp trước khi ban hành')
    return this.db.$transaction(async tx => {
      if (current.supersedesId)
        await tx.complianceDocument.update({
          where: { id: current.supersedesId },
          data: { status: ComplianceDocumentStatus.SUPERSEDED },
        })
      const issued = await tx.complianceDocument.update({
        where: { id },
        data: {
          status: ComplianceDocumentStatus.ISSUED,
          issuedAt: new Date(),
          effectiveFrom: new Date(body.effectiveFrom),
          nextReviewAt: this.date(body.nextReviewAt),
          approvedBy: actor.id,
          approvedAt: new Date(),
        },
        include: documentInclude,
      })
      await this.audit(tx, actor.id, 'COMPLIANCE_DOCUMENT_ISSUED', 'ComplianceDocument', id, {
        documentCode: issued.documentCode,
        version: issued.version,
        note: body.note.trim(),
      })
      return issued
    })
  }

  async withdrawDocument(id: string, body: WithdrawDocumentDto, actor: Actor) {
    this.authorize(actor)
    const current = await this.db.complianceDocument.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy tài liệu')
    if (current.status === ComplianceDocumentStatus.WITHDRAWN) throw new BadRequestException('Tài liệu đã được thu hồi')
    return this.db.$transaction(async tx => {
      const withdrawn = await tx.complianceDocument.update({
        where: { id },
        data: { status: ComplianceDocumentStatus.WITHDRAWN, withdrawnAt: new Date() },
        include: documentInclude,
      })
      await this.audit(tx, actor.id, 'COMPLIANCE_DOCUMENT_WITHDRAWN', 'ComplianceDocument', id, {
        documentCode: withdrawn.documentCode,
        reason: body.reason.trim(),
      })
      return withdrawn
    })
  }

  // -------------------------------------------------------------------------
  // Files
  // -------------------------------------------------------------------------

  async addFile(documentId: string, file: IncomingFile, actor: Actor) {
    this.authorize(actor)
    const document = await this.db.complianceDocument.findUnique({ where: { id: documentId } })
    if (!document) throw new NotFoundException('Không tìm thấy tài liệu')
    if (
      document.status === ComplianceDocumentStatus.SUPERSEDED ||
      document.status === ComplianceDocumentStatus.WITHDRAWN
    )
      throw new BadRequestException('Tài liệu đã hết hiệu lực, không đính kèm thêm được')
    const stored = await this.storage.save(file)
    try {
      return await this.db.$transaction(async tx => {
        const created = await tx.complianceDocumentFile.create({
          data: { documentId, uploadedBy: actor.id, ...stored },
        })
        await this.audit(tx, actor.id, 'COMPLIANCE_FILE_UPLOADED', 'ComplianceDocument', documentId, {
          fileId: created.id,
          originalName: stored.originalName,
          checksumSha256: stored.checksumSha256,
        })
        return created
      })
    } catch (error) {
      // The bytes are already on disk; without this the volume collects files no record points at.
      await this.storage.remove(stored.storagePath)
      throw error
    }
  }

  async fileForDownload(fileId: string, actor: Actor) {
    this.authorize(actor)
    const file = await this.db.complianceDocumentFile.findUnique({ where: { id: fileId } })
    if (!file) throw new NotFoundException('Không tìm thấy tệp')
    return {
      file,
      stream: this.storage.stream(file.storagePath),
      contentDisposition: this.storage.contentDisposition(file.originalName),
    }
  }

  async removeFile(fileId: string, actor: Actor) {
    this.authorize(actor)
    const file = await this.db.complianceDocumentFile.findUnique({
      where: { id: fileId },
      include: { document: { select: { id: true, status: true, documentCode: true } } },
    })
    if (!file) throw new NotFoundException('Không tìm thấy tệp')
    if (file.document.status !== ComplianceDocumentStatus.DRAFT)
      throw new BadRequestException('Chỉ gỡ được tệp khi tài liệu còn là bản nháp')
    await this.db.$transaction(async tx => {
      await tx.complianceDocumentFile.delete({ where: { id: fileId } })
      await this.audit(tx, actor.id, 'COMPLIANCE_FILE_REMOVED', 'ComplianceDocument', file.document.id, {
        fileId,
        originalName: file.originalName,
      })
    })
    await this.storage.remove(file.storagePath)
    return { removed: true }
  }

  // -------------------------------------------------------------------------
  // Access and overview
  // -------------------------------------------------------------------------

  async operators(actor: Actor) {
    this.authorize(actor)
    return this.db.user.findMany({
      where: { status: 'ACTIVE', OR: [{ role: 'ADMIN' }, { complianceAccess: true }] },
      select: { id: true, fullName: true, role: true, complianceAccess: true },
      orderBy: { fullName: 'asc' },
    })
  }

  async summary(actor: Actor) {
    this.authorize(actor)
    const [issued, byStatus, reviewDue, soa] = await Promise.all([
      this.db.complianceDocument.count({ where: { status: ComplianceDocumentStatus.ISSUED } }),
      this.db.complianceDocument.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.complianceDocument.count({
        where: { status: ComplianceDocumentStatus.ISSUED, nextReviewAt: { lt: new Date() } },
      }),
      this.db.soaVersion.findFirst({
        where: { status: SoaStatus.ISSUED },
        orderBy: { issuedAt: 'desc' },
        include: { entries: { select: { decision: true, implementation: true } } },
      }),
    ])
    const entries = soa?.entries || []
    return {
      totalControls: annexControls.length,
      documentsIssued: issued,
      documentsByStatus: byStatus.map(row => ({ label: row.status, count: row._count._all })),
      reviewDue,
      soa: soa
        ? {
            version: soa.version,
            issuedAt: soa.issuedAt,
            applicable: entries.filter(entry => entry.decision === 'APPLICABLE').length,
            excluded: entries.filter(entry => entry.decision === 'EXCLUDED').length,
            implemented: entries.filter(entry => entry.implementation === 'IMPLEMENTED').length,
          }
        : null,
      /** Controls AssetFlow can evidence from live records rather than an uploaded document. */
      linkedEvidence: Object.keys(evidenceSources).length,
    }
  }
}
