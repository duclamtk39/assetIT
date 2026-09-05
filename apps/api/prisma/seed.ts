import 'reflect-metadata'
import { PrismaClient } from '@prisma/client'
import { AssetImportsService } from '../src/modules/asset-imports/asset-imports.service'
import { AssetsService } from '../src/modules/assets/assets.service'
import { DisposalsService } from '../src/modules/disposals/disposals.service'
import { IncidentsService } from '../src/modules/incidents/incidents.service'
import { InventoryService } from '../src/modules/inventory/inventory.service'
import { LifecycleService } from '../src/modules/lifecycle/lifecycle.service'
import { RenewalsService } from '../src/modules/renewals/renewals.service'
import { RisksService } from '../src/modules/risks/risks.service'
import { hashPassword } from '../src/auth/password'

// The demo data is written through the real services so every record carries the same
// history, audit trail and state transitions that the application itself would produce.
const db = new PrismaClient()
const service = <T>(Ctor: new (db: never) => T) => new Ctor(db as never)

const assets = service(AssetsService)
const lifecycle = service(LifecycleService)
const inventory = service(InventoryService)
const incidents = service(IncidentsService)
const disposals = service(DisposalsService)
const renewals = service(RenewalsService)
const risks = service(RisksService)
const imports = service(AssetImportsService)

type Actor = { id: string; role: string; departmentId: string | null }

const DEMO_PASSWORD = 'Demo@12345'
const DAY = 24 * 60 * 60 * 1000
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10)
const isoTime = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()
const pick = <T>(list: readonly T[], index: number) => list[index % list.length]

const PEOPLE = [
  'Nguyễn Minh Anh',
  'Trần Đức Long',
  'Lê Hoàng Nam',
  'Phạm Thu Hà',
  'Nguyễn Thu Hương',
  'Vũ Thanh Mai',
  'Hoàng Anh Tuấn',
  'Nguyễn Văn Hùng',
  'Trần Thu Linh',
  'Lê Minh Quân',
  'Đặng Hải Yến',
  'Bùi Quang Huy',
  'Phan Thị Ngọc',
  'Đỗ Trung Kiên',
  'Ngô Bảo Châu',
  'Dương Thùy Trang',
  'Lý Gia Bảo',
  'Mai Khánh Linh',
  'Tạ Hoàng Phúc',
  'Vương Diệu My',
] as const

async function main() {
  if (process.env.ASSETFLOW_DEMO_SEED !== 'true')
    throw new Error('Demo seed is disabled. Set ASSETFLOW_DEMO_SEED=true only for a disposable local/demo database.')

  const present = await db.asset.count({ where: { assetTag: { startsWith: 'DEMO-' } } })
  if (present) {
    console.log(
      `Dữ liệu demo đã có sẵn (${present} tài sản mã DEMO-). Không tạo thêm.
` + 'Muốn tạo lại từ đầu: docker compose -f compose.yaml -f compose.dev.yaml down -v && up -d',
    )
    return
  }

  const actor = await adminActor()
  const reference = await seedReferenceData()
  const itOperator = await seedOperatorAccounts(reference)
  const people = await seedPeople(reference)
  const created = await seedAssets(actor, reference)
  await seedLifecycle(actor, reference, people, created)
  await seedInventory(actor, reference)
  const vendors = await seedVendors()
  const incidentRecords = await seedIncidents(actor, reference, created)
  await seedRenewals(actor, reference, vendors, people)
  await seedRisks(actor, reference, created, incidentRecords)
  await seedDisposals(itOperator, actor)
  await seedDiscovery(actor, created)
  await seedImportBatches(actor, reference)
  await report()
}

async function adminActor(): Promise<Actor> {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })
  return { id: admin.id, role: 'ADMIN', departmentId: null }
}

async function seedOperatorAccounts(reference: Reference): Promise<Actor> {
  const passwordHash = await hashPassword(DEMO_PASSWORD)
  const it = await db.user.upsert({
    where: { username: 'it.manager' },
    update: {},
    create: {
      employeeCode: 'IT-001',
      username: 'it.manager',
      fullName: 'Trần Đức Long',
      email: 'it.manager@company.vn',
      role: 'IT',
      authSource: 'LOCAL',
      passwordHash,
      mustChangePassword: false,
      departmentId: reference.departments[0].id,
    },
  })
  await db.user.upsert({
    where: { username: 'hcns.admin' },
    update: {},
    create: {
      employeeCode: 'HC-001',
      username: 'hcns.admin',
      fullName: 'Nguyễn Thu Hương',
      email: 'hcns.admin@company.vn',
      role: 'HCNS',
      authSource: 'LOCAL',
      passwordHash,
      mustChangePassword: false,
      departmentId: reference.departments[3].id,
    },
  })
  return { id: it.id, role: 'IT', departmentId: reference.departments[0].id }
}

async function seedReferenceData() {
  const departmentNames = ['IT', 'Marketing', 'Kinh doanh', 'Hành chính', 'Kế toán']
  const departments = []
  for (const [index, name] of departmentNames.entries())
    departments.push(
      await db.department.upsert({
        where: { code: `D${index + 1}` },
        update: { name },
        create: { code: `D${index + 1}`, name, isIncidentResponseTeam: name === 'IT' },
      }),
    )

  const locationDefs = [
    ['L1', 'VP Hà Nội', 'SITE', 'Số 1 Đại Cồ Việt, Hà Nội'],
    ['L2', 'Tầng 2 - Kinh doanh', 'FLOOR', undefined],
    ['L3', 'Tầng 3 - Marketing', 'FLOOR', undefined],
    ['L4', 'Phòng Server', 'ROOM', undefined],
    ['L5', 'VP Hồ Chí Minh', 'SITE', 'Số 8 Nguyễn Huệ, TP. Hồ Chí Minh'],
    ['L6', 'Tầng 4 - Kỹ thuật', 'FLOOR', undefined],
  ] as const
  const locations = []
  for (const [code, name, type, address] of locationDefs)
    locations.push(
      await db.location.upsert({ where: { code }, update: { name }, create: { code, name, type, address } }),
    )

  const warehouses = [
    await db.warehouse.upsert({
      where: { code: 'KHO-HN' },
      update: {},
      create: { code: 'KHO-HN', name: 'Kho Tổng Hà Nội', locationId: locations[0].id },
    }),
    await db.warehouse.upsert({
      where: { code: 'KHO-HCM' },
      update: {},
      create: { code: 'KHO-HCM', name: 'Kho Tổng Hồ Chí Minh', locationId: locations[4].id },
    }),
  ]

  const categoryNames = [
    'Laptop',
    'Desktop',
    'Server',
    'Màn hình',
    'Switch',
    'Firewall',
    'Máy in',
    'Điện thoại',
    'Phụ kiện',
    'Thiết bị lưu trữ',
  ]
  const categories = []
  for (const [index, name] of categoryNames.entries())
    categories.push(
      await db.assetCategory.upsert({
        where: { code: `DEMO-CAT-${index + 1}` },
        update: { name },
        create: { code: `DEMO-CAT-${index + 1}`, name },
      }),
    )

  const manufacturerNames = ['Dell', 'HP', 'Lenovo', 'Apple', 'Cisco', 'Fortinet', 'Logitech', 'Synology']
  const manufacturers = []
  for (const name of manufacturerNames)
    manufacturers.push(await db.manufacturer.upsert({ where: { name }, update: {}, create: { name } }))

  const modelNames = [
    'Latitude 7450',
    'OptiPlex 7010',
    'PowerEdge R660',
    'UltraSharp U2723QE',
    'Catalyst 9200L',
    'FortiGate 100F',
    'LaserJet Pro M404',
    'iPhone 15 Pro',
    'MX Keys S',
    'DiskStation DS923+',
    'ThinkPad X1 Carbon',
    'MacBook Pro 14 M4',
  ]
  const models = []
  for (const [index, name] of modelNames.entries())
    models.push(
      await db.assetModel.upsert({
        where: { manufacturerId_name: { manufacturerId: pick(manufacturers, index).id, name } },
        update: {},
        create: {
          name,
          modelNumber: `M-${String(index + 1).padStart(3, '0')}`,
          manufacturerId: pick(manufacturers, index).id,
          categoryId: pick(categories, index).id,
        },
      }),
    )

  return { departments, locations, warehouses, categories, manufacturers, models }
}

type Reference = Awaited<ReturnType<typeof seedReferenceData>>

async function seedPeople(reference: Reference) {
  const people = []
  for (const [index, fullName] of PEOPLE.entries())
    people.push(
      await db.person.upsert({
        where: { employeeCode: `NV-${String(index + 1).padStart(3, '0')}` },
        update: {},
        create: {
          employeeCode: `NV-${String(index + 1).padStart(3, '0')}`,
          fullName,
          email: `nhanvien${index + 1}@company.vn`,
          phone: `09${String(10000000 + index * 137)}`.slice(0, 10),
          jobTitle: pick(['Chuyên viên', 'Trưởng nhóm', 'Quản lý', 'Kỹ sư'], index),
          departmentId: pick(reference.departments, index).id,
          locationId: pick(reference.locations, index).id,
        },
      }),
    )
  return people
}

type Person = Awaited<ReturnType<typeof seedPeople>>[number]

const ASSET_DEFS = [
  [
    'Laptop Dell Latitude 7450',
    0,
    0,
    0,
    32_500_000,
    { cpu: 'Intel Core Ultra 7', ram: '32 GB', storage: 'SSD 1 TB', operatingSystem: 'Windows 11 Pro' },
  ],
  [
    'MacBook Pro 14 M4',
    0,
    3,
    11,
    52_900_000,
    { cpu: 'Apple M4 Pro', ram: '24 GB', storage: 'SSD 512 GB', operatingSystem: 'macOS 15' },
  ],
  [
    'Laptop ThinkPad X1 Carbon',
    0,
    2,
    10,
    41_200_000,
    { cpu: 'Intel Core i7-1365U', ram: '16 GB', storage: 'SSD 512 GB', operatingSystem: 'Windows 11 Pro' },
  ],
  [
    'Desktop Dell OptiPlex 7010',
    1,
    0,
    1,
    18_400_000,
    { cpu: 'Intel Core i5-13500', ram: '16 GB', storage: 'SSD 512 GB', operatingSystem: 'Windows 11 Pro' },
  ],
  [
    'Desktop HP ProDesk 400',
    1,
    1,
    1,
    16_900_000,
    { cpu: 'Intel Core i5-12500', ram: '8 GB', storage: 'SSD 256 GB', operatingSystem: 'Windows 11 Pro' },
  ],
  [
    'Server Dell PowerEdge R660',
    2,
    0,
    2,
    268_000_000,
    {
      cpu: '2x Xeon Gold 6438Y',
      ram: '256 GB',
      storage: 'SSD 8 TB',
      operatingSystem: 'VMware ESXi 8',
      ipAddress: '10.10.1.11',
    },
  ],
  [
    'Server HP ProLiant DL380',
    2,
    1,
    2,
    214_000_000,
    {
      cpu: '2x Xeon Silver 4410Y',
      ram: '128 GB',
      storage: 'SSD 4 TB',
      operatingSystem: 'Ubuntu Server 24.04',
      ipAddress: '10.10.1.12',
    },
  ],
  ['Màn hình Dell UltraSharp U2723QE', 3, 0, 3, 13_900_000, {}],
  ['Màn hình LG UltraFine 27', 3, 1, 3, 12_400_000, {}],
  ['Switch Cisco Catalyst 9200L', 4, 4, 4, 78_500_000, { ipAddress: '10.10.1.2', macAddress: '40:55:39:A0:18:22' }],
  ['Switch Cisco Catalyst 2960X', 4, 4, 4, 42_000_000, { ipAddress: '10.10.1.3', macAddress: '40:55:39:A0:18:23' }],
  ['Firewall FortiGate 100F', 5, 5, 5, 96_000_000, { ipAddress: '10.10.1.1', operatingSystem: 'FortiOS 7.4' }],
  ['Máy in HP LaserJet Pro M404', 6, 1, 6, 8_900_000, { ipAddress: '10.10.3.50' }],
  ['Máy in Canon imageRUNNER', 6, 1, 6, 24_500_000, { ipAddress: '10.10.3.51' }],
  ['iPhone 15 Pro 256GB', 7, 3, 7, 28_990_000, { operatingSystem: 'iOS 18' }],
  ['Samsung Galaxy S24', 7, 7, 7, 21_500_000, { operatingSystem: 'Android 15' }],
  ['Bàn phím Logitech MX Keys S', 8, 6, 8, 2_890_000, {}],
  ['Chuột Logitech MX Master 3S', 8, 6, 8, 2_490_000, {}],
  ['NAS Synology DiskStation DS923+', 9, 7, 9, 34_800_000, { storage: 'HDD 32 TB', ipAddress: '10.10.1.20' }],
  ['SSD di động Samsung T7 1TB', 9, 7, 9, 2_790_000, { storage: 'SSD 1 TB' }],
] as const

async function seedAssets(actor: Actor, reference: Reference) {
  const created = []
  for (const [index, definition] of ASSET_DEFS.entries()) {
    const [name, categoryIndex, manufacturerIndex, modelIndex, cost, technical] = definition
    const tag = `DEMO-2026-${String(index + 1).padStart(3, '0')}`
    created.push(
      await assets.create(
        {
          assetTag: tag,
          name,
          barcode: tag,
          serialNumber: `SN-2026-${String(90000 + index * 37).padStart(6, '0')}`,
          categoryId: reference.categories[categoryIndex].id,
          manufacturerId: reference.manufacturers[manufacturerIndex].id,
          modelId: reference.models[modelIndex].id,
          warehouseId: pick(reference.warehouses, index).id,
          purchaseDate: isoDate(-360 + index * 12),
          purchaseCost: cost,
          warrantyMonths: 36,
          ...technical,
        } as never,
        actor as never,
      ),
    )
  }
  return created
}

async function seedLifecycle(actor: Actor, reference: Reference, people: Person[], created: { id: string }[]) {
  const desks = [reference.locations[1], reference.locations[2], reference.locations[5]]

  // Eight assets leave the warehouse: six assignments and two loans, one of them overdue.
  for (let index = 0; index < 8; index++) {
    const isLoan = index >= 6
    await lifecycle.assign(
      created[index].id,
      {
        type: isLoan ? 'LOAN' : 'ASSIGNMENT',
        assignedToId: people[index].id,
        locationId: pick(desks, index).id,
        conditionOut: 'Tốt',
        ...(isLoan ? { expectedReturnDate: isoDate(index === 6 ? 21 : 2) } : {}),
        note: isLoan ? 'Cho mượn phục vụ công tác' : 'Cấp phát theo yêu cầu phòng ban',
      } as never,
      actor,
    )
  }

  // Three come back with different outcomes so every return path has data.
  await lifecycle.returnAsset(
    created[0].id,
    {
      conditionIn: 'Tốt',
      outcome: 'READY',
      warehouseId: reference.warehouses[0].id,
      note: 'Nhân viên chuyển bộ phận',
    } as never,
    actor,
  )
  await lifecycle.returnAsset(
    created[1].id,
    {
      conditionIn: 'Vỡ màn hình',
      outcome: 'BROKEN',
      locationId: reference.locations[0].id,
      note: 'Rơi khi di chuyển',
    } as never,
    actor,
  )
  await lifecycle.returnAsset(
    created[2].id,
    {
      conditionIn: 'Máy chạy chậm, cần kiểm tra',
      outcome: 'MAINTENANCE',
      warehouseId: reference.warehouses[0].id,
    } as never,
    actor,
  )

  await lifecycle.transfer(
    created[9].id,
    { toLocationId: reference.locations[3].id, condition: 'Tốt', reason: 'Lắp đặt tại phòng máy chủ' } as never,
    actor,
  )
  await lifecycle.transfer(
    created[10].id,
    { toWarehouseId: reference.warehouses[1].id, condition: 'Tốt', reason: 'Điều chuyển vào kho Hồ Chí Minh' } as never,
    actor,
  )
  await lifecycle.transfer(
    created[12].id,
    { toLocationId: reference.locations[2].id, condition: 'Tốt', reason: 'Chuyển sang khu vực Marketing' } as never,
    actor,
  )

  // One maintenance stays open, one is completed back to READY.
  await lifecycle.openMaintenance(
    created[13].id,
    { warehouseId: reference.warehouses[0].id, issue: 'Kẹt giấy liên tục, cần vệ sinh bộ sấy' } as never,
    actor,
  )
  const repaired = await lifecycle.openMaintenance(
    created[18].id,
    { warehouseId: reference.warehouses[0].id, issue: 'Thay ổ cứng số 2 trong RAID' } as never,
    actor,
  )
  // completeMaintenance is keyed by the maintenance record, not by the asset.
  await lifecycle.completeMaintenance(
    repaired.id,
    {
      outcome: 'READY',
      resolution: 'Đã thay ổ cứng và rebuild RAID thành công',
      cost: 4_200_000,
      warehouseId: reference.warehouses[0].id,
    } as never,
    actor,
  )
}

async function seedInventory(actor: Actor, reference: Reference) {
  const closed = await inventory.create(
    { name: 'Kiểm kê kho Hà Nội đợt tháng này', warehouseId: reference.warehouses[0].id } as never,
    actor,
  )
  const items = await db.inventoryItem.findMany({
    where: { sessionId: closed.id },
    include: { asset: { select: { assetTag: true } } },
    orderBy: { id: 'asc' },
    take: 6,
  })
  for (const [index, item] of items.entries())
    await inventory.scan(
      closed.id,
      {
        value: item.asset.assetTag,
        ...(index === items.length - 1
          ? { observedLocationId: reference.locations[3].id, note: 'Phát hiện lệch vị trí' }
          : {}),
      } as never,
      actor,
    )
  // Whatever was not scanned is reported as missing on close.
  await inventory.close(closed.id, actor)

  await inventory.create(
    { name: 'Kiểm kê nhóm Laptop (đang mở)', categoryId: reference.categories[0].id } as never,
    actor,
  )
}

const VENDOR_DEFS = [
  ['Công ty TNHH Dell Việt Nam', 'Máy tính & máy chủ', 'Nguyễn Hoàng Minh', 92],
  ['Công ty CP Công nghệ HP', 'Máy tính & máy in', 'Trần Quốc Bảo', 88],
  ['Lenovo Việt Nam', 'Máy tính xách tay', 'Lê Thị Hồng', 86],
  ['Apple Authorised Reseller', 'Thiết bị Apple', 'Phạm Anh Khoa', 90],
  ['Cisco Systems Vietnam', 'Thiết bị mạng', 'Đỗ Trung Hiếu', 94],
  ['Fortinet Distribution', 'Bảo mật mạng', 'Vũ Minh Châu', 89],
  ['Synology Partner VN', 'Lưu trữ NAS', 'Ngô Thanh Tùng', 78],
  ['Công ty CP Viễn thông FPT', 'Đường truyền & Cloud', 'Bùi Hải Đăng', 83],
  ['Viettel IDC', 'Trung tâm dữ liệu', 'Hoàng Nhật Nam', 87],
  ['CMC Telecom', 'Kết nối & Cloud', 'Đặng Thu Trang', 81],
  ['Công ty TNHH Logitech VN', 'Phụ kiện', 'Mai Quốc Cường', 74],
  ['Samsung Vina', 'Thiết bị di động', 'Trịnh Bảo Ngọc', 85],
  ['Microsoft Vietnam', 'Bản quyền phần mềm', 'Lý Hoàng Long', 93],
  ['VNPT Technology', 'Hạ tầng CNTT', 'Phan Đức Duy', 72],
  ['Công ty CP Misa', 'Phần mềm nghiệp vụ', 'Nguyễn Khánh Chi', 80],
  ['Schneider Electric VN', 'UPS & nguồn điện', 'Tạ Minh Khang', 84],
  ['APC Distribution', 'Thiết bị nguồn', 'Dương Gia Hân', 68],
  ['Công ty TNHH An ninh mạng CyRadar', 'Dịch vụ bảo mật', 'Vương Tuấn Kiệt', 79],
  ['Công ty CP Sao Bắc Đẩu', 'Tích hợp hệ thống', 'Lâm Thùy Dương', 76],
  ['Công ty TNHH Ricoh Việt Nam', 'Thiết bị in ấn', 'Chu Văn Thành', 0],
] as const

// Mirrors the weighting the vendor controller applies when it scores a scorecard.
const VENDOR_WEIGHTS = { quality: 25, delivery: 20, security: 20, compliance: 15, continuity: 10, sustainability: 10 }

async function seedVendors() {
  const vendors = []
  for (const [index, [name, category, contact, target]] of VENDOR_DEFS.entries()) {
    const evaluated = target > 0
    const scores: Record<string, number> = {}
    if (evaluated)
      Object.keys(VENDOR_WEIGHTS).forEach((key, offset) => {
        scores[key] = Math.min(100, Math.max(0, target + ((offset % 3) - 1) * 4))
      })
    const score = evaluated
      ? Math.round(
          Object.entries(VENDOR_WEIGHTS).reduce((total, [key, weight]) => total + (scores[key] * weight) / 100, 0),
        )
      : 0
    vendors.push(
      await db.vendor.upsert({
        where: { code: `NCC-${String(index + 1).padStart(3, '0')}` },
        update: {},
        create: {
          code: `NCC-${String(index + 1).padStart(3, '0')}`,
          name,
          taxCode: `0${103000000 + index * 771}`,
          category,
          contact,
          email: `sales${index + 1}@vendor-demo.vn`,
          phone: `024 7300 ${String(100 + index)}`,
          address: index % 2 ? 'Hà Nội' : 'TP. Hồ Chí Minh',
          certifications: evaluated ? 'ISO 9001, ISO 27001' : null,
          lifecycleStatus: index === 18 ? 'SUSPENDED' : 'ACTIVE',
          status: evaluated
            ? score >= 85
              ? 'Đã phê duyệt'
              : score >= 70
                ? 'Có điều kiện'
                : 'Cần cải thiện'
            : 'Chưa đánh giá',
          lastEvaluation: evaluated ? new Date(isoDate(-30 - index * 5)) : null,
          score,
          scores,
        },
      }),
    )
  }
  return vendors
}

const INCIDENT_DEFS = [
  ['Máy chủ ERP không truy cập được', 'HARDWARE', 'HIGH', 'HIGH'],
  ['Mất kết nối Internet chi nhánh HCM', 'NETWORK', 'HIGH', 'HIGH'],
  ['Laptop kế toán không khởi động', 'HARDWARE', 'MEDIUM', 'HIGH'],
  ['Email cảnh báo đăng nhập bất thường', 'SECURITY', 'HIGH', 'HIGH'],
  ['Máy in tầng 2 kẹt giấy liên tục', 'HARDWARE', 'LOW', 'MEDIUM'],
  ['Phần mềm CRM báo lỗi khi xuất báo cáo', 'SOFTWARE', 'MEDIUM', 'MEDIUM'],
  ['Wi-Fi tầng 3 chập chờn', 'NETWORK', 'MEDIUM', 'MEDIUM'],
  ['Ổ cứng NAS báo lỗi SMART', 'HARDWARE', 'HIGH', 'MEDIUM'],
  ['Không đăng nhập được VPN', 'NETWORK', 'MEDIUM', 'HIGH'],
  ['Nghi ngờ email lừa đảo gửi tới kế toán', 'SECURITY', 'HIGH', 'HIGH'],
  ['Máy trạm nhiễm phần mềm quảng cáo', 'SECURITY', 'MEDIUM', 'MEDIUM'],
  ['Ứng dụng chấm công không đồng bộ', 'SOFTWARE', 'MEDIUM', 'LOW'],
  ['Màn hình phòng họp mất tín hiệu', 'HARDWARE', 'LOW', 'LOW'],
  ['Chậm truy cập file server', 'NETWORK', 'MEDIUM', 'MEDIUM'],
  ['Sao lưu đêm thất bại', 'SOFTWARE', 'HIGH', 'MEDIUM'],
  ['Điện thoại công ty mất tín hiệu', 'HARDWARE', 'LOW', 'LOW'],
  ['Tài khoản nhân viên nghỉ việc chưa khóa', 'SECURITY', 'MEDIUM', 'HIGH'],
  ['Switch tầng 4 khởi động lại bất thường', 'NETWORK', 'HIGH', 'MEDIUM'],
  ['Lỗi cấp phát license Office', 'SOFTWARE', 'LOW', 'MEDIUM'],
  ['UPS phòng server báo lỗi pin', 'HARDWARE', 'HIGH', 'HIGH'],
] as const

async function seedIncidents(actor: Actor, reference: Reference, created: { id: string }[]) {
  const records = []
  for (const [index, [title, category, impact, urgency]] of INCIDENT_DEFS.entries())
    records.push(
      await incidents.create(
        {
          title,
          category,
          impact,
          urgency,
          description: `${title}. Sự cố được người dùng cuối báo lên và cần bộ phận IT xử lý.`,
          reporterName: pick(PEOPLE, index),
          reporterContact: `nhanvien${index + 1}@company.vn`,
          detectedAt: isoTime(-index - 1),
          departmentId: pick(reference.departments, index).id,
          locationId: pick(reference.locations, index).id,
          assetId: created[index % created.length].id,
          serviceName: pick(['ERP', 'Email', 'Mạng nội bộ', 'File server', 'CRM'], index),
          affectedUsers: (index % 5) * 12,
          downtimeMinutes: (index % 4) * 45,
          isSecurityIncident: category === 'SECURITY',
        } as never,
        actor,
      ),
    )

  for (const record of records.slice(0, 5))
    await incidents.addActivity(
      record.id,
      { type: 'NOTE', note: 'Đã tiếp nhận và đang phân tích nguyên nhân ban đầu.' } as never,
      actor,
    )

  return records
}

const ENTITLEMENT_DEFS = [
  ['Microsoft 365 Business Premium', 'LICENSE', 120, 30],
  ['Windows Server 2022 Datacenter', 'LICENSE', 4, 210],
  ['Adobe Creative Cloud', 'LICENSE', 12, 12],
  ['AutoCAD 2026', 'LICENSE', 6, 95],
  ['Zoom Business', 'LICENSE', 50, -5],
  ['Slack Pro', 'LICENSE', 80, 150],
  ['Atlassian Jira Software', 'LICENSE', 40, 60],
  ['GitHub Enterprise', 'LICENSE', 35, 240],
  ['Kaspersky Endpoint Security', 'LICENSE', 200, 20],
  ['VMware vSphere Standard', 'LICENSE', 8, 180],
  ['Chứng chỉ SSL Wildcard *.company.vn', 'SSL_CERTIFICATE', 1, 45],
  ['Chứng chỉ SSL portal.company.vn', 'SSL_CERTIFICATE', 1, 7],
  ['Chứng chỉ SSL api.company.vn', 'SSL_CERTIFICATE', 1, 120],
  ['Chứng chỉ SSL mail.company.vn', 'SSL_CERTIFICATE', 1, -12],
  ['Chứng chỉ ký số doanh nghiệp', 'SSL_CERTIFICATE', 1, 300],
  ['Tên miền company.vn', 'DOMAIN', 1, 90],
  ['Tên miền company.com', 'DOMAIN', 1, 400],
  ['Tên miền company.com.vn', 'DOMAIN', 1, 25],
  ['Tên miền shop-company.vn', 'DOMAIN', 1, -20],
  ['Tên miền company.net', 'DOMAIN', 1, 160],
] as const

async function seedRenewals(actor: Actor, reference: Reference, vendors: { id: string }[], people: Person[]) {
  const entitlements = []
  for (const [index, [name, type, quantity, expiryOffset]] of ENTITLEMENT_DEFS.entries()) {
    const isDomain = type === 'DOMAIN'
    const isCertificate = type === 'SSL_CERTIFICATE'
    entitlements.push(
      await renewals.create(
        {
          code: `DIG-${String(index + 1).padStart(3, '0')}`,
          name,
          type,
          totalQuantity: quantity,
          startDate: isoDate(expiryOffset - 365),
          expiryDate: isoDate(expiryOffset),
          autoRenew: index % 3 === 0,
          currency: 'VND',
          renewalPeriodMonths: 12,
          purchaseCost: 5_000_000 + index * 1_800_000,
          renewalCost: 5_200_000 + index * 1_800_000,
          vendorId: pick(vendors, index).id,
          ownerDepartmentId: reference.departments[0].id,
          businessOwner: pick(PEOPLE, index),
          technicalContact: 'it-support@company.vn',
          ...(isDomain ? { domainName: name.replace('Tên miền ', ''), registrar: 'PA Vietnam' } : {}),
          ...(isCertificate ? { commonName: name.replace('Chứng chỉ SSL ', ''), issuer: 'DigiCert' } : {}),
          ...(!isDomain && !isCertificate ? { productName: name, licenseMetric: 'Người dùng' } : {}),
        } as never,
        actor,
      ),
    )
  }

  // Hand out a few seats so the assignment view is not empty.
  for (let index = 0; index < 4; index++)
    await renewals.assign(
      entitlements[index].id,
      { personId: people[index].id, quantity: 1, note: 'Cấp phát theo yêu cầu' } as never,
      actor,
    )

  await renewals.syncAlerts()
  return entitlements
}

const RISK_DEFS = [
  ['Rò rỉ dữ liệu khách hàng qua email', 'Bảo mật thông tin', 4, 5],
  ['Mất điện kéo dài tại phòng server', 'Vận hành', 3, 4],
  ['Ransomware mã hóa file server', 'Bảo mật thông tin', 3, 5],
  ['Thiết bị mạng hết vòng đời hỗ trợ', 'Hạ tầng', 4, 3],
  ['Nhân sự chủ chốt nghỉ việc đột ngột', 'Nhân sự', 3, 4],
  ['Nhà cung cấp dịch vụ cloud gián đoạn', 'Bên thứ ba', 2, 4],
  ['Sao lưu không khôi phục được', 'Vận hành', 2, 5],
  ['Truy cập trái phép từ tài khoản cũ', 'Bảo mật thông tin', 3, 3],
  ['Vi phạm bản quyền phần mềm', 'Tuân thủ', 2, 3],
  ['Thiết bị BYOD không kiểm soát', 'Bảo mật thông tin', 4, 2],
] as const

async function seedRisks(
  actor: Actor,
  reference: Reference,
  created: { id: string }[],
  incidentRecords: { id: string }[],
) {
  const assessment = await risks.createAssessment(
    {
      title: 'Đánh giá rủi ro CNTT năm 2026',
      description: 'Đánh giá định kỳ theo ISO 27005 cho toàn bộ hạ tầng và dịch vụ CNTT.',
      scope: 'Hạ tầng máy chủ, mạng, thiết bị đầu cuối, dịch vụ đám mây và dữ liệu nghiệp vụ.',
      methodology: 'ISO_27005_NIST_800_30',
      ownerId: actor.id,
      departmentId: reference.departments[0].id,
      startDate: isoDate(-60),
      targetDate: isoDate(30),
      nextReviewAt: isoDate(180),
    } as never,
    actor,
  )

  for (const [index, [title, category, likelihood, impact]] of RISK_DEFS.entries())
    await risks.createRisk(
      assessment.id,
      {
        title,
        category,
        scenario: `${title} dẫn tới gián đoạn dịch vụ và ảnh hưởng hoạt động kinh doanh.`,
        threat: pick(['Tấn công có chủ đích', 'Lỗi con người', 'Hỏng hóc thiết bị', 'Thiên tai', 'Bên thứ ba'], index),
        vulnerability: pick(
          ['Thiếu kiểm soát truy cập', 'Chưa vá lỗ hổng', 'Không có phương án dự phòng', 'Thiếu giám sát'],
          index,
        ),
        existingControls: 'Tường lửa, phân quyền theo vai trò, sao lưu hằng ngày.',
        source: 'MANUAL',
        treatmentStrategy: index % 4 === 3 ? 'ACCEPT' : 'MITIGATE',
        ...(index % 4 === 3 ? { acceptanceRationale: 'Rủi ro nằm trong ngưỡng chấp nhận của ban lãnh đạo.' } : {}),
        likelihood,
        impact,
        residualLikelihood: Math.max(1, likelihood - 1),
        residualImpact: Math.max(1, impact - 1),
        ownerId: actor.id,
        departmentId: reference.departments[0].id,
        dueDate: isoDate(45 + index * 7),
        nextReviewAt: isoDate(120),
        assetIds: [created[index % created.length].id],
        incidentIds: [incidentRecords[index % incidentRecords.length].id],
      } as never,
      actor,
    )

  return assessment
}

async function seedDisposals(requester: Actor, approver: Actor) {
  const eligible = await disposals.eligibleAssets(requester)
  const list = (Array.isArray(eligible) ? eligible : ((eligible as { data?: unknown[] }).data ?? [])) as {
    id: string
  }[]
  if (list.length < 4) {
    console.warn(`Bỏ qua hồ sơ thanh lý: chỉ có ${list.length} tài sản đủ điều kiện.`)
    return
  }

  const makeCase = (title: string, type: string, assetId: string, reason: string) =>
    disposals.create(
      {
        title,
        type,
        reason,
        policyReference: 'QĐ-2026/TS-01 về thanh lý tài sản CNTT',
        recipient: 'Công ty CP Môi trường Xanh',
        estimatedProceeds: 1_500_000,
        currency: 'VND',
        items: [
          {
            assetId,
            conditionAssessment: 'Đã hết khấu hao, không còn đáp ứng nhu cầu sử dụng',
            requiresDataSanitization: true,
          },
        ],
      } as never,
      requester,
    )

  // One draft, one submitted, and two that have been approved and started.
  await makeCase('Thanh lý thiết bị hỏng đợt 1', 'SALE', list[0].id, 'Thiết bị hết khấu hao và hư hỏng')

  const submitted = await makeCase(
    'Thanh lý thiết bị hỏng đợt 2',
    'RECYCLE',
    list[1].id,
    'Không còn linh kiện thay thế',
  )
  await disposals.submit(submitted.id, requester)

  const executing = await makeCase(
    'Tiêu hủy ổ cứng chứa dữ liệu',
    'DESTRUCTION',
    list[2].id,
    'Ổ cứng lỗi, chứa dữ liệu nhạy cảm',
  )
  await disposals.submit(executing.id, requester)
  await disposals.approve(executing.id, { note: 'Đã duyệt theo đề xuất của bộ phận IT' } as never, approver)
  await disposals.start(executing.id, { note: 'Bắt đầu quy trình xóa dữ liệu an toàn' } as never, requester)
  await disposals.addEvidence(
    executing.id,
    {
      type: 'DATA_ERASURE_CERTIFICATE',
      title: 'Chứng nhận xóa dữ liệu theo NIST 800-88',
      documentNo: 'CN-XD-2026-004',
      documentDate: isoDate(-2),
      storagePath: 'documents/disposals/CN-XD-2026-004.pdf',
      note: 'Xóa dữ liệu bằng phần mềm được phê duyệt, có nhân sự IT giám sát.',
    } as never,
    requester,
  )

  const donated = await makeCase(
    'Tặng thiết bị cho trường học',
    'DONATION',
    list[3].id,
    'Thiết bị còn dùng được cho mục đích giáo dục',
  )
  await disposals.submit(donated.id, requester)
  await disposals.approve(donated.id, { note: 'Ban giám đốc đồng ý' } as never, approver)
  await disposals.start(donated.id, { note: 'Chuẩn bị bàn giao' } as never, requester)
}

async function seedDiscovery(actor: Actor, created: { id: string }[]) {
  const stamp = Date.now()
  const token = await db.agentEnrollmentToken.create({
    data: {
      name: 'Token triển khai demo',
      tokenHash: `demo-token-hash-${stamp}`,
      expiresAt: new Date(Date.now() + 30 * DAY),
      siteCode: 'HN',
      createdBy: actor.id,
    },
  })

  const hosts = [
    ['DESKTOP-KT01', 'WINDOWS', 'PENDING', 0],
    ['DESKTOP-MKT02', 'WINDOWS', 'PENDING', 0],
    ['LAPTOP-SALES03', 'WINDOWS', 'PENDING', 82],
    ['SRV-UBUNTU-01', 'LINUX', 'CONFLICT', 64],
    ['LAPTOP-IT05', 'WINDOWS', 'LINKED', 96],
  ] as const

  for (const [index, [hostname, osFamily, status, confidence]] of hosts.entries()) {
    const agent = await db.endpointAgent.create({
      data: {
        agentKey: `demo-agent-key-${index + 1}-${stamp}`,
        credentialHash: `demo-credential-hash-${index + 1}-${stamp}`,
        enrollmentTokenId: token.id,
        fingerprint: `demo-fingerprint-${index + 1}-${stamp}`,
        hostname,
        siteCode: index % 2 ? 'HCM' : 'HN',
        agentVersion: '1.4.0',
        osFamily,
        lastSeenAt: new Date(Date.now() - index * 3_600_000),
      },
    })
    await db.agentInventorySnapshot.create({
      data: {
        agentId: agent.id,
        schemaVersion: '1',
        collectedAt: new Date(Date.now() - index * 3_600_000),
        hostname,
        serialNumber: `AGT-SN-${String(index + 1).padStart(4, '0')}`,
        systemUuid: `00000000-0000-4000-8000-00000000000${index + 1}`,
        primaryMac: `AA:BB:CC:00:00:0${index + 1}`,
        payload: { hostname, osFamily, cpu: 'Intel Core i5', ramGb: 16, disks: [{ model: 'SSD 512GB', sizeGb: 512 }] },
      },
    })
    await db.discoveryInboxItem.create({
      data: {
        agentId: agent.id,
        status,
        matchConfidence: confidence,
        suggestedAssetId: confidence ? created[index].id : null,
        resolvedAssetId: status === 'LINKED' ? created[index].id : null,
        conflictReason: status === 'CONFLICT' ? 'Serial trùng với tài sản đã liên kết agent khác' : null,
        lastObservedAt: new Date(Date.now() - index * 3_600_000),
      },
    })
  }
}

async function seedImportBatches(actor: Actor, reference: Reference) {
  const rows = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({
      rowNumber: index + 1,
      payload: {
        assetTag: `${prefix}-${String(index + 1).padStart(3, '0')}`,
        name: `Màn hình Dell P2422H ${index + 1}`,
        barcode: `${prefix}-${String(index + 1).padStart(3, '0')}`,
        serialNumber: `${prefix}-SN-${String(index + 1).padStart(4, '0')}`,
        categoryId: reference.categories[3].id,
        warehouseId: reference.warehouses[0].id,
        purchaseCost: 4_500_000,
      },
    }))

  const committed = await imports.stage(
    { sourceFileName: 'nhap-kho-man-hinh-2026-06.xlsx', rows: rows('IMP-A', 5) } as never,
    actor,
  )
  await imports.commit(committed.id, actor)

  // A batch left in staging with one invalid row, so the review screen has something to show.
  const staging = rows('IMP-B', 3)
  staging.push({ rowNumber: 4, payload: { ...staging[0].payload, assetTag: '', barcode: '' } })
  await imports.stage({ sourceFileName: 'nhap-kho-loi-2026-07.xlsx', rows: staging } as never, actor)
}

async function report() {
  const counts: Record<string, number> = {
    'Phòng ban': await db.department.count(),
    'Vị trí': await db.location.count(),
    Kho: await db.warehouse.count(),
    'Nhóm tài sản': await db.assetCategory.count(),
    'Người nhận tài sản': await db.person.count(),
    'Tài sản': await db.asset.count({ where: { deletedAt: null } }),
    'Phiếu cấp phát/mượn': await db.assetAssignment.count(),
    'Phiếu thu hồi': await db.assetReturn.count(),
    'Phiếu điều chuyển': await db.assetTransfer.count(),
    'Phiếu bảo trì': await db.maintenanceRecord.count(),
    'Đợt kiểm kê': await db.inventorySession.count(),
    'Nhà cung cấp': await db.vendor.count(),
    'Sự cố': await db.incident.count(),
    'License/SSL/Domain': await db.digitalEntitlement.count(),
    'Cảnh báo gia hạn': await db.renewalAlert.count(),
    'Đánh giá rủi ro': await db.riskAssessment.count(),
    'Rủi ro': await db.riskItem.count(),
    'Hồ sơ thanh lý': await db.disposalCase.count(),
    'Agent phát hiện': await db.discoveryInboxItem.count(),
    'Lô nhập Excel': await db.assetImportBatch.count(),
    'Lịch sử tài sản': await db.assetHistory.count(),
    'Audit log': await db.auditLog.count(),
  }
  console.log('Tài khoản thêm (mật khẩu ' + DEMO_PASSWORD + '): it.manager [IT], hcns.admin [HCNS]')
  console.log('\nDữ liệu demo đã tạo:')
  for (const [label, value] of Object.entries(counts)) console.log(`  ${label.padEnd(24)}${value}`)
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
