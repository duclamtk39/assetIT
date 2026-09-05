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

// The asset record is a snapshot of physical reality, so a handful of invariants must hold
// after every operation. These tests state them once and check them against the services.
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

const assignBody = (f: Fixtures) => ({
  type: 'ASSIGNMENT' as const,
  assignedToId: f.person.id,
  locationId: f.deskLocation.id,
  conditionOut: 'Tốt',
})

async function assertConsistent(assetId: string, label: string) {
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId }, include: { status: true } })
  const held = asset.currentCustodianId !== null
  const inHand = ['IN_USE', 'ON_LOAN'].includes(asset.status.code)

  assert.equal(
    held,
    inHand,
    `${label}: người giữ và trạng thái phải khớp (status=${asset.status.code}, custodian=${held})`,
  )
  if (asset.warehouseId)
    assert.equal(asset.currentCustodianId, null, `${label}: tài sản nằm trong kho thì không được có người giữ`)
  if (asset.status.code === 'READY')
    assert.notEqual(asset.warehouseId, null, `${label}: tài sản Sẵn sàng phải thuộc một kho`)
}

test('tài sản mới nhập kho ở trạng thái nhất quán', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-001')
  await assertConsistent(asset.id, 'sau khi nhập kho')
})

test('cấp phát đưa tài sản ra khỏi kho và giao cho đúng một người', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-002')
  await lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor)
  await assertConsistent(asset.id, 'sau khi cấp phát')
})

test('không được điều chuyển tài sản đang có người giữ vào kho', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-003')
  await lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor)

  await assert.rejects(
    () =>
      lifecycle.transfer(
        asset.id,
        { toWarehouseId: fixtures.warehouse.id, reason: 'Đưa về kho mà chưa thu hồi' } as never,
        fixtures.adminActor,
      ),
    'phải thu hồi trước khi nhập lại kho',
  )

  await assertConsistent(asset.id, 'sau khi điều chuyển bị từ chối')
})

test('vẫn được đổi vị trí cho tài sản đang sử dụng mà không đụng tới kho', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-004')
  await lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor)

  await lifecycle.transfer(
    asset.id,
    { toLocationId: fixtures.location.id, reason: 'Nhân viên đổi chỗ ngồi' } as never,
    fixtures.adminActor,
  )

  const asset2 = await db.asset.findUniqueOrThrow({ where: { id: asset.id } })
  assert.equal(asset2.locationId, fixtures.location.id)
  assert.equal(asset2.currentCustodianId, fixtures.person.id, 'đổi vị trí không được làm mất người giữ')
  await assertConsistent(asset.id, 'sau khi đổi vị trí')
})

test('điều chuyển tài sản trong kho sang kho khác vẫn hợp lệ', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-005')
  const other = await db.warehouse.create({
    data: { code: `KHO2-${fixtures.suffix}`, name: 'Kho phụ', locationId: fixtures.deskLocation.id },
  })

  await lifecycle.transfer(
    asset.id,
    { toWarehouseId: other.id, reason: 'Cân đối tồn kho giữa hai kho' } as never,
    fixtures.adminActor,
  )

  const moved = await db.asset.findUniqueOrThrow({ where: { id: asset.id } })
  assert.equal(moved.warehouseId, other.id)
  await assertConsistent(asset.id, 'sau khi chuyển kho')
})

test('một tài sản không thể có hai phiếu bảo trì mở cùng lúc', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-006')
  await lifecycle.openMaintenance(
    asset.id,
    { warehouseId: fixtures.warehouse.id, issue: 'Lần một' } as never,
    fixtures.adminActor,
  )

  await assert.rejects(
    () =>
      lifecycle.openMaintenance(
        asset.id,
        { warehouseId: fixtures.warehouse.id, issue: 'Lần hai' } as never,
        fixtures.adminActor,
      ),
    'tài sản đang bảo trì không được mở phiếu thứ hai',
  )

  assert.equal(await db.maintenanceRecord.count({ where: { assetId: asset.id, status: 'OPEN' } }), 1)
})

test('không được cấp phát tài sản đang bảo trì', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-007')
  await lifecycle.openMaintenance(
    asset.id,
    { warehouseId: fixtures.warehouse.id, issue: 'Đang sửa' } as never,
    fixtures.adminActor,
  )

  await assert.rejects(() => lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor))
  assert.equal(await statusCodeOf(asset.id), 'MAINTENANCE')
  await assertConsistent(asset.id, 'sau khi cấp phát bị từ chối')
})

test('tài sản đã ngừng theo dõi không còn nhận nghiệp vụ nào', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-008')
  await db.asset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } })

  await assert.rejects(() => lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor))
  await assert.rejects(() =>
    lifecycle.transfer(
      asset.id,
      { toLocationId: fixtures.deskLocation.id, reason: 'Thử điều chuyển' } as never,
      fixtures.adminActor,
    ),
  )
})

test('không được cấp phát cho người đã ngừng hoạt động', async () => {
  const asset = await createReadyAsset(fixtures, 'INV-009')
  await db.person.update({ where: { id: fixtures.person.id }, data: { status: 'INACTIVE' } })

  await assert.rejects(() => lifecycle.assign(asset.id, assignBody(fixtures) as never, fixtures.adminActor))
  await assertConsistent(asset.id, 'sau khi cấp phát cho người nghỉ việc bị từ chối')
})
