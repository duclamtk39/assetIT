export type LifecycleAssignmentType='ASSIGNMENT'|'LOAN'
export type LifecycleReturnOutcome='READY'|'MAINTENANCE'|'BROKEN'
export type LifecycleMaintenanceOutcome='READY'|'BROKEN'|'DISPOSED'

export function assignmentTarget(currentStatus:string,type:LifecycleAssignmentType){
  if(currentStatus!=='READY')throw new Error('ASSET_NOT_READY')
  return type==='LOAN'?'ON_LOAN':'IN_USE'
}
export function returnTarget(currentStatus:string,outcome:LifecycleReturnOutcome){
  if(!['IN_USE','ON_LOAN'].includes(currentStatus))throw new Error('ASSET_NOT_ASSIGNED')
  return outcome
}
export function assertTransferAllowed(currentStatus:string){
  if(currentStatus==='DISPOSED')throw new Error('ASSET_DISPOSED')
}
export function assertMaintenanceOpenAllowed(currentStatus:string){
  if(!['READY','RETURNED','BROKEN'].includes(currentStatus))throw new Error('MAINTENANCE_NOT_ALLOWED')
}
export function maintenanceTarget(currentStatus:string,outcome:LifecycleMaintenanceOutcome){
  if(currentStatus!=='MAINTENANCE')throw new Error('ASSET_NOT_IN_MAINTENANCE')
  if(outcome==='DISPOSED')throw new Error('DISPOSAL_WORKFLOW_REQUIRED')
  return outcome
}
