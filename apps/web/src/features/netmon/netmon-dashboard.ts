import type { NetEvent } from './netmon-model'

export type Severity = 'CRITICAL' | 'HIGH' | 'NORMAL'
export type SiteStatus = 'OK' | 'WARNING' | 'CRITICAL'

export interface Bucket {
  key: string
  name: string
  devices: number
  up: number
  warning: number
  down: number
}

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

export interface HourPoint {
  hour: string
  avgResponseMs: number | null
  maxResponseMs: number | null
  uptimePercent: number | null
}

export interface TopologySubnet extends Bucket {
  id: string
  cidr: string
  groups: Bucket[]
}

export interface NetDashboard {
  generatedAt: string
  totals: {
    devices: number
    up: number
    healthy: number
    warning: number
    down: number
    unknown: number
    paused: number
    linked: number
    openAlerts: number
    subnets: number
  }
  healthPercent: number
  trend: { newDevices: number; outagesOpened: number; recoveries: number }
  categories: Bucket[]
  sites: Array<Bucket & { status: SiteStatus }>
  alerts: RankedAlert[]
  responseSeries: HourPoint[]
  topology: TopologySubnet[]
  recentEvents: NetEvent[]
  capabilities: { bandwidth: boolean; topologyDiscovery: boolean }
}

export const severityLabels: Record<Severity, string> = {
  CRITICAL: 'NGHIÊM TRỌNG',
  HIGH: 'CAO',
  NORMAL: 'TRUNG BÌNH',
}

export const siteStatusLabels: Record<SiteStatus, string> = {
  OK: 'Bình thường',
  WARNING: 'Có cảnh báo',
  CRITICAL: 'Sự cố',
}

export const emptyDashboard: NetDashboard = {
  generatedAt: new Date(0).toISOString(),
  totals: {
    devices: 0,
    up: 0,
    healthy: 0,
    warning: 0,
    down: 0,
    unknown: 0,
    paused: 0,
    linked: 0,
    openAlerts: 0,
    subnets: 0,
  },
  healthPercent: 0,
  trend: { newDevices: 0, outagesOpened: 0, recoveries: 0 },
  categories: [],
  sites: [],
  alerts: [],
  responseSeries: [],
  topology: [],
  recentEvents: [],
  capabilities: { bandwidth: false, topologyDiscovery: false },
}

/** Share of the total, to one decimal, with an empty register reading 0 rather than NaN. */
export function share(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 1000) / 10
}

/** "2 giờ 15 phút" - an outage is read as a duration, not as a clock time. */
export function outageDuration(minutes: number) {
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ ${minutes % 60} phút`
  return `${Math.floor(hours / 24)} ngày ${hours % 24} giờ`
}

/** Hour label on the response chart, in the reader's own timezone. */
export function hourLabel(iso: string) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return `${String(at.getHours()).padStart(2, '0')}:00`
}

export interface Scale {
  max: number
  ticks: number[]
}

/**
 * Y axis for the response chart. It rounds up to a readable step so the gridline labels are round
 * numbers, and never collapses to zero height when every reading is 0 ms, which would draw the line
 * along the top of the box and read as "worst possible" instead of "instant".
 */
export function niceScale(values: Array<number | null>, minTop = 20): Scale {
  const real = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const peak = real.length ? Math.max(...real) : 0
  const target = Math.max(peak, minTop)
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = target / magnitude <= 2 ? magnitude / 2 : target / magnitude <= 5 ? magnitude : magnitude * 2
  const max = Math.max(step, Math.ceil(target / step) * step)
  const ticks: number[] = []
  for (let value = 0; value <= max + 1e-9; value += step) ticks.push(Math.round(value * 100) / 100)
  return { max, ticks }
}

/**
 * Builds an SVG polyline from a series that may have gaps. Hours with no successful check return
 * null, and those are skipped rather than plotted as zero - drawing a gap as 0 ms would invent a
 * perfect response where in fact nothing answered.
 */
export function linePoints(values: Array<number | null>, scale: Scale, width: number, height: number): string {
  if (values.length < 2) return ''
  return values
    .map((value, index) => {
      if (value === null) return null
      const x = (index / (values.length - 1)) * width
      const y = height - (Math.min(value, scale.max) / scale.max) * height
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
    })
    .filter((point): point is string => point !== null)
    .join(' ')
}

/** Stroke offset for a donut of the given radius at a given percentage. */
export function ringDash(percent: number, radius: number) {
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percent))
  return { circumference, offset: circumference * (1 - clamped / 100) }
}
