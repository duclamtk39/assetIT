import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { BadRequestException, Injectable } from '@nestjs/common'
import {
  contentDisposition as dispositionHeader,
  extensionOf,
  resolveWithin,
  safeOriginalName,
} from '../../common/storage-paths'

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

  async save(file: IncomingFile): Promise<StoredFile> {
    if (!file?.buffer?.length) throw new BadRequestException('Tệp rỗng')
    if (file.size > MAX_FILE_BYTES)
      throw new BadRequestException(`Tệp vượt quá ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`)
    const originalName = safeOriginalName(file.originalname, 'tai-lieu')
    const extension = extensionOf(originalName)
    const mimeType = ALLOWED[extension]
    if (!mimeType) throw new BadRequestException(`Định dạng .${extension || '?'} không được chấp nhận`)
    const now = new Date()
    const relative = join(
      'compliance',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${randomUUID()}.${extension}`,
    )
    const full = resolveWithin(this.root, relative)
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
    return createReadStream(resolveWithin(this.root, storagePath))
  }

  /** Delegates to the shared helper so both file stores encode a Vietnamese filename identically. */
  contentDisposition(originalName: string) {
    return dispositionHeader(originalName)
  }

  async remove(storagePath: string) {
    try {
      await unlink(resolveWithin(this.root, storagePath))
    } catch {
      // A missing file must not block deleting the record that points at it.
    }
  }
}
