import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { NetworkDeviceStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import {
  AcknowledgeNetworkAlertDto,
  DeviceHistoryQuery,
  LinkDeviceDto,
  ListDevicesQuery,
  SubnetDto,
  UpdateDeviceDto,
  UpdateSubnetDto,
} from './netmon.dto'
import {
  hostAddresses,
  matchAsset,
  MAX_SCAN_HOSTS,
  normalizeMac,
  parseCidr,
  uptimePercent,
  vendorFromMac,
} from './network'
import { arpLookup, mapWithConcurrency, probeHost } from './probe'

type Actor = { id: string; role: string; departmentId: string | null }

const deviceInclude = {
  subnet: { select: { id: true, name: true, cidr: true, vlanId: true } },
  asset: {
    select: {
      id: true,
      assetTag: true,
      name: true,
      category: { select: { name: true } },
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      currentCustodian: { select: { id: true, fullName: true, department: { select: { id: true, name: true } } } },
    },
  },
} as const

const SCAN_CONCURRENCY = Number(process.env.NETMON_SCAN_CONCURRENCY || 32)

@Injectable()
export class NetmonService {
  constructor(private readonly db: PrismaService) {}

  /** Reading the map is open to the operating roles; changing what gets probed is not. */
  private read(actor: Actor) {
    if (!['ADMIN', 'IT', 'HCNS'].includes(actor.role))
      throw new ForbiddenException('Tài khoản không có quyền xem giám sát mạng')
  }
  private manage(actor: Actor) {
    if (!['ADMIN', 'IT'].includes(actor.role))
      throw new ForbiddenException('Chỉ Admin hoặc IT được quản lý giám sát mạng')
  }
  private admin(actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được khai báo dải mạng')
  }

  /**
   * A subnet is the only thing that authorises a probe, so this is where the range is bounded. The
   * /22 floor in parseCidr caps a single declaration at 1022 addresses; MAX_SCAN_HOSTS is the second
   * belt, in case that floor is ever relaxed.
   */
  private assertCidr(cidr: string) {
    const parsed = parseCidr(cidr)
    if (!parsed)
      throw new BadRequestException('Dải mạng phải ở dạng CIDR IPv4 và không rộng hơn /22, ví dụ 192.168.50.0/24')
    if (parsed.hostCount > MAX_SCAN_HOSTS)
      throw new BadRequestException(`Dải vượt quá ${MAX_SCAN_HOSTS} địa chỉ; hãy chia nhỏ ra`)
    return parsed
  }

  async listSubnets(actor: Actor) {
    this.read(actor)
    return this.db.networkSubnet.findMany({
      include: {
        location: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: { select: { devices: true } },
      },
      orderBy: { name: 'asc' },
    })
  }

  async createSubnet(body: SubnetDto, actor: Actor) {
    this.admin(actor)
    const parsed = this.assertCidr(body.cidr)
    try {
      const created = await this.db.networkSubnet.create({
        data: {
          name: body.name.trim(),
          cidr: `${parsed.network}/${parsed.prefix}`,
          vlanId: body.vlanId,
          description: body.description?.trim() || null,
          locationId: body.locationId || null,
          departmentId: body.departmentId || null,
          enabled: body.enabled ?? true,
          probeMethod: body.probeMethod || 'BOTH',
          ...(body.tcpPorts ? { tcpPorts: body.tcpPorts } : {}),
          ...(body.scanIntervalMinutes ? { scanIntervalMinutes: body.scanIntervalMinutes } : {}),
          ...(body.checkIntervalSeconds ? { checkIntervalSeconds: body.checkIntervalSeconds } : {}),
          ...(body.failureThreshold ? { failureThreshold: body.failureThreshold } : {}),
          createdBy: actor.id,
        },
      })
      await this.db.auditLog.create({
        data: {
          userId: actor.id,
          action: 'NETWORK_SUBNET_CREATED',
          entityType: 'NetworkSubnet',
          entityId: created.id,
          newValues: { name: created.name, cidr: created.cidr } as Prisma.InputJsonValue,
        },
      })
      return created
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Dải mạng này đã được khai báo')
      throw error
    }
  }

  async updateSubnet(id: string, body: UpdateSubnetDto, actor: Actor) {
    this.admin(actor)
    const current = await this.db.networkSubnet.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('Không tìm thấy dải mạng')
    const parsed = body.cidr ? this.assertCidr(body.cidr) : undefined
    return this.db.networkSubnet.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        ...(parsed ? { cidr: `${parsed.network}/${parsed.prefix}` } : {}),
        vlanId: body.vlanId,
        description: body.description?.trim(),
        locationId: body.locationId,
        departmentId: body.departmentId,
        enabled: body.enabled,
        probeMethod: body.probeMethod,
        tcpPorts: body.tcpPorts,
        scanIntervalMinutes: body.scanIntervalMinutes,
        checkIntervalSeconds: body.checkIntervalSeconds,
        failureThreshold: body.failureThreshold,
      },
    })
  }

  async removeSubnet(id: string, actor: Actor) {
    this.admin(actor)
    const subnet = await this.db.networkSubnet.findUnique({
      where: { id },
      include: { _count: { select: { devices: true } } },
    })
    if (!subnet) throw new NotFoundException('Không tìm thấy dải mạng')
    await this.db.$transaction(async tx => {
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'NETWORK_SUBNET_DELETED',
          entityType: 'NetworkSubnet',
          entityId: id,
          oldValues: {
            name: subnet.name,
            cidr: subnet.cidr,
            devices: subnet._count.devices,
          } as Prisma.InputJsonValue,
        },
      })
      // Devices, their events, samples and alerts all cascade from the subnet.
      await tx.networkSubnet.delete({ where: { id } })
    })
    return { success: true }
  }

  /**
   * Sweeps one subnet and records what answered. Nothing is written to the asset register here: a
   * discovered address becomes a NetworkDevice with a suggested asset, and an administrator decides
   * whether that suggestion is right. The ping is also what populates the neighbour table, so the
   * MAC read afterwards is the one that just replied.
   */
  async scanSubnet(id: string, actor: Actor) {
    this.manage(actor)
    const subnet = await this.db.networkSubnet.findUnique({ where: { id } })
    if (!subnet) throw new NotFoundException('Không tìm thấy dải mạng')
    if (!subnet.enabled) throw new BadRequestException('Dải mạng đang tắt; hãy bật trước khi quét')
    const running = await this.db.networkScan.findFirst({ where: { subnetId: id, status: 'RUNNING' } })
    if (running) throw new ConflictException('Dải mạng này đang được quét')
    const scan = await this.db.networkScan.create({
      data: { subnetId: id, triggeredBy: actor.id, status: 'RUNNING' },
    })
    try {
      const result = await this.sweep(subnet)
      return this.db.networkScan.update({
        where: { id: scan.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          hostsProbed: result.probed,
          hostsAnswered: result.answered,
          devicesAdded: result.added,
        },
      })
    } catch (error: any) {
      await this.db.networkScan.update({
        where: { id: scan.id },
        data: { status: 'FAILED', finishedAt: new Date(), error: String(error?.message || error).slice(0, 1000) },
      })
      throw error
    }
  }

  /** Shared by the on-demand scan and the poller's schedule. */
  async sweep(subnet: {
    id: string
    cidr: string
    probeMethod: string
    tcpPorts: number[]
    departmentId: string | null
    locationId: string | null
  }) {
    const addresses = hostAddresses(subnet.cidr)
    const outcomes = await mapWithConcurrency(addresses, SCAN_CONCURRENCY, async ip => ({
      ip,
      outcome: await probeHost(ip, subnet.probeMethod as any, subnet.tcpPorts),
    }))
    const live = outcomes.filter(entry => entry.outcome.reachable)
    const assets = await this.db.asset.findMany({
      where: { deletedAt: null },
      select: { id: true, assetTag: true, name: true, macAddress: true, ipAddress: true },
    })
    let added = 0
    for (const entry of live) {
      const mac = await arpLookup(entry.ip)
      const existing = await this.db.networkDevice.findUnique({
        where: { subnetId_ipAddress: { subnetId: subnet.id, ipAddress: entry.ip } },
      })
      const suggestion = existing?.assetId
        ? undefined
        : matchAsset({ macAddress: mac, ipAddress: entry.ip, hostname: existing?.hostname }, assets)
      const common = {
        macAddress: mac || existing?.macAddress || null,
        vendor: vendorFromMac(mac) || existing?.vendor || null,
        openPorts: entry.outcome.openPorts,
        responseTimeMs: entry.outcome.responseTimeMs ?? null,
        status: NetworkDeviceStatus.UP,
        consecutiveFailures: 0,
        lastSeenAt: new Date(),
        lastCheckedAt: new Date(),
      }
      if (existing) {
        await this.db.networkDevice.update({ where: { id: existing.id }, data: common })
      } else {
        await this.db.networkDevice.create({
          data: {
            subnetId: subnet.id,
            ipAddress: entry.ip,
            ...common,
            // A suggestion is stored so the screen can show it, but linkedBy stays empty until a
            // person confirms it, which is what separates a guess from a decision.
            assetId: suggestion && suggestion.confidence >= 95 ? suggestion.asset.id : null,
          },
        })
        added++
      }
    }
    await this.db.networkSubnet.update({ where: { id: subnet.id }, data: { lastScanAt: new Date() } })
    return { probed: addresses.length, answered: live.length, added }
  }

  async listScans(subnetId: string, actor: Actor) {
    this.read(actor)
    return this.db.networkScan.findMany({
      where: { subnetId },
      include: { trigger: { select: { fullName: true } } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })
  }

  async listDevices(query: ListDevicesQuery, actor: Actor) {
    this.read(actor)
    const term = query.search?.trim()
    const where: Prisma.NetworkDeviceWhereInput = {
      subnetId: query.subnetId,
      status: query.status as NetworkDeviceStatus | undefined,
      assetId: query.link === 'linked' ? { not: null } : query.link === 'unlinked' ? null : undefined,
      OR: term
        ? [
            { ipAddress: { contains: term, mode: 'insensitive' } },
            { macAddress: { contains: term, mode: 'insensitive' } },
            { hostname: { contains: term, mode: 'insensitive' } },
            { label: { contains: term, mode: 'insensitive' } },
            { vendor: { contains: term, mode: 'insensitive' } },
            {
              asset: {
                is: {
                  OR: [
                    { assetTag: { contains: term, mode: 'insensitive' } },
                    { name: { contains: term, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ]
        : undefined,
    }
    const [data, total] = await this.db.$transaction([
      this.db.networkDevice.findMany({
        where,
        include: deviceInclude,
        orderBy: [{ status: 'asc' }, { ipAddress: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.networkDevice.count({ where }),
    ])
    return { data, meta: { page: query.page, limit: query.limit, total } }
  }

  async getDevice(id: string, query: DeviceHistoryQuery, actor: Actor) {
    this.read(actor)
    const device = await this.db.networkDevice.findUnique({ where: { id }, include: deviceInclude })
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị')
    const since = new Date(Date.now() - query.days * 86400000)
    const [events, samples, alerts] = await Promise.all([
      this.db.networkEvent.findMany({
        where: { deviceId: id, occurredAt: { gte: since } },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      this.db.networkSample.findMany({
        where: { deviceId: id, bucketStart: { gte: since } },
        orderBy: { bucketStart: 'asc' },
      }),
      this.db.networkAlert.findMany({ where: { deviceId: id }, orderBy: { downSince: 'desc' }, take: 20 }),
    ])
    return { ...device, events, samples, alerts, uptimePercent: uptimePercent(samples) }
  }

  async updateDevice(id: string, body: UpdateDeviceDto, actor: Actor) {
    this.manage(actor)
    const device = await this.db.networkDevice.findUnique({ where: { id } })
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị')
    return this.db.networkDevice.update({
      where: { id },
      data: {
        label: body.label?.trim(),
        note: body.note?.trim(),
        ...(body.monitored === undefined
          ? {}
          : {
              monitored: body.monitored,
              // Turning monitoring back on must not inherit the old failure streak, or the device
              // would trip an alert on its first miss after being paused.
              consecutiveFailures: 0,
              status: body.monitored ? NetworkDeviceStatus.UNKNOWN : NetworkDeviceStatus.PAUSED,
            }),
      },
      include: deviceInclude,
    })
  }

  /**
   * Ties a discovered address to an asset. This is the only path that writes network fields onto the
   * register, and it is a person's decision every time - the scanner never does it on its own.
   */
  async linkDevice(id: string, body: LinkDeviceDto, actor: Actor) {
    this.manage(actor)
    const device = await this.db.networkDevice.findUnique({ where: { id } })
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị')
    const asset = await this.db.asset.findFirst({ where: { id: body.assetId, deletedAt: null } })
    if (!asset) throw new BadRequestException('Tài sản không tồn tại hoặc đã ngừng theo dõi')
    const claimed = await this.db.networkDevice.findFirst({
      where: { assetId: body.assetId, id: { not: id } },
      select: { ipAddress: true },
    })
    if (claimed)
      throw new ConflictException(`Tài sản này đã gắn với địa chỉ ${claimed.ipAddress}; hãy gỡ liên kết cũ trước`)
    return this.db.$transaction(async tx => {
      const linked = await tx.networkDevice.update({
        where: { id },
        data: { assetId: body.assetId, linkedBy: actor.id },
        include: deviceInclude,
      })
      if (body.copyNetworkFields)
        await tx.asset.update({
          where: { id: body.assetId },
          data: { ipAddress: device.ipAddress, ...(device.macAddress ? { macAddress: device.macAddress } : {}) },
        })
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: 'NETWORK_DEVICE_LINKED',
          entityType: 'NetworkDevice',
          entityId: id,
          newValues: {
            assetTag: asset.assetTag,
            ipAddress: device.ipAddress,
            macAddress: device.macAddress,
            copiedToAsset: Boolean(body.copyNetworkFields),
          } as Prisma.InputJsonValue,
        },
      })
      return linked
    })
  }

  async unlinkDevice(id: string, actor: Actor) {
    this.manage(actor)
    const device = await this.db.networkDevice.findUnique({ where: { id } })
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị')
    return this.db.networkDevice.update({
      where: { id },
      data: { assetId: null, linkedBy: null },
      include: deviceInclude,
    })
  }

  async removeDevice(id: string, actor: Actor) {
    this.manage(actor)
    const device = await this.db.networkDevice.findUnique({ where: { id } })
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị')
    await this.db.networkDevice.delete({ where: { id } })
    return { success: true }
  }

  /** Suggestions for an unlinked device, so the screen can offer a shortlist rather than 305 assets. */
  async suggestAssets(id: string, actor: Actor) {
    this.read(actor)
    const device = await this.db.networkDevice.findUnique({ where: { id } })
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị')
    const assets = await this.db.asset.findMany({
      where: { deletedAt: null },
      select: { id: true, assetTag: true, name: true, macAddress: true, ipAddress: true },
    })
    const match = matchAsset(device, assets)
    return match ? [{ ...match.asset, confidence: match.confidence, reason: match.reason }] : []
  }

  async listAlerts(actor: Actor) {
    this.read(actor)
    return this.db.networkAlert.findMany({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
      include: { device: { include: deviceInclude }, acknowledger: { select: { fullName: true } } },
      orderBy: { downSince: 'desc' },
      take: 200,
    })
  }

  async acknowledgeAlert(id: string, body: AcknowledgeNetworkAlertDto, actor: Actor) {
    this.manage(actor)
    const alert = await this.db.networkAlert.findUnique({ where: { id } })
    if (!alert) throw new NotFoundException('Không tìm thấy cảnh báo')
    return this.db.networkAlert.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
        acknowledgedBy: actor.id,
        note: body.note?.trim() || alert.note,
      },
    })
  }

  /**
   * The overview and the map read from the same query: a device's place on the map comes from the
   * asset it is linked to, which is why linking is what makes the map meaningful. Anything unlinked
   * is grouped under "Chưa gán" rather than hidden, so the gap is visible instead of silent.
   */
  async overview(actor: Actor) {
    this.read(actor)
    const [devices, subnets, openAlerts, recentEvents] = await Promise.all([
      this.db.networkDevice.findMany({ include: deviceInclude, orderBy: { ipAddress: 'asc' } }),
      this.db.networkSubnet.findMany({ orderBy: { name: 'asc' } }),
      this.db.networkAlert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
      this.db.networkEvent.findMany({
        include: {
          device: { select: { ipAddress: true, label: true, asset: { select: { assetTag: true, name: true } } } },
        },
        orderBy: { occurredAt: 'desc' },
        take: 25,
      }),
    ])
    const counts = devices.reduce(
      (totals, device) => ({ ...totals, [device.status]: (totals[device.status] || 0) + 1 }),
      {} as Record<string, number>,
    )
    const groups = new Map<string, { key: string; name: string; devices: typeof devices }>()
    for (const device of devices) {
      const department = device.asset?.currentCustodian?.department || device.asset?.department
      const key = department?.id || 'unassigned'
      const name = department?.name || 'Chưa gán phòng ban'
      const group = groups.get(key) || { key, name, devices: [] as typeof devices }
      group.devices.push(device)
      groups.set(key, group)
    }
    return {
      totals: {
        devices: devices.length,
        up: counts.UP || 0,
        down: counts.DOWN || 0,
        unknown: counts.UNKNOWN || 0,
        paused: counts.PAUSED || 0,
        linked: devices.filter(device => device.assetId).length,
        openAlerts,
        subnets: subnets.length,
      },
      subnets,
      groups: Array.from(groups.values()).sort((a, b) =>
        a.key === 'unassigned' ? 1 : b.key === 'unassigned' ? -1 : a.name.localeCompare(b.name),
      ),
      recentEvents,
    }
  }
}

export { normalizeMac }
