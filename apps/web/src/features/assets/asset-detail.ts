import type { Asset } from '../../types'

export interface SpecRow {
  label: string
  value?: string
}

/** The technical fields the register records, in the order an IT reader scans them. */
export function assetSpecs(asset: Asset): SpecRow[] {
  return [
    { label: 'Hãng sản xuất', value: asset.manufacturer },
    { label: 'Model', value: asset.model },
    { label: 'CPU', value: asset.cpu },
    { label: 'RAM', value: asset.ram },
    { label: 'Ổ đĩa', value: asset.storage },
    { label: 'Hệ điều hành', value: asset.operatingSystem },
    { label: 'Địa chỉ IP', value: asset.ipAddress },
    { label: 'Địa chỉ MAC', value: asset.macAddress },
  ].map(row => ({ ...row, value: row.value?.trim() || undefined }))
}

/**
 * How much of the technical record is filled in. Shown next to the heading so a half-empty spec sheet
 * reads as incomplete rather than as a device that genuinely has no CPU.
 */
export function specCompleteness(rows: SpecRow[]) {
  const filled = rows.filter(row => row.value).length
  return { filled, total: rows.length }
}

/**
 * "Chưa gán" is how the register spells an unassigned asset. Rendering it as a person would put a
 * two-letter avatar on a warehouse, so the owner panel checks for it and shows the stock location.
 */
export function hasCustodian(asset: Pick<Asset, 'assignedTo'>) {
  const name = asset.assignedTo?.trim()
  return Boolean(name) && name !== 'Chưa gán'
}

/**
 * Initials for the avatar: the last two words of a Vietnamese name, which are the given names people
 * are actually called by - "Bùi Thanh Tùng" is TT, not BT. Diacritics are kept and upper-cased.
 */
export function initials(fullName?: string) {
  const words = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return words
    .slice(-2)
    .map(word => word[0])
    .join('')
    .toLocaleUpperCase('vi-VN')
}

/** Due date for a loan, or the plain statement that an issued asset has none. */
export function dueLabel(dueDate?: string) {
  if (!dueDate) return 'Không giới hạn'
  const at = new Date(dueDate)
  return Number.isNaN(at.getTime()) ? 'Không giới hạn' : at.toLocaleDateString('vi-VN')
}
