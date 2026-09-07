import assert from 'node:assert/strict'
import test from 'node:test'
import {
  annexControls,
  annexThemes,
  evidenceSources,
  findAnnexControl,
  isAnnexControlCode,
} from '../src/modules/compliance/annex-a'

test('the Annex A catalogue holds all 93 controls in the published theme sizes', () => {
  assert.equal(annexControls.length, 93)
  const count = (theme: string) => annexControls.filter(control => control.theme === theme).length
  assert.equal(count('ORGANIZATIONAL'), 37)
  assert.equal(count('PEOPLE'), 8)
  assert.equal(count('PHYSICAL'), 14)
  assert.equal(count('TECHNOLOGICAL'), 34)
})

test('every control code is unique and numbered without gaps inside its theme', () => {
  assert.equal(new Set(annexControls.map(control => control.code)).size, 93)
  const expected: Record<string, number> = { 'A.5': 37, 'A.6': 8, 'A.7': 14, 'A.8': 34 }
  for (const [prefix, total] of Object.entries(expected))
    for (let index = 1; index <= total; index++)
      assert.ok(isAnnexControlCode(`${prefix}.${index}`), `thiếu kiểm soát ${prefix}.${index}`)
})

test('each control carries a code, both titles and a theme that is declared', () => {
  const themes = new Set(annexThemes.map(theme => theme.key))
  for (const control of annexControls) {
    assert.match(control.code, /^A\.[5-8]\.\d{1,2}$/)
    assert.ok(control.title.trim().length > 0, `${control.code} thiếu tiêu đề tiếng Anh`)
    assert.ok(control.titleVi.trim().length > 0, `${control.code} thiếu tiêu đề tiếng Việt`)
    assert.ok(themes.has(control.theme))
  }
})

test('controls named in the certification audit programme resolve to the right titles', () => {
  // Spot checks against the DAS audit programme so a typo in the catalogue is caught.
  assert.equal(findAnnexControl('A.5.11')?.title, 'Return of assets')
  assert.equal(findAnnexControl('A.5.9')?.title, 'Inventory of information and other associated assets')
  assert.equal(findAnnexControl('A.7.14')?.title, 'Secure disposal or re-use of equipment')
  assert.equal(findAnnexControl('A.8.34')?.title, 'Protection of information systems during audit testing')
  assert.equal(findAnnexControl('A.6.8')?.title, 'Information security event reporting')
})

test('unknown codes are rejected so a document cannot claim a control that does not exist', () => {
  for (const code of ['A.5.38', 'A.6.9', 'A.7.15', 'A.8.35', 'A.9.1', 'A5.11', '', 'DROP TABLE'])
    assert.equal(isAnnexControlCode(code), false, `${code} không được coi là hợp lệ`)
})

test('every control with a linked evidence source points at a real control and a route', () => {
  for (const [code, source] of Object.entries(evidenceSources)) {
    assert.ok(isAnnexControlCode(code), `${code} không có trong danh mục`)
    assert.match(source.route, /^\//)
    assert.ok(source.module.trim().length > 0)
    assert.ok(source.description.trim().length > 0)
  }
})

test('asset lifecycle controls are evidenced by AssetFlow records rather than by a document', () => {
  // These are the ones the audit programme puts to the IT and HR departments, and the product
  // already produces the records for them; losing the link would send an auditor to a Word file.
  for (const code of ['A.5.9', 'A.5.11', 'A.7.13', 'A.7.14', 'A.8.1'])
    assert.ok(evidenceSources[code], `${code} phải có nguồn bằng chứng trong hệ thống`)
})
