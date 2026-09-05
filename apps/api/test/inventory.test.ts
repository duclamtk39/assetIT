import assert from 'node:assert/strict'
import test from 'node:test'
import { InventoryResult } from '@prisma/client'
import { inventoryResult } from '../src/modules/inventory/inventory.rules'
import { InventoryService } from '../src/modules/inventory/inventory.service'

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
