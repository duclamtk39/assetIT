import assert from 'node:assert/strict'
import test from 'node:test'
import type { Asset } from '../src/types'
import {
  daysUntilDue,
  isDueSoon,
  isInStock,
  isOverdue,
  matchesOperationalStatus,
  operationalStatusOptions,
} from '../src/features/assets/asset-status'

// `now` is always built from local components: daysUntilDue reads the current calendar day
// through the local getters, so an ISO string with a fixed offset would land on a different day
// depending on the runner's timezone and make these assertions pass only in UTC+7.
const asset = (overrides: Partial<Asset> = {}): Asset =>
  ({
    id: 1,
    code: 'TS-2026-001',
    name: 'Dock Dell WD22TB4',
    category: 'Phụ kiện',
    serial: 'DELL-WD22-0621',
    department: 'IT',
    location: 'Kho Tổng',
    assignedTo: 'Chưa gán',
    purchaseDate: '2026-05-10',
    purchaseCost: 6990000,
    status: 'Sẵn sàng',
    icon: 'laptop',
    ...overrides,
  }) as Asset

test('an asset is not overdue on the calendar day it is due', () => {
  const now = new Date(2026, 8, 7, 15, 30)
  const dueToday = asset({ dueDate: '2026-09-07T00:00:00.000Z' })
  assert.equal(daysUntilDue(dueToday.dueDate, now), 0)
  assert.equal(isOverdue(dueToday, now), false)
  assert.equal(isDueSoon(dueToday, 7, now), true)
})

test('an asset becomes overdue only once the due day has passed', () => {
  const now = new Date(2026, 8, 7, 0, 30)
  assert.equal(isOverdue(asset({ dueDate: '2026-09-06T00:00:00.000Z' }), now), true)
  assert.equal(isOverdue(asset({ dueDate: '2026-09-08T00:00:00.000Z' }), now), false)
})

test('due-soon covers the whole window and stops outside it', () => {
  const now = new Date(2026, 8, 7, 9, 0)
  assert.equal(isDueSoon(asset({ dueDate: '2026-09-14T00:00:00.000Z' }), 7, now), true)
  assert.equal(isDueSoon(asset({ dueDate: '2026-09-15T00:00:00.000Z' }), 7, now), false)
  assert.equal(isDueSoon(asset({ dueDate: '2026-09-06T00:00:00.000Z' }), 7, now), false)
})

test('a missing or unparsable due date never marks an asset late', () => {
  assert.equal(daysUntilDue(undefined), undefined)
  assert.equal(daysUntilDue('không phải ngày'), undefined)
  assert.equal(isOverdue(asset()), false)
  assert.equal(isDueSoon(asset()), false)
})

test('stock is decided by the warehouse the record points at, not by the location wording', () => {
  assert.equal(isInStock(asset({ warehouse: 'Trung tâm lưu trữ Miền Bắc', location: 'Tầng hầm B1' })), true)
  assert.equal(isInStock(asset({ warehouse: '', location: 'Kho Tổng · Kệ A02' })), false)
})

test('an asset that is assigned or unavailable is not in stock', () => {
  assert.equal(isInStock(asset({ warehouse: 'Kho Tổng', assignedTo: 'Nguyễn Minh Anh' })), false)
  assert.equal(isInStock(asset({ warehouse: 'Kho Tổng', status: 'Bảo trì' })), false)
})

test('operational status filter matches loans, due states and plain statuses', () => {
  const now = new Date(2026, 8, 7, 9, 0)
  const loan = asset({ assignmentType: 'Cho mượn', assignedTo: 'Nguyễn Minh Anh', status: 'Đang sử dụng' })
  assert.equal(matchesOperationalStatus(loan, 'Cho mượn'), true)
  // A loan is still an asset in use, so it stays visible under the plain status too.
  assert.equal(matchesOperationalStatus(loan, 'Đang sử dụng'), true)
  assert.equal(matchesOperationalStatus(asset(), 'Cho mượn'), false)
  assert.equal(matchesOperationalStatus(asset(), 'Sẵn sàng'), true)
  assert.equal(matchesOperationalStatus(asset(), ''), true)
  assert.equal(matchesOperationalStatus(asset(), 'Tất cả trạng thái'), true)
  assert.equal(isOverdue(asset({ dueDate: '2026-09-01T00:00:00.000Z' }), now), true)
})

test('the status filter offers every state the mapper can produce', () => {
  const mapped = ['Sẵn sàng', 'Đang sử dụng', 'Bảo trì', 'Hỏng', 'Đã giữ chỗ', 'Đã thu hồi', 'Đã thanh lý']
  mapped.forEach(status => assert.ok(operationalStatusOptions.includes(status), `thiếu trạng thái ${status}`))
  assert.equal(operationalStatusOptions[0], 'Tất cả trạng thái')
  assert.equal(new Set(operationalStatusOptions).size, operationalStatusOptions.length)
})
