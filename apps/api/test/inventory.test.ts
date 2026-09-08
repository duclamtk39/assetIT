import assert from 'node:assert/strict'
import test from 'node:test'
import { InventoryResult } from '@prisma/client'
import { inventoryResult } from '../src/modules/inventory/inventory.rules'
import { InventoryService } from '../src/modules/inventory/inventory.service'

test('a count that copies the register can only ever agree with itself', () => {
  // The scan endpoint fills an omitted observation from the asset record. That default is a
  // confirmation, not an observation: with it the comparison is the book against the book, so the
  // discrepancy count stays at zero no matter what is physically on the floor. Recording what was
  // actually seen is what makes a mismatch reachable.
  const book = { location: 'loc-1', custodian: 'person-1' }
  assert.equal(inventoryResult(book.location, book.custodian, book.location, book.custodian), InventoryResult.MATCHED)
  assert.equal(
    inventoryResult(book.location, book.custodian, 'loc-9', book.custodian),
    InventoryResult.LOCATION_MISMATCH,
  )
  assert.equal(
    inventoryResult(book.location, book.custodian, book.location, 'person-9'),
    InventoryResult.CUSTODIAN_MISMATCH,
  )
})

test('an asset with no recorded location still reconciles instead of reporting a false mismatch', () => {
  assert.equal(inventoryResult(null, null, null, null), InventoryResult.MATCHED)
  assert.equal(inventoryResult(null, 'person-1', null, 'person-1'), InventoryResult.MATCHED)
  assert.equal(inventoryResult(null, null, 'loc-1', null), InventoryResult.LOCATION_MISMATCH)
})

test('inventory distinguishes matching, missing dimensions and unexpected assets', () => {
  assert.equal(inventoryResult('loc-1', 'person-1', 'loc-1', 'person-1'), InventoryResult.MATCHED)
  assert.equal(inventoryResult('loc-1', 'person-1', 'loc-2', 'person-1'), InventoryResult.LOCATION_MISMATCH)
  assert.equal(inventoryResult('loc-1', 'person-1', 'loc-1', 'person-2'), InventoryResult.CUSTODIAN_MISMATCH)
  assert.equal(inventoryResult(null, null, 'loc-1', null, false), InventoryResult.UNEXPECTED)
})

test('closing an inventory marks pending items missing and writes immutable asset history', async () => {
  let missingFilter: any,
    historyRows: any[] = []
  const tx = {
    inventorySession: {
      findUnique: async () => ({
        id: 'session-1',
        inventoryNo: 'KK-001',
        status: 'OPEN',
        scopeDepartmentId: null,
        items: [{ assetId: 'asset-1' }, { assetId: 'asset-2' }],
      }),
      update: async () => ({ id: 'session-1', status: 'CLOSED' }),
    },
    inventoryItem: {
      updateMany: async (args: any) => {
        missingFilter = args
        return { count: 2 }
      },
    },
    assetHistory: {
      createMany: async ({ data }: any) => {
        historyRows = data
        return { count: data.length }
      },
    },
    auditLog: { create: async () => ({}) },
  }
  const service = new InventoryService({ $transaction: (work: any) => work(tx) } as any)
  const result = await service.close('session-1', { id: 'admin', role: 'ADMIN', departmentId: null })
  assert.equal(result.status, 'CLOSED')
  assert.equal(missingFilter.where.result, 'PENDING')
  assert.equal(missingFilter.data.result, 'MISSING')
  assert.equal(historyRows.length, 2)
  assert.ok(historyRows.every(row => row.action === 'INVENTORIED'))
})

test('deleting a stock count copies the whole count into the audit log first', async () => {
  // A closed count is the evidence behind Annex A.5.9. Deleting it is allowed, but the session and
  // every counted line have to survive somewhere they cannot be edited, so the audit row is written
  // inside the same transaction as the delete.
  const order: string[] = []
  let audited: any
  const session = {
    id: 'session-1',
    inventoryNo: 'KK-001',
    name: 'Kiểm kê quý 3',
    status: 'CLOSED',
    startedAt: new Date('2026-09-01T00:00:00Z'),
    closedAt: new Date('2026-09-02T00:00:00Z'),
    creator: { fullName: 'Quản trị viên' },
    items: [
      {
        result: 'MATCHED',
        scannedAt: new Date('2026-09-01T02:00:00Z'),
        note: null,
        asset: { assetTag: 'TS-001', name: 'Laptop' },
      },
      { result: 'MISSING', scannedAt: null, note: 'Không tìm thấy', asset: { assetTag: 'TS-002', name: 'PC' } },
    ],
  }
  const tx = {
    auditLog: {
      create: async ({ data }: any) => {
        order.push('audit')
        audited = data
        return {}
      },
    },
    inventorySession: {
      delete: async () => {
        order.push('delete')
        return {}
      },
    },
  }
  const db = {
    inventorySession: { findUnique: async () => session },
    $transaction: (work: any) => work(tx),
  }
  const service = new InventoryService(db as any)
  assert.deepEqual(await service.remove('session-1', { id: 'admin', role: 'ADMIN', departmentId: null }), {
    success: true,
  })
  assert.deepEqual(order, ['audit', 'delete'])
  assert.equal(audited.action, 'INVENTORY_DELETED')
  assert.equal(audited.oldValues.inventoryNo, 'KK-001')
  assert.deepEqual(audited.oldValues.summary, { MATCHED: 1, MISSING: 1 })
  assert.equal(audited.oldValues.items.length, 2)
  assert.equal(audited.oldValues.items[1].note, 'Không tìm thấy')
})

test('only an administrator can delete a stock count', async () => {
  const db = {
    inventorySession: {
      findUnique: async () => assert.fail('must not read the session before the role is checked'),
    },
  }
  const service = new InventoryService(db as any)
  await assert.rejects(() => service.remove('session-1', { id: 'it', role: 'IT', departmentId: null }), /Chỉ Admin/)
})
