import assert from 'node:assert/strict'
import test from 'node:test'
import { IntakeExcelValidationError, parseIntakeExcelRows, resolveIntakeLookup } from '../src/features/intake/intake-excel'

const categories = [{ id: 'cat-laptop', code: 'LAPTOP', name: 'Laptop' }]
const warehouses = [{ id: 'warehouse-hn', code: 'KHO-HN', name: 'Kho Tổng Hà Nội' }]

test('intake lookup ignores case, accents and redundant spaces', () => {
  assert.equal(resolveIntakeLookup('  kho tong HA NOI ', warehouses)?.id, 'warehouse-hn')
  assert.equal(resolveIntakeLookup('laptop', categories)?.id, 'cat-laptop')
})

test('intake rows use configured defaults when optional master-data cells are blank', () => {
  const rows = [['Mã tài sản', 'Tên tài sản'], ['TS-001', 'Laptop kế toán', '', 'SERIAL-1', '', '', '', '', '25/08/2026', 12000000]]
  const parsed = parseIntakeExcelRows(rows, categories, warehouses, 'Kế toán')
  assert.equal(parsed[0].category.id, 'cat-laptop')
  assert.equal(parsed[0].warehouse.id, 'warehouse-hn')
  assert.equal(parsed[0].purchaseDate, '2026-08-25')
})

test('intake validation reports the exact row and missing master data', () => {
  const rows = [['Mã tài sản', 'Tên tài sản'], ['TS-001', 'Laptop', 'Không tồn tại', '', '', 'Kho sai']]
  assert.throws(
    () => parseIntakeExcelRows(rows, categories, warehouses),
    (error: unknown) => error instanceof IntakeExcelValidationError
      && error.message.includes('Dòng 2: Nhóm tài sản')
      && error.message.includes('Dòng 2: Kho nhập'),
  )
})
