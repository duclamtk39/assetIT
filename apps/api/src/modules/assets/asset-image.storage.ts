import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { BadRequestException, Injectable } from '@nestjs/common'
import { extensionOf, resolveWithin, safeOriginalName } from '../../common/storage-paths'

/**
 * Photographs of assets, held on the documents volume rather than in the database.
 *
 * The form used to keep the picture as a data URL in client state, so it was never saved anywhere -
 * the image simply reverted on the next load. Putting that data URL in a column would have been the
 * quick fix and the wrong one: at 1.5 MB a photo, base64 inflated, a register of a few hundred
 * assets carries hundreds of megabytes that every unguarded SELECT would drag along with it.
 */

const MAX_IMAGE_BYTES = Number(process.env.ASSET_IMAGE_MAX_BYTES || 3 * 1024 * 1024)

/** Extension to content type. Anything not listed is refused rather than guessed at. */
const ALLOWED: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

/** The first bytes each accepted format must start with, so the extension cannot lie about content. */
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
]

export interface StoredImage {
  storagePath: string
  mimeType: string
  fileSize: number
}

export interface IncomingImage {
  originalname: string
  buffer: Buffer
  size: number
}

@Injectable()
export class AssetImageStorage {
  private readonly root = resolve(process.env.STORAGE_PATH || '/var/lib/assetflow/documents')

  get maxBytes() {
    return MAX_IMAGE_BYTES
  }
  get allowedExtensions() {
    return Object.keys(ALLOWED)
  }

  /**
   * A renamed .exe with a .png extension would otherwise be stored and later served back with an
   * image content type. Checking the magic bytes is what makes the declared type true.
   */
  private sniff(buffer: Buffer) {
    return SIGNATURES.find(signature =>
      signature.bytes.every((byte, index) => buffer[(signature.offset || 0) + index] === byte),
    )?.mime
  }

  async save(file: IncomingImage): Promise<StoredImage> {
    if (!file?.buffer?.length) throw new BadRequestException('Tệp ảnh rỗng')
    if (file.size > MAX_IMAGE_BYTES)
      throw new BadRequestException(`Ảnh vượt quá ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`)
    const extension = extensionOf(safeOriginalName(file.originalname, 'anh-tai-san'))
    const declared = ALLOWED[extension]
    if (!declared)
      throw new BadRequestException(`Định dạng .${extension || '?'} không được chấp nhận; chỉ nhận PNG, JPG, WEBP, GIF`)
    const actual = this.sniff(file.buffer)
    if (!actual) throw new BadRequestException('Nội dung tệp không phải ảnh hợp lệ')
    // jpg and jpeg both declare image/jpeg, so compare the resolved type rather than the extension.
    if (actual !== declared) throw new BadRequestException('Phần mở rộng không khớp với nội dung tệp')
    const now = new Date()
    const relative = join(
      'asset-images',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${extension}`,
    )
    const full = resolveWithin(this.root, relative)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, file.buffer, { mode: 0o640 })
    return { storagePath: relative, mimeType: actual, fileSize: file.size }
  }

  stream(storagePath: string) {
    return createReadStream(resolveWithin(this.root, storagePath))
  }

  mimeFor(storagePath: string) {
    return ALLOWED[extensionOf(storagePath)] || 'application/octet-stream'
  }

  async remove(storagePath: string) {
    try {
      await unlink(resolveWithin(this.root, storagePath))
    } catch {
      // A missing file must not block clearing the column that points at it.
    }
  }
}
