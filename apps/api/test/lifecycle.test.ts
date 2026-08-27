import assert from 'node:assert/strict'
import test from 'node:test'
import { assignmentTarget,assertMaintenanceOpenAllowed,assertTransferAllowed,maintenanceTarget,returnTarget } from '../src/modules/lifecycle/lifecycle.rules'

test('only READY assets can be assigned or loaned',()=>{
  assert.equal(assignmentTarget('READY','ASSIGNMENT'),'IN_USE')
  assert.equal(assignmentTarget('READY','LOAN'),'ON_LOAN')
  assert.throws(()=>assignmentTarget('IN_USE','ASSIGNMENT'),/ASSET_NOT_READY/)
  assert.throws(()=>assignmentTarget('MAINTENANCE','LOAN'),/ASSET_NOT_READY/)
})

test('return only closes an active assignment or loan',()=>{
  assert.equal(returnTarget('IN_USE','READY'),'READY')
  assert.equal(returnTarget('ON_LOAN','BROKEN'),'BROKEN')
  assert.throws(()=>returnTarget('READY','READY'),/ASSET_NOT_ASSIGNED/)
})

test('disposed assets are terminal and maintenance transitions are constrained',()=>{
  assert.throws(()=>assertTransferAllowed('DISPOSED'),/ASSET_DISPOSED/)
  assert.doesNotThrow(()=>assertMaintenanceOpenAllowed('READY'))
  assert.doesNotThrow(()=>assertMaintenanceOpenAllowed('BROKEN'))
  assert.throws(()=>assertMaintenanceOpenAllowed('IN_USE'),/MAINTENANCE_NOT_ALLOWED/)
  assert.equal(maintenanceTarget('MAINTENANCE','READY'),'READY')
  assert.throws(()=>maintenanceTarget('MAINTENANCE','DISPOSED'),/DISPOSAL_WORKFLOW_REQUIRED/)
  assert.throws(()=>maintenanceTarget('READY','DISPOSED'),/ASSET_NOT_IN_MAINTENANCE/)
})
