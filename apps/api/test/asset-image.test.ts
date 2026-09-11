import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetImageStorage } from '../src/modules/assets/asset-image.storage'
import { contentDisposition, extensionOf, resolveWithin, safeOriginalName } from '../src/common/storage-paths'

const png = (extra = 8) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra)])
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)])

test('a stored path can never climb out of the root', () => {
  // This is the whole reason the helper exists: a tampered column value must not become a write
  // anywhere on the filesystem.
  const root = process.platform === 'win32' ? 'C:\\srv\\files' : '/srv/files'
  assert.ok(resolveWithin(root, 'asset-images/2026/09/a.png'))
  for (const attempt of ['../../etc/passwd', '..', 'a/../../b', '/etc/passwd'])
    assert.throws(() => resolveWithin(root, attempt), /Đường dẫn tệp không hợp lệ/, `phải chặn ${attempt}`)
})

test('a client filename never contributes a path segment or a header line', () => {
  assert.equal(safeOriginalName('../../etc/passwd'), 'passwd')
  assert.equal(safeOriginalName('C:\\Users\\me\\anh.png'), 'anh.png')
  assert.equal(safeOriginalName('anh\r\nX-Injected: 1.png'), 'anhX-Injected: 1.png')
  assert.equal(safeOriginalName('   '), 'tep-tin')
  assert.equal(safeOriginalName('', 'anh-tai-san'), 'anh-tai-san')
})

test('a Vietnamese filename survives the download header', () => {
  const header = contentDisposition('Biên bản bàn giao.pdf')
  assert.match(header, /^attachment; filename="Bi.n b.n b.n giao\.pdf"/)
  assert.match(header, /filename\*=UTF-8''/)
  assert.ok(!header.includes('\n'))
})

test('extensions are read from the last dot and lower-cased', () => {
  assert.equal(extensionOf('ANH.PNG'), 'png')
  assert.equal(extensionOf('a.b.jpeg'), 'jpeg')
  assert.equal(extensionOf('khong-co-duoi'), '')
})

test('an image is accepted only when its bytes agree with its extension', async () => {
  // A renamed executable with a .png name would otherwise be stored and later served back with an
  // image content type, which is exactly what the sniff is there to stop.
  const storage = new AssetImageStorage()
  await assert.rejects(
    () => storage.save({ originalname: 'x.png', buffer: Buffer.from('MZ not an image'), size: 15 }),
    /không phải ảnh hợp lệ/,
  )
  await assert.rejects(
    () => storage.save({ originalname: 'x.png', buffer: jpeg(), size: 12 }),
    /không khớp với nội dung/,
  )
})

test('only image extensions are offered, and anything else is refused before the bytes are read', async () => {
  const storage = new AssetImageStorage()
  assert.deepEqual(storage.allowedExtensions.sort(), ['gif', 'jpeg', 'jpg', 'png', 'webp'])
  await assert.rejects(
    () => storage.save({ originalname: 'payload.svg', buffer: png(), size: 16 }),
    /không được chấp nhận/,
  )
  await assert.rejects(() => storage.save({ originalname: 'noext', buffer: png(), size: 16 }), /không được chấp nhận/)
})

test('an empty or oversized upload is refused rather than written', async () => {
  const storage = new AssetImageStorage()
  await assert.rejects(() => storage.save({ originalname: 'a.png', buffer: Buffer.alloc(0), size: 0 }), /rỗng/)
  await assert.rejects(
    () => storage.save({ originalname: 'a.png', buffer: png(), size: storage.maxBytes + 1 }),
    /vượt quá/,
  )
})

test('jpg and jpeg both resolve to the same content type', () => {
  const storage = new AssetImageStorage()
  assert.equal(storage.mimeFor('asset-images/2026/09/a.jpg'), 'image/jpeg')
  assert.equal(storage.mimeFor('asset-images/2026/09/a.jpeg'), 'image/jpeg')
  assert.equal(storage.mimeFor('asset-images/2026/09/a.png'), 'image/png')
  assert.equal(storage.mimeFor('asset-images/2026/09/a.bin'), 'application/octet-stream')
})
