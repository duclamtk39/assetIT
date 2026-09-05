import assert from 'node:assert/strict'
import test from 'node:test'
import { findAssetByScannedValue, normalizeScannedValue } from '../src/features/scanner/scan-lookup'
import type { Asset } from '../src/types'

const asset = {
  id: 1,
  code: 'TS-2026-001',
  barcode: 'BC-000001',
  qrCode: 'TS-2026-001',
  serial: 'FVFGH20PLK',
  name: 'MacBook Pro',
  category: 'Laptop',
  department: 'IT',
  location: 'Kho Tổng',
  assignedTo: 'Chưa gán',
  purchaseDate: '2026-08-24',
  purchaseCost: 1,
  status: 'Sẵn sàng',
  icon: 'laptop',
} satisfies Asset

test('simulated CODE128 payload resolves the asset', () =>
  assert.equal(findAssetByScannedValue([asset], 'BC-000001')?.code, 'TS-2026-001'))
test('simulated QR payload resolves the asset and ignores surrounding whitespace', () =>
  assert.equal(findAssetByScannedValue([asset], '  TS-2026-001\n')?.name, 'MacBook Pro'))
test('serial can be entered by a USB scanner or keyboard', () =>
  assert.equal(findAssetByScannedValue([asset], 'fvfgh20plk')?.code, 'TS-2026-001'))
test('unknown and empty payloads do not produce a false match', () => {
  assert.equal(findAssetByScannedValue([asset], 'UNKNOWN'), null)
  assert.equal(findAssetByScannedValue([asset], '   '), null)
})
test('scanner normalization is case and Vietnamese diacritic insensitive', () =>
  assert.equal(normalizeScannedValue('  Mã-TS-01 '), 'ma ts 01'))
