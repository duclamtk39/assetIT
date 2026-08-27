import assert from 'node:assert/strict'
import test from 'node:test'
import { assertAssetEligibleForDisposal,assertCanApprove,assertCanCancel,assertCanComplete,assertCanRecordExecution,assertCanStart,assertCanSubmit } from '../src/modules/disposals/disposals.rules'

test('only returned, ready or broken assets can enter disposal workflow',()=>{
  for(const status of ['READY','RETURNED','BROKEN'])assert.doesNotThrow(()=>assertAssetEligibleForDisposal(status))
  for(const status of ['IN_USE','ON_LOAN','MAINTENANCE','RESERVED'])assert.throws(()=>assertAssetEligibleForDisposal(status),/ASSET_NOT_ELIGIBLE_FOR_DISPOSAL/)
  assert.throws(()=>assertAssetEligibleForDisposal('DISPOSED'),/ASSET_ALREADY_DISPOSED/)
})

test('disposal approval enforces workflow and segregation of duties',()=>{
  assert.doesNotThrow(()=>assertCanSubmit('DRAFT',1))
  assert.throws(()=>assertCanSubmit('DRAFT',0),/DISPOSAL_REQUIRES_ASSETS/)
  assert.throws(()=>assertCanSubmit('SUBMITTED',1),/DISPOSAL_NOT_DRAFT/)
  assert.doesNotThrow(()=>assertCanApprove('SUBMITTED','requester','approver'))
  assert.throws(()=>assertCanApprove('SUBMITTED','same','same'),/SEGREGATION_OF_DUTIES/)
  assert.throws(()=>assertCanApprove('DRAFT','requester','approver'),/DISPOSAL_NOT_SUBMITTED/)
})

test('execution cannot skip approval, evidence or verified data sanitization',()=>{
  assert.throws(()=>assertCanStart('SUBMITTED'),/DISPOSAL_NOT_APPROVED/)
  assert.doesNotThrow(()=>assertCanStart('APPROVED'))
  assert.doesNotThrow(()=>assertCanRecordExecution('APPROVED'))
  assert.doesNotThrow(()=>assertCanRecordExecution('IN_EXECUTION'))
  assert.throws(()=>assertCanComplete('APPROVED',1,[]),/DISPOSAL_NOT_IN_EXECUTION/)
  assert.throws(()=>assertCanComplete('IN_EXECUTION',0,[]),/DISPOSAL_EVIDENCE_REQUIRED/)
  assert.throws(()=>assertCanComplete('IN_EXECUTION',1,[{requiresDataSanitization:true,sanitizationStatus:'PENDING'}]),/DATA_SANITIZATION_REQUIRED/)
  assert.doesNotThrow(()=>assertCanComplete('IN_EXECUTION',1,[{requiresDataSanitization:true,sanitizationStatus:'VERIFIED'}]))
})

test('terminal disposal cases cannot be cancelled',()=>{
  for(const status of ['COMPLETED','CANCELLED','REJECTED'] as const)assert.throws(()=>assertCanCancel(status),/DISPOSAL_CANNOT_CANCEL/)
  for(const status of ['DRAFT','SUBMITTED','APPROVED','IN_EXECUTION'] as const)assert.doesNotThrow(()=>assertCanCancel(status))
})
