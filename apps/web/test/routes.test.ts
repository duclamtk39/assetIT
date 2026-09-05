import assert from 'node:assert/strict'
import test from 'node:test'
import { pageForPath, pathForPage } from '../src/routing/routes'

test('license and renewal module has a stable enterprise route', () => {
  assert.equal(pathForPage('License & Gia hạn'), '/renewals')
  assert.equal(pageForPath('/renewals'), 'License & Gia hạn')
})

test('legacy encoded license URL remains accessible', () => {
  assert.equal(pageForPath('/license%20%26%20gia%20h%E1%BA%A1n'), 'License & Gia hạn')
})

test('IT risk assessment has a stable enterprise route', () => {
  assert.equal(pathForPage('Đánh giá rủi ro CNTT'), '/it-risk-assessment')
  assert.equal(pageForPath('/it-risk-assessment'), 'Đánh giá rủi ro CNTT')
})

test('disposal module replaces the legacy stock issue placeholder route', () => {
  assert.equal(pathForPage('Thanh lý & Hủy bỏ'), '/disposals')
  assert.equal(pageForPath('/disposals'), 'Thanh lý & Hủy bỏ')
  assert.equal(pageForPath('/warehouse/issues'), 'Thanh lý & Hủy bỏ')
})
