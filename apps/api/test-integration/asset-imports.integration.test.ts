import assert from 'node:assert/strict'
import test, { after, before, beforeEach } from 'node:test'
import { AssetImportsService } from '../src/modules/asset-imports/asset-imports.service'
import { LifecycleService } from '../src/modules/lifecycle/lifecycle.service'
import { createFixtures, db, type Fixtures, requireDatabase, resetBusinessData } from './harness'

requireDatabase()

const imports = new AssetImportsService(db as never)
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

const row = (fixtures: Fixtures, rowNumber: number, tag: string) => ({
  rowNumber,
  payload: {
    assetTag: tag,
    name: `Máy tính ${tag}`,
    barcode: `BC-${tag}`,
    categoryId: fixtures.category.id,
    warehouseId: fixtures.warehouse.id,
  },
})

const stage = (rows: ReturnType<typeof row>[]) =>
  imports.stage({ sourceFileName: 'nhap-kho.xlsx', rows } as never, fixtures.adminActor)

test('a batch with a duplicate tag inside the file is staged as invalid and commits nothing', async () => {
  const batch = await imports.stage(
    { sourceFileName: 'nhap-kho.xlsx', rows: [row(fixtures, 1, 'IM-001'), row(fixtures, 2, 'IM-001')] } as never,
    fixtures.adminActor,
  )

  assert.equal(batch.invalidRows, 1)
  assert.equal(batch.validRows, 1)
  await assert.rejects(() => imports.commit(batch.id, fixtures.adminActor), /dòng lỗi/)
  assert.equal(await db.asset.count(), 0)
})

test('committing a valid batch creates every asset with its intake history', async () => {
  const batch = await stage([row(fixtures, 1, 'IM-010'), row(fixtures, 2, 'IM-011')])
  assert.equal(batch.invalidRows, 0)

  const result = await imports.commit(batch.id, fixtures.adminActor)

  assert.equal(result.committedRows, 2)
  assert.equal(await db.asset.count(), 2)
  assert.equal(await db.assetHistory.count({ where: { action: 'CREATED' } }), 2)
  const stored = await db.asset.findFirstOrThrow({ where: { assetTag: 'IM-010' }, include: { status: true } })
  assert.equal(stored.status.code, 'READY')
  assert.equal(stored.warehouseId, fixtures.warehouse.id)
})

test('an identity taken between staging and commit rolls the whole batch back', async () => {
  const batch = await stage([row(fixtures, 1, 'IM-020'), row(fixtures, 2, 'IM-021')])

  // Somebody else registers the second tag while the batch sits in staging.
  const conflicting = await stage([row(fixtures, 1, 'IM-021')])
  await imports.commit(conflicting.id, fixtures.adminActor)
  assert.equal(await db.asset.count(), 1)

  await assert.rejects(() => imports.commit(batch.id, fixtures.adminActor), /trùng/)

  assert.equal(await db.asset.count(), 1, 'the failed batch must not leave a partially imported asset behind')
  assert.equal(await db.asset.count({ where: { assetTag: 'IM-020' } }), 0)
  const reloaded = await db.assetImportBatch.findUniqueOrThrow({ where: { id: batch.id } })
  assert.equal(reloaded.status, 'STAGED')
})

test('rollback soft deletes the imported assets and releases their identifiers', async () => {
  const batch = await stage([row(fixtures, 1, 'IM-030')])
  await imports.commit(batch.id, fixtures.adminActor)

  const result = await imports.rollback(batch.id, fixtures.adminActor)

  assert.equal(result.rolledBackRows, 1)
  const stored = await db.asset.findFirstOrThrow({ where: { name: 'Máy tính IM-030' } })
  assert.notEqual(stored.deletedAt, null)
  assert.equal(stored.assetTag.startsWith('ROLLED-BACK-'), true)

  // The released tag can be imported again.
  const again = await stage([row(fixtures, 1, 'IM-030')])
  assert.equal(again.invalidRows, 0)
})

test('rollback is refused once an imported asset has been issued', async () => {
  const batch = await stage([row(fixtures, 1, 'IM-040')])
  await imports.commit(batch.id, fixtures.adminActor)
  const asset = await db.asset.findFirstOrThrow({ where: { assetTag: 'IM-040' } })

  await lifecycle.assign(
    asset.id,
    {
      type: 'ASSIGNMENT',
      assignedToId: fixtures.person.id,
      locationId: fixtures.deskLocation.id,
      conditionOut: 'Tốt',
    } as never,
    fixtures.adminActor,
  )

  await assert.rejects(() => imports.rollback(batch.id, fixtures.adminActor), /nghiệp vụ|trạng thái/)
  const reloaded = await db.asset.findUniqueOrThrow({ where: { id: asset.id } })
  assert.equal(reloaded.deletedAt, null)
  assert.equal(reloaded.assetTag, 'IM-040')
})

test('only Admin or IT may stage an import', async () => {
  await assert.rejects(
    () =>
      imports.stage({ sourceFileName: 'x.xlsx', rows: [row(fixtures, 1, 'IM-050')] } as never, {
        id: fixtures.admin.id,
        role: 'HCNS',
        departmentId: fixtures.department.id,
      }),
    /Chỉ Admin hoặc IT/,
  )
  assert.equal(await db.assetImportBatch.count(), 0)
})
