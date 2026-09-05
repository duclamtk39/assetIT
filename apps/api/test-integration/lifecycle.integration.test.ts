import assert from 'node:assert/strict'
import test, { after, before, beforeEach } from 'node:test'
import { LifecycleService } from '../src/modules/lifecycle/lifecycle.service'
import {
  createFixtures,
  createReadyAsset,
  db,
  type Fixtures,
  requireDatabase,
  resetBusinessData,
  statusCodeOf,
} from './harness'

requireDatabase()

const lifecycle = new LifecycleService(db as never)
let fixtures: Fixtures

before(async () => {
  await db.$connect()
})
beforeEach(async () => {
  await resetBusinessData()
  fixtures = await createFixtures()
})
after(async () => {
  await db.$disconnect()
})

const assignBody = (fixtures: Fixtures) => ({
  type: 'ASSIGNMENT' as const,
  assignedToId: fixtures.person.id,
  locationId: fixtures.deskLocation.id,
  conditionOut: 'Tốt',
})

test('assignment moves the asset to IN_USE and records history and audit in the same transaction', async () => {
  const asset = await createReadyAsset(fixtures, 'TS-0001')

  const assignment = await lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor)

  assert.equal(await statusCodeOf(asset.id), 'IN_USE')
  const stored = await db.asset.findUniqueOrThrow({ where: { id: asset.id } })
  assert.equal(stored.currentCustodianId, fixtures.person.id)
  assert.equal(stored.warehouseId, null, 'an issued asset must leave the warehouse')
  assert.equal(stored.locationId, fixtures.deskLocation.id)

  const history = await db.assetHistory.findMany({ where: { assetId: asset.id } })
  assert.equal(history.length, 1)
  assert.equal(history[0].action, 'ASSIGNED')
  assert.equal(history[0].referenceId, assignment.id)

  const audit = await db.auditLog.findMany({ where: { entityId: asset.id, action: 'ASSET_ASSIGNED' } })
  assert.equal(audit.length, 1)
})

test('two concurrent assignments of one asset cannot both succeed', async () => {
  const asset = await createReadyAsset(fixtures, 'TS-0002')

  const results = await Promise.allSettled([
    lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor),
    lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor),
  ])
  const succeeded = results.filter(result => result.status === 'fulfilled')

  assert.equal(succeeded.length, 1, 'exactly one assignment may win the race')
  assert.equal(await db.assetAssignment.count({ where: { assetId: asset.id, status: 'OPEN' } }), 1)
  assert.equal(await db.assetHistory.count({ where: { assetId: asset.id, action: 'ASSIGNED' } }), 1)
})

test('an asset that is already issued cannot be issued again', async () => {
  const asset = await createReadyAsset(fixtures, 'TS-0003')
  await lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor)

  await assert.rejects(() => lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor))
  assert.equal(await db.assetAssignment.count({ where: { assetId: asset.id } }), 1)
})

test('a loan requires a return date in the future', async () => {
  const asset = await createReadyAsset(fixtures, 'TS-0004')
  const body = { ...assignBody(fixtures), type: 'LOAN' as const, expectedReturnDate: '2020-01-01' }

  await assert.rejects(() => lifecycle.assign(asset.id, body as never, fixtures.adminActor), /ngày trả dự kiến/)
  assert.equal(await statusCodeOf(asset.id), 'READY')
})

test('HCNS cannot issue an asset to a person outside its own department', async () => {
  const asset = await createReadyAsset(fixtures, 'TS-0005')
  const body = { ...assignBody(fixtures), assignedToId: fixtures.otherPerson.id }

  await assert.rejects(() => lifecycle.assign(asset.id, body as never, fixtures.hcnsActor), /phòng ban/)
  assert.equal(await db.assetAssignment.count({ where: { assetId: asset.id } }), 0)
})

test('returning an asset to READY requires a warehouse and clears the custodian', async () => {
  const asset = await createReadyAsset(fixtures, 'TS-0006')
  await lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor)

  await assert.rejects(
    () => lifecycle.returnAsset(asset.id, { conditionIn: 'Tốt', outcome: 'READY' } as never, fixtures.adminActor),
    /kho/,
  )

  await lifecycle.returnAsset(
    asset.id,
    { conditionIn: 'Tốt', outcome: 'READY', warehouseId: fixtures.warehouse.id } as never,
    fixtures.adminActor,
  )

  assert.equal(await statusCodeOf(asset.id), 'READY')
  const stored = await db.asset.findUniqueOrThrow({ where: { id: asset.id } })
  assert.equal(stored.currentCustodianId, null)
  assert.equal(stored.warehouseId, fixtures.warehouse.id)
  assert.equal(await db.assetAssignment.count({ where: { assetId: asset.id, status: 'OPEN' } }), 0)
})

test('returning a broken asset opens no maintenance record but a check-required return does', async () => {
  const broken = await createReadyAsset(fixtures, 'TS-0007')
  await lifecycle.assign(broken.id, assignBody(fixtures) as never, fixtures.adminActor)
  await lifecycle.returnAsset(
    broken.id,
    { conditionIn: 'Vỡ màn hình', outcome: 'BROKEN', locationId: fixtures.location.id } as never,
    fixtures.adminActor,
  )
  assert.equal(await statusCodeOf(broken.id), 'BROKEN')
  assert.equal(await db.maintenanceRecord.count({ where: { assetId: broken.id } }), 0)

  const checked = await createReadyAsset(fixtures, 'TS-0008')
  await lifecycle.assign(checked.id, assignBody(fixtures) as never, fixtures.adminActor)
  await lifecycle.returnAsset(
    checked.id,
    { conditionIn: 'Cần kiểm tra', outcome: 'MAINTENANCE', warehouseId: fixtures.warehouse.id } as never,
    fixtures.adminActor,
  )
  assert.equal(await statusCodeOf(checked.id), 'MAINTENANCE')
  assert.equal(await db.maintenanceRecord.count({ where: { assetId: checked.id } }), 1)
})

test('a duplicate asset tag is rejected by the database, not only by the service', async () => {
  await createReadyAsset(fixtures, 'TS-0009')
  await assert.rejects(() => createReadyAsset(fixtures, 'TS-0009'), /Unique constraint|P2002/)
})
