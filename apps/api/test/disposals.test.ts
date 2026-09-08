import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertAssetEligibleForDisposal,
  assertCanApprove,
  assertCanCancel,
  assertCanComplete,
  assertCanRecordExecution,
  assertCanStart,
  assertCanSubmit,
} from '../src/modules/disposals/disposals.rules'
import { DisposalsService } from '../src/modules/disposals/disposals.service'

test('only returned, ready or broken assets can enter disposal workflow', () => {
  for (const status of ['READY', 'RETURNED', 'BROKEN'])
    assert.doesNotThrow(() => assertAssetEligibleForDisposal(status))
  for (const status of ['IN_USE', 'ON_LOAN', 'MAINTENANCE', 'RESERVED'])
    assert.throws(() => assertAssetEligibleForDisposal(status), /ASSET_NOT_ELIGIBLE_FOR_DISPOSAL/)
  assert.throws(() => assertAssetEligibleForDisposal('DISPOSED'), /ASSET_ALREADY_DISPOSED/)
})

test('disposal approval enforces workflow and segregation of duties', () => {
  assert.doesNotThrow(() => assertCanSubmit('DRAFT', 1))
  assert.throws(() => assertCanSubmit('DRAFT', 0), /DISPOSAL_REQUIRES_ASSETS/)
  assert.throws(() => assertCanSubmit('SUBMITTED', 1), /DISPOSAL_NOT_DRAFT/)
  assert.doesNotThrow(() => assertCanApprove('SUBMITTED', 'requester', 'approver'))
  assert.throws(() => assertCanApprove('SUBMITTED', 'same', 'same'), /SEGREGATION_OF_DUTIES/)
  assert.throws(() => assertCanApprove('DRAFT', 'requester', 'approver'), /DISPOSAL_NOT_SUBMITTED/)
})

test('execution cannot skip approval, evidence or verified data sanitization', () => {
  assert.throws(() => assertCanStart('SUBMITTED'), /DISPOSAL_NOT_APPROVED/)
  assert.doesNotThrow(() => assertCanStart('APPROVED'))
  assert.doesNotThrow(() => assertCanRecordExecution('APPROVED'))
  assert.doesNotThrow(() => assertCanRecordExecution('IN_EXECUTION'))
  assert.throws(() => assertCanComplete('APPROVED', 1, []), /DISPOSAL_NOT_IN_EXECUTION/)
  assert.throws(() => assertCanComplete('IN_EXECUTION', 0, []), /DISPOSAL_EVIDENCE_REQUIRED/)
  assert.throws(
    () => assertCanComplete('IN_EXECUTION', 1, [{ requiresDataSanitization: true, sanitizationStatus: 'PENDING' }]),
    /DATA_SANITIZATION_REQUIRED/,
  )
  assert.doesNotThrow(() =>
    assertCanComplete('IN_EXECUTION', 1, [{ requiresDataSanitization: true, sanitizationStatus: 'VERIFIED' }]),
  )
})

test('terminal disposal cases cannot be cancelled', () => {
  for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED'] as const)
    assert.throws(() => assertCanCancel(status), /DISPOSAL_CANNOT_CANCEL/)
  for (const status of ['DRAFT', 'SUBMITTED', 'APPROVED', 'IN_EXECUTION'] as const)
    assert.doesNotThrow(() => assertCanCancel(status))
})

const disposalRecord = (status: string) => ({
  id: 'case-1',
  disposalNo: 'TL-001',
  title: 'Thanh lý laptop hết khấu hao',
  type: 'SALE',
  status,
  reason: 'Hết vòng đời',
  policyReference: 'QT-TL-01',
  cancellationReason: null,
  rejectionReason: null,
  items: [{ asset: { assetTag: 'TS-001' }, conditionAssessment: 'Cũ', sanitizationStatus: 'VERIFIED' }],
  evidence: [{ type: 'SALE_CONTRACT', title: 'Hợp đồng bán' }],
})

test('a completed disposal is not deletable because its assets are already retired by it', async () => {
  const db = {
    disposalCase: { findUnique: async () => disposalRecord('COMPLETED') },
    $transaction: async () => assert.fail('must not reach the transaction'),
  }
  await assert.rejects(
    () => new DisposalsService(db as any).remove('case-1', { id: 'admin', role: 'ADMIN', departmentId: null }),
    /Đã thanh lý/,
  )
})

test('a disposal still holding assets must be cancelled before it can be deleted', async () => {
  // Between submit and execution the assets sit in RESERVED for this case. Deleting it there would
  // strand them held by a case that no longer exists, so the case has to release them first.
  for (const status of ['SUBMITTED', 'APPROVED', 'IN_EXECUTION']) {
    const db = {
      disposalCase: { findUnique: async () => disposalRecord(status) },
      $transaction: async () => assert.fail('must not reach the transaction'),
    }
    await assert.rejects(
      () => new DisposalsService(db as any).remove('case-1', { id: 'admin', role: 'ADMIN', departmentId: null }),
      /hủy hồ sơ/,
    )
  }
})

test('a draft, rejected or cancelled disposal is deleted with its children and an audit snapshot', async () => {
  for (const status of ['DRAFT', 'REJECTED', 'CANCELLED']) {
    const order: string[] = []
    let audited: any
    const tx = {
      auditLog: {
        create: async ({ data }: any) => {
          order.push('audit')
          audited = data
          return {}
        },
      },
      disposalEvidence: {
        deleteMany: async () => {
          order.push('evidence')
          return { count: 1 }
        },
      },
      disposalActivity: {
        deleteMany: async () => {
          order.push('activities')
          return { count: 1 }
        },
      },
      disposalItem: {
        deleteMany: async () => {
          order.push('items')
          return { count: 1 }
        },
      },
      disposalCase: {
        delete: async () => {
          order.push('case')
          return {}
        },
      },
    }
    const db = {
      disposalCase: { findUnique: async () => disposalRecord(status) },
      $transaction: (work: any) => work(tx),
    }
    const service = new DisposalsService(db as any)
    assert.deepEqual(await service.remove('case-1', { id: 'admin', role: 'ADMIN', departmentId: null }), {
      success: true,
    })
    assert.deepEqual(order, ['audit', 'evidence', 'activities', 'items', 'case'])
    assert.equal(audited.oldValues.disposalNo, 'TL-001')
    assert.equal(audited.oldValues.assets[0].assetTag, 'TS-001')
  }
})

test('only an administrator can delete a disposal case', async () => {
  const db = { disposalCase: { findUnique: async () => assert.fail('role is checked first') } }
  await assert.rejects(
    () => new DisposalsService(db as any).remove('case-1', { id: 'it', role: 'IT', departmentId: null }),
    /Chỉ Admin/,
  )
})
