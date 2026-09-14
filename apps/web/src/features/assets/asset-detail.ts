import type { Asset, AssetTransaction, TransactionType } from '../../types'

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

/**
 * The newest movements first. The history list is not guaranteed to arrive sorted, and an overview
 * that showed the oldest three would describe where the asset was a year ago as if it were now.
 */
export function latestTransactions(history: AssetTransaction[], limit = 3) {
  return [...history]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, Math.max(0, limit))
}

/**
 * One colour per movement type, shared by the timeline and the overview so they never disagree. The
 * mapping is the one the timeline already used, lifted out rather than redrawn.
 */
export function transactionTone(type: TransactionType) {
  if (type === 'Cấp phát') return 'purple'
  if (type === 'Thu hồi') return 'orange'
  if (type === 'Nhập kho') return 'green'
  return 'blue'
}

const OUTCOME_LABELS: Record<string, string> = {
  READY: 'Sẵn sàng',
  MAINTENANCE: 'Cần bảo trì',
  BROKEN: 'Hỏng',
}

/**
 * History already written carries the raw return outcome ("kết quả BROKEN"): the API interpolated the
 * enum until it was fixed, and those rows are stored text. Translating on display is what fixes the
 * records that exist, not only the ones written from now on. Only a whole word after "kết quả" is
 * touched, so free text that happens to contain one of these words is left alone.
 */
export function readableNote(note?: string) {
  if (!note) return note
  return note.replace(
    /(kết quả\s+)(READY|MAINTENANCE|BROKEN)\b/g,
    (_, lead: string, code: string) => lead + OUTCOME_LABELS[code],
  )
}

export type WarrantyState = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'UNKNOWN'

/** What GET /assets/:id/overview returns: the record's context from the rest of the system. */
export interface AssetOverview {
  id: string
  notes: string | null
  systemUuid: string | null
  createdAt?: string
  updatedAt?: string
  warrantyMonths: number | null
  warranty: { expiry: string | null; state: WarrantyState; daysLeft: number | null; label: string }
  age: string | null
  cost: { purchase: number; maintenance: number; total: number; costedJobs: number }
  custodian: {
    fullName: string
    jobTitle?: string | null
    email?: string | null
    employeeCode?: string | null
    department?: string | null
  } | null
  manager: { fullName: string; jobTitle?: string | null; email?: string | null } | null
  hostname: string | null
  network: Array<{
    ipAddress: string
    macAddress?: string | null
    hostname?: string | null
    status: 'UNKNOWN' | 'UP' | 'DOWN' | 'PAUSED'
    responseTimeMs?: number | null
    lastSeenAt?: string | null
    subnet?: { name: string; cidr: string } | null
  }>
  agents: Array<{ hostname: string; osFamily: string; agentVersion: string; lastSeenAt: string }>
  counts: { history: number; maintenance: number; related: number }
  maintenance: Array<{
    id: string
    maintenanceNo: string
    status: 'OPEN' | 'COMPLETED' | 'CANCELLED'
    issue: string
    cost: number | null
    openedAt: string
    completedAt?: string | null
  }>
  incidents: Array<{
    id: string
    incidentNo: string
    title: string
    status: string
    priority: string
    reportedAt: string
  }>
  licences: Array<{
    quantity: number
    assignedAt: string
    entitlement: { code: string; name: string; type: string; expiryDate?: string | null }
  }>
  risks: Array<{ riskNo: string; title: string; inherentLevel: string; residualLevel?: string | null; status: string }>
}

export const warrantyTone: Record<WarrantyState, string> = {
  ACTIVE: 'good',
  EXPIRING: 'warn',
  EXPIRED: 'bad',
  UNKNOWN: 'muted',
}

export const networkStatusLabels: Record<string, string> = {
  UP: 'Đang hoạt động',
  DOWN: 'Mất kết nối',
  UNKNOWN: 'Chưa kiểm tra',
  PAUSED: 'Tạm dừng theo dõi',
}

export const maintenanceStatusLabels: Record<string, string> = {
  OPEN: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

export const incidentStatusLabels: Record<string, string> = {
  NEW: 'Mới',
  ACKNOWLEDGED: 'Đã tiếp nhận',
  IN_PROGRESS: 'Đang xử lý',
  MONITORING: 'Theo dõi',
  RESOLVED: 'Đã khắc phục',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
}

export const riskLevelLabels: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
}

/** A date stored as an ISO string, shown as dd/mm/yyyy, or a dash rather than "Invalid Date". */
export function dayLabel(value?: string | null) {
  if (!value) return '—'
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? '—' : at.toLocaleDateString('vi-VN')
}
