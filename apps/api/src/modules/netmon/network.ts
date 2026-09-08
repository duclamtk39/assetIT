/**
 * Pure network helpers for the monitoring module: address maths, vendor lookup and the rules that
 * decide when a device counts as down. Nothing here touches the database or the network, so the
 * behaviour that matters - which addresses get probed, when an alert is raised - is testable
 * without a network to probe.
 */

export const MAX_SCAN_HOSTS = 1024

export interface ParsedCidr {
  base: number
  prefix: number
  network: string
  broadcast: string
  hostCount: number
}

const OCTET = /^\d{1,3}$/

export function ipToInt(ip: string): number | undefined {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return undefined
  let value = 0
  for (const part of parts) {
    if (!OCTET.test(part)) return undefined
    const octet = Number(part)
    if (octet > 255) return undefined
    // Leading zeros are how an address gets read as octal somewhere else in the stack, so a
    // "0192.168.0.1" style value is rejected rather than silently reinterpreted.
    if (part.length > 1 && part.startsWith('0')) return undefined
    value = value * 256 + octet
  }
  return value
}

export function intToIp(value: number) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

/**
 * Accepts IPv4 CIDR only. The prefix floor is what keeps a typo from turning into a scan of the
 * whole internet: /22 is 1022 usable addresses, which is already a long sweep for an office.
 */
export function parseCidr(input: string): ParsedCidr | undefined {
  const [address, prefixText, ...rest] = input.trim().split('/')
  if (rest.length || !prefixText) return undefined
  if (!/^\d{1,2}$/.test(prefixText)) return undefined
  const prefix = Number(prefixText)
  if (prefix < 22 || prefix > 32) return undefined
  const value = ipToInt(address)
  if (value === undefined) return undefined
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const base = (value & mask) >>> 0
  const broadcast = (base | (~mask >>> 0)) >>> 0
  const total = 2 ** (32 - prefix)
  return {
    base,
    prefix,
    network: intToIp(base),
    broadcast: intToIp(broadcast),
    // /31 and /32 have no network or broadcast address to skip.
    hostCount: total <= 2 ? total : total - 2,
  }
}

/** The addresses a scan actually probes: the usable hosts, network and broadcast left out. */
export function hostAddresses(cidr: string): string[] {
  const parsed = parseCidr(cidr)
  if (!parsed) return []
  const total = 2 ** (32 - parsed.prefix)
  if (total <= 2) return Array.from({ length: total }, (_, index) => intToIp(parsed.base + index))
  const hosts: string[] = []
  for (let offset = 1; offset < total - 1; offset++) hosts.push(intToIp((parsed.base + offset) >>> 0))
  return hosts
}

export function isInCidr(ip: string, cidr: string) {
  const parsed = parseCidr(cidr),
    value = ipToInt(ip)
  if (!parsed || value === undefined) return false
  const mask = parsed.prefix === 0 ? 0 : (0xffffffff << (32 - parsed.prefix)) >>> 0
  return (value & mask) >>> 0 === parsed.base
}

/** Normalises to lower-case colon form so the same card compares equal whatever reported it. */
export function normalizeMac(value?: string | null) {
  if (!value) return undefined
  const hex = value.replace(/[^0-9a-fA-F]/g, '').toLowerCase()
  if (hex.length !== 12) return undefined
  return (hex.match(/.{2}/g) as string[]).join(':')
}

/**
 * Vendor by OUI. The IEEE registry has tens of thousands of entries and is not worth shipping in
 * the image; this is the office-equipment slice of it, which is what an asset register is full of.
 * A miss returns undefined and the device simply shows no vendor rather than a wrong one.
 */
const OUI: Record<string, string> = {
  '00000c': 'Cisco',
  '00000e': 'Fujitsu',
  '0000aa': 'Xerox',
  '0003ea': 'Eaton',
  '0003ff': 'Microsoft',
  '000423': 'Intel',
  '000569': 'VMware',
  '000578': 'H3C',
  '0007b8': 'Corega',
  '000874': 'Dell',
  '00090f': 'Fortinet',
  '00095b': 'Netgear',
  '000ac9': 'Zyxel',
  '000b82': 'Grandstream',
  '000c29': 'VMware',
  '000c42': 'MikroTik',
  '000e8f': 'Cisco',
  '000ec6': 'ASUS',
  '000f7c': 'Axis Communications',
  '000fe2': 'H3C',
  '000ffe': 'G-Pro',
  '001125': 'IBM',
  '001256': 'Dahua',
  '001349': 'Zyxel',
  '001517': 'Intel',
  '00155d': 'Microsoft Hyper-V',
  '001565': 'Yealink',
  '001632': 'Samsung',
  '001635': 'HP',
  '0017c8': 'Kyocera',
  '0018fe': 'HP',
  '001966': 'ASUSTek',
  '001a11': 'Google',
  '001a2f': 'Cisco',
  '001b54': 'Cisco',
  '001b63': 'Apple',
  '001b78': 'HP Enterprise',
  '001c14': 'VMware',
  '001cf0': 'D-Link',
  '001d0f': 'TP-Link',
  '001dd8': 'Microsoft',
  '001e0b': 'HP',
  '001e58': 'D-Link',
  '001e8f': 'Canon',
  '001f33': 'Netgear',
  '00204c': 'Mitron',
  '00206b': 'Konica Minolta',
  '00215a': 'Lenovo',
  '00219b': 'Dell',
  '00238b': 'Quanta',
  '00248c': 'Asus',
  '00248d': 'Xiamen',
  '0024e8': 'Dell',
  '00254b': 'Apple',
  '0025ae': 'Microsoft',
  '00265e': 'Canon',
  '002673': 'Konica Minolta',
  '0026f2': 'Netgear',
  '002722': 'Ubiquiti',
  '005056': 'VMware',
  '0050f0': 'Cisco',
  '00806d': 'Panasonic',
  '008077': 'Brother',
  '008092': 'Silex',
  '00907f': 'WatchGuard',
  '00aa00': 'Intel',
  '00c0b7': 'American Power Conversion',
  '00d861': 'Micro-Star',
  '00e04c': 'Realtek',
  '00e0fc': 'Huawei',
  '109819': 'Samsung',
  '14cc20': 'TP-Link',
  '18dbf2': 'Dell',
  '1c872c': 'Asus',
  '1cbdb9': 'D-Link',
  '20f3a3': 'Huawei',
  '24a43c': 'Ubiquiti',
  '2c56dc': 'Asus',
  '2c9ef2': 'Canon',
  '30055c': 'Brother',
  '309c23': 'Micro-Star',
  '340804': 'D-Link',
  '3464a9': 'HP',
  '3c2ef5': 'Apple',
  '3c5ab4': 'Google',
  '3c9752': 'Intel',
  '3ca82a': 'Hewlett Packard',
  '3cef8c': 'Dahua',
  '4c11bf': 'Hikvision',
  '4c5e0c': 'MikroTik',
  '4cd577': 'Hon Hai/Foxconn',
  '525400': 'QEMU/KVM',
  '54ee75': 'Lenovo',
  '5ca6e6': 'TP-Link',
  '5cc9d3': 'Panasonic',
  '5cf4ab': 'Zyxel',
  '6c3b6b': 'MikroTik',
  '7054f5': 'H3C',
  '705a0f': 'HP',
  '781dba': 'Huawei',
  '788a20': 'Ubiquiti',
  '805ec0': 'Yealink',
  '88aedd': 'Hikvision',
  '8cec4b': 'Lenovo',
  '9002a9': 'Dahua',
  '9440c9': 'HP',
  '9c3dcf': 'Netgear',
  '9c5c8e': 'ASUSTek',
  '9c8e99': 'HP',
  '9c934e': 'Xerox',
  '9cb654': 'Fujitsu',
  a00460: 'Netgear',
  a42bb0: 'TP-Link',
  ac87a3: 'Apple',
  accc8e: 'Axis Communications',
  b05ada: 'HP',
  b8a44f: 'Axis Communications',
  b8ca3a: 'Dell',
  bcad28: 'Hikvision',
  c0561e: 'Hikvision',
  c074ad: 'Grandstream',
  d4ae52: 'Dell',
  d8075a: 'TP-Link',
  e02be9: 'Lenovo',
  e0508b: 'Dahua',
  e41f13: 'IBM',
  e4aa5d: 'Cisco',
  f0189e: 'Apple',
  f8bc12: 'Dell',
  fcecda: 'Ubiquiti',
}

export function vendorFromMac(mac?: string | null) {
  const normalized = normalizeMac(mac)
  if (!normalized) return undefined
  return OUI[normalized.replace(/:/g, '').slice(0, 6)]
}

export type ProbeMethod = 'ICMP' | 'TCP_PORT' | 'BOTH'
export type DeviceStatus = 'UNKNOWN' | 'UP' | 'DOWN' | 'PAUSED'

export interface ProbeOutcome {
  reachable: boolean
  responseTimeMs?: number
  openPorts: number[]
}

export interface DeviceCheckState {
  status: DeviceStatus
  consecutiveFailures: number
  monitored: boolean
}

export interface CheckResolution {
  status: DeviceStatus
  consecutiveFailures: number
  changed: boolean
  raiseAlert: boolean
  clearAlert: boolean
}

/**
 * Turns one probe result into the next stored state. A single missed reply is not an outage - a
 * busy switch drops one now and then - so a device only goes down once it has missed the subnet's
 * threshold in a row, and one reply is enough to bring it straight back up.
 */
export function resolveCheck(
  current: DeviceCheckState,
  outcome: ProbeOutcome,
  failureThreshold: number,
): CheckResolution {
  if (!current.monitored)
    return {
      status: 'PAUSED',
      consecutiveFailures: 0,
      changed: current.status !== 'PAUSED',
      raiseAlert: false,
      clearAlert: current.status === 'DOWN',
    }
  const threshold = Math.max(1, failureThreshold)
  if (outcome.reachable) {
    return {
      status: 'UP',
      consecutiveFailures: 0,
      changed: current.status !== 'UP',
      raiseAlert: false,
      clearAlert: current.status !== 'UP',
    }
  }
  const failures = current.consecutiveFailures + 1
  const down = failures >= threshold
  return {
    status: down ? 'DOWN' : current.status === 'UP' ? 'UP' : current.status,
    consecutiveFailures: failures,
    changed: down && current.status !== 'DOWN',
    raiseAlert: down && current.status !== 'DOWN',
    clearAlert: false,
  }
}

/** Uptime over a set of hourly rollups, as a percentage rounded to one decimal. */
export function uptimePercent(samples: Array<{ checks: number; successes: number }>) {
  const checks = samples.reduce((sum, sample) => sum + sample.checks, 0)
  if (!checks) return undefined
  const successes = samples.reduce((sum, sample) => sum + sample.successes, 0)
  return Math.round((successes / checks) * 1000) / 10
}

/** The hour a sample belongs to, so concurrent pollers land on the same rollup row. */
export function sampleBucket(at: Date) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours()))
}

/**
 * Matches a discovered device against the asset register. MAC is the only identifier that survives
 * a DHCP lease changing, so it outranks the address; hostname is the weakest and only counts when
 * it is an exact match on a non-empty value.
 */
export interface AssetCandidate {
  id: string
  assetTag: string
  macAddress?: string | null
  ipAddress?: string | null
  name?: string | null
}

export function matchAsset(
  device: { macAddress?: string | null; ipAddress: string; hostname?: string | null },
  assets: AssetCandidate[],
): { asset: AssetCandidate; confidence: number; reason: string } | undefined {
  const mac = normalizeMac(device.macAddress)
  if (mac) {
    const hit = assets.find(asset => normalizeMac(asset.macAddress) === mac)
    if (hit) return { asset: hit, confidence: 95, reason: 'Trùng địa chỉ MAC' }
  }
  const byIp = assets.filter(asset => asset.ipAddress && asset.ipAddress.trim() === device.ipAddress)
  if (byIp.length === 1) return { asset: byIp[0], confidence: 70, reason: 'Trùng địa chỉ IP đã khai' }
  const hostname = device.hostname?.trim().toLowerCase()
  if (hostname) {
    const byName = assets.filter(
      asset => asset.assetTag.toLowerCase() === hostname || (asset.name || '').trim().toLowerCase() === hostname,
    )
    if (byName.length === 1) return { asset: byName[0], confidence: 50, reason: 'Trùng tên máy' }
  }
  return undefined
}
