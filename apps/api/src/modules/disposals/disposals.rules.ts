export type DisposalWorkflowStatus='DRAFT'|'SUBMITTED'|'APPROVED'|'REJECTED'|'IN_EXECUTION'|'COMPLETED'|'CANCELLED'

const ELIGIBLE_ASSET_STATUSES=new Set(['READY','RETURNED','BROKEN'])

export function assertAssetEligibleForDisposal(status:string){
  if(status==='DISPOSED')throw new Error('ASSET_ALREADY_DISPOSED')
  if(!ELIGIBLE_ASSET_STATUSES.has(status))throw new Error('ASSET_NOT_ELIGIBLE_FOR_DISPOSAL')
}

export function assertCanSubmit(status:DisposalWorkflowStatus,itemCount:number){
  if(status!=='DRAFT')throw new Error('DISPOSAL_NOT_DRAFT')
  if(itemCount<1)throw new Error('DISPOSAL_REQUIRES_ASSETS')
}

export function assertCanApprove(status:DisposalWorkflowStatus,requesterId:string,approverId:string){
  if(status!=='SUBMITTED')throw new Error('DISPOSAL_NOT_SUBMITTED')
  if(requesterId===approverId)throw new Error('SEGREGATION_OF_DUTIES')
}

export function assertCanReject(status:DisposalWorkflowStatus,requesterId:string,approverId:string){
  assertCanApprove(status,requesterId,approverId)
}

export function assertCanStart(status:DisposalWorkflowStatus){
  if(status!=='APPROVED')throw new Error('DISPOSAL_NOT_APPROVED')
}

export function assertCanRecordExecution(status:DisposalWorkflowStatus){
  if(!['APPROVED','IN_EXECUTION'].includes(status))throw new Error('DISPOSAL_NOT_EXECUTABLE')
}

export function assertCanComplete(status:DisposalWorkflowStatus,evidenceCount:number,items:Array<{requiresDataSanitization:boolean;sanitizationStatus:string}>){
  if(status!=='IN_EXECUTION')throw new Error('DISPOSAL_NOT_IN_EXECUTION')
  if(evidenceCount<1)throw new Error('DISPOSAL_EVIDENCE_REQUIRED')
  if(items.some(item=>item.requiresDataSanitization&&item.sanitizationStatus!=='VERIFIED'))throw new Error('DATA_SANITIZATION_REQUIRED')
}

export function assertCanCancel(status:DisposalWorkflowStatus){
  if(['COMPLETED','CANCELLED','REJECTED'].includes(status))throw new Error('DISPOSAL_CANNOT_CANCEL')
}

export const eligibleAssetStatuses=()=>Array.from(ELIGIBLE_ASSET_STATUSES)
