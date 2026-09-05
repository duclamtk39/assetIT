import assert from 'node:assert/strict'
import test from 'node:test'
import { historyToTransaction } from '../src/features/handover/history-transaction'

test('reviewed assignment handover keeps receiver separate from handover location', () => {
  const transaction = historyToTransaction(
    {
      id: 'history-1',
      action: 'ASSIGNED',
      description: 'Cấp phát cho Vũ Tuấn Anh',
      createdAt: '2026-08-27T10:00:00.000Z',
      asset: { id: 'asset-1', assetTag: 'TV-HA-TSO-COM-010', name: 'PC' },
      actor: { fullName: 'Đinh Việt Anh' },
      toLocation: { name: 'TV - Hà Nội' },
      assignment: {
        assignedTo: {
          fullName: 'Vũ Tuấn Anh',
          email: 'anhvt1@tinhvan.com',
          department: { name: 'Hệ thống Thông tin' },
        },
        department: { name: 'Hệ thống Thông tin' },
        location: { name: 'TV - Hà Nội' },
        conditionOut: 'Tốt',
        expectedReturnDate: null,
      },
    },
    value => (value === 'history-1' ? 1 : 2),
  )

  assert.ok(transaction)
  assert.equal(transaction.to, 'Vũ Tuấn Anh')
  assert.equal(transaction.handoverLocation, 'TV - Hà Nội')
  assert.equal(transaction.recipientDepartment, 'Hệ thống Thông tin')
  assert.equal(transaction.recipientEmail, 'anhvt1@tinhvan.com')
  assert.equal(transaction.condition, 'Tốt')
})

test('older non-enriched history remains readable as a compatibility fallback', () => {
  const transaction = historyToTransaction(
    {
      id: 'history-2',
      action: 'TRANSFERRED',
      description: 'Điều chuyển đến Kho Tổng',
      createdAt: '2026-08-27T10:00:00.000Z',
      asset: { id: 'asset-2', assetTag: 'TS-002', name: 'Màn hình' },
      actor: { fullName: 'Quản trị viên' },
      fromLocation: { name: 'TV - Hà Nội' },
      toLocation: { name: 'Kho Tổng' },
    },
    () => 2,
  )

  assert.ok(transaction)
  assert.equal(transaction.from, 'TV - Hà Nội')
  assert.equal(transaction.to, 'Kho Tổng')
})
