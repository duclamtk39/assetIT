export const pageRoutes: Record<string,string> = {
  'Tổng quan':'/',
  'Sổ tài sản':'/assets',
  'Cấp phát & Thu hồi':'/assignments',
  'Kiểm kê':'/inventory',
  'Lịch sử / Audit':'/audit',
  'Barcode / QR':'/barcode',
  'Khám phá & Agent':'/discovery',
  'Nhập kho':'/warehouse/receipts',
  'Thanh lý & Hủy bỏ':'/disposals',
  'Kho & Vị trí':'/warehouses',
  'Mua sắm & PO':'/procurement',
  'Nhà cung cấp':'/vendors',
  'License & Gia hạn':'/renewals',
  'Bảo trì & Sự cố':'/maintenance',
  'Đánh giá rủi ro CNTT':'/it-risk-assessment',
  'Báo cáo':'/reports',
  'Cấu hình hệ thống':'/settings',
  'Tùy chỉnh thương hiệu':'/settings/branding',
  'Cấu hình email':'/settings/email',
}

const normalizedEntries=Object.entries(pageRoutes).sort((a,b)=>b[1].length-a[1].length)

export const pathForPage=(page:string)=>pageRoutes[page]||`/${encodeURIComponent(page.toLowerCase())}`

export const pageForPath=(path:string)=>{
  if(path.startsWith('/assets/'))return 'Sổ tài sản'
  if(path==='/transfers')return 'Cấp phát & Thu hồi'
  if(path==='/warehouse/issues')return 'Thanh lý & Hủy bỏ'
  const decoded=decodeURIComponent(path).toLocaleLowerCase('vi-VN')
  if(decoded==='/license & gia hạn'||decoded==='/license và gia hạn')return 'License & Gia hạn'
  return normalizedEntries.find(([,route])=>route===path)?.[0]||'Tổng quan'
}
