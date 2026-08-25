export interface IntakeLookup {
  id: string
  code: string
  name: string
  location?: { id?: string; code?: string; name?: string }
}

export interface ParsedIntakeRow {
  rowNumber: number
  assetTag: string
  name: string
  category: IntakeLookup
  warehouse: IntakeLookup
  serialNumber: string
  department: string
  purchaseDate: string
  purchaseCost: number
  manufacturer: string
  model: string
  cpu: string
  ram: string
  storage: string
  operatingSystem: string
  ipAddress: string
  macAddress: string
  imageUrl: string
}

export class IntakeExcelValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.slice(0, 8).join('\n'))
    this.name = 'IntakeExcelValidationError'
  }
}

export const normalizeIntakeLookup = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('vi')

export function resolveIntakeLookup(value: unknown, options: IntakeLookup[]) {
  const needle = normalizeIntakeLookup(value)
  if (!needle) return options[0]
  return options.find(option => [option.name, option.code, option.location?.name, option.location?.code]
    .some(candidate => normalizeIntakeLookup(candidate) === needle))
}

const cellText = (value: unknown) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : String(value ?? '').trim()

const excelDate = (value: unknown) => {
  if (!value) return new Date().toISOString().slice(0, 10)
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000)
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  const raw = cellText(value)
  const vietnamese = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  const normalized = vietnamese
    ? `${vietnamese[3]}-${vietnamese[2].padStart(2, '0')}-${vietnamese[1].padStart(2, '0')}`
    : raw
  const timestamp = Date.parse(normalized)
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString().slice(0, 10)
}

const purchaseCost = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 0
  if (typeof value === 'number') return value
  const normalized = String(value).trim().replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  const decimal = normalized.includes(',') && !normalized.includes('.')
    ? normalized.replace(',', '.')
    : normalized.replace(/,/g, '')
  return Number(decimal)
}

export function parseIntakeExcelRows(
  rows: unknown[][],
  categories: IntakeLookup[],
  warehouses: IntakeLookup[],
  defaultDepartment = '',
) {
  const issues: string[] = []
  if (!categories.length) issues.push('Chưa có Nhóm tài sản hoạt động. Hãy tạo danh mục trước khi import.')
  if (!warehouses.length) issues.push('Chưa có Kho nhập hoạt động. Hãy tạo Site/Kho trước khi import.')
  if (!rows.length) issues.push('File Excel không có dữ liệu.')
  if (issues.length) throw new IntakeExcelValidationError(issues)

  const parsed: ParsedIntakeRow[] = []
  const seenTags = new Map<string, number>()
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2
    if (row.every(value => !cellText(value))) return
    const text = (column: number) => cellText(row[column - 1])
    const assetTag = text(1)
    const name = text(2)
    if (!assetTag) issues.push(`Dòng ${rowNumber}: thiếu Mã tài sản.`)
    if (!name) issues.push(`Dòng ${rowNumber}: thiếu Tên tài sản.`)

    const identity = normalizeIntakeLookup(assetTag)
    const priorRow = identity ? seenTags.get(identity) : undefined
    if (priorRow) issues.push(`Dòng ${rowNumber}: Mã tài sản trùng với dòng ${priorRow}.`)
    else if (identity) seenTags.set(identity, rowNumber)

    const category = resolveIntakeLookup(row[2], categories)
    const warehouse = resolveIntakeLookup(row[5], warehouses)
    if (!category) issues.push(`Dòng ${rowNumber}: Nhóm tài sản “${text(3)}” không tồn tại hoặc đã ngừng hoạt động.`)
    if (!warehouse) issues.push(`Dòng ${rowNumber}: Kho nhập “${text(6)}” không tồn tại hoặc đã ngừng hoạt động.`)

    const cost = purchaseCost(row[9])
    if (!Number.isFinite(cost) || cost < 0) issues.push(`Dòng ${rowNumber}: Nguyên giá phải là số không âm.`)
    const date = excelDate(row[8])
    if (!date) issues.push(`Dòng ${rowNumber}: Ngày mua không hợp lệ; dùng YYYY-MM-DD hoặc DD/MM/YYYY.`)

    if (assetTag && name && category && warehouse && Number.isFinite(cost) && cost >= 0 && date) {
      parsed.push({
        rowNumber,
        assetTag,
        name,
        category,
        warehouse,
        serialNumber: text(4),
        department: text(5) || defaultDepartment,
        purchaseDate: date,
        purchaseCost: cost,
        manufacturer: text(11),
        model: text(12),
        cpu: text(13),
        ram: text(14),
        storage: text(15),
        operatingSystem: text(16),
        ipAddress: text(17),
        macAddress: text(18),
        imageUrl: text(19),
      })
    }
  })
  if (!parsed.length && !issues.length) issues.push('File không có dòng tài sản nào để import.')
  if (issues.length) throw new IntakeExcelValidationError(issues)
  return parsed
}
