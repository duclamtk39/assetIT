import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { BadRequestException, Injectable } from '@nestjs/common'

/**
 * File storage for ISMS documents.
 *
 * Everything here assumes the upload is hostile. The stored path is generated, never derived from
 * the client's filename; the original name is kept as data for display only. Content type comes from
 * an allowlist rather than from the request, and downloads are always sent as an attachment so a
 * file that turns out to be HTML or SVG cannot execute in the application's origin.
 */

const MAX_FILE_BYTES = Number(process.env.COMPLIANCE_MAX_FILE_BYTES || 25 * 1024 * 1024)

/** Extension to content type. A file whose extension is not listed is refused. */
const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
}

// Matching control characters is the whole point here: they are what lets a filename smuggle extra
// lines into a response header, so the rule that warns about them is what we are deliberately doing.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')

export interface StoredFile {
  storagePath: string
  originalName: string
  mimeType: string
  fileSize: number
  checksumSha256: string
}

export interface IncomingFile {
  originalname: string
  buffer: Buffer
  size: number
}

@Injectable()
export class DocumentStorage {
  private readonly root = resolve(process.env.STORAGE_PATH || '/var/lib/assetflow/documents')

  get maxBytes() {
    return MAX_FILE_BYTES
  }

  get allowedExtensions() {
    return Object.keys(ALLOWED)
  }

  private extensionOf(name: string) {
    const parts = name.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
  }

  /**
   * Keeps the name readable for the download header without letting it influence any path. Only the
   * last segment survives, and control characters are stripped because those are what let a filename
   * inject extra header lines. Vietnamese characters are kept; the header encodes them per RFC 5987.
   */
  private safeOriginalName(name: string) {
    const base = name.split(/[\\/]/).pop() || 'tai-lieu'
    const cleaned = base.replace(CONTROL_CHARACTERS, '').trim()
    return cleaned.slice(0, 200) || 'tai-lieu'
  }

  /**
   * Defence in depth: every path handed to the filesystem is re-resolved and checked to still sit
   * under the root, so a stored value that was somehow tampered with cannot escape the volume.
   */
  private absolute(storagePath: string) {
    const full = resolve(this.root, storagePath)
    if (full !== this.root && !full.startsWith(this.root + sep))
      throw new BadRequestException('Đường dẫn tệp không hợp lệ')
    return full
  }

  async save(file: IncomingFile): Promise<StoredFile> {
    if (!file?.buffer?.length) throw new BadRequestException('Tệp rỗng')
    if (file.size > MAX_FILE_BYTES)
      throw new BadRequestException(`Tệp vượt quá ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`)
    const originalName = this.safeOriginalName(file.originalname)
    const extension = this.extensionOf(originalName)
    const mimeType = ALLOWED[extension]
    if (!mimeType) throw new BadRequestException(`Định dạng .${extension || '?'} không được chấp nhận`)
    const now = new Date()
    const relative = join(
      'compliance',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${extension}`,
    )
    const full = this.absolute(relative)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, file.buffer, { mode: 0o640 })
    return {
      storagePath: relative,
      originalName,
      mimeType,
      fileSize: file.size,
      checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
    }
  }

  stream(storagePath: string) {
    return createReadStream(this.absolute(storagePath))
  }

  /** RFC 5987 so a Vietnamese filename survives the round trip without breaking the header. */
  contentDisposition(originalName: string) {
    const fallback = originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
  }

  async remove(storagePath: string) {
    try {
      await unlink(this.absolute(storagePath))
    } catch {
      // A missing file must not block deleting the record that points at it.
    }
  }
}
