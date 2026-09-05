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
