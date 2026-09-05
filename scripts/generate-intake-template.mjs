import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import writeXlsxFile from 'write-excel-file/node'

const columns = [
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

const targetDirectory = resolve('apps/web/public/templates')
const targetFile = resolve(targetDirectory, 'mau-nhap-kho-tai-san.xlsx')
await mkdir(targetDirectory, { recursive: true })

const header = columns.map(value => ({
  value,
  type: String,
  fontWeight: 'bold',
  backgroundColor: '#DCE6F1',
  align: 'center',
}))
const blankRow = columns.map(() => ({ value: '', type: String }))

await writeXlsxFile([header, blankRow], {
  columns: columns.map((_, index) => ({ width: index === 1 ? 28 : index === 18 ? 32 : 20 })),
  stickyRowsCount: 1,
}).toFile(targetFile)

console.log(`Generated ${targetFile}`)
