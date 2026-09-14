import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addMonths,
  ageLabel,
  costOfOwnership,
  monthsBetween,
  warrantyLabel,
  warrantyStatus,
} from '../src/modules/assets/asset-overview'

const d = (value: string) => new Date(`${value}T00:00:00Z`)

test('adding months clamps to the last day of a shorter month', () => {
  assert.equal(addMonths(d('2026-01-31'), 1).toISOString().slice(0, 10), '2026-02-28')
  assert.equal(addMonths(d('2024-01-31'), 1).toISOString().slice(0, 10), '2024-02-29')
  assert.equal(addMonths(d('2026-03-15'), 36).toISOString().slice(0, 10), '2029-03-15')
})

test('months are counted by calendar, not 30-day blocks', () => {
  assert.equal(monthsBetween(d('2026-01-20'), d('2026-02-19')), 0)
  assert.equal(monthsBetween(d('2026-01-20'), d('2026-02-20')), 1)
  assert.equal(monthsBetween(d('2026-05-01'), d('2026-01-01')), 0, 'a future purchase date is not negative')
})

test('an explicit warranty expiry wins over purchase date plus months', () => {
  const now = d('2026-09-14')
  const explicit = warrantyStatus(
    { purchaseDate: d('2026-01-01'), warrantyMonths: 36, warrantyExpiry: d('2026-10-01') },
    now,
  )
  assert.equal(explicit.state, 'EXPIRING')
  assert.equal(explicit.daysLeft, 17)
  const derived = warrantyStatus({ purchaseDate: d('2026-01-01'), warrantyMonths: 36 }, now)
  assert.equal(derived.state, 'ACTIVE')
  assert.equal(derived.expiry?.toISOString().slice(0, 10), '2029-01-01')
})

test('no warranty data is unknown, and a lapsed one is expired', () => {
  const now = d('2026-09-14')
  assert.equal(warrantyStatus({ purchaseDate: d('2026-01-01') }, now).state, 'UNKNOWN')
  assert.equal(warrantyStatus({}, now).state, 'UNKNOWN')
  assert.equal(warrantyStatus({ purchaseDate: d('2024-01-01'), warrantyMonths: 12 }, now).state, 'EXPIRED')
})

test('age and warranty read as Vietnamese words', () => {
  const now = d('2026-09-14')
  assert.equal(ageLabel(undefined, now), null)
  assert.equal(ageLabel(d('2026-09-01'), now), 'Dưới 1 tháng')
  assert.equal(ageLabel(d('2025-11-14'), now), '10 tháng')
  assert.equal(ageLabel(d('2024-09-14'), now), '2 năm')
  assert.equal(ageLabel(d('2023-06-14'), now), '3 năm 3 tháng')
  assert.equal(warrantyLabel('UNKNOWN', null), 'Chưa khai bảo hành')
  assert.equal(warrantyLabel('EXPIRED', -5), 'Đã hết bảo hành')
  assert.equal(warrantyLabel('EXPIRING', 17), 'Còn 17 ngày bảo hành')
  assert.equal(warrantyLabel('ACTIVE', 200), 'Còn 6 tháng bảo hành')
  assert.equal(warrantyLabel('ACTIVE', 800), 'Còn 2 năm 2 tháng bảo hành')
})

test('cost of ownership adds only recorded, non-cancelled maintenance costs', () => {
  const cost = costOfOwnership(20_000_000, [
    { status: 'COMPLETED', cost: 1_500_000 },
    { status: 'CANCELLED', cost: 9_000_000 },
    { status: 'OPEN', cost: null },
    { status: 'IN_PROGRESS', cost: 0 },
  ])
  assert.deepEqual(cost, { purchase: 20_000_000, maintenance: 1_500_000, total: 21_500_000, costedJobs: 2 })
  assert.deepEqual(costOfOwnership(null, []), { purchase: 0, maintenance: 0, total: 0, costedJobs: 0 })
})
