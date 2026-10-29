import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignmentTarget,
  assertMaintenanceOpenAllowed,
  assertTransferAllowed,
  maintenanceTarget,
  returnTarget,
} from '../src/modules/lifecycle/lifecycle.rules'
import { LifecycleService } from '../src/modules/lifecycle/lifecycle.service'

test('only READY assets can be assigned or loaned', () => {
  assert.equal(assignmentTarget('READY', 'ASSIGNMENT'), 'IN_USE')
  assert.equal(assignmentTarget('READY', 'LOAN'), 'ON_LOAN')
  assert.throws(() => assignmentTarget('IN_USE', 'ASSIGNMENT'), /ASSET_NOT_READY/)
  assert.throws(() => assignmentTarget('MAINTENANCE', 'LOAN'), /ASSET_NOT_READY/)
})

test('return only closes an active assignment or loan', () => {
  assert.equal(returnTarget('IN_USE', 'READY'), 'READY')
  assert.equal(returnTarget('ON_LOAN', 'BROKEN'), 'BROKEN')
  assert.throws(() => returnTarget('READY', 'READY'), /ASSET_NOT_ASSIGNED/)
})

test('disposed assets are terminal and maintenance transitions are constrained', () => {
  assert.throws(() => assertTransferAllowed('DISPOSED'), /ASSET_DISPOSED/)
  assert.doesNotThrow(() => assertMaintenanceOpenAllowed('READY'))
  assert.doesNotThrow(() => assertMaintenanceOpenAllowed('BROKEN'))
  assert.throws(() => assertMaintenanceOpenAllowed('IN_USE'), /MAINTENANCE_NOT_ALLOWED/)
  assert.equal(maintenanceTarget('MAINTENANCE', 'READY'), 'READY')
  assert.throws(() => maintenanceTarget('MAINTENANCE', 'DISPOSED'), /DISPOSAL_WORKFLOW_REQUIRED/)
  assert.throws(() => maintenanceTarget('READY', 'DISPOSED'), /ASSET_NOT_IN_MAINTENANCE/)
})

test('a held asset cannot be transferred straight back into a warehouse', () => {
  // Moving it into stock while somebody still holds it would make the asset both
  // "in the warehouse" and "in use"; the recall has to go through a return.
  assert.throws(() => assertTransferAllowed('IN_USE', true, true), /RETURN_REQUIRED_BEFORE_WAREHOUSE/)
  assert.throws(() => assertTransferAllowed('ON_LOAN', true, true), /RETURN_REQUIRED_BEFORE_WAREHOUSE/)
  // Changing only the location of an asset somebody is using stays allowed.
  assert.doesNotThrow(() => assertTransferAllowed('IN_USE', false, true))
  // Stock-to-stock movement is unaffected.
  assert.doesNotThrow(() => assertTransferAllowed('READY', true, false))
})

test('asset history enriches assignments with the actual receiver for handover review', async () => {
  const db = {
    assetHistory: {
      findMany: async () => [
        {
          id: 'history-1',
          referenceType: 'AssetAssignment',
          referenceId: 'assignment-1',
          asset: { id: 'asset-1', assetTag: 'TV-HA-TSO-COM-010', name: 'PC' },
          toLocation: { name: 'TV - Hà Nội' },
        },
      ],
    },
    assetAssignment: {
      findMany: async ({ where }: any) => {
        assert.deepEqual(where, { id: { in: ['assignment-1'] } })
        return [
          {
            id: 'assignment-1',
            assignedTo: { fullName: 'Vũ Tuấn Anh', email: 'anhvt1@tinhvan.com' },
            department: { name: 'Hệ thống Thông tin' },
            location: { name: 'TV - Hà Nội' },
          },
        ]
      },
    },
  }
  const service = new LifecycleService(db as any)
  const result = await service.allHistory({ id: 'admin-1', role: 'ADMIN', departmentId: null })

  assert.equal(result.data[0].assignment?.assignedTo.fullName, 'Vũ Tuấn Anh')
  assert.equal(result.data[0].assignment?.location.name, 'TV - Hà Nội')
})

test('a return outcome is written to history as Vietnamese, not as the enum', async () => {
  const { returnOutcomeLabel } = await import('../src/modules/lifecycle/lifecycle.service')
  assert.equal(returnOutcomeLabel('BROKEN'), 'Hỏng')
  assert.equal(returnOutcomeLabel('READY'), 'Sẵn sàng')
  assert.equal(returnOutcomeLabel('MAINTENANCE'), 'Cần bảo trì')
  assert.equal(returnOutcomeLabel('SOMETHING_NEW'), 'SOMETHING_NEW', 'mã chưa biết vẫn hiện thay vì mất')
})

test('a batch handover names every asset that would stop it, not only the first', async () => {
  const { bulkAssignmentBlockers } = await import('../src/modules/lifecycle/lifecycle.rules')
  assert.deepEqual(
    bulkAssignmentBlockers([
      { assetTag: 'TS-1', statusCode: 'READY', hasCustodian: false },
      { assetTag: 'TS-2', statusCode: 'IN_USE', hasCustodian: true },
      { assetTag: 'TS-3', statusCode: 'READY', hasCustodian: true },
      { assetTag: 'TS-4', statusCode: 'MAINTENANCE', hasCustodian: false },
    ]),
    [
      { assetTag: 'TS-2', reason: 'ASSET_NOT_READY' },
      { assetTag: 'TS-3', reason: 'ASSET_HELD' },
      { assetTag: 'TS-4', reason: 'ASSET_NOT_READY' },
    ],
  )
  assert.deepEqual(bulkAssignmentBlockers([{ assetTag: 'TS-1', statusCode: 'READY', hasCustodian: false }]), [])
})

const bulkDb = (assets: Array<{ id: string; assetTag: string; status: string; custodian?: string }>) => {
  const written = { assignments: [] as any[], updates: [] as any[], history: [] as any[], audit: [] as any[] }
  const tx = {
    asset: {
      findMany: async () =>
        assets.map(item => ({
          id: item.id,
          assetTag: item.assetTag,
          status: { code: item.status },
          currentCustodianId: item.custodian || null,
        })),
      update: async (args: any) => written.updates.push(args),
    },
    person: {
      findFirst: async () => ({ id: 'person-1', fullName: 'Nguyễn Văn A', departmentId: 'dept-1', linkedUserId: null }),
    },
    location: { findFirst: async () => ({ id: 'loc-1', name: 'Tầng 3' }) },
    assetStatus: { findUnique: async ({ where }: any) => ({ id: `status-${where.code}`, code: where.code }) },
    assetAssignment: {
      create: async ({ data }: any) => {
        written.assignments.push(data)
        return { id: `assignment-${written.assignments.length}`, ...data }
      },
    },
    assetHistory: { create: async ({ data }: any) => written.history.push(data) },
    auditLog: { create: async ({ data }: any) => written.audit.push(data) },
  }
  return { db: { $transaction: async (run: any) => run(tx) }, written }
}
const bulkBody = (assetIds: string[]) => ({
  assetIds,
  type: 'ASSIGNMENT' as const,
  assignedToId: 'person-1',
  locationId: 'loc-1',
  conditionOut: 'Tốt',
})
const admin = { id: 'admin-1', role: 'ADMIN', departmentId: null }

test('a batch handover issues every asset to the same person under one batch number', async () => {
  const { db, written } = bulkDb([
    { id: 'a-2', assetTag: 'TS-2', status: 'READY' },
    { id: 'a-1', assetTag: 'TS-1', status: 'READY' },
  ])
  const result = await new LifecycleService(db as any).assignMany(bulkBody(['a-1', 'a-2']) as any, admin)

  assert.equal(result?.assignments.length, 2)
  assert.deepEqual(
    written.assignments.map(item => item.assetId),
    ['a-1', 'a-2'],
    'được ghi theo đúng thứ tự người dùng chọn',
  )
  assert.ok(written.assignments.every(item => item.assignedToId === 'person-1'))
  assert.deepEqual(
    written.assignments.map(item => item.assignmentNo),
    [`${result?.batchNo}-01`, `${result?.batchNo}-02`],
  )
  assert.ok(written.updates.every(item => item.data.statusId === 'status-IN_USE' && item.data.warehouseId === null))
  assert.ok(written.history.every(item => item.description.includes(`lô ${result?.batchNo}, 2 tài sản`)))
  assert.ok(written.audit.every(item => item.newValues.batchNo === result?.batchNo))
})

test('a batch handover writes nothing when one of the assets is not in stock', async () => {
  const { db, written } = bulkDb([
    { id: 'a-1', assetTag: 'TS-1', status: 'READY' },
    { id: 'a-2', assetTag: 'TS-2', status: 'IN_USE', custodian: 'someone' },
  ])
  await assert.rejects(
    () => new LifecycleService(db as any).assignMany(bulkBody(['a-1', 'a-2']) as any, admin),
    /TS-2 \(không ở trạng thái Sẵn sàng\)/,
  )
  assert.equal(written.assignments.length, 0)
  assert.equal(written.updates.length, 0)
})

test('a batch handover refuses an asset id it cannot find', async () => {
  const { db, written } = bulkDb([{ id: 'a-1', assetTag: 'TS-1', status: 'READY' }])
  await assert.rejects(
    () => new LifecycleService(db as any).assignMany(bulkBody(['a-1', 'a-404']) as any, admin),
    /Không tìm thấy 1 tài sản/,
  )
  assert.equal(written.assignments.length, 0)
})
