import assert from 'node:assert/strict'
import test, { after, before, beforeEach } from 'node:test'
import { DirectoryService } from '../src/modules/directory/directory.service'
import { LifecycleService } from '../src/modules/lifecycle/lifecycle.service'
import { createFixtures, createReadyAsset, db, type Fixtures, requireDatabase, resetBusinessData } from './harness'

// A synced account is only useful for asset management once it also exists in the
// recipient directory, so these tests drive the persistence step against a real database.
requireDatabase()

const directory = new DirectoryService(db as never, {} as never)
const lifecycle = new LifecycleService(db as never)
let fixtures: Fixtures

const persist = (users: unknown[]) =>
  (
    directory as unknown as { persistUsers: (p: string, c: unknown, u: unknown[]) => Promise<Record<string, number>> }
  ).persistUsers('LDAP', { syncDisabled: false, groupMapping: null } as never, users)

const externalUser = (index: number, department?: string) => ({
  externalId: `ext-${index}`,
  username: `nhanvien.dir${index}`,
  fullName: `Người dùng thư mục ${index}`,
  email: `nhanvien.dir${index}@company.vn`,
  employeeCode: `DIR-${String(index).padStart(3, '0')}`,
  department,
  enabled: true,
  groups: [],
})

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

test('tài khoản đồng bộ có phòng ban tạo cả người dùng lẫn hồ sơ người nhận tài sản', async () => {
  const counts = await persist([externalUser(1, 'Phòng Kỹ thuật')])

  assert.equal(counts.created, 1)
  const user = await db.user.findFirstOrThrow({ where: { username: 'nhanvien.dir1' } })
  assert.equal(user.authSource, 'LDAP')

  const person = await db.person.findFirstOrThrow({ where: { linkedUserId: user.id }, include: { department: true } })
  assert.equal(person.department.name, 'Phòng Kỹ thuật')
})

test('tài khoản không có thuộc tính phòng ban vẫn có hồ sơ người nhận tài sản', async () => {
  await persist([externalUser(2)])

  const user = await db.user.findFirstOrThrow({ where: { username: 'nhanvien.dir2' } })
  const person = await db.person.findFirst({ where: { linkedUserId: user.id }, include: { department: true } })

  assert.notEqual(person, null, 'thiếu phòng ban không được làm mất hồ sơ người nhận tài sản')
  assert.equal(person!.department.code, 'DIR-UNASSIGNED')
})

test('người đồng bộ từ thư mục nhận được tài sản ngay', async () => {
  await persist([externalUser(3)])
  const person = await db.person.findFirstOrThrow({ where: { employeeCode: 'DIR-003' } })
  const asset = await createReadyAsset(fixtures, 'DIR-ASSET-1')

  await lifecycle.assign(
    asset.id,
    {
      type: 'ASSIGNMENT',
      assignedToId: person.id,
      locationId: fixtures.deskLocation.id,
      conditionOut: 'Tốt',
    } as never,
    fixtures.adminActor,
  )

  const held = await db.asset.findUniqueOrThrow({ where: { id: asset.id }, include: { status: true } })
  assert.equal(held.currentCustodianId, person.id)
  assert.equal(held.status.code, 'IN_USE')
  assert.equal(held.warehouseId, null)
})

test('tài khoản bị vô hiệu ở thư mục kéo theo hồ sơ người nhận tài sản', async () => {
  await persist([externalUser(4, 'Phòng Kinh doanh')])
  await persist([{ ...externalUser(4, 'Phòng Kinh doanh'), enabled: false }])

  const user = await db.user.findFirstOrThrow({ where: { username: 'nhanvien.dir4' } })
  const person = await db.person.findFirstOrThrow({ where: { linkedUserId: user.id } })
  assert.equal(user.status, 'INACTIVE')
  assert.equal(person.status, 'INACTIVE')
})

test('tài khoản biến mất khỏi thư mục bị vô hiệu ở lần đồng bộ sau', async () => {
  await persist([externalUser(5, 'Phòng Kế toán'), externalUser(6, 'Phòng Kế toán')])
  await persist([externalUser(5, 'Phòng Kế toán')])

  const gone = await db.user.findFirstOrThrow({ where: { username: 'nhanvien.dir6' } })
  const kept = await db.user.findFirstOrThrow({ where: { username: 'nhanvien.dir5' } })
  assert.equal(gone.status, 'INACTIVE')
  assert.equal(kept.status, 'ACTIVE')
})

test('đồng bộ lại không tạo trùng hồ sơ người nhận tài sản', async () => {
  await persist([externalUser(7, 'Phòng Marketing')])
  await persist([{ ...externalUser(7, 'Phòng Marketing'), fullName: 'Tên đã đổi' }])

  const user = await db.user.findFirstOrThrow({ where: { username: 'nhanvien.dir7' } })
  assert.equal(user.fullName, 'Tên đã đổi')
  assert.equal(await db.person.count({ where: { linkedUserId: user.id } }), 1)
})
