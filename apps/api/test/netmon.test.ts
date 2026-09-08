import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hostAddresses,
  intToIp,
  ipToInt,
  isInCidr,
  matchAsset,
  normalizeMac,
  parseCidr,
  resolveCheck,
  sampleBucket,
  uptimePercent,
  vendorFromMac,
} from '../src/modules/netmon/network'
import { mapWithConcurrency } from '../src/modules/netmon/probe'

test('a scan range covers the usable hosts and leaves out network and broadcast', () => {
  const hosts = hostAddresses('192.168.50.0/24')
  assert.equal(hosts.length, 254)
  assert.equal(hosts[0], '192.168.50.1')
  assert.equal(hosts[253], '192.168.50.254')
  assert.ok(!hosts.includes('192.168.50.0'), 'địa chỉ mạng không được quét')
  assert.ok(!hosts.includes('192.168.50.255'), 'địa chỉ broadcast không được quét')
})

test('a CIDR written from any address inside the range resolves to the same network', () => {
  const fromHost = parseCidr('192.168.50.15/24')
  assert.equal(fromHost?.network, '192.168.50.0')
  assert.equal(fromHost?.broadcast, '192.168.50.255')
  assert.equal(fromHost?.hostCount, 254)
})

test('a prefix wider than /22 is refused, which is what bounds a scan', () => {
  // Without this floor a typo like /8 turns one careless click into a sweep of sixteen million
  // addresses across networks that are not the office.
  assert.equal(parseCidr('10.0.0.0/8'), undefined)
  assert.equal(parseCidr('192.168.0.0/16'), undefined)
  assert.equal(parseCidr('192.168.0.0/21'), undefined)
  assert.ok(parseCidr('192.168.0.0/22'))
  assert.equal(hostAddresses('10.0.0.0/8').length, 0)
})

test('malformed addresses never become a range', () => {
  for (const value of ['', '192.168.1', '192.168.1.1', '192.168.1.256/24', 'abc/24', '192.168.1.0/33', '::1/64'])
    assert.equal(parseCidr(value), undefined, `phải từ chối ${value}`)
})

test('an octet with a leading zero is rejected rather than read as octal', () => {
  // 010 is 8 in octal and 10 in decimal; letting it through means probing a different host than
  // the one that was typed.
  assert.equal(ipToInt('192.168.010.1'), undefined)
  assert.equal(ipToInt('192.168.10.1'), 3232238081)
  assert.equal(intToIp(3232238081), '192.168.10.1')
})

test('small prefixes keep both endpoints because they have no network or broadcast address', () => {
  assert.deepEqual(hostAddresses('192.168.50.8/31'), ['192.168.50.8', '192.168.50.9'])
  assert.deepEqual(hostAddresses('192.168.50.9/32'), ['192.168.50.9'])
})

test('membership follows the mask, not the text', () => {
  assert.ok(isInCidr('192.168.50.200', '192.168.50.0/24'))
  assert.ok(!isInCidr('192.168.51.1', '192.168.50.0/24'))
  assert.ok(isInCidr('192.168.51.1', '192.168.48.0/22'))
})

test('MAC addresses compare equal whatever separator reported them', () => {
  const expected = '00:50:56:81:ce:46'
  for (const written of ['00:50:56:81:CE:46', '00-50-56-81-ce-46', '005056.81ce46', '0050 5681 ce46'])
    assert.equal(normalizeMac(written), expected, `phải chuẩn hoá ${written}`)
  for (const bad of ['', '00:50:56:81:ce', 'not-a-mac', null, undefined]) assert.equal(normalizeMac(bad), undefined)
})

test('vendor comes from the OUI, and an unknown prefix stays blank rather than guessing', () => {
  assert.equal(vendorFromMac('00:50:56:81:ce:46'), 'VMware')
  assert.equal(vendorFromMac('00:09:0f:09:00:10'), 'Fortinet')
  assert.equal(vendorFromMac('88:ae:dd:70:6e:e8'), 'Hikvision')
  assert.equal(vendorFromMac('ff:ff:ff:00:00:01'), undefined)
  assert.equal(vendorFromMac(undefined), undefined)
})

test('one missed reply is not an outage', () => {
  // A busy switch drops the odd packet. Alerting on the first miss is how a monitor becomes noise
  // that nobody reads, so the device only goes down after the subnet's threshold in a row.
  const monitored = { status: 'UP' as const, consecutiveFailures: 0, monitored: true }
  const first = resolveCheck(monitored, { reachable: false, openPorts: [] }, 3)
  assert.equal(first.status, 'UP')
  assert.equal(first.consecutiveFailures, 1)
  assert.equal(first.raiseAlert, false)
  const second = resolveCheck({ ...monitored, consecutiveFailures: 1 }, { reachable: false, openPorts: [] }, 3)
  assert.equal(second.raiseAlert, false)
  const third = resolveCheck({ ...monitored, consecutiveFailures: 2 }, { reachable: false, openPorts: [] }, 3)
  assert.equal(third.status, 'DOWN')
  assert.equal(third.raiseAlert, true)
  assert.equal(third.changed, true)
})

test('a device that is already down does not raise a second alert every check', () => {
  const down = { status: 'DOWN' as const, consecutiveFailures: 9, monitored: true }
  const again = resolveCheck(down, { reachable: false, openPorts: [] }, 3)
  assert.equal(again.status, 'DOWN')
  assert.equal(again.raiseAlert, false)
  assert.equal(again.changed, false)
})

test('a single reply brings a device straight back up and clears the alert', () => {
  const recovered = resolveCheck(
    { status: 'DOWN', consecutiveFailures: 7, monitored: true },
    { reachable: true, responseTimeMs: 4, openPorts: [445] },
    3,
  )
  assert.equal(recovered.status, 'UP')
  assert.equal(recovered.consecutiveFailures, 0)
  assert.equal(recovered.clearAlert, true)
  assert.equal(recovered.changed, true)
})

test('a paused device is never alerted on and releases any alert it was holding', () => {
  const paused = resolveCheck(
    { status: 'DOWN', consecutiveFailures: 5, monitored: false },
    { reachable: false, openPorts: [] },
    3,
  )
  assert.equal(paused.status, 'PAUSED')
  assert.equal(paused.raiseAlert, false)
  assert.equal(paused.clearAlert, true)
})

test('a threshold below one still needs a real failure', () => {
  const resolved = resolveCheck(
    { status: 'UP', consecutiveFailures: 0, monitored: true },
    { reachable: false, openPorts: [] },
    0,
  )
  assert.equal(resolved.status, 'DOWN')
  assert.equal(resolved.consecutiveFailures, 1)
})

test('uptime is measured over the rollups and is undefined when nothing was checked', () => {
  assert.equal(
    uptimePercent([
      { checks: 30, successes: 30 },
      { checks: 30, successes: 27 },
    ]),
    95,
  )
  assert.equal(uptimePercent([{ checks: 3, successes: 1 }]), 33.3)
  assert.equal(uptimePercent([]), undefined)
  assert.equal(uptimePercent([{ checks: 0, successes: 0 }]), undefined)
})

test('samples from the same hour land in one bucket so concurrent pollers do not split a row', () => {
  const early = sampleBucket(new Date('2026-09-08T03:00:01.000Z'))
  const late = sampleBucket(new Date('2026-09-08T03:59:59.000Z'))
  assert.equal(early.toISOString(), late.toISOString())
  assert.equal(early.toISOString(), '2026-09-08T03:00:00.000Z')
  assert.notEqual(sampleBucket(new Date('2026-09-08T04:00:00.000Z')).toISOString(), early.toISOString())
})

const assets = [
  { id: 'a1', assetTag: 'TS-001', name: 'Laptop kế toán', macAddress: '00:50:56:81:CE:46', ipAddress: '192.168.50.20' },
  { id: 'a2', assetTag: 'TS-002', name: 'Camera kho', macAddress: null, ipAddress: '192.168.50.30' },
  { id: 'a3', assetTag: 'PC-KT-01', name: 'PC kế toán', macAddress: null, ipAddress: null },
]

test('MAC outranks address, because a DHCP lease moves and a network card does not', () => {
  const match = matchAsset({ macAddress: '00-50-56-81-ce-46', ipAddress: '192.168.50.99' }, assets)
  assert.equal(match?.asset.id, 'a1')
  assert.equal(match?.confidence, 95)
})

test('an address match is accepted only when exactly one asset claims it', () => {
  const single = matchAsset({ ipAddress: '192.168.50.30' }, assets)
  assert.equal(single?.asset.id, 'a2')
  assert.equal(single?.confidence, 70)
  const duplicated = matchAsset({ ipAddress: '192.168.50.30' }, [
    ...assets,
    { ...assets[1], id: 'a4', assetTag: 'TS-004' },
  ])
  assert.equal(duplicated, undefined, 'hai tài sản cùng IP thì không được đoán bừa')
})

test('hostname is the weakest evidence and never overrides a MAC', () => {
  const byName = matchAsset({ ipAddress: '192.168.50.77', hostname: 'pc-kt-01' }, assets)
  assert.equal(byName?.asset.id, 'a3')
  assert.equal(byName?.confidence, 50)
  const macWins = matchAsset({ macAddress: '00:50:56:81:ce:46', ipAddress: '10.0.0.1', hostname: 'pc-kt-01' }, assets)
  assert.equal(macWins?.asset.id, 'a1')
})

test('nothing recognisable produces no match rather than the first asset in the list', () => {
  assert.equal(matchAsset({ ipAddress: '10.10.10.10' }, assets), undefined)
  assert.equal(matchAsset({ ipAddress: '10.10.10.10', hostname: '   ' }, assets), undefined)
  assert.equal(matchAsset({ ipAddress: '10.10.10.10' }, []), undefined)
})

test('the sweep keeps results in order while limiting how many run at once', async () => {
  let inFlight = 0,
    peak = 0
  const items = Array.from({ length: 40 }, (_, index) => index)
  const results = await mapWithConcurrency(items, 8, async value => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise(resolve => setTimeout(resolve, 1))
    inFlight--
    return value * 2
  })
  assert.deepEqual(
    results,
    items.map(value => value * 2),
  )
  assert.ok(peak <= 8, `chạy song song tối đa 8, thực tế ${peak}`)
  assert.ok(peak > 1, 'phải thực sự chạy song song')
})

test('an empty range does no work at all', async () => {
  let called = 0
  const results = await mapWithConcurrency([], 8, async () => {
    called++
    return 1
  })
  assert.deepEqual(results, [])
  assert.equal(called, 0)
})
