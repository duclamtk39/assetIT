import { writeFile } from 'node:fs/promises'
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { NetworkDeviceStatus } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { NetmonService } from './netmon.service'
import { resolveCheck, sampleBucket, type DeviceStatus } from './network'
import { mapWithConcurrency, probeHost } from './probe'

/**
 * The monitoring loop.
 *
 * It only runs where NETMON_POLLER is enabled, which in production is a second container from the
 * same image. Keeping it out of the API process is what stops a subnet full of timing-out addresses
 * from holding up request handling: probing is mostly waiting, but Node's single thread still has to
 * come back for every resolved timer.
 *
 * Two guards keep concurrent pollers honest: a device is only claimed for a check when its own
 * lastCheckedAt is older than the interval, and the hourly sample is an upsert keyed on the bucket,
 * so two pollers racing on the same device produce one row rather than two.
 */

const CHECK_CONCURRENCY = Number(process.env.NETMON_CHECK_CONCURRENCY || 24)
const TICK_MS = Number(process.env.NETMON_TICK_MS || 30_000)
/**
 * The container serves no port, so liveness is a file it touches at the end of every completed tick.
 * The healthcheck reads its age: a poller wedged on a hung probe stops touching it and is restarted,
 * where a port-based check would have had nothing to ask.
 */
const HEARTBEAT_PATH = process.env.NETMON_HEARTBEAT_PATH || '/tmp/netmon.heartbeat'

@Injectable()
export class NetmonPoller implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('NetmonPoller')
  private timer?: NodeJS.Timeout
  private busy = false

  constructor(
    private readonly db: PrismaService,
    private readonly netmon: NetmonService,
  ) {}

  static get enabled() {
    return process.env.NETMON_POLLER === 'true'
  }

  onModuleInit() {
    if (!NetmonPoller.enabled) return
    this.log.log(`Network poller active, tick ${TICK_MS}ms`)
    // Deliberately not unref'd. In the API this class never starts, and in the poller role there is
    // no HTTP server holding the event loop open, so an unref'd timer lets Node decide it has
    // nothing left to do and exit - which reads as a crash loop under `restart: unless-stopped`.
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    setTimeout(() => void this.tick(), 5000)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** One pass: due scans first so new devices exist, then the checks. Never overlaps itself. */
  async tick() {
    if (this.busy) return
    this.busy = true
    try {
      await this.runDueScans()
      await this.runDueChecks()
    } catch (error) {
      this.log.error(`Poller tick failed: ${String((error as Error)?.message || error)}`)
    } finally {
      this.busy = false
      await this.heartbeat()
    }
  }

  private async heartbeat() {
    try {
      await writeFile(HEARTBEAT_PATH, new Date().toISOString())
    } catch {
      // A read-only or missing path must not take the loop down; the healthcheck will notice.
    }
  }

  private async runDueScans() {
    const subnets = await this.db.networkSubnet.findMany({ where: { enabled: true } })
    const now = Date.now()
    for (const subnet of subnets) {
      const due = !subnet.lastScanAt || now - subnet.lastScanAt.getTime() >= subnet.scanIntervalMinutes * 60_000
      if (!due) continue
      const running = await this.db.networkScan.findFirst({ where: { subnetId: subnet.id, status: 'RUNNING' } })
      if (running) continue
      const scan = await this.db.networkScan.create({ data: { subnetId: subnet.id, status: 'RUNNING' } })
      try {
        const result = await this.netmon.sweep(subnet)
        await this.db.networkScan.update({
          where: { id: scan.id },
          data: {
            status: 'COMPLETED',
            finishedAt: new Date(),
            hostsProbed: result.probed,
            hostsAnswered: result.answered,
            devicesAdded: result.added,
          },
        })
        this.log.log(`Scanned ${subnet.cidr}: ${result.answered}/${result.probed} answered, ${result.added} new`)
      } catch (error: any) {
        await this.db.networkScan.update({
          where: { id: scan.id },
          data: { status: 'FAILED', finishedAt: new Date(), error: String(error?.message || error).slice(0, 1000) },
        })
      }
    }
  }

  private async runDueChecks() {
    const now = new Date()
    const devices = await this.db.networkDevice.findMany({
      where: { monitored: true, subnet: { enabled: true } },
      include: {
        subnet: { select: { probeMethod: true, tcpPorts: true, failureThreshold: true, checkIntervalSeconds: true } },
      },
    })
    const due = devices.filter(
      device =>
        !device.lastCheckedAt ||
        now.getTime() - device.lastCheckedAt.getTime() >= device.subnet.checkIntervalSeconds * 1000,
    )
    if (!due.length) return
    await mapWithConcurrency(due, CHECK_CONCURRENCY, async device => {
      try {
        const outcome = await probeHost(device.ipAddress, device.subnet.probeMethod as any, device.subnet.tcpPorts)
        await this.record(device, outcome)
      } catch (error) {
        this.log.warn(`Check failed for ${device.ipAddress}: ${String((error as Error)?.message || error)}`)
      }
    })
  }

  private async record(
    device: {
      id: string
      ipAddress: string
      status: NetworkDeviceStatus
      consecutiveFailures: number
      monitored: boolean
      subnet: { failureThreshold: number }
    },
    outcome: { reachable: boolean; responseTimeMs?: number; openPorts: number[] },
  ) {
    const resolution = resolveCheck(
      {
        status: device.status as DeviceStatus,
        consecutiveFailures: device.consecutiveFailures,
        monitored: device.monitored,
      },
      outcome,
      device.subnet.failureThreshold,
    )
    const checkedAt = new Date()
    const bucket = sampleBucket(checkedAt)
    await this.db.$transaction(async tx => {
      await tx.networkDevice.update({
        where: { id: device.id },
        data: {
          status: resolution.status as NetworkDeviceStatus,
          consecutiveFailures: resolution.consecutiveFailures,
          responseTimeMs: outcome.responseTimeMs ?? null,
          lastCheckedAt: checkedAt,
          ...(outcome.reachable ? { lastSeenAt: checkedAt, openPorts: outcome.openPorts } : {}),
        },
      })
      // Raw upsert because neither aggregate can be expressed through the client: a mean has to be
      // kept as a sum and divided at read time, and a maximum needs GREATEST. The first version set
      // maxResponseMs on every write, so it held the latest reading rather than the largest, and
      // never touched the average after the row was created - both charted the wrong number.
      const responseMs = outcome.responseTimeMs ?? null
      await tx.$executeRaw`
        INSERT INTO network_samples ("id", "deviceId", "bucketStart", "checks", "successes", "sumResponseMs", "maxResponseMs")
        VALUES (gen_random_uuid(), ${device.id}::uuid, ${bucket}, 1, ${outcome.reachable ? 1 : 0}, ${responseMs ?? 0}, ${responseMs})
        ON CONFLICT ("deviceId", "bucketStart") DO UPDATE SET
          "checks" = network_samples."checks" + 1,
          "successes" = network_samples."successes" + ${outcome.reachable ? 1 : 0},
          "sumResponseMs" = network_samples."sumResponseMs" + ${responseMs ?? 0},
          "maxResponseMs" = GREATEST(network_samples."maxResponseMs", ${responseMs})`
      if (resolution.changed)
        await tx.networkEvent.create({
          data: {
            deviceId: device.id,
            fromStatus: device.status,
            toStatus: resolution.status as NetworkDeviceStatus,
            responseTimeMs: outcome.responseTimeMs ?? null,
            detail: outcome.reachable
              ? `Phản hồi trở lại${outcome.responseTimeMs === undefined ? '' : ` sau ${outcome.responseTimeMs} ms`}`
              : `Mất phản hồi ${resolution.consecutiveFailures} lần liên tiếp`,
            occurredAt: checkedAt,
          },
        })
      if (resolution.raiseAlert) {
        const open = await tx.networkAlert.findFirst({
          where: { deviceId: device.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        })
        if (!open) await tx.networkAlert.create({ data: { deviceId: device.id, downSince: checkedAt } })
      }
      if (resolution.clearAlert)
        await tx.networkAlert.updateMany({
          where: { deviceId: device.id, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
          data: { status: 'RESOLVED', resolvedAt: checkedAt },
        })
    })
  }
}
