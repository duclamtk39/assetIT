type IntakeCatalogEntry = {
  name: string
  code: string
}

export const intakeTemplateFileName = 'mau-nhap-kho-tai-san.xlsx'

export const intakeTemplateHeaders = [
  'Mã tài sản',
  'Tên tài sản',
  'Nhóm tài sản',
  'Serial / IMEI',
  'Phòng ban',
  'Kho / Vị trí',
  'Người sử dụng (bỏ qua khi nhập kho)',
  'Trạng thái (bỏ qua khi nhập kho)',
  'Ngày mua (YYYY-MM-DD)',
  'Nguyên giá (VNĐ)',
  'Hãng sản xuất',
  'Model',
  'CPU',
  'RAM',
  'Ổ đĩa',
  'Hệ điều hành',
  'Địa chỉ IP',
  'Địa chỉ MAC',
  'Ảnh tài sản (URL)',
]

export function createIntakeTemplateSheets(categories: IntakeCatalogEntry[], warehouses: IntakeCatalogEntry[]) {
  const header = intakeTemplateHeaders.map(value => ({
    value,
    type: String,
    fontWeight: 'bold' as const,
    backgroundColor: '#DCE6F1',
  }))
  const blank = intakeTemplateHeaders.map(() => ({ value: '', type: String }))
  const catalogRows = [
    [
      { value: 'NHÓM TÀI SẢN HỢP LỆ', type: String, fontWeight: 'bold' as const },
      { value: 'MÃ NHÓM', type: String, fontWeight: 'bold' as const },
      { value: 'KHO NHẬP HỢP LỆ', type: String, fontWeight: 'bold' as const },
      { value: 'MÃ KHO', type: String, fontWeight: 'bold' as const },
    ],
    ...Array.from({ length: Math.max(categories.length, warehouses.length) }, (_, index) => [
      { value: categories[index]?.name || '', type: String },
      { value: categories[index]?.code || '', type: String },
      { value: warehouses[index]?.name || '', type: String },
      { value: warehouses[index]?.code || '', type: String },
    ]),
  ]

  return [
    {
      sheet: 'Nhập kho',
      data: [header, blank],
      columns: intakeTemplateHeaders.map((_, index) => ({
        width: index === 1 ? 28 : index === 18 ? 32 : 20,
      })),
    },
    {
      sheet: 'Danh mục hợp lệ',
      data: catalogRows,
      columns: [{ width: 30 }, { width: 18 }, { width: 30 }, { width: 18 }],
    },
  ]
}
