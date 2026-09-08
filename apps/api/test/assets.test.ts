import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetsService } from '../src/modules/assets/assets.service'

test('scan queries PostgreSQL by asset tag, barcode or serial', async () => {
  let captured: any
  const expected = { id: 'asset-1', assetTag: 'TS-2026-001' }
  const db = {
    asset: {
      findFirst: ({ where }: any) => {
        captured = where
        return Promise.resolve(expected)
      },
    },
  }
  const service = new AssetsService(db as any)
  assert.equal(await service.scan('  BC-000001  ', { id: 'admin', role: 'ADMIN', departmentId: null }), expected)
  assert.equal(captured.deletedAt, null)
  assert.deepEqual(
    captured.OR.map((item: any) => Object.keys(item)[0]),
    ['assetTag', 'barcode', 'serialNumber'],
  )
  assert.equal(captured.OR[1].barcode.equals, 'BC-000001')
})

test('HCNS scan cannot resolve assets outside its department', async () => {
  let captured: any
  const db = {
    asset: {
      findFirst: ({ where }: any) => {
        captured = where
        return Promise.resolve(null)
      },
    },
  }
  const service = new AssetsService(db as any)
  await assert.rejects(
    () => service.scan('TS-OTHER-001', { id: 'hr', role: 'HCNS', departmentId: 'department-hr' }),
    /Không tìm thấy tài sản/,
  )
  assert.equal(captured.departmentId, 'department-hr')
})

test('soft delete archives and releases all active asset identifiers', async () => {
  let updated: any, oldValues: any
  const asset = {
    id: '10000000-0000-4000-8000-000000000099',
    assetTag: 'TS-001',
    barcode: 'BC-001',
    serialNumber: 'SN-001',
    systemUuid: 'UUID-001',
    currentCustodianId: null,
    departmentId: null,
    status: { code: 'READY' },
  }
  const tx = {
    assetAssignment: { updateMany: async () => ({ count: 0 }) },
    assetHistory: { create: async () => ({}) },
    auditLog: {
      create: async ({ data }: any) => {
        oldValues = data.oldValues
        return {}
      },
    },
    asset: {
      update: async ({ data }: any) => {
        updated = data
        return {}
      },
    },
  }
  const db = {
    asset: { findFirst: async () => asset },
    assetAssignment: { count: async () => 0 },
    $transaction: (work: any) => work(tx),
  }
  const service = new AssetsService(db as any)
  assert.deepEqual(await service.remove(asset.id, { id: 'admin', role: 'ADMIN', departmentId: null }), {
    success: true,
  })
  assert.deepEqual(oldValues, {
    assetTag: 'TS-001',
    barcode: 'BC-001',
    serialNumber: 'SN-001',
    systemUuid: 'UUID-001',
    statusCode: 'READY',
    custodian: null,
    cancelledAssignments: 0,
  })
  assert.equal(updated.archivedAssetTag, 'TS-001')
  assert.equal(updated.archivedBarcode, 'BC-001')
  assert.equal(updated.archivedSerialNumber, 'SN-001')
  assert.equal(updated.archivedSystemUuid, 'UUID-001')
  assert.equal(updated.assetTag, `DELETED-${asset.id}`)
  assert.equal(updated.barcode, `DELETED-${asset.id}`)
  assert.equal(updated.serialNumber, null)
  assert.equal(updated.systemUuid, null)
  assert.ok(updated.deletedAt instanceof Date)
})

test('an asset returned to the warehouse can be removed once its assignments are closed', async () => {
  // The guard used to count every assignment the asset had ever had, so a laptop that was handed
  // out once and properly returned could never be taken off the register again — the screen just
  // answered "hãy thanh lý thay vì xóa" for a device sitting unassigned in the warehouse. Checked
  // as IT, because that is the role the guard still applies to.
  let assignmentFilter: any
  const asset = {
    id: 'asset-1',
    assetTag: 'TS-2026-001',
    barcode: 'BC-1',
    serialNumber: 'SN-1',
    systemUuid: null,
    departmentId: null,
    currentCustodianId: null,
    status: { code: 'READY' },
  }
  const tx = {
    assetAssignment: { updateMany: async () => ({ count: 0 }) },
    assetHistory: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
    asset: { update: async () => ({}) },
  }
  const db = {
    asset: { findFirst: async () => asset },
    assetAssignment: {
      count: async (args: any) => {
        assignmentFilter = args.where
        return 0
      },
    },
    $transaction: (work: any) => work(tx),
  }
  const service = new AssetsService(db as any)
  const result = await service.remove('asset-1', { id: 'it', role: 'IT', departmentId: null })
  assert.deepEqual(result, { success: true })
  assert.equal(assignmentFilter.status, 'OPEN')
})

test('IT still may not remove an asset that is out on an open assignment', async () => {
  const asset = {
    id: 'asset-1',
    assetTag: 'TS-2026-001',
    departmentId: null,
    currentCustodianId: null,
    status: { code: 'READY' },
  }
  const db = {
    asset: { findFirst: async () => asset },
    assetAssignment: { count: async () => 1 },
    $transaction: async () => assert.fail('must not reach the transaction'),
  }
  const service = new AssetsService(db as any)
  await assert.rejects(() => service.remove('asset-1', { id: 'it', role: 'IT', departmentId: null }), /thu hồi/)
})

test('an administrator may remove an asset in any state, settling what it was still holding', async () => {
  // Correcting test and mistaken data is the administrator's to do, so no state refuses. What must
  // not survive is a live assignment pointing at a record that has gone, so it is cancelled here and
  // the count is recorded in the audit entry.
  let cancelled: any, patched: any, audited: any
  const asset = {
    id: 'asset-1',
    assetTag: 'TS-2026-001',
    barcode: 'BC-1',
    serialNumber: 'SN-1',
    systemUuid: null,
    departmentId: null,
    currentCustodianId: 'person-1',
    currentCustodian: { fullName: 'Vũ Tuấn Anh' },
    status: { code: 'IN_USE' },
  }
  const tx = {
    assetAssignment: {
      updateMany: async (args: any) => {
        cancelled = args
        return { count: 1 }
      },
    },
    assetHistory: { create: async () => ({}) },
    auditLog: {
      create: async ({ data }: any) => {
        audited = data
        return {}
      },
    },
    asset: {
      update: async ({ data }: any) => {
        patched = data
        return {}
      },
    },
  }
  const db = {
    asset: { findFirst: async () => asset },
    assetAssignment: { count: async () => assert.fail('an administrator is not gated on this') },
    $transaction: (work: any) => work(tx),
  }
  const service = new AssetsService(db as any)
  assert.deepEqual(await service.remove('asset-1', { id: 'admin', role: 'ADMIN', departmentId: null }), {
    success: true,
  })
  assert.equal(cancelled.where.status, 'OPEN')
  assert.equal(cancelled.data.status, 'CANCELLED')
  assert.equal(patched.currentCustodianId, null)
  assert.equal(audited.oldValues.statusCode, 'IN_USE')
  assert.equal(audited.oldValues.cancelledAssignments, 1)
})

test('an administrator may correct a wrong status, and the change is written to the history', async () => {
  let updated: any, history: any, audited: any
  const current = {
    id: 'asset-1',
    assetTag: 'TS-001',
    name: 'Laptop',
    serialNumber: 'SN-1',
    statusId: 'old',
    departmentId: null,
    status: { code: 'DISPOSED' },
  }
  const tx = {
    asset: {
      update: async ({ data }: any) => {
        updated = data
        return { id: 'asset-1' }
      },
    },
    assetHistory: {
      create: async ({ data }: any) => {
        history = data
        return {}
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audited = data
        return {}
      },
    },
  }
  const db = {
    asset: { findFirst: async () => current },
    assetStatus: { findUnique: async ({ where }: any) => ({ id: 'new', code: where.code }) },
    $transaction: (work: any) => work(tx),
  }
  const service = new AssetsService(db as any)
  await service.update('asset-1', { statusCode: 'ready' } as any, { id: 'admin', role: 'ADMIN', departmentId: null })
  assert.equal(updated.statusId, 'new')
  assert.equal(updated.statusCode, undefined)
  assert.match(history.description, /DISPOSED → READY/)
  assert.equal(audited.action, 'ASSET_STATUS_CORRECTED')
})

test('only an administrator may set a status directly', async () => {
  const db = {
    asset: { findFirst: async () => ({ id: 'asset-1', departmentId: null, status: { code: 'READY' } }) },
    assetStatus: { findUnique: async () => assert.fail('the role is checked before the lookup') },
  }
  const service = new AssetsService(db as any)
  await assert.rejects(
    () => service.update('asset-1', { statusCode: 'DISPOSED' } as any, { id: 'it', role: 'IT', departmentId: null }),
    /Chỉ Admin/,
  )
})
