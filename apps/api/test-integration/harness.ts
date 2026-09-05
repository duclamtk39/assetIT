import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'

// Reference data that the migrations install and the services look up by code.
// Everything else is recreated per run so each test starts from a known state.
const PRESERVED_TABLES = ['_prisma_migrations', 'asset_statuses']

export const db = new PrismaClient()

export function requireDatabase() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      'Integration tests need DATABASE_URL pointing at a disposable PostgreSQL database. ' +
        'Run `npm run test:integration:docker` to have one started for you.',
    )
}

export async function resetBusinessData() {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `
  const targets = tables.map(row => row.tablename).filter(name => !PRESERVED_TABLES.includes(name))
  if (!targets.length) throw new Error('No application tables found; run the migrations first.')
  const list = targets.map(name => `"public"."${name}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

export type Fixtures = Awaited<ReturnType<typeof createFixtures>>

export async function createFixtures() {
  const suffix = randomUUID().slice(0, 8)
  const department = await db.department.create({ data: { code: `IT-${suffix}`, name: 'Phòng CNTT' } })
  const otherDepartment = await db.department.create({ data: { code: `HC-${suffix}`, name: 'Phòng Hành chính' } })
  const location = await db.location.create({ data: { code: `L-${suffix}`, name: 'Kho tầng 1', type: 'ROOM' } })
  const deskLocation = await db.location.create({ data: { code: `D-${suffix}`, name: 'Bàn làm việc', type: 'ROOM' } })
  const warehouse = await db.warehouse.create({
    data: { code: `KHO-${suffix}`, name: 'Kho Tổng', locationId: location.id },
  })
  const category = await db.assetCategory.create({ data: { code: `LAP-${suffix}`, name: 'Laptop' } })

  const admin = await db.user.create({
    data: {
      employeeCode: `AD-${suffix}`,
      username: `admin-${suffix}`,
      fullName: 'Quản trị viên',
      email: `admin-${suffix}@example.test`,
      role: 'ADMIN',
      departmentId: department.id,
    },
  })
  const person = await db.person.create({
    data: {
      employeeCode: `NV-${suffix}`,
      fullName: 'Nguyễn Văn A',
      email: `nva-${suffix}@example.test`,
      departmentId: department.id,
    },
  })
  const otherPerson = await db.person.create({
    data: {
      employeeCode: `NV2-${suffix}`,
      fullName: 'Trần Thị B',
      email: `ttb-${suffix}@example.test`,
      departmentId: otherDepartment.id,
    },
  })

  const adminActor = { id: admin.id, role: 'ADMIN', departmentId: department.id }
  const hcnsActor = { id: admin.id, role: 'HCNS', departmentId: department.id }

  return {
    suffix,
    department,
    otherDepartment,
    location,
    deskLocation,
    warehouse,
    category,
    admin,
    person,
    otherPerson,
    adminActor,
    hcnsActor,
  }
}

export async function createReadyAsset(fixtures: Fixtures, tag: string) {
  const status = await db.assetStatus.findUniqueOrThrow({ where: { code: 'READY' } })
  return db.asset.create({
    data: {
      assetTag: tag,
      name: `Máy tính ${tag}`,
      barcode: `BC-${tag}`,
      categoryId: fixtures.category.id,
      statusId: status.id,
      warehouseId: fixtures.warehouse.id,
      locationId: fixtures.location.id,
      departmentId: fixtures.department.id,
    },
  })
}

export async function statusCodeOf(assetId: string) {
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId }, include: { status: true } })
  return asset.status.code
}
