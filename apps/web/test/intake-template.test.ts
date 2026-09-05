import assert from 'node:assert/strict'
import test from 'node:test'
import readXlsxFile from 'read-excel-file/node'
import writeXlsxFile from 'write-excel-file/node'
import {
  createIntakeTemplateSheets,
  intakeTemplateFileName,
  intakeTemplateHeaders,
} from '../src/features/intake/intake-template'

test('warehouse template uses the current multi-sheet Excel writer contract', () => {
  const sheets = createIntakeTemplateSheets([{ name: 'Laptop', code: 'LAPTOP' }], [{ name: 'Kho Tổng', code: 'MAIN' }])

  assert.equal(intakeTemplateFileName, 'mau-nhap-kho-tai-san.xlsx')
  assert.equal(sheets.length, 2)
  assert.equal(sheets[0].sheet, 'Nhập kho')
  assert.equal(sheets[0].data[0].length, intakeTemplateHeaders.length)
  assert.equal(sheets[0].data[0][0].value, 'Mã tài sản')
  assert.equal(sheets[1].sheet, 'Danh mục hợp lệ')
  assert.deepEqual(
    sheets[1].data[1].map(cell => cell.value),
    ['Laptop', 'LAPTOP', 'Kho Tổng', 'MAIN'],
  )
})

test('warehouse template produces a valid readable xlsx workbook', async () => {
  const sheets = createIntakeTemplateSheets([{ name: 'Laptop', code: 'LAPTOP' }], [{ name: 'Kho Tổng', code: 'MAIN' }])
  const workbook = await writeXlsxFile(sheets, {}).toBuffer()
  const parsed = await readXlsxFile(workbook)

  assert.equal(workbook.subarray(0, 2).toString(), 'PK')
  assert.deepEqual(
    parsed.map(sheet => sheet.sheet),
    ['Nhập kho', 'Danh mục hợp lệ'],
  )
  assert.equal(parsed[0].data[0][0], 'Mã tài sản')
  assert.deepEqual(parsed[1].data[1], ['Laptop', 'LAPTOP', 'Kho Tổng', 'MAIN'])
})
