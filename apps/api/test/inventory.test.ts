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
