import assert from 'node:assert/strict'
import test from 'node:test'
import { pageForPath, pageRoutes, pathForPage } from '../src/routing/routes'
import { navSections } from '../src/routing/navigation'

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

test('every sidebar entry has a route, or clicking it silently lands on the dashboard', () => {
  // `page` is derived from the URL, not held in state. A label with no entry in pageRoutes navigates
  // to an encoded fallback path, pageForPath finds no match and answers 'Tổng quan', so the click
  // looks like it did nothing at all. That is exactly how the network pages shipped broken.
  const missing = navSections
    .flatMap(section => section.items.map(item => item.label))
    .filter(label => !pageRoutes[label])
  assert.deepEqual(missing, [], `thiếu route cho: ${missing.join(', ')}`)
})

test('a sidebar click round-trips through the URL back to the same page', () => {
  for (const section of navSections)
    for (const item of section.items)
      assert.equal(pageForPath(pathForPage(item.label)), item.label, `route hỏng ở mục ${item.label}`)
})

test('the network pages have stable routes of their own', () => {
  assert.equal(pathForPage('Sơ đồ mạng'), '/network')
  assert.equal(pageForPath('/network'), 'Sơ đồ mạng')
  assert.equal(pageForPath('/network/devices'), 'Thiết bị mạng')
  assert.equal(pageForPath('/network/alerts'), 'Cảnh báo mạng')
})

test('an unknown path still falls back to the dashboard rather than a blank screen', () => {
  assert.equal(pageForPath('/khong-ton-tai'), 'Tổng quan')
})

test('an app route that shares a name with a build directory still loads on a hard refresh', async () => {
  // /assets is both the asset register and Vite's output folder. With `$uri/` in the SPA fallback,
  // nginx matched the directory, redirected to /assets/ on its own :8080 port and answered 403, so
  // reloading the most-used page in the product broke. The fallback must not try directories.
  const { readFile } = await import('node:fs/promises')
  const conf = await readFile(new URL('../nginx.conf', import.meta.url), 'utf8')
  const spa = /location \/ \{([^}]*)\}/.exec(conf)
  assert.ok(spa, 'thiếu location / trong nginx.conf')
  assert.doesNotMatch(spa[1], /\$uri\//, 'SPA fallback không được thử thư mục')
  assert.match(spa[1], /try_files \$uri \/index\.html;/)
  assert.match(conf, /absolute_redirect off;/, 'redirect tuyệt đối sẽ lộ cổng nội bộ 8080')
  assert.equal(pageForPath('/assets'), 'Sổ tài sản')
})
