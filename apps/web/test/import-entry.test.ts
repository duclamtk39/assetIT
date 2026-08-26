import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('asset register delegates Excel intake to the single staged warehouse workflow', () => {
  assert.equal((source.match(/readXlsxFile\(file\)/g) || []).length, 0)
  assert.equal((source.match(/readSheet\(file\)/g) || []).length, 1)
  assert.match(source, /onOpenImport=\{\(\)=>\{setIntakeMode\('import'\);setPage\('Nhập kho'\)\}\}/)
})
