import assert from 'node:assert/strict'
import test from 'node:test'
import type { Asset } from '../src/types'
import {
  assetSpecs,
  dueLabel,
  hasCustodian,
  initials,
  latestTransactions,
  readableNote,
  specCompleteness,
  transactionTone,
} from '../src/features/assets/asset-detail'

const asset = (overrides: Partial<Asset> = {}): Asset =>
  ({
    id: 1,
    code: 'TV-HA-TSO-BOX-001',
    name: 'BOX Ổ CỨNG',
    category: 'Ổ lưu trữ ngoài',
    serial: '',
    department: 'TSO',
    location: 'KHO',
    assignedTo: 'Bùi Thanh Tùng',
    purchaseDate: '2026-09-08',
    purchaseCost: 0,
    status: 'Đang sử dụng',
    icon: 'box',
    ...overrides,
  }) as Asset

test('the spec sheet lists every technical field in a fixed order', () => {
  const rows = assetSpecs(asset({ cpu: 'Intel i7', ipAddress: '10.10.1.25' }))
  assert.deepEqual(
    rows.map(row => row.label),
    ['Hãng sản xuất', 'Model', 'CPU', 'RAM', 'Ổ đĩa', 'Hệ điều hành', 'Địa chỉ IP', 'Địa chỉ MAC'],
  )
  assert.equal(rows[2].value, 'Intel i7')
  assert.equal(rows[6].value, '10.10.1.25')
})

test('a blank or whitespace value counts as missing, not as filled in', () => {
  // A field saved as "  " would otherwise show an empty cell and still count towards 8/8.
  const rows = assetSpecs(asset({ cpu: '   ', ram: '16 GB', model: '' }))
  assert.equal(rows.find(row => row.label === 'CPU')?.value, undefined)
  assert.equal(rows.find(row => row.label === 'Model')?.value, undefined)
  assert.deepEqual(specCompleteness(rows), { filled: 1, total: 8 })
})

test('completeness reads the whole sheet', () => {
  const full = asset({
    manufacturer: 'Dell',
    model: 'OptiPlex',
    cpu: 'i5',
    ram: '8 GB',
    storage: 'SSD 256 GB',
    operatingSystem: 'Windows 11',
    ipAddress: '10.0.0.5',
    macAddress: '00:1A:2B:3C:4D:5E',
  })
  assert.deepEqual(specCompleteness(assetSpecs(full)), { filled: 8, total: 8 })
  assert.deepEqual(specCompleteness(assetSpecs(asset())), { filled: 0, total: 8 })
})

test('an unassigned asset is not rendered as a person', () => {
  // "Chưa gán" is the register's word for nobody. Treating it as a name would put a "CG" avatar on
  // a device sitting in the warehouse.
  assert.equal(hasCustodian(asset()), true)
  assert.equal(hasCustodian(asset({ assignedTo: 'Chưa gán' })), false)
  assert.equal(hasCustodian(asset({ assignedTo: '  ' })), false)
  assert.equal(hasCustodian(asset({ assignedTo: '' })), false)
})

test('initials come from the given names a Vietnamese name is called by', () => {
  assert.equal(initials('Bùi Thanh Tùng'), 'TT')
  assert.equal(initials('Đinh Việt Anh'), 'VA')
  assert.equal(initials('Abe Satoshi'), 'AS')
  assert.equal(initials('Lan'), 'L')
  assert.equal(initials('  nguyễn   văn   an  '), 'VA')
  assert.equal(initials(''), '?')
  assert.equal(initials(undefined), '?')
})

test('an asset with no due date is issued, not overdue', () => {
  assert.equal(dueLabel(undefined), 'Không giới hạn')
  assert.equal(dueLabel(''), 'Không giới hạn')
  assert.equal(dueLabel('không phải ngày'), 'Không giới hạn')
  assert.match(dueLabel('2026-12-31'), /2026/)
})

test('recent activity is the newest movements, whatever order history arrives in', () => {
  // Showing the first three of an unsorted list would describe where the asset was a year ago as if
  // that were its current state.
  const tx = (id: number, date: string) => ({ id, date }) as any
  const history = [
    tx(1, '2026-01-05'),
    tx(2, '2026-09-07T10:00:00Z'),
    tx(3, '2026-03-01'),
    tx(4, '2026-09-07T08:00:00Z'),
  ]
  assert.deepEqual(
    latestTransactions(history, 3).map(t => t.id),
    [2, 4, 3],
  )
  assert.equal(history[0].id, 1, 'không được làm đảo thứ tự mảng gốc')
  assert.deepEqual(latestTransactions([], 3), [])
  assert.deepEqual(latestTransactions(history, 0), [])
})

test('the overview and the timeline colour each movement the same way', () => {
  assert.equal(transactionTone('Cấp phát'), 'purple')
  assert.equal(transactionTone('Thu hồi'), 'orange')
  assert.equal(transactionTone('Nhập kho'), 'green')
  assert.equal(transactionTone('Điều chuyển'), 'blue')
  assert.equal(transactionTone('Cho mượn'), 'blue', 'giữ đúng màu timeline đang dùng')
})

test('history written with a raw return outcome reads in Vietnamese', () => {
  // Rows created before the API fix store "kết quả BROKEN" as text; translating on display is what
  // fixes the history that already exists.
  assert.equal(readableNote('Thu hồi từ Trần Đức Long; kết quả BROKEN'), 'Thu hồi từ Trần Đức Long; kết quả Hỏng')
  assert.equal(readableNote('Thu hồi từ A; kết quả READY'), 'Thu hồi từ A; kết quả Sẵn sàng')
  assert.equal(readableNote('Thu hồi từ A; kết quả MAINTENANCE'), 'Thu hồi từ A; kết quả Cần bảo trì')
})

test('only an outcome after "kết quả" is translated, free text is left alone', () => {
  assert.equal(readableNote('Máy READY để giao'), 'Máy READY để giao')
  assert.equal(readableNote('kết quả BROKENX'), 'kết quả BROKENX')
  assert.equal(readableNote(''), '')
  assert.equal(readableNote(undefined), undefined)
})
