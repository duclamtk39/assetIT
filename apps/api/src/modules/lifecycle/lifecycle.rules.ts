export type LifecycleAssignmentType = 'ASSIGNMENT' | 'LOAN'
export type LifecycleReturnOutcome = 'READY' | 'MAINTENANCE' | 'BROKEN'
export type LifecycleMaintenanceOutcome = 'READY' | 'BROKEN' | 'DISPOSED'

export function assignmentTarget(currentStatus: string, type: LifecycleAssignmentType) {
  if (currentStatus !== 'READY') throw new Error('ASSET_NOT_READY')
  return type === 'LOAN' ? 'ON_LOAN' : 'IN_USE'
}
export type BulkAssignmentCandidate = { assetTag: string; statusCode: string; hasCustodian: boolean }
export type BulkAssignmentBlocker = { assetTag: string; reason: 'ASSET_NOT_READY' | 'ASSET_HELD' }
/**
 * A batch handover is all-or-nothing, so every asset that would stop it is reported at once rather
 * than the first one only - the operator removes them from the list in one pass instead of retrying.
 */
export function bulkAssignmentBlockers(assets: BulkAssignmentCandidate[]): BulkAssignmentBlocker[] {
  return assets.flatMap((asset): BulkAssignmentBlocker[] =>
    asset.statusCode !== 'READY'
      ? [{ assetTag: asset.assetTag, reason: 'ASSET_NOT_READY' }]
      : asset.hasCustodian
        ? [{ assetTag: asset.assetTag, reason: 'ASSET_HELD' }]
        : [],
  )
}
export function returnTarget(currentStatus: string, outcome: LifecycleReturnOutcome) {
  if (!['IN_USE', 'ON_LOAN'].includes(currentStatus)) throw new Error('ASSET_NOT_ASSIGNED')
  return outcome
}
export function assertTransferAllowed(currentStatus: string, intoWarehouse = false, hasCustodian = false) {
  if (currentStatus === 'DISPOSED') throw new Error('ASSET_DISPOSED')
  if (intoWarehouse && hasCustodian) throw new Error('RETURN_REQUIRED_BEFORE_WAREHOUSE')
}
export function assertMaintenanceOpenAllowed(currentStatus: string) {
  if (!['READY', 'RETURNED', 'BROKEN'].includes(currentStatus)) throw new Error('MAINTENANCE_NOT_ALLOWED')
}
export function maintenanceTarget(currentStatus: string, outcome: LifecycleMaintenanceOutcome) {
  if (currentStatus !== 'MAINTENANCE') throw new Error('ASSET_NOT_IN_MAINTENANCE')
  if (outcome === 'DISPOSED') throw new Error('DISPOSAL_WORKFLOW_REQUIRED')
  return outcome
}
