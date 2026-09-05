import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { AssetHistoryAction, DiscoveryStatus, Prisma } from '@prisma/client'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaService } from '../../database/prisma.service'
import {
  AgentInventoryDto,
  CreateAssetFromDiscoveryDto,
  CreateEnrollmentTokenDto,
  IgnoreDiscoveryDto,
  LinkDiscoveryDto,
  ListDiscoveryQuery,
} from './discovery.dto'
import { classifyCandidates, inventoryFingerprint, sanitizeHardwareIdentifier } from './discovery.rules'

type Actor = { id: string; role: string }
type Tx = Prisma.TransactionClient
const inboxInclude = {
  agent: {
    include: {
      linkedAsset: { select: { id: true, assetTag: true, name: true, serialNumber: true } },
      snapshots: { orderBy: { collectedAt: 'desc' as const }, take: 1 },
    },
  },
  suggestedAsset: { select: { id: true, assetTag: true, name: true, serialNumber: true, macAddress: true } },
  resolvedAsset: { select: { id: true, assetTag: true, name: true } },
  resolver: { select: { id: true, fullName: true } },
} as const

@Injectable()
export class DiscoveryService {
  constructor(private readonly db: PrismaService) {}
  assertOperator(actor: Actor) {
    if (!['ADMIN', 'IT'].includes(actor.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được quản lý thiết bị khám phá')
  }
  private assertAdmin(actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được quản lý token cài đặt Agent')
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex')
  }
  private token(prefix: string) {
    return `${prefix}_${randomBytes(32).toString('base64url')}`
  }
  private bearer(header?: string) {
    const match = header?.match(/^Bearer\s+(.+)$/i)
    if (!match) throw new UnauthorizedException('Thiếu token Agent')
    return match[1].trim()
  }
  private validateCollectedAt(value: string) {
    const date = new Date(value),
      now = Date.now()
    if (Number.isNaN(date.getTime()) || date.getTime() > now + 10 * 60_000 || date.getTime() < now - 30 * 86400_000)
      throw new BadRequestException('Thời điểm inventory nằm ngoài khoảng cho phép')
    return date
  }
  private primaryMac(body: AgentInventoryDto) {
    return body.device.network_interfaces.map(item => item.mac_address?.trim().toUpperCase()).find(Boolean) || null
  }
  private validateFingerprint(body: AgentInventoryDto) {
    if (inventoryFingerprint(body) !== body.device.fingerprint.toLowerCase())
      throw new BadRequestException('Fingerprint không khớp bằng chứng phần cứng trong payload')
  }

  async createEnrollmentToken(body: CreateEnrollmentTokenDto, actor: Actor) {
    this.assertAdmin(actor)
    const raw = this.token('afe'),
      expiresAt = new Date(Date.now() + body.expiresInDays * 86400_000)
    const record = await this.db.agentEnrollmentToken.create({
      data: {
        name: body.name.trim(),
        tokenHash: this.hash(raw),
        siteCode: body.siteCode?.trim() || null,
        expiresAt,
        maxEnrollments: body.maxEnrollments,
        createdBy: actor.id,
      },
    })
    await this.db.auditLog.create({
      data: {
        userId: actor.id,
        action: 'AGENT_ENROLLMENT_TOKEN_CREATED',
        entityType: 'AgentEnrollmentToken',
        entityId: record.id,
        newValues: {
          name: record.name,
          siteCode: record.siteCode,
          expiresAt,
          maxEnrollments: record.maxEnrollments,
        } as Prisma.InputJsonValue,
      },
    })
    return { ...record, tokenHash: undefined, token: raw }
  }
  listEnrollmentTokens(actor: Actor) {
    this.assertAdmin(actor)
    return this.db.agentEnrollmentToken.findMany({
      select: {
        id: true,
        name: true,
        siteCode: true,
        expiresAt: true,
        maxEnrollments: true,
        enrollmentCount: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        creator: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }
  async revokeEnrollmentToken(id: string, actor: Actor) {
    this.assertAdmin(actor)
    const token = await this.db.agentEnrollmentToken.findUnique({ where: { id } })
    if (!token) throw new NotFoundException('Không tìm thấy enrollment token')
    if (!token.revokedAt)
      await this.db.$transaction([
        this.db.agentEnrollmentToken.update({ where: { id }, data: { revokedAt: new Date() } }),
        this.db.auditLog.create({
          data: {
            userId: actor.id,
            action: 'AGENT_ENROLLMENT_TOKEN_REVOKED',
            entityType: 'AgentEnrollmentToken',
            entityId: id,
          },
        }),
      ])
    return { success: true }
  }
  async revokeAgent(id: string, actor: Actor) {
    this.assertAdmin(actor)
    const agent = await this.db.endpointAgent.findUnique({ where: { id } })
    if (!agent) throw new NotFoundException('Không tìm thấy Endpoint Agent')
    if (!agent.revokedAt)
      await this.db.$transaction([
        this.db.endpointAgent.update({ where: { id }, data: { revokedAt: new Date() } }),
        this.db.auditLog.create({
          data: {
            userId: actor.id,
            action: 'ENDPOINT_AGENT_REVOKED',
            entityType: 'EndpointAgent',
            entityId: id,
            newValues: { hostname: agent.hostname, fingerprint: agent.fingerprint } as Prisma.InputJsonValue,
          },
        }),
      ])
    return { success: true }
  }

  async enroll(authorization: string | undefined, body: AgentInventoryDto) {
    this.validateFingerprint(body)
    const rawToken = this.bearer(authorization),
      tokenHash = this.hash(rawToken)
    const credential = this.token('afa'),
      credentialHash = this.hash(credential),
      agentKey = randomUUID(),
      collectedAt = this.validateCollectedAt(body.collected_at)
    const result = await this.db.$transaction(async tx => {
      const enrollment = await tx.agentEnrollmentToken.findUnique({ where: { tokenHash } })
      if (!enrollment || enrollment.revokedAt || enrollment.expiresAt <= new Date())
        throw new UnauthorizedException('Enrollment token không hợp lệ hoặc đã hết hạn')
      const existing = await tx.endpointAgent.findUnique({ where: { fingerprint: body.device.fingerprint } })
      if (existing && !existing.revokedAt)
        throw new ConflictException('Thiết bị đã enroll; Admin phải thu hồi Agent cũ trước khi cài lại')
      const consumed = await tx.agentEnrollmentToken.updateMany({
        where: {
          id: enrollment.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          enrollmentCount: { lt: enrollment.maxEnrollments },
        },
        data: { enrollmentCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      if (consumed.count !== 1) throw new UnauthorizedException('Enrollment token đã đạt giới hạn thiết bị')
      const agent = existing
        ? await tx.endpointAgent.update({
            where: { id: existing.id },
            data: {
              agentKey,
              credentialHash,
              enrollmentTokenId: enrollment.id,
              hostname: body.device.hostname,
              siteCode: body.site_code || enrollment.siteCode,
              agentVersion: body.agent.version,
              osFamily: body.device.os.family,
              lastSeenAt: new Date(),
              enrolledAt: new Date(),
              revokedAt: null,
            },
          })
        : await tx.endpointAgent.create({
            data: {
              agentKey,
              credentialHash,
              enrollmentTokenId: enrollment.id,
              fingerprint: body.device.fingerprint,
              hostname: body.device.hostname,
              siteCode: body.site_code || enrollment.siteCode,
              agentVersion: body.agent.version,
              osFamily: body.device.os.family,
            },
          })
      await this.storeSnapshotAndReconcile(tx, agent.id, body, collectedAt)
      return agent
    })
    return { agent_id: result.agentKey, agent_token: credential, inventory_accepted: true }
  }

  async ingest(authorization: string | undefined, body: AgentInventoryDto) {
    this.validateFingerprint(body)
    const credentialHash = this.hash(this.bearer(authorization)),
      agent = await this.db.endpointAgent.findUnique({ where: { credentialHash } })
    if (!agent || agent.revokedAt) throw new UnauthorizedException('Agent token không hợp lệ hoặc đã bị thu hồi')
    if (body.agent.id !== agent.agentKey) throw new UnauthorizedException('Agent ID không khớp token')
    if (agent.lastSeenAt.getTime() > Date.now() - 15_000)
      throw new HttpException('Agent gửi inventory quá nhanh', HttpStatus.TOO_MANY_REQUESTS)
    const collectedAt = this.validateCollectedAt(body.collected_at)
    await this.db.$transaction(async tx => {
      await tx.endpointAgent.update({
        where: { id: agent.id },
        data: {
          hostname: body.device.hostname,
          siteCode: body.site_code || agent.siteCode,
          agentVersion: body.agent.version,
          osFamily: body.device.os.family,
          lastSeenAt: new Date(),
        },
      })
      await this.storeSnapshotAndReconcile(tx, agent.id, body, collectedAt)
    })
    return { accepted: true, collected_at: collectedAt.toISOString() }
  }

  private async storeSnapshotAndReconcile(tx: Tx, agentId: string, body: AgentInventoryDto, collectedAt: Date) {
    const serial = sanitizeHardwareIdentifier(body.device.hardware.serial_number) || null,
      mac = this.primaryMac(body)
    await tx.agentInventorySnapshot.upsert({
      where: { agentId_collectedAt: { agentId, collectedAt } },
      create: {
        agentId,
        schemaVersion: body.schema_version,
        collectedAt,
        hostname: body.device.hostname,
        serialNumber: serial,
        systemUuid: sanitizeHardwareIdentifier(body.device.hardware.system_uuid) || null,
        primaryMac: mac,
        payload: body as unknown as Prisma.InputJsonValue,
      },
      update: {},
    })
    await this.reconcile(tx, agentId, body)
  }
  private async reconcile(tx: Tx, agentId: string, body: AgentInventoryDto) {
    const systemUuid = sanitizeHardwareIdentifier(body.device.hardware.system_uuid) || null,
      serial = sanitizeHardwareIdentifier(body.device.hardware.serial_number) || null,
      mac = this.primaryMac(body),
      agent = await tx.endpointAgent.findUniqueOrThrow({ where: { id: agentId } })
    if (agent.linkedAssetId) {
      await tx.discoveryInboxItem.upsert({
        where: { agentId },
        create: {
          agentId,
          status: 'LINKED',
          resolvedAssetId: agent.linkedAssetId,
          matchConfidence: 100,
          lastObservedAt: new Date(),
        },
        update: {
          status: 'LINKED',
          suggestedAssetId: null,
          resolvedAssetId: agent.linkedAssetId,
          matchConfidence: 100,
          conflictReason: null,
          lastObservedAt: new Date(),
        },
      })
      return
    }
    const candidates = await tx.asset.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(systemUuid ? [{ systemUuid: { equals: systemUuid, mode: 'insensitive' as const } }] : []),
          ...(serial ? [{ serialNumber: { equals: serial, mode: 'insensitive' as const } }] : []),
          ...(mac ? [{ macAddress: { equals: mac, mode: 'insensitive' as const } }] : []),
        ],
      },
      select: { id: true, systemUuid: true, serialNumber: true, macAddress: true },
      take: 5,
    })
    const decision = classifyCandidates(candidates, { systemUuid, serial, mac }),
      status = decision.status as DiscoveryStatus,
      suggestedAssetId = decision.suggestedAssetId,
      confidence = decision.confidence,
      reason = decision.reason
    await tx.discoveryInboxItem.upsert({
      where: { agentId },
      create: {
        agentId,
        status,
        suggestedAssetId,
        matchConfidence: confidence,
        conflictReason: reason,
        lastObservedAt: new Date(),
      },
      update: {
        status,
        suggestedAssetId,
        resolvedAssetId: null,
        matchConfidence: confidence,
        conflictReason: reason,
        resolutionNote: null,
        resolvedBy: null,
        resolvedAt: null,
        lastObservedAt: new Date(),
      },
    })
  }

  async summary(actor: Actor) {
    this.assertOperator(actor)
    const statuses: DiscoveryStatus[] = ['PENDING', 'MATCHED', 'CONFLICT', 'LINKED', 'IGNORED']
    const [pending, matched, conflict, linked, ignored, agents] = await Promise.all([
      ...statuses.map(status => this.db.discoveryInboxItem.count({ where: { status } })),
      this.db.endpointAgent.count({ where: { revokedAt: null } }),
    ])
    return { pending, matched, conflict, linked, ignored, agents }
  }
  async list(query: ListDiscoveryQuery, actor: Actor) {
    this.assertOperator(actor)
    const text = query.search?.trim(),
      where: Prisma.DiscoveryInboxItemWhereInput = {
        status: query.status as DiscoveryStatus | undefined,
        OR: text
          ? [
              { agent: { is: { hostname: { contains: text, mode: 'insensitive' } } } },
              { agent: { is: { fingerprint: { contains: text, mode: 'insensitive' } } } },
              { suggestedAsset: { is: { assetTag: { contains: text, mode: 'insensitive' } } } },
            ]
          : undefined,
      }
    return {
      data: await this.db.discoveryInboxItem.findMany({
        where,
        include: inboxInclude,
        orderBy: { lastObservedAt: 'desc' },
        take: query.limit,
      }),
    }
  }
  async get(id: string, actor: Actor) {
    this.assertOperator(actor)
    const item = await this.db.discoveryInboxItem.findUnique({ where: { id }, include: inboxInclude })
    if (!item) throw new NotFoundException('Không tìm thấy thiết bị trong Discovery Inbox')
    return item
  }

  async link(id: string, body: LinkDiscoveryDto, actor: Actor) {
    this.assertOperator(actor)
    return this.db.$transaction(async tx => {
      const item = await tx.discoveryInboxItem.findUnique({ where: { id }, include: { agent: true } })
      if (!item) throw new NotFoundException('Không tìm thấy thiết bị khám phá')
      const asset = await tx.asset.findFirst({ where: { id: body.assetId, deletedAt: null } })
      if (!asset) throw new NotFoundException('Không tìm thấy tài sản')
      const occupied = await tx.endpointAgent.findFirst({
        where: { linkedAssetId: asset.id, id: { not: item.agentId } },
      })
      if (occupied) throw new ConflictException('Tài sản đã liên kết với Agent khác')
      await tx.endpointAgent.update({ where: { id: item.agentId }, data: { linkedAssetId: asset.id } })
      const updated = await tx.discoveryInboxItem.update({
        where: { id },
        data: {
          status: 'LINKED',
          suggestedAssetId: null,
          resolvedAssetId: asset.id,
          matchConfidence: 100,
          conflictReason: null,
          resolutionNote: body.note?.trim() || null,
          resolvedBy: actor.id,
          resolvedAt: new Date(),
        },
        include: inboxInclude,
      })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'DISCOVERY_LINKED',
          entityType: 'DiscoveryInboxItem',
          entityId: id,
          newValues: { assetId: asset.id, agentId: item.agentId } as Prisma.InputJsonValue,
        },
      })
      return updated
    })
  }
  async ignore(id: string, body: IgnoreDiscoveryDto, actor: Actor) {
    this.assertOperator(actor)
    const item = await this.get(id, actor)
    return this.db.$transaction(async tx => {
      const updated = await tx.discoveryInboxItem.update({
        where: { id },
        data: {
          status: 'IGNORED',
          suggestedAssetId: null,
          resolvedAssetId: null,
          resolutionNote: body.note.trim(),
          resolvedBy: actor.id,
          resolvedAt: new Date(),
        },
        include: inboxInclude,
      })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'DISCOVERY_IGNORED',
          entityType: 'DiscoveryInboxItem',
          entityId: id,
          newValues: { agentId: item.agentId, note: body.note } as Prisma.InputJsonValue,
        },
      })
      return updated
    })
  }
  async reopen(id: string, actor: Actor) {
    this.assertOperator(actor)
    const item = await this.get(id, actor)
    if (item.agent.linkedAsset) throw new BadRequestException('Hãy gỡ liên kết Agent trước khi mở lại')
    const snapshot = item.agent.snapshots[0]
    if (!snapshot) throw new BadRequestException('Thiết bị chưa có snapshot')
    const body = snapshot.payload as unknown as AgentInventoryDto
    await this.db.$transaction(tx => this.reconcile(tx, item.agentId, body))
    return this.get(id, actor)
  }

  async createAsset(id: string, body: CreateAssetFromDiscoveryDto, actor: Actor) {
    this.assertOperator(actor)
    return this.db.$transaction(async tx => {
      const item = await tx.discoveryInboxItem.findUnique({
        where: { id },
        include: { agent: { include: { snapshots: { orderBy: { collectedAt: 'desc' }, take: 1 } } } },
      })
      if (!item) throw new NotFoundException('Không tìm thấy thiết bị khám phá')
      if (!['PENDING', 'MATCHED', 'CONFLICT'].includes(item.status))
        throw new BadRequestException('Thiết bị đã được xử lý')
      const snapshot = item.agent.snapshots[0]
      if (!snapshot) throw new BadRequestException('Thiết bị chưa có snapshot')
      const inventory = snapshot.payload as unknown as AgentInventoryDto,
        status = await tx.assetStatus.findUnique({ where: { code: 'READY' } }),
        warehouse = await tx.warehouse.findFirst({ where: { id: body.warehouseId, status: 'ACTIVE' } }),
        category = await tx.assetCategory.findFirst({ where: { id: body.categoryId, status: 'ACTIVE' } })
      if (!status || !warehouse || !category)
        throw new BadRequestException('Trạng thái READY, kho hoặc nhóm tài sản không hợp lệ')
      const hw = inventory.device.hardware,
        primary = inventory.device.network_interfaces.find(value => value.mac_address),
        storage = (hw.disks || [])
          .map(disk =>
            `${disk.model || disk.name} ${disk.size_bytes ? Math.round(disk.size_bytes / 1073741824) + ' GB' : ''}`.trim(),
          )
          .join('; '),
        ram = hw.memory_bytes ? `${Math.round(hw.memory_bytes / 1073741824)} GB` : undefined,
        ip = primary?.addresses?.[0]?.split('/')[0]
      let asset
      try {
        asset = await tx.asset.create({
          data: {
            assetTag: body.assetTag.trim(),
            name: body.name.trim(),
            barcode: body.barcode.trim(),
            serialNumber: sanitizeHardwareIdentifier(hw.serial_number) || null,
            systemUuid: sanitizeHardwareIdentifier(hw.system_uuid) || null,
            categoryId: category.id,
            statusId: status.id,
            warehouseId: warehouse.id,
            locationId: warehouse.locationId,
            cpu: hw.cpu_model?.trim(),
            ram,
            storage,
            operatingSystem: [inventory.device.os.name, inventory.device.os.version].filter(Boolean).join(' '),
            ipAddress: ip,
            macAddress: primary?.mac_address?.trim(),
            notes: [body.note?.trim(), `Tạo từ Endpoint Agent ${item.agent.agentKey}`].filter(Boolean).join('\n'),
          },
          include: { category: true, status: true, warehouse: true, location: true },
        })
      } catch (error: any) {
        if (error?.code === 'P2002')
          throw new ConflictException('Mã tài sản, barcode, System UUID hoặc serial đã tồn tại')
        throw error
      }
      await tx.endpointAgent.update({ where: { id: item.agentId }, data: { linkedAssetId: asset.id } })
      await tx.discoveryInboxItem.update({
        where: { id },
        data: {
          status: 'CREATED',
          suggestedAssetId: null,
          resolvedAssetId: asset.id,
          matchConfidence: 100,
          conflictReason: null,
          resolutionNote: body.note?.trim() || null,
          resolvedBy: actor.id,
          resolvedAt: new Date(),
        },
      })
      await tx.assetHistory.create({
        data: {
          assetId: asset.id,
          action: AssetHistoryAction.CREATED,
          toLocationId: warehouse.locationId,
          description: `Tạo từ Discovery Inbox; nhập ${warehouse.name}`,
          performedBy: actor.id,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'DISCOVERY_ASSET_CREATED',
          entityType: 'DiscoveryInboxItem',
          entityId: id,
          newValues: { assetId: asset.id, assetTag: asset.assetTag, agentId: item.agentId } as Prisma.InputJsonValue,
        },
      })
      return asset
    })
  }

  downloads() {
    const base = '/api/v1/discovery/agent-files'
    return {
      windows: { label: 'Windows x64', url: `${base}/assetflow-agent-windows-amd64.exe` },
      linuxAmd64: { label: 'Linux x64', url: `${base}/assetflow-agent-linux-amd64` },
      linuxArm64: { label: 'Linux ARM64', url: `${base}/assetflow-agent-linux-arm64` },
      checksums: `${base}/SHA256SUMS`,
      networkDiscovery: { available: false, status: 'PLANNED' },
    }
  }
  agentFile(filename: string, actor: Actor) {
    this.assertOperator(actor)
    const allowed = new Set([
      'assetflow-agent-windows-amd64.exe',
      'assetflow-agent-linux-amd64',
      'assetflow-agent-linux-arm64',
      'SHA256SUMS',
    ])
    if (!allowed.has(filename)) throw new NotFoundException('Không tìm thấy gói Endpoint Agent')
    const roots = [
      process.env.AGENT_DOWNLOAD_DIR,
      join(process.cwd(), 'apps/api/agent-downloads'),
      join(process.cwd(), 'apps/agent/dist'),
    ].filter(Boolean) as string[]
    const path = roots.map(root => join(root, filename)).find(candidate => existsSync(candidate))
    if (!path) throw new NotFoundException('Binary Agent chưa được đóng gói trong bản API này')
    return path
  }
}
