import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { AuthSource, DirectoryConfiguration, DirectoryProvider, Prisma, RecordStatus, UserRole } from '@prisma/client'
import { createHash } from 'node:crypto'
import { Client } from 'ldapts'
import { PrismaService } from '../../database/prisma.service'
import { DirectoryCryptoService } from './directory-crypto.service'
import { SaveDirectoryConfigurationDto } from './directory.dto'

type ExternalUser = {
  externalId: string
  username: string
  fullName: string
  email: string
  employeeCode: string
  department?: string
  enabled: boolean
  groups: string[]
}
type Counters = { discovered: number; created: number; updated: number; disabled: number; skipped: number }
const rolePriority: Record<string, number> = { USER: 0, HCNS: 1, IT: 2, ADMIN: 3 }
const scheduleMs: Record<string, number> = {
  HOURLY: 3600000,
  EVERY_6_HOURS: 21600000,
  EVERY_12_HOURS: 43200000,
  DAILY_02: 86400000,
}

@Injectable()
export class DirectoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DirectoryService.name)
  private readonly running = new Set<DirectoryProvider>()
  private timer?: NodeJS.Timeout
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: DirectoryCryptoService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runDueSyncs(), 60000)
    this.timer.unref()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  assertAdmin(user: { role: string }) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Chỉ quản trị viên được cấu hình đồng bộ danh tính')
  }
  private provider(value: string) {
    const normalized = value.toUpperCase()
    if (normalized !== 'M365' && normalized !== 'LDAP') throw new BadRequestException('Directory provider không hợp lệ')
    return normalized as DirectoryProvider
  }
  private trim(value?: string) {
    return value?.trim() || null
  }
  private attribute(value: string) {
    if (!/^[a-zA-Z][a-zA-Z0-9;._-]{0,99}$/.test(value))
      throw new BadRequestException(`Tên thuộc tính không hợp lệ: ${value}`)
    return value
  }
  private mapping(value?: string | Prisma.JsonValue) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, string>
    const result: Record<string, string> = {}
    for (const line of String(value || '').split(/\r?\n/)) {
      const [name, role] = line.split('=').map(x => x.trim())
      const upper = role?.toUpperCase()
      if (!name && !upper) continue
      if (!name || !['ADMIN', 'IT', 'HCNS', 'USER'].includes(upper))
        throw new BadRequestException(`Ánh xạ nhóm không hợp lệ: ${line}`)
      result[name] = upper
    }
    return result
  }
  private response(config: DirectoryConfiguration) {
    return {
      ...config,
      secretEncrypted: undefined,
      hasSecret: Boolean(config.secretEncrypted),
      groupMapping: Object.entries(this.mapping(config.groupMapping))
        .map(([group, role]) => `${group} = ${role}`)
        .join('\n'),
    }
  }

  async list() {
    const existing = await this.db.directoryConfiguration.findMany({ orderBy: { provider: 'asc' } })
    return { data: existing.map(x => this.response(x)) }
  }
  async runs(limit = 20) {
    return {
      data: await this.db.directorySyncRun.findMany({
        take: Math.min(Math.max(limit, 1), 100),
        orderBy: { startedAt: 'desc' },
        include: { configuration: { select: { provider: true } } },
      }),
    }
  }

  async save(providerValue: string, body: SaveDirectoryConfigurationDto, actorId?: string) {
    const provider = this.provider(providerValue)
    const existing = await this.db.directoryConfiguration.findUnique({ where: { provider } })
    const secret = body.secret?.trim() ? this.crypto.encrypt(body.secret.trim()) : existing?.secretEncrypted
    if (body.enabled && !secret)
      throw new BadRequestException('Phải nhập client secret hoặc mật khẩu bind trước khi bật đồng bộ')
    const data = {
      enabled: body.enabled,
      tenantId: this.trim(body.tenantId),
      clientId: this.trim(body.clientId),
      ldapUrl: this.trim(body.ldapUrl),
      baseDn: this.trim(body.baseDn),
      bindDn: this.trim(body.bindDn),
      caCertificate: this.trim(body.caCertificate),
      secretEncrypted: secret,
      userFilter: this.trim(body.userFilter),
      useTls: body.useTls,
      schedule: body.schedule,
      syncDisabled: body.syncDisabled,
      syncLicenses: provider === 'M365' && body.syncLicenses,
      groupMapping: this.mapping(body.groupMapping),
      departmentAttribute: this.attribute(body.departmentAttribute),
      emailAttribute: this.attribute(body.emailAttribute),
      employeeCodeAttribute: this.attribute(body.employeeCodeAttribute),
      usernameAttribute: this.attribute(body.usernameAttribute),
    }
    this.validateConfiguration(provider, data)
    const saved = await this.db.directoryConfiguration.upsert({
      where: { provider },
      update: data,
      create: { provider, ...data },
    })
    await this.db.auditLog.create({
      data: {
        userId: actorId,
        action: 'DIRECTORY_CONFIG_UPDATED',
        entityType: 'DirectoryConfiguration',
        entityId: saved.id,
        newValues: {
          provider,
          enabled: body.enabled,
          schedule: body.schedule,
          useTls: body.useTls,
          syncDisabled: body.syncDisabled,
          syncLicenses: data.syncLicenses,
          secretChanged: Boolean(body.secret?.trim()),
        },
      },
    })
    return { data: this.response(saved) }
  }

  private validateConfiguration(provider: DirectoryProvider, config: any) {
    if (provider === 'M365') {
      if (!config.tenantId || !config.clientId) throw new BadRequestException('Tenant ID và Client ID là bắt buộc')
      if (!/^[0-9a-f-]{36}$/i.test(config.tenantId) || !/^[0-9a-f-]{36}$/i.test(config.clientId))
        throw new BadRequestException('Tenant ID hoặc Client ID không đúng định dạng GUID')
    } else {
      if (!config.ldapUrl || !config.baseDn || !config.bindDn)
        throw new BadRequestException('LDAP URL, Base DN và Bind DN là bắt buộc')
      let url: URL
      try {
        url = new URL(config.ldapUrl)
      } catch {
        throw new BadRequestException('LDAP URL không hợp lệ')
      }
      if (
        !['ldap:', 'ldaps:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.pathname && url.pathname !== '/')
      )
        throw new BadRequestException('LDAP URL chỉ được chứa protocol, hostname và port')
      if (url.protocol === 'ldap:' && !config.useTls && process.env.ALLOW_INSECURE_LDAP !== 'true')
        throw new BadRequestException('LDAP không mã hóa bị chặn; hãy bật StartTLS hoặc dùng ldaps://')
      if (!config.userFilter) throw new BadRequestException('LDAP user filter là bắt buộc')
    }
  }

  private async getConfigured(providerValue: string) {
    const provider = this.provider(providerValue)
    const config = await this.db.directoryConfiguration.findUnique({ where: { provider } })
    if (!config || !config.secretEncrypted) throw new BadRequestException('Provider chưa được lưu đầy đủ')
    return { provider, config, secret: this.crypto.decrypt(config.secretEncrypted) }
  }
  private safeError(error: unknown, secret?: string) {
    let message = error instanceof Error ? error.message : 'Lỗi kết nối không xác định'
    if (secret) message = message.split(secret).join('[REDACTED]')
    return message.slice(0, 1000)
  }

  async test(providerValue: string) {
    const { provider, config, secret } = await this.getConfigured(providerValue)
    let message = ''
    try {
      if (provider === 'M365') {
        const token = await this.graphToken(config, secret)
        await this.graphJson('https://graph.microsoft.com/v1.0/users?$select=id&$top=1', token)
        message = 'Kết nối Microsoft Graph thành công và có quyền đọc người dùng.'
      } else
        await this.withLdap(config, secret, async client => {
          await client.search(config.baseDn!, {
            scope: 'sub',
            filter: config.userFilter!,
            attributes: ['dn'],
            sizeLimit: 1,
            timeLimit: 10,
          })
          message = 'Bind LDAP và truy vấn người dùng thành công.'
        })
      await this.db.directoryConfiguration.update({
        where: { id: config.id },
        data: { lastTestAt: new Date(), lastTestOk: true, lastTestMessage: message },
      })
      return { ok: true, message }
    } catch (error) {
      message = this.safeError(error, secret)
      await this.db.directoryConfiguration.update({
        where: { id: config.id },
        data: { lastTestAt: new Date(), lastTestOk: false, lastTestMessage: message },
      })
      throw new BadRequestException(`Kiểm tra kết nối thất bại: ${message}`)
    }
  }

  async sync(providerValue: string, triggeredBy = 'system') {
    const { provider, config, secret } = await this.getConfigured(providerValue)
    if (!config.enabled && triggeredBy === 'scheduler') return null
    if (this.running.has(provider)) throw new ConflictException('Provider đang đồng bộ')
    this.running.add(provider)
    const run = await this.db.directorySyncRun.create({ data: { configurationId: config.id, triggeredBy } })
    try {
      const users = provider === 'M365' ? await this.graphUsers(config, secret) : await this.ldapUsers(config, secret)
      const counters = await this.persistUsers(provider, config, users)
      if (provider === 'M365' && config.syncLicenses) {
        const actor = await this.db.user.findFirst({
          where: { OR: [{ username: triggeredBy }, { role: 'ADMIN', status: 'ACTIVE' }] },
          orderBy: { role: 'asc' },
          select: { id: true, username: true },
        })
        if (actor) await this.syncMicrosoftLicenses(actor)
      }
      const finished = await this.db.directorySyncRun.update({
        where: { id: run.id },
        data: { status: 'SUCCESS', finishedAt: new Date(), ...counters },
      })
      await this.db.directoryConfiguration.update({ where: { id: config.id }, data: { lastSyncAt: new Date() } })
      return { data: finished }
    } catch (error) {
      const message = this.safeError(error, secret)
      await this.db.directorySyncRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message },
      })
      throw new BadRequestException(`Đồng bộ thất bại: ${message}`)
    } finally {
      this.running.delete(provider)
    }
  }

  private async graphToken(config: DirectoryConfiguration, secret: string) {
    const body = new URLSearchParams({
      client_id: config.clientId!,
      client_secret: secret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    })
    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId!)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000),
      },
    )
    const payload: any = await response.json()
    if (!response.ok || !payload.access_token)
      throw new Error(
        `Microsoft identity trả về ${response.status}: ${payload.error_description || payload.error || 'không có access token'}`,
      )
    return payload.access_token as string
  }
  private async graphJson(url: string, token: string) {
    const parsed = new URL(url)
    if (parsed.origin !== 'https://graph.microsoft.com') throw new Error('Graph pagination URL không hợp lệ')
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(parsed, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      const payload: any = await response.json()
      if (response.ok) return payload
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const retryAfter = Math.min(Number(response.headers.get('retry-after') || attempt + 1), 30)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        continue
      }
      throw new Error(`Microsoft Graph trả về ${response.status}: ${payload.error?.message || 'request failed'}`)
    }
    throw new Error('Microsoft Graph không phản hồi sau khi thử lại')
  }
  private async graphAll(url: string, token: string) {
    const values: any[] = []
    let next: string | undefined = url
    for (let page = 0; next && page < 100; page++) {
      const payload = await this.graphJson(next, token)
      values.push(...(payload.value || []))
      next = payload['@odata.nextLink']
    }
    if (next) throw new Error('Microsoft Graph vượt quá giới hạn 100 trang')
    return values
  }
  private async graphUsers(config: DirectoryConfiguration, secret: string) {
    const token = await this.graphToken(config, secret),
      mapping = this.mapping(config.groupMapping),
      groupNames = Object.keys(mapping)
    const rawUsers = await this.graphAll(
      'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,employeeId,department,accountEnabled&$top=999',
      token,
    )
    const memberships = new Map<string, string[]>()
    if (groupNames.length) {
      const groups = await this.graphAll(
        'https://graph.microsoft.com/v1.0/groups?$select=id,displayName&$top=999',
        token,
      )
      for (const group of groups.filter((x: any) => groupNames.includes(x.displayName))) {
        const members = await this.graphAll(
          `https://graph.microsoft.com/v1.0/groups/${encodeURIComponent(group.id)}/members?$select=id&$top=999`,
          token,
        )
        for (const member of members)
          memberships.set(member.id, [...(memberships.get(member.id) || []), group.displayName])
      }
    }
    return rawUsers.map((user: any): ExternalUser => ({
      externalId: user.id,
      username: user.userPrincipalName?.split('@')[0] || `entra-${user.id.slice(0, 8)}`,
      fullName: user.displayName || user.userPrincipalName,
      email: user.mail || user.userPrincipalName,
      employeeCode: user.employeeId || `ENTRA-${user.id.replace(/-/g, '').slice(0, 12)}`,
      department: user.department || undefined,
      enabled: user.accountEnabled !== false,
      groups: memberships.get(user.id) || [],
    }))
  }

  async testMicrosoftLicenses() {
    const { provider, config, secret } = await this.getConfigured('M365')
    if (provider !== 'M365') throw new BadRequestException('Microsoft 365 chưa được cấu hình')
    try {
      const token = await this.graphToken(config, secret),
        payload = await this.graphJson(
          'https://graph.microsoft.com/v1.0/subscribedSkus?$select=id,skuId,skuPartNumber,consumedUnits,prepaidUnits,capabilityStatus',
          token,
        )
      return {
        ok: true,
        skuCount: (payload.value || []).length,
        message: `Kết nối thành công. Đọc được ${(payload.value || []).length} SKU Microsoft 365.`,
      }
    } catch (error) {
      throw new BadRequestException(`Không thể đọc license Microsoft 365: ${this.safeError(error, secret)}`)
    }
  }

  async syncMicrosoftLicenses(actor: { id: string; username: string }) {
    const { config, secret } = await this.getConfigured('M365'),
      now = new Date()
    try {
      const token = await this.graphToken(config, secret)
      const [skus, users] = await Promise.all([
        this.graphAll(
          'https://graph.microsoft.com/v1.0/subscribedSkus?$select=id,skuId,skuPartNumber,consumedUnits,prepaidUnits,capabilityStatus',
          token,
        ),
        this.graphAll(
          'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,assignedLicenses,licenseAssignmentStates&$top=999',
          token,
        ),
      ])
      let assignments = 0,
        matchedPeople = 0,
        unmatchedPeople = 0
      for (const sku of skus) {
        const total = Number(sku.prepaidUnits?.enabled || 0),
          consumed = Number(sku.consumedUnits || 0),
          externalSkuId = String(sku.skuId),
          part = String(sku.skuPartNumber || externalSkuId)
        const existing = await this.db.digitalEntitlement.findUnique({
          where: {
            externalProvider_externalTenantId_externalSkuId: {
              externalProvider: 'MICROSOFT_365',
              externalTenantId: config.tenantId!,
              externalSkuId,
            },
          },
        })
        const entitlement = await this.db.digitalEntitlement.upsert({
          where: {
            externalProvider_externalTenantId_externalSkuId: {
              externalProvider: 'MICROSOFT_365',
              externalTenantId: config.tenantId!,
              externalSkuId,
            },
          },
          create: {
            code: `M365-${externalSkuId.replace(/-/g, '').slice(0, 12).toUpperCase()}`,
            name: part,
            type: 'LICENSE',
            status: 'ACTIVE',
            productName: part,
            totalQuantity: Math.max(total, consumed, 1),
            currency: 'VND',
            createdBy: actor.id,
            externalProvider: 'MICROSOFT_365',
            externalTenantId: config.tenantId!,
            externalSkuId,
            externalSkuPartNumber: part,
            externalAssignedQuantity: consumed,
            externalAvailableQuantity: Math.max(0, total - consumed),
            externalCapabilityStatus: String(sku.capabilityStatus || ''),
            externalLastSyncedAt: now,
          },
          update: {
            name: existing?.name || part,
            productName: existing?.productName || part,
            totalQuantity: Math.max(total, consumed, 1),
            externalSkuPartNumber: part,
            externalAssignedQuantity: consumed,
            externalAvailableQuantity: Math.max(0, total - consumed),
            externalCapabilityStatus: String(sku.capabilityStatus || ''),
            externalLastSyncedAt: now,
          },
        })
        const seen: string[] = []
        for (const user of users) {
          const assigned = (user.assignedLicenses || []).some(
            (item: any) => String(item.skuId).toLowerCase() === externalSkuId.toLowerCase(),
          )
          if (!assigned) continue
          seen.push(user.id)
          assignments++
          const email = String(user.mail || user.userPrincipalName || '').toLowerCase(),
            person = await this.db.person.findFirst({
              where: { OR: [{ source: 'ENTRA_ID', externalId: user.id }, ...(email ? [{ email }] : [])] },
            })
          if (person) matchedPeople++
          else unmatchedPeople++
          const state = (user.licenseAssignmentStates || []).find(
            (item: any) => String(item.skuId).toLowerCase() === externalSkuId.toLowerCase(),
          )
          await this.db.microsoftLicenseAssignment.upsert({
            where: { entitlementId_externalUserId: { entitlementId: entitlement.id, externalUserId: user.id } },
            create: {
              entitlementId: entitlement.id,
              externalUserId: user.id,
              userPrincipalName: String(user.userPrincipalName || email),
              displayName: user.displayName,
              assignedByGroup: state?.assignedByGroup || null,
              assignmentState: state?.state || 'Active',
              assignmentError: state?.error || null,
              personId: person?.id,
              lastSyncedAt: now,
            },
            update: {
              userPrincipalName: String(user.userPrincipalName || email),
              displayName: user.displayName,
              assignedByGroup: state?.assignedByGroup || null,
              assignmentState: state?.state || 'Active',
              assignmentError: state?.error || null,
              personId: person?.id,
              lastSyncedAt: now,
            },
          })
        }
        await this.db.microsoftLicenseAssignment.deleteMany({
          where: { entitlementId: entitlement.id, ...(seen.length ? { externalUserId: { notIn: seen } } : {}) },
        })
      }
      const message = `Đã đồng bộ ${skus.length} SKU, ${assignments} lượt cấp license; ${unmatchedPeople} lượt chưa khớp danh bạ.`
      await this.db.directoryConfiguration.update({
        where: { id: config.id },
        data: { lastLicenseSyncAt: now, lastLicenseSyncStatus: 'SUCCESS', lastLicenseSyncMessage: message },
      })
      await this.db.auditLog.create({
        data: {
          userId: actor.id,
          action: 'M365_LICENSES_SYNCED',
          entityType: 'DirectoryConfiguration',
          entityId: config.id,
          newValues: { skus: skus.length, assignments, matchedPeople, unmatchedPeople } as Prisma.InputJsonValue,
        },
      })
      return { ok: true, skus: skus.length, assignments, matchedPeople, unmatchedPeople, message }
    } catch (error) {
      const message = this.safeError(error, secret)
      await this.db.directoryConfiguration.update({
        where: { id: config.id },
        data: { lastLicenseSyncAt: now, lastLicenseSyncStatus: 'FAILED', lastLicenseSyncMessage: message },
      })
      throw new BadRequestException(`Đồng bộ license Microsoft 365 thất bại: ${message}`)
    }
  }

  private tlsOptions(config: DirectoryConfiguration) {
    return {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2' as const,
      ca: config.caCertificate ? [config.caCertificate] : undefined,
    }
  }
  private async withLdap<T>(config: DirectoryConfiguration, secret: string, work: (client: Client) => Promise<T>) {
    const url = new URL(config.ldapUrl!)
    const client = new Client({
      url: config.ldapUrl!,
      connectTimeout: 10000,
      timeout: 20000,
      tlsOptions: url.protocol === 'ldaps:' ? this.tlsOptions(config) : undefined,
    })
    try {
      if (url.protocol === 'ldap:' && config.useTls) await client.startTLS(this.tlsOptions(config))
      await client.bind(config.bindDn!, secret)
      return await work(client)
    } finally {
      await client.unbind().catch(() => undefined)
    }
  }
  private value(entry: Record<string, unknown>, attribute: string) {
    const raw = entry[attribute]
    const value = Array.isArray(raw) ? raw[0] : raw
    return Buffer.isBuffer(value) ? value.toString('hex') : String(value ?? '').trim()
  }
  private values(entry: Record<string, unknown>, attribute: string) {
    const raw = entry[attribute]
    return (Array.isArray(raw) ? raw : [raw])
      .filter(Boolean)
      .map(value => (Buffer.isBuffer(value) ? value.toString('hex') : String(value)))
  }
  private async ldapUsers(config: DirectoryConfiguration, secret: string) {
    return this.withLdap(config, secret, async client => {
      const attrs = [
        config.usernameAttribute,
        config.emailAttribute,
        config.employeeCodeAttribute,
        config.departmentAttribute,
        'displayName',
        'cn',
        'userPrincipalName',
        'objectGUID',
        'entryUUID',
        'userAccountControl',
        'memberOf',
        'distinguishedName',
      ].filter((x, i, a) => Boolean(x) && a.indexOf(x) === i) as string[]
      const users: ExternalUser[] = []
      for await (const page of client.searchPaginated(config.baseDn!, {
        scope: 'sub',
        filter: config.userFilter!,
        attributes: attrs,
        explicitBufferAttributes: ['objectGUID'],
        paged: { pageSize: 500 },
        timeLimit: 30,
      })) {
        for (const raw of page.searchEntries) {
          const entry = raw as unknown as Record<string, unknown>,
            externalId =
              this.value(entry, 'objectGUID') ||
              this.value(entry, 'entryUUID') ||
              this.value(entry, 'dn') ||
              this.value(entry, 'distinguishedName')
          const username =
            this.value(entry, config.usernameAttribute) || this.value(entry, 'userPrincipalName').split('@')[0]
          const email = this.value(entry, config.emailAttribute) || this.value(entry, 'userPrincipalName')
          const fullName = this.value(entry, 'displayName') || this.value(entry, 'cn') || username
          const employeeCode =
            this.value(entry, config.employeeCodeAttribute) ||
            `LDAP-${createHash('sha1').update(externalId).digest('hex').slice(0, 12)}`
          const flags = Number(this.value(entry, 'userAccountControl') || 0)
          users.push({
            externalId,
            username,
            fullName,
            email,
            employeeCode,
            department: this.value(entry, config.departmentAttribute) || undefined,
            enabled: (flags & 2) === 0,
            groups: this.values(entry, 'memberOf'),
          })
        }
      }
      return users
    })
  }

  private mappedRole(config: DirectoryConfiguration, groups: string[]) {
    const mapping = this.mapping(config.groupMapping)
    let role = 'USER'
    for (const [group, mapped] of Object.entries(mapping)) {
      const matched = groups.some(
        value =>
          value.toLowerCase() === group.toLowerCase() || value.toLowerCase().startsWith(`cn=${group.toLowerCase()},`),
      )
      if (matched && (rolePriority[mapped] ?? 0) > rolePriority[role]) role = mapped
    }
    return role as UserRole
  }
  private async holdingDepartment() {
    return this.db.department.upsert({
      where: { code: 'DIR-UNASSIGNED' },
      update: {},
      create: { code: 'DIR-UNASSIGNED', name: 'Chưa phân bổ phòng ban' },
    })
  }

  private async persistUsers(provider: DirectoryProvider, config: DirectoryConfiguration, users: ExternalUser[]) {
    const authSource: AuthSource = provider === 'M365' ? 'ENTRA_ID' : 'LDAP',
      counts: Counters = { discovered: users.length, created: 0, updated: 0, disabled: 0, skipped: 0 },
      seen: string[] = []
    let withoutDepartment = 0
    for (const item of users) {
      if (!item.externalId || !item.username || !item.email || !item.fullName) {
        counts.skipped++
        continue
      }
      seen.push(item.externalId)
      const existing = await this.db.user.findUnique({
        where: { authSource_externalId: { authSource, externalId: item.externalId } },
      })
      if (!item.enabled && !config.syncDisabled) {
        if (existing && existing.status !== 'INACTIVE') {
          await this.db.user.update({ where: { id: existing.id }, data: { status: 'INACTIVE' } })
          await this.db.person.updateMany({ where: { linkedUserId: existing.id }, data: { status: 'INACTIVE' } })
          counts.disabled++
        } else counts.skipped++
        continue
      }
      const email = item.email.toLowerCase(),
        emailOwner = await this.db.user.findUnique({ where: { email } })
      if (emailOwner && emailOwner.id !== existing?.id) {
        counts.skipped++
        continue
      }
      let departmentId: string | undefined
      if (item.department) {
        const code = `DIR-${createHash('sha1').update(item.department.toLowerCase()).digest('hex').slice(0, 10).toUpperCase()}`
        departmentId = (
          await this.db.department.upsert({
            where: { code },
            update: { name: item.department },
            create: { code, name: item.department },
          })
        ).id
      }
      const status: RecordStatus = item.enabled ? 'ACTIVE' : 'INACTIVE',
        role = this.mappedRole(config, item.groups)
      try {
        const syncedUser = existing
          ? await this.db.user.update({
              where: { id: existing.id },
              data: {
                username: item.username.toLowerCase(),
                fullName: item.fullName,
                email,
                employeeCode: item.employeeCode,
                departmentId,
                status,
                role,
              },
            })
          : await this.db.user.create({
              data: {
                externalId: item.externalId,
                authSource,
                username: item.username.toLowerCase(),
                fullName: item.fullName,
                email,
                employeeCode: item.employeeCode,
                departmentId,
                status,
                role,
              },
            })
        if (existing) counts.updated++
        else counts.created++
        if (!item.enabled) counts.disabled++
        const personDepartmentId = departmentId ?? (await this.holdingDepartment()).id
        if (!departmentId) withoutDepartment++
        {
          const person = await this.db.person.findFirst({
            where: {
              OR: [
                { linkedUserId: syncedUser.id },
                { source: authSource, externalId: item.externalId },
                { employeeCode: item.employeeCode },
              ],
            },
          })
          const data = {
            linkedUserId: syncedUser.id,
            source: authSource,
            externalId: item.externalId,
            employeeCode: item.employeeCode,
            fullName: item.fullName,
            email,
            departmentId: personDepartmentId,
            status,
          }
          if (person) await this.db.person.update({ where: { id: person.id }, data })
          else await this.db.person.create({ data })
        }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          counts.skipped++
          continue
        }
        throw error
      }
    }
    if (seen.length) {
      const result = await this.db.user.updateMany({
        where: { authSource, externalId: { notIn: seen }, status: 'ACTIVE' },
        data: { status: 'INACTIVE' },
      })
      await this.db.person.updateMany({
        where: { source: authSource, externalId: { notIn: seen }, status: 'ACTIVE' },
        data: { status: 'INACTIVE' },
      })
      counts.disabled += result.count
    }
    if (withoutDepartment)
      this.logger.warn(
        `${withoutDepartment} tài khoản không có thuộc tính phòng ban; hồ sơ người nhận tài sản được đưa vào "Chưa phân bổ phòng ban".`,
      )
    return counts
  }

  private async runDueSyncs() {
    try {
      const configs = await this.db.directoryConfiguration.findMany({
        where: { enabled: true, schedule: { not: 'MANUAL' } },
      })
      for (const config of configs) {
        const interval = scheduleMs[config.schedule]
        if (!interval) continue
        let due = !config.lastSyncAt || Date.now() - config.lastSyncAt.getTime() >= interval
        if (config.schedule === 'DAILY_02') {
          const now = new Date()
          due = now.getHours() === 2 && (!config.lastSyncAt || now.toDateString() !== config.lastSyncAt.toDateString())
        }
        if (due && !this.running.has(config.provider))
          void this.sync(config.provider, 'scheduler').catch(error => this.logger.error(this.safeError(error)))
      }
    } catch (error) {
      this.logger.error(this.safeError(error))
    }
  }
}
