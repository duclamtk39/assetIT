/**
 * Figures shown on the asset overview, derived only from what the register actually records.
 *
 * Deliberately absent: residual value and depreciation. The register has no depreciation method,
 * period or start date, so any "giá trị còn lại" would be a number invented to look like accounting.
 * Cost of ownership is shown instead, because every term in it - the purchase price and the cost of
 * each maintenance job - is a recorded amount.
 */

const DAY = 86_400_000

/** Whole months between two dates, counted the way a person says "bảy tháng", not by 30-day blocks. */
export function monthsBetween(from: Date, to: Date) {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  if (to.getUTCDate() < from.getUTCDate()) months -= 1
  return Math.max(0, months)
}

export function addMonths(date: Date, months: number) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
  // 31 January plus one month is 3 March in a naive add; clamp back to the last day of February.
  if (result.getUTCDate() !== date.getUTCDate()) result.setUTCDate(0)
  return result
}

export type WarrantyState = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'UNKNOWN'

/**
 * Warranty end date and how much is left. An explicit expiry wins; otherwise it is the purchase date
 * plus the recorded months. With neither there is no warranty to report, and saying "unknown" is
 * better than implying the device is covered.
 */
export function warrantyStatus(
  asset: { purchaseDate?: Date | null; warrantyMonths?: number | null; warrantyExpiry?: Date | null },
  now = new Date(),
) {
  const expiry =
    asset.warrantyExpiry ??
    (asset.purchaseDate && asset.warrantyMonths ? addMonths(asset.purchaseDate, asset.warrantyMonths) : null)
  if (!expiry) return { expiry: null, state: 'UNKNOWN' as WarrantyState, daysLeft: null }
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / DAY)
  const state: WarrantyState = daysLeft < 0 ? 'EXPIRED' : daysLeft <= 90 ? 'EXPIRING' : 'ACTIVE'
  return { expiry, state, daysLeft }
}

/** Human age of an asset since purchase: "11 tháng", "2 năm 3 tháng". */
export function ageLabel(purchaseDate?: Date | null, now = new Date()) {
  if (!purchaseDate) return null
  const months = monthsBetween(purchaseDate, now)
  if (months < 1) return 'Dưới 1 tháng'
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (!years) return `${rest} tháng`
  return rest ? `${years} năm ${rest} tháng` : `${years} năm`
}

/** Remaining warranty as words, or the date it lapsed. */
export function warrantyLabel(state: WarrantyState, daysLeft: number | null) {
  if (state === 'UNKNOWN' || daysLeft === null) return 'Chưa khai bảo hành'
  if (state === 'EXPIRED') return 'Đã hết bảo hành'
  if (daysLeft < 31) return `Còn ${daysLeft} ngày bảo hành`
  const months = Math.floor(daysLeft / 30.44)
  if (months < 12) return `Còn ${months} tháng bảo hành`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest ? `Còn ${years} năm ${rest} tháng bảo hành` : `Còn ${years} năm bảo hành`
}

/**
 * Purchase price plus the recorded cost of every maintenance job that was not cancelled. A job with no
 * cost entered adds nothing rather than being guessed at, and the count of costed jobs is returned so
 * the screen can say how many amounts the total is built from.
 */
export function costOfOwnership(
  purchaseCost: number | null | undefined,
  jobs: Array<{ status: string; cost: number | null | undefined }>,
) {
  const counted = jobs.filter(job => job.status !== 'CANCELLED' && job.cost !== null && job.cost !== undefined)
  const maintenance = counted.reduce((sum, job) => sum + Number(job.cost), 0)
  const purchase = purchaseCost ? Number(purchaseCost) : 0
  return { purchase, maintenance, total: purchase + maintenance, costedJobs: counted.length }
}
