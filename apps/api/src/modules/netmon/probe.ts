import { execFile } from 'node:child_process'
import { createConnection } from 'node:net'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { normalizeMac, type ProbeMethod, type ProbeOutcome } from './network'

const run = promisify(execFile)

/**
 * The part that actually touches the network.
 *
 * ICMP goes through the system `ping`, which on Linux opens an unprivileged ICMP datagram socket
 * when net.ipv4.ping_group_range allows the running group - so this works with every capability
 * dropped, and no NET_RAW is added anywhere. Where the kernel does not allow it, ping fails and the
 * TCP probe is what answers, which is why BOTH is the default: a device that refuses ICMP but has a
 * management port open still reads as up, and one that answers only ICMP does too.
 */

const PING_TIMEOUT_SECONDS = 1
const TCP_TIMEOUT_MS = Number(process.env.NETMON_TCP_TIMEOUT_MS || 900)

/** Sends one echo request. Returns the round trip in milliseconds, or undefined if nothing replied. */
export async function icmpProbe(ip: string): Promise<number | undefined> {
  const started = Date.now()
  try {
    const { stdout } = await run('ping', ['-c', '1', '-W', String(PING_TIMEOUT_SECONDS), ip], {
      timeout: (PING_TIMEOUT_SECONDS + 1) * 1000,
      windowsHide: true,
    })
    // Prefer the round trip ping itself measured; fall back to the wall clock around the call.
    const reported = /time[=<]\s*([\d.]+)\s*ms/i.exec(stdout)
    if (!/1 (packets )?received/i.test(stdout) && !reported) return undefined
    return reported ? Math.max(0, Math.round(Number(reported[1]))) : Date.now() - started
  } catch {
    return undefined
  }
}

/** One TCP connect. Resolves to the connect time, or undefined when refused, filtered or timed out. */
export function tcpProbe(ip: string, port: number, timeoutMs = TCP_TIMEOUT_MS): Promise<number | undefined> {
  return new Promise(resolve => {
    const started = Date.now()
    let settled = false
    const finish = (value?: number) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }
    const socket = createConnection({ host: ip, port })
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(Date.now() - started))
    socket.once('timeout', () => finish(undefined))
    socket.once('error', () => finish(undefined))
  })
}

/**
 * Probes one address by the subnet's method. A refused TCP connection is deliberately not counted as
 * reachable even though it proves a host is there: the ports listed for a subnet are the ones its
 * devices are expected to serve, and treating a refusal as "up" would report a running host for
 * every address the firewall answers for.
 */
export async function probeHost(ip: string, method: ProbeMethod, ports: number[]): Promise<ProbeOutcome> {
  const wantsIcmp = method === 'ICMP' || method === 'BOTH'
  const wantsTcp = (method === 'TCP_PORT' || method === 'BOTH') && ports.length > 0
  const icmp = wantsIcmp ? await icmpProbe(ip) : undefined
  if (icmp !== undefined && method === 'ICMP') return { reachable: true, responseTimeMs: icmp, openPorts: [] }
  if (!wantsTcp) return { reachable: icmp !== undefined, responseTimeMs: icmp, openPorts: [] }
  const results = await Promise.all(ports.map(async port => ({ port, ms: await tcpProbe(ip, port) })))
  const open = results.filter(result => result.ms !== undefined)
  const fastest = open.length ? Math.min(...open.map(result => result.ms as number)) : undefined
  return {
    reachable: icmp !== undefined || open.length > 0,
    responseTimeMs: icmp ?? fastest,
    openPorts: open.map(result => result.port).sort((a, b) => a - b),
  }
}

/**
 * Reads the kernel's neighbour table for an address the host has just talked to. This is why a scan
 * pings before it reads: the reply is what populates the entry. It only works for addresses on a
 * network the host is directly attached to, so a device behind a router has no MAC here and is
 * matched on address or hostname instead.
 */
export async function arpLookup(ip: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('arp', ['-n', ip], { timeout: 2000, windowsHide: true })
    const match = /([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})/.exec(stdout)
    if (match) return normalizeMac(match[1])
  } catch {
    // busybox images often ship no arp binary; /proc is the fallback below.
  }
  try {
    const table = await readFile('/proc/net/arp', 'utf8')
    for (const line of table.split('\n').slice(1)) {
      const columns = line.trim().split(/\s+/)
      if (columns[0] === ip && columns[3] && columns[3] !== '00:00:00:00:00:00') return normalizeMac(columns[3])
    }
  } catch {
    // No neighbour table available: the device simply has no MAC recorded.
  }
  return undefined
}

/**
 * Runs `worker` over `items` with a bounded number in flight. A /24 sweep is 254 addresses and each
 * one may sit on a timeout, so this is what keeps a scan to seconds rather than minutes without
 * opening 254 sockets at once.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}
