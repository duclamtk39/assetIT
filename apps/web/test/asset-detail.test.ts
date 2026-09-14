import assert from 'node:assert/strict'
import test from 'node:test'
import type { Asset } from '../src/types'
import { assetSpecs, dueLabel, hasCustodian, initials, specCompleteness } from '../src/features/assets/asset-detail'

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
