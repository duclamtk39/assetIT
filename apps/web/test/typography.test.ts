import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stylesheet = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('assignments typography contract remains the project-wide reference', () => {
  assert.match(stylesheet, /AssetFlow typography contract/)
  assert.match(stylesheet, /--font-enterprise:\s*"Poppins"/)
  assert.match(stylesheet, /--type-page-title:\s*25px/)
  assert.match(stylesheet, /--type-section-title:\s*17px/)
  assert.match(stylesheet, /--type-content:\s*12px/)
  assert.match(stylesheet, /--type-control:\s*12px/)
  assert.match(stylesheet, /--type-action:\s*13px/)
  assert.match(stylesheet, /--type-table-head:\s*12px/)
  assert.match(stylesheet, /--type-kpi-value:\s*20px/)
})

test('late feature modules consume the shared typography tokens', () => {
  for (const selector of ['.incident-table td', '.renewal-register td', '.discovery-list td']) {
    assert.match(
      stylesheet,
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?font-size:\\s*var\\(--type-content\\)`),
    )
  }
})

test('the asset detail page reads from the shared type scale, not from hard-coded small sizes', () => {
  // Fact labels and values once rendered at 10px in #91919D, below the 4.5:1 contrast small text
  // needs, and the page mixed 10, 12, 13 and 17px headings across its two columns. The detail page
  // now takes every size from the tokens, so it cannot drift back to a private, smaller scale.
  const block = stylesheet.slice(stylesheet.indexOf('Asset detail typography'))
  assert.ok(block.length > 100, 'thiếu khối typography của trang chi tiết tài sản')
  assert.match(block, /\.asset-facts dt[\s\S]*?font-size:\s*var\(--type-label\)/)
  assert.match(block, /\.asset-facts dd[\s\S]*?font-size:\s*var\(--type-body\)/)
  assert.match(block, /\.asset-aside-card h3[\s\S]*?font-size:\s*var\(--type-section-title\)/)
  assert.doesNotMatch(block, /font-size:\s*(8|9|10|11)px/, 'không dùng cỡ chữ dưới 12px')
  assert.doesNotMatch(block, /color:\s*#91919d/i, 'màu nhãn cũ không đạt tương phản')
  // The history tab was missed by the first pass and sat at 9-11px; it must stay on the scale too.
  const audit = stylesheet.slice(stylesheet.indexOf('Full-page audit follow-up'))
  assert.match(audit, /\.detail-history small[\s\S]*?font-size:\s*var\(--type-caption\)/)
  assert.match(audit, /\.detail-history em[\s\S]*?font-size:\s*var\(--type-label\)/)
  assert.doesNotMatch(audit, /font-size:\s*(7|8|9|10|11)px/)
})
