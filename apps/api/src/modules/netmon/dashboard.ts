/**
 * Pure shaping for the infrastructure dashboard. Every figure on that screen comes from here, so the
 * rules behind the numbers - what counts as degraded, how an alert is ranked, how uptime is averaged
 * - are readable and testable in one place instead of being spread through a query.
 */

export type DeviceStatus = 'UNKNOWN' | 'UP' | 'DOWN' | 'PAUSED'
export type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL'

export interface DashboardDevice {
  id: string
  ipAddress: string
  label?: string | null
  hostname?: string | null
  status: DeviceStatus
  monitored: boolean
  consecutiveFailures: number
  responseTimeMs?: number | null
  firstSeenAt: Date
  asset?: {
    assetTag: string
    name: string
    category?: { name: string } | null
    location?: { id: string; name: string } | null
    currentCustodian?: { department?: { id: string; name: string } | null } | null
    department?: { id: string; name: string } | null
  } | null
  subnet?: { id: string; name: string; locationId?: string | null } | null
}

/**
 * A device that has missed at least one check but has not yet reached its subnet's failure threshold.
 * It is still up, so counting it as down would overstate outages, but it is not healthy either -
 * this is the state the dashboard shows as "Cảnh báo".
 */
export function isDegraded(device: Pick<DashboardDevice, 'status' | 'monitored' | 'consecutiveFailures'>) {
  return device.monitored && device.status === 'UP' && device.consecutiveFailures > 0
}

export function statusTotals(devices: DashboardDevice[]) {
  const up = devices.filter(device => device.status === 'UP').length
  const warning = devices.filter(isDegraded).length
  return {
    devices: devices.length,
    up,
    // Degraded devices are a subset of UP, so they are reported separately and taken out of the
    // healthy count; adding the four buckets must equal the total, not exceed it.
    healthy: up - warning,
    warning,
    down: devices.filter(device => device.status === 'DOWN').length,
    unknown: devices.filter(device => device.status === 'UNKNOWN').length,
    paused: devices.filter(device => device.status === 'PAUSED').length,
    linked: devices.filter(device => device.asset).length,
  }
}

/** Share of devices answering, which is what the health ring shows. Nothing monitored reads as 0. */
export function healthPercent(devices: DashboardDevice[]) {
  if (!devices.length) return 0
  return Math.round((devices.filter(device => device.status === 'UP').length / devices.length) * 1000) / 10
}

/**
 * Infrastructure a whole site depends on. An outage here is escalated one level, because a core
 * switch down for ten minutes is not the same event as a desk phone down for ten minutes.
 */
const INFRASTRUCTURE = ['switch', 'router', 'firewall', 'server', 'thiết bị mạng', 'tường lửa', 'máy chủ', 'ups', 'nas']

export function isInfrastructure(categoryName?: string | null) {
  const name = (categoryName || '').toLowerCase()
  return INFRASTRUCTURE.some(term => name.includes(term))
}

/**
 * Ranks an outage. Duration is the base - fifteen minutes is a blip, an hour is an incident - and
 * infrastructure moves up one level. The thresholds are shown in the legend on the screen so the
 * ranking is something a reader can check rather than take on trust.
 */
export function alertSeverity(minutesDown: number, categoryName?: string | null): Severity {
  const base: Severity = minutesDown >= 60 ? 'CRITICAL' : minutesDown >= 15 ? 'HIGH' : 'NORMAL'
  if (!isInfrastructure(categoryName)) return base
  return base === 'NORMAL' ? 'HIGH' : 'CRITICAL'
}

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 }

export interface RankedAlert {
  id: string
  severity: Severity
  minutesDown: number
  name: string
  ipAddress: string
  site: string
  downSince: string
  acknowledged: boolean
}

export function rankAlerts(
  alerts: Array<{
    id: string
    downSince: Date
    status: string
    device: DashboardDevice
  }>,
  now = new Date(),
): RankedAlert[] {
  return alerts
    .map(alert => {
      const minutesDown = Math.max(0, Math.floor((now.getTime() - alert.downSince.getTime()) / 60000))
      const device = alert.device
      return {
        id: alert.id,
        severity: alertSeverity(minutesDown, device.asset?.category?.name),
        minutesDown,
        name: device.asset ? device.asset.assetTag : device.label || device.hostname || device.ipAddress,
        ipAddress: device.ipAddress,
        site: siteOf(device),
        downSince: alert.downSince.toISOString(),
        acknowledged: alert.status === 'ACKNOWLEDGED',
      }
    })
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.minutesDown - a.minutesDown)
}

/**
 * Where a device is. The asset's own location is the most specific answer; the subnet's is the
 * fallback, which is why declaring a location on a subnet is worth doing. Neither is a failure - it
 * groups under an explicit "unassigned" heading so the gap shows.
 */
export function siteOf(device: DashboardDevice) {
  return device.asset?.location?.name || device.subnet?.name || 'Chưa gán vị trí'
}

export function categoryOf(device: DashboardDevice) {
  return device.asset?.category?.name || 'Chưa gán tài sản'
}

export interface Bucket {
  key: string
  name: string
  devices: number
  up: number
  warning: number
  down: number
}

function bucketise(devices: DashboardDevice[], keyOf: (device: DashboardDevice) => string): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const device of devices) {
    const name = keyOf(device)
    const bucket = map.get(name) || { key: name, name, devices: 0, up: 0, warning: 0, down: 0 }
    bucket.devices++
    if (device.status === 'DOWN') bucket.down++
    else if (isDegraded(device)) bucket.warning++
    else if (device.status === 'UP') bucket.up++
    map.set(name, bucket)
  }
  // Most trouble first, then largest: a reader scans for what is broken, not for what is biggest.
  return Array.from(map.values()).sort((a, b) => b.down - a.down || b.warning - a.warning || b.devices - a.devices)
}

export const byCategory = (devices: DashboardDevice[]) => bucketise(devices, categoryOf)
export const bySite = (devices: DashboardDevice[]) => bucketise(devices, siteOf)

export function siteStatus(bucket: Bucket): 'OK' | 'WARNING' | 'CRITICAL' {
  if (bucket.down) return bucket.down / Math.max(1, bucket.devices) >= 0.2 ? 'CRITICAL' : 'WARNING'
  return bucket.warning ? 'WARNING' : 'OK'
}

export interface HourPoint {
  hour: string
  avgResponseMs: number | null
  maxResponseMs: number | null
  uptimePercent: number | null
}

/**
 * Collapses the hourly rollups of every device into one series. The mean is weighted by the number
 * of successful checks in each row, so an hour where one device was polled twice does not carry the
 * same weight as an hour where forty were - a plain average of averages would let it.
 */
export function responseSeries(
  samples: Array<{
    bucketStart: Date
    checks: number
    successes: number
    sumResponseMs: number
    maxResponseMs: number | null
  }>,
  hours = 24,
  now = new Date(),
): HourPoint[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()))
  start.setUTCHours(start.getUTCHours() - (hours - 1))
  const points = new Map<string, { checks: number; successes: number; sum: number; max: number | null }>()
  for (let index = 0; index < hours; index++) {
    const at = new Date(start)
    at.setUTCHours(start.getUTCHours() + index)
    points.set(at.toISOString(), { checks: 0, successes: 0, sum: 0, max: null })
  }
  for (const sample of samples) {
    const key = sample.bucketStart.toISOString()
    const point = points.get(key)
    if (!point) continue
    point.checks += sample.checks
    point.successes += sample.successes
    point.sum += sample.sumResponseMs
    if (sample.maxResponseMs !== null) point.max = Math.max(point.max ?? 0, sample.maxResponseMs)
  }
  return Array.from(points.entries()).map(([hour, point]) => ({
    hour,
    avgResponseMs: point.successes ? Math.round(point.sum / point.successes) : null,
    maxResponseMs: point.max,
    uptimePercent: point.checks ? Math.round((point.successes / point.checks) * 1000) / 10 : null,
  }))
}

/**
 * What changed in the last week. Only figures the data can actually support: devices seen for the
 * first time, and how many outages opened and closed. There is no stored snapshot of last week's
 * device count, so no "compared with last week" delta is offered for the totals rather than one
 * being estimated.
 */
export function weeklyTrend(
  devices: DashboardDevice[],
  events: Array<{ toStatus: DeviceStatus; occurredAt: Date }>,
  now = new Date(),
) {
  const since = new Date(now.getTime() - 7 * 86400000)
  return {
    newDevices: devices.filter(device => device.firstSeenAt >= since).length,
    outagesOpened: events.filter(event => event.toStatus === 'DOWN' && event.occurredAt >= since).length,
    recoveries: events.filter(event => event.toStatus === 'UP' && event.occurredAt >= since).length,
  }
}

/**
 * The topology the data can honestly support: the internet, the declared subnets, and the device
 * categories sitting on each. There is no switch-port or LLDP source, so no firewall or core switch
 * is drawn between them - inventing those boxes would make the picture look authoritative about
 * something nothing has measured.
 */
export function topology(devices: DashboardDevice[], subnets: Array<{ id: string; name: string; cidr: string }>) {
  return subnets.map(subnet => {
    const own = devices.filter(device => device.subnet?.id === subnet.id)
    return {
      id: subnet.id,
      name: subnet.name,
      cidr: subnet.cidr,
      devices: own.length,
      up: own.filter(device => device.status === 'UP').length,
      down: own.filter(device => device.status === 'DOWN').length,
      warning: own.filter(isDegraded).length,
      groups: byCategory(own),
    }
  })
}
