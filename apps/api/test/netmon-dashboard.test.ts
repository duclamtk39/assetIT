import assert from 'node:assert/strict'
import test from 'node:test'
import {
  alertSeverity,
  byCategory,
  bySite,
  healthPercent,
  isDegraded,
  isInfrastructure,
  rankAlerts,
  responseSeries,
  siteStatus,
  statusTotals,
  topology,
  weeklyTrend,
  type DashboardDevice,
} from '../src/modules/netmon/dashboard'

const device = (overrides: Partial<DashboardDevice> = {}): DashboardDevice => ({
  id: 'd1',
  ipAddress: '10.0.10.1',
  status: 'UP',
  monitored: true,
  consecutiveFailures: 0,
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
})

test('a device that has missed a check is degraded, not down', () => {
  // It still answers, so counting it as an outage overstates the damage; it is also not healthy.
  assert.equal(isDegraded(device({ consecutiveFailures: 1 })), true)
  assert.equal(isDegraded(device()), false)
  assert.equal(isDegraded(device({ status: 'DOWN', consecutiveFailures: 5 })), false)
  assert.equal(isDegraded(device({ monitored: false, consecutiveFailures: 3 })), false)
})

test('the status buckets add up to the total instead of double counting', () => {
  // Degraded devices are a subset of UP. Reporting both without subtracting made the four cards on
  // the dashboard sum to more than the number of devices that exist.
  const devices = [
    device({ id: 'a' }),
    device({ id: 'b', consecutiveFailures: 2 }),
    device({ id: 'c', status: 'DOWN' }),
    device({ id: 'd', status: 'UNKNOWN' }),
    device({ id: 'e', status: 'PAUSED', monitored: false }),
  ]
  const totals = statusTotals(devices)
  assert.equal(totals.devices, 5)
  assert.equal(totals.up, 2)
  assert.equal(totals.warning, 1)
  assert.equal(totals.healthy, 1)
  assert.equal(totals.healthy + totals.warning + totals.down + totals.unknown + totals.paused, totals.devices)
})

test('health is the share answering, and an empty register reads zero rather than NaN', () => {
  assert.equal(healthPercent([device(), device({ id: 'b', status: 'DOWN' })]), 50)
  assert.equal(healthPercent([]), 0)
  assert.equal(healthPercent([device(), device({ id: 'b' }), device({ id: 'c', status: 'DOWN' })]), 66.7)
})

test('severity climbs with the length of the outage', () => {
  assert.equal(alertSeverity(5), 'NORMAL')
  assert.equal(alertSeverity(15), 'HIGH')
  assert.equal(alertSeverity(59), 'HIGH')
  assert.equal(alertSeverity(60), 'CRITICAL')
})

test('infrastructure is escalated one level, because a core switch is not a desk phone', () => {
  assert.equal(alertSeverity(5, 'Switch'), 'HIGH')
  assert.equal(alertSeverity(20, 'Firewall'), 'CRITICAL')
  assert.equal(alertSeverity(90, 'Máy chủ'), 'CRITICAL')
  assert.equal(alertSeverity(5, 'Laptop'), 'NORMAL')
  assert.ok(isInfrastructure('Thiết bị mạng'))
  assert.ok(!isInfrastructure('Camera'))
  assert.ok(!isInfrastructure(null))
})

test('alerts are ordered by severity first and then by how long they have been down', () => {
  const now = new Date('2026-09-08T12:00:00.000Z')
  const ranked = rankAlerts(
    [
      {
        id: 'minor',
        status: 'OPEN',
        downSince: new Date('2026-09-08T11:55:00.000Z'),
        device: device({ id: 'x', ipAddress: '10.0.10.7', asset: { assetTag: 'TS-7', name: 'Camera' } }),
      },
      {
        id: 'long',
        status: 'OPEN',
        downSince: new Date('2026-09-08T09:00:00.000Z'),
        device: device({ id: 'y', ipAddress: '10.0.10.8', asset: { assetTag: 'TS-8', name: 'PC' } }),
      },
      {
        id: 'switch',
        status: 'ACKNOWLEDGED',
        downSince: new Date('2026-09-08T11:50:00.000Z'),
        device: device({
          id: 'z',
          ipAddress: '10.0.10.9',
          asset: { assetTag: 'SW-1', name: 'Core switch', category: { name: 'Switch' } },
        }),
      },
    ],
    now,
  )
  assert.deepEqual(
    ranked.map(alert => alert.id),
    ['long', 'switch', 'minor'],
  )
  assert.equal(ranked[0].severity, 'CRITICAL')
  assert.equal(ranked[0].minutesDown, 180)
  assert.equal(ranked[1].acknowledged, true)
  assert.equal(ranked[2].severity, 'NORMAL')
})

test('an alert raised in the future never renders a negative outage', () => {
  const ranked = rankAlerts(
    [{ id: 'a', status: 'OPEN', downSince: new Date('2026-09-08T12:05:00.000Z'), device: device() }],
    new Date('2026-09-08T12:00:00.000Z'),
  )
  assert.equal(ranked[0].minutesDown, 0)
})

test('devices group by category and by site, with the unlinked ones visible rather than dropped', () => {
  const devices = [
    device({
      id: 'a',
      asset: { assetTag: 'A', name: 'a', category: { name: 'Camera' }, location: { id: 'l1', name: 'Trụ sở' } },
    }),
    device({
      id: 'b',
      status: 'DOWN',
      asset: { assetTag: 'B', name: 'b', category: { name: 'Camera' }, location: { id: 'l1', name: 'Trụ sở' } },
    }),
    device({ id: 'c', subnet: { id: 's1', name: 'LAN' } }),
  ]
  const categories = byCategory(devices)
  assert.equal(categories[0].name, 'Camera', 'nhóm có sự cố phải đứng trước')
  assert.equal(categories[0].down, 1)
  assert.ok(categories.some(bucket => bucket.name === 'Chưa gán tài sản'))
  const sites = bySite(devices)
  assert.equal(sites[0].name, 'Trụ sở')
  assert.equal(sites[0].devices, 2)
  assert.ok(sites.some(bucket => bucket.name === 'LAN'))
})

test('a site is critical only once a fifth of it is down', () => {
  assert.equal(siteStatus({ key: 'a', name: 'a', devices: 10, up: 9, warning: 0, down: 1 }), 'WARNING')
  assert.equal(siteStatus({ key: 'a', name: 'a', devices: 10, up: 8, warning: 0, down: 2 }), 'CRITICAL')
  assert.equal(siteStatus({ key: 'a', name: 'a', devices: 10, up: 9, warning: 1, down: 0 }), 'WARNING')
  assert.equal(siteStatus({ key: 'a', name: 'a', devices: 10, up: 10, warning: 0, down: 0 }), 'OK')
})

test('the response series is a weighted mean, not an average of averages', () => {
  // One device polled twice must not carry the same weight as forty polled once. Dividing the summed
  // milliseconds by the successful checks is what keeps a quiet hour from dominating a busy one.
  const now = new Date('2026-09-08T12:30:00.000Z')
  const hour = new Date('2026-09-08T12:00:00.000Z')
  const series = responseSeries(
    [
      { bucketStart: hour, checks: 2, successes: 2, sumResponseMs: 20, maxResponseMs: 15 },
      { bucketStart: hour, checks: 8, successes: 8, sumResponseMs: 800, maxResponseMs: 140 },
    ],
    24,
    now,
  )
  const point = series[series.length - 1]
  assert.equal(point.avgResponseMs, 82, '(20+800)/10 = 82, không phải (10+100)/2 = 55')
  assert.equal(point.maxResponseMs, 140)
  assert.equal(point.uptimePercent, 100)
})

test('an hour where nothing answered is a gap, not a zero millisecond reading', () => {
  const now = new Date('2026-09-08T12:30:00.000Z')
  const series = responseSeries(
    [
      {
        bucketStart: new Date('2026-09-08T12:00:00.000Z'),
        checks: 4,
        successes: 0,
        sumResponseMs: 0,
        maxResponseMs: null,
      },
    ],
    24,
    now,
  )
  const point = series[series.length - 1]
  assert.equal(point.avgResponseMs, null, 'không có lần nào thành công thì không có số để vẽ')
  assert.equal(point.uptimePercent, 0)
})

test('the series always spans the full window even before any data exists', () => {
  const series = responseSeries([], 24, new Date('2026-09-08T12:30:00.000Z'))
  assert.equal(series.length, 24)
  assert.ok(series.every(point => point.avgResponseMs === null))
  assert.equal(series[23].hour, '2026-09-08T12:00:00.000Z')
  assert.equal(series[0].hour, '2026-09-07T13:00:00.000Z')
})

test('the weekly trend only reports what the data can support', () => {
  const now = new Date('2026-09-08T12:00:00.000Z')
  const trend = weeklyTrend(
    [
      device({ id: 'old', firstSeenAt: new Date('2026-08-01T00:00:00Z') }),
      device({ id: 'new', firstSeenAt: new Date('2026-09-05T00:00:00Z') }),
    ],
    [
      { toStatus: 'DOWN', occurredAt: new Date('2026-09-06T00:00:00Z') },
      { toStatus: 'UP', occurredAt: new Date('2026-09-06T01:00:00Z') },
      { toStatus: 'DOWN', occurredAt: new Date('2026-08-01T00:00:00Z') },
    ],
    now,
  )
  assert.deepEqual(trend, { newDevices: 1, outagesOpened: 1, recoveries: 1 })
})

test('topology reflects the declared subnets and nothing that was not measured', () => {
  const devices = [
    device({
      id: 'a',
      subnet: { id: 's1', name: 'LAN' },
      asset: { assetTag: 'A', name: 'a', category: { name: 'PC' } },
    }),
    device({ id: 'b', status: 'DOWN', subnet: { id: 's1', name: 'LAN' } }),
  ]
  const tree = topology(devices, [
    { id: 's1', name: 'LAN', cidr: '10.0.10.0/24' },
    { id: 's2', name: 'Camera VLAN', cidr: '10.0.20.0/24' },
  ])
  assert.equal(tree.length, 2)
  assert.equal(tree[0].devices, 2)
  assert.equal(tree[0].down, 1)
  assert.equal(tree[1].devices, 0, 'dải chưa quét vẫn hiện, với số 0 thay vì bị ẩn')
  assert.ok(tree[0].groups.some(group => group.name === 'PC'))
})
