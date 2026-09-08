import type { Asset, AssetStatus } from '../../types'

// The states an asset record can actually hold, paired with the code the API stores. The asset form
// reads its options from here so the field can always display the record it was opened on, and an
// administrator correcting a status sends the code back through the same map. The API's own mapping
// is lossy in one direction — ON_LOAN also reads as "Đang sử dụng", LOST also as "Hỏng" — so each
// label points at the one code that is canonical for it.
export const assetStatusCodes: Record<AssetStatus, string> = {
  'Sẵn sàng': 'READY',
  'Đang sử dụng': 'IN_USE',
  'Đã giữ chỗ': 'RESERVED',
  'Đã thu hồi': 'RETURNED',
  'Bảo trì': 'MAINTENANCE',
  Hỏng: 'BROKEN',
  'Đã thanh lý': 'DISPOSED',
}
export const assetRecordStatuses = Object.keys(assetStatusCodes) as AssetStatus[]

// Every state the asset mapper can produce, plus the loan-derived ones. Filters read from this
// list rather than from whichever states happen to be present, so an option never disappears
// just because no asset is currently in that state.
export const operationalStatusOptions = [
  'Tất cả trạng thái',
  'Sẵn sàng',
  'Đang sử dụng',
  'Cho mượn',
  'Sắp đến hạn trả',
  'Quá hạn trả',
  'Đã giữ chỗ',
  'Đã thu hồi',
  'Bảo trì',
  'Hỏng',
  'Đã thanh lý',
]

// expectedReturnDate is stored as a UTC midnight timestamp standing for a calendar day, so
// comparing it against the current instant marks an asset overdue during the very day it is
// due. Work in whole days instead: 0 is due today, negative is genuinely late.
export const daysUntilDue = (dueDate?: string, now = new Date()) => {
  if (!dueDate) return undefined
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return undefined
  return Math.round(
    (Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000,
  )
}

export const isOverdue = (asset: Asset, now = new Date()) => {
  const days = daysUntilDue(asset.dueDate, now)
  return days !== undefined && days < 0
}

export const isDueSoon = (asset: Asset, within = 7, now = new Date()) => {
  const days = daysUntilDue(asset.dueDate, now)
  return days !== undefined && days >= 0 && days <= within
}

// "Trong kho" means the asset record points at a warehouse, which the API already tells us.
// Matching the Vietnamese word "kho" inside a location label breaks on any warehouse named
// otherwise, and silently disagreed with the dashboard, which never applied that test.
export const isInStock = (asset: Asset) =>
  asset.assignedTo === 'Chưa gán' && asset.status === 'Sẵn sàng' && Boolean(asset.warehouse)

export const matchesOperationalStatus = (asset: Asset, status: string) => {
  if (!status || status === 'Tất cả trạng thái') return true
  if (status === 'Cho mượn') return asset.assignmentType === 'Cho mượn'
  if (status === 'Quá hạn trả') return isOverdue(asset)
  if (status === 'Sắp đến hạn trả') return isDueSoon(asset)
  return asset.status === status
}
