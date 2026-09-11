import { BadRequestException } from '@nestjs/common'
import { resolve, sep } from 'node:path'

/**
 * The path handling every file store shares. It lives on its own because getting it wrong is how an
 * upload escapes its volume, and two copies of that logic is two chances to fix only one of them.
 */

// Matching control characters is the whole point here: they are what lets a filename smuggle extra
// lines into a response header, so the rule that warns about them is what we are deliberately doing.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')

/**
 * Keeps a client filename readable for a download header without letting it influence any path. Only
 * the last segment survives, and control characters are stripped because those are what let a
 * filename inject extra header lines. Vietnamese characters are kept; the header encodes them.
 */
export function safeOriginalName(name: string, fallback = 'tep-tin') {
  const base = name.split(/[\\/]/).pop() || fallback
  const cleaned = base.replace(CONTROL_CHARACTERS, '').trim()
  return cleaned.slice(0, 200) || fallback
}

/**
 * Re-resolves a stored path and proves it still sits under the root. Every read and write goes
 * through this, so a value that was somehow tampered with cannot reach outside the volume.
 */
export function resolveWithin(root: string, storagePath: string) {
  const full = resolve(root, storagePath)
  if (full !== root && !full.startsWith(root + sep)) throw new BadRequestException('Đường dẫn tệp không hợp lệ')
  return full
}

/** RFC 5987, so a Vietnamese filename survives the round trip without breaking the header. */
export function contentDisposition(originalName: string, disposition: 'attachment' | 'inline' = 'attachment') {
  const fallback = originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`
}

export function extensionOf(name: string) {
  const parts = name.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}
