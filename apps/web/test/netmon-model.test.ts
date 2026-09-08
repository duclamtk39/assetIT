import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareIp,
  deviceName,
  outageLabel,
  sinceLabel,
  toList,
  uptimeFromSamples,
  type NetDevice,
} from '../src/features/netmon/netmon-model'

const device = (overrides: Partial<NetDevice> = {}): NetDevice => ({
  id: 'd1',
  ipAddress: '192.168.50.20',
  status: 'UP',
  monitored: true,
  openPorts: [445],
  consecutiveFailures: 0,
  ...overrides,
})

test('addresses sort the way a person reads them, not as text', () => {
  // Plain string sort puts .10 before .2, which scrambles every subnet listing.
  const sorted = ['192.168.50.10', '192.168.50.2', '192.168.50.100', '192.168.50.1'].sort(compareIp)
  assert.deepEqual(sorted, ['192.168.50.1', '192.168.50.2', '192.168.50.10', '192.168.50.100'])
})

test('a device is named by the register first, then its label, then its address', () => {
  assert.equal(
    deviceName(device({ asset: { id: 'a1', assetTag: 'TS-001', name: 'Camera kho' }, label: 'Cam 1' })),
    'TS-001 · Camera kho',
  )
  assert.equal(deviceName(device({ label: 'Cam 1', hostname: 'cam-01' })), 'Cam 1')
  assert.equal(deviceName(device({ hostname: 'cam-01' })), 'cam-01')
  assert.equal(deviceName(device()), '192.168.50.20')
})

test('age reads in the largest unit that still says something useful', () => {
  const now = Date.parse('2026-09-08T12:00:00.000Z')
  assert.equal(sinceLabel('2026-09-08T11:59:30.000Z', now), '30 giây trước')
  assert.equal(sinceLabel('2026-09-08T11:45:00.000Z', now), '15 phút trước')
  assert.equal(sinceLabel('2026-09-08T09:00:00.000Z', now), '3 giờ trước')
  assert.equal(sinceLabel('2026-09-06T12:00:00.000Z', now), '2 ngày trước')
})

test('a device that has never been seen shows a dash rather than 1970', () => {
  assert.equal(sinceLabel(undefined), '—')
  assert.equal(sinceLabel(null), '—')
  assert.equal(sinceLabel('not a date'), '—')
})

test('a clock skewed into the future never renders a negative age', () => {
  const now = Date.parse('2026-09-08T12:00:00.000Z')
  assert.equal(sinceLabel('2026-09-08T12:05:00.000Z', now), '0 giây trước')
})

test('an outage is phrased as how long it has lasted', () => {
  const now = Date.parse('2026-09-08T12:00:00.000Z')
  assert.equal(outageLabel('2026-09-08T11:35:00.000Z', now), '25 phút')
  assert.equal(outageLabel('2026-09-08T09:20:00.000Z', now), '2 giờ 40 phút')
  assert.equal(outageLabel('2026-09-06T10:00:00.000Z', now), '2 ngày 2 giờ')
})

test('uptime comes from the rollups and is undefined before anything was measured', () => {
  assert.equal(
    uptimeFromSamples([
      { bucketStart: '', checks: 30, successes: 30 },
      { bucketStart: '', checks: 30, successes: 24 },
    ]),
    90,
  )
  assert.equal(uptimeFromSamples([]), undefined)
  assert.equal(uptimeFromSamples([{ bucketStart: '', checks: 0, successes: 0 }]), undefined)
})

test('list payloads normalise whichever shape the endpoint answers with', () => {
  // The netmon endpoints are a mix: subnets and alerts answer with a bare array, devices with
  // { data }. Calling .map() on the wrong one is what blanked the inventory screen once already.
  assert.deepEqual(toList([{ id: 'a' }]), [{ id: 'a' }])
  assert.deepEqual(toList({ data: [{ id: 'b' }] }), [{ id: 'b' }])
  assert.deepEqual(toList({ items: [{ id: 'c' }] }), [{ id: 'c' }])
})

test('an unusable payload becomes an empty list instead of breaking the render', () => {
  for (const payload of [undefined, null, {}, { data: null }, { data: 'x' }, { items: 3 }, 'oops', 42])
    assert.deepEqual(toList(payload), [])
})
