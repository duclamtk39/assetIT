export type DeviceStatus = 'UNKNOWN' | 'UP' | 'DOWN' | 'PAUSED'
export type ProbeMethod = 'ICMP' | 'TCP_PORT' | 'BOTH'

export interface NetSubnet {
  id: string
  name: string
  cidr: string
  vlanId?: number | null
  description?: string | null
  enabled: boolean
  probeMethod: ProbeMethod
  tcpPorts: number[]
  scanIntervalMinutes: number
  checkIntervalSeconds: number
  failureThreshold: number
  lastScanAt?: string | null
  location?: { id: string; name: string } | null
  department?: { id: string; name: string } | null
  _count?: { devices: number }
}

export interface NetDevice {
  id: string
  ipAddress: string
  macAddress?: string | null
  hostname?: string | null
  vendor?: string | null
  label?: string | null
  note?: string | null
  status: DeviceStatus
  monitored: boolean
  openPorts: number[]
  responseTimeMs?: number | null
  consecutiveFailures: number
  lastSeenAt?: string | null
  lastCheckedAt?: string | null
  assetId?: string | null
  subnet?: { id: string; name: string; cidr: string; vlanId?: number | null }
  asset?: {
    id: string
    assetTag: string
    name: string
    category?: { name: string } | null
    department?: { id: string; name: string } | null
    location?: { id: string; name: string } | null
    currentCustodian?: { id: string; fullName: string; department?: { id: string; name: string } | null } | null
  } | null
}

export interface NetEvent {
  id: string
  fromStatus: DeviceStatus
  toStatus: DeviceStatus
  responseTimeMs?: number | null
  detail?: string | null
  occurredAt: string
  device?: { ipAddress: string; label?: string | null; asset?: { assetTag: string; name: string } | null }
}

export interface NetSample {
  bucketStart: string
  checks: number
  successes: number
  avgResponseMs?: number | null
  maxResponseMs?: number | null
}

export interface NetAlert {
  id: string
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  downSince: string
  resolvedAt?: string | null
  acknowledgedAt?: string | null
  note?: string | null
  device: NetDevice
  acknowledger?: { fullName: string } | null
}

export interface NetOverview {
  totals: {
    devices: number
    up: number
    down: number
    unknown: number
    paused: number
    linked: number
    openAlerts: number
    subnets: number
  }
  subnets: NetSubnet[]
  groups: Array<{ key: string; name: string; devices: NetDevice[] }>
  recentEvents: NetEvent[]
}

export const statusLabels: Record<DeviceStatus, string> = {
  UP: 'Đang hoạt động',
  DOWN: 'Mất kết nối',
  UNKNOWN: 'Chưa kiểm tra',
  PAUSED: 'Tạm dừng theo dõi',
}

export const probeLabels: Record<ProbeMethod, string> = {
  ICMP: 'Chỉ ping (ICMP)',
  TCP_PORT: 'Chỉ cổng TCP',
  BOTH: 'Ping và cổng TCP',
}

/**
 * The name a device is known by. A linked asset's tag is what the register calls it, so it wins; a
 * hand-typed label is next, and the address is the fallback that always exists. Without this order
 * an unlinked camera would show as nothing but a number on a map full of names.
 */
export function deviceName(device: NetDevice) {
  if (device.asset) return `${device.asset.assetTag} · ${device.asset.name}`
  return device.label || device.hostname || device.ipAddress
}

/** Sorts a subnet's addresses the way a person reads them: .2 before .10, not after it. */
export function compareIp(a: string, b: string) {
  const parse = (value: string) => value.split('.').map(Number)
  const left = parse(a),
    right = parse(b)
  for (let index = 0; index < 4; index++) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff) return diff
  }
  return 0
}

/** "3 phút trước" style, because an outage is read as an age rather than a timestamp. */
export function sinceLabel(value?: string | null, now = Date.now()) {
  if (!value) return '—'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return '—'
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return `${seconds} giây trước`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  return `${Math.round(hours / 24)} ngày trước`
}

/** How long a device has been down, phrased as a duration rather than a point in time. */
export function outageLabel(downSince: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(downSince).getTime()) / 60000))
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ ${minutes % 60} phút`
  const days = Math.floor(hours / 24)
  return `${days} ngày ${hours % 24} giờ`
}

export function uptimeFromSamples(samples: NetSample[]) {
  const checks = samples.reduce((sum, sample) => sum + sample.checks, 0)
  if (!checks) return undefined
  const successes = samples.reduce((sum, sample) => sum + sample.successes, 0)
  return Math.round((successes / checks) * 1000) / 10
}

/** Accepts both the paged and bare shapes the API uses, so a list never lands as a non-array. */
export function toList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  const data = (payload as { data?: unknown; items?: unknown } | null | undefined) || {}
  if (Array.isArray(data.data)) return data.data as T[]
  return Array.isArray(data.items) ? (data.items as T[]) : []
}
