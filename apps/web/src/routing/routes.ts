export const pageRoutes: Record<string, string> = {
  'Tổng quan': '/',
  'Sổ tài sản': '/assets',
  'Cấp phát & Thu hồi': '/assignments',
  'Kiểm kê': '/inventory',
  'Lịch sử / Audit': '/audit',
  'Khám phá & Agent': '/discovery',
  'Nhập kho': '/warehouse/receipts',
  'Thanh lý & Hủy bỏ': '/disposals',
  'Nhà cung cấp': '/vendors',
  'License & Gia hạn': '/renewals',
  'Bảo trì & Sự cố': '/maintenance',
  'Đánh giá rủi ro CNTT': '/it-risk-assessment',
  'Khung tiêu chuẩn & SoA': '/compliance/controls',
  'Hệ thống tài liệu': '/compliance/documents',
  'Báo cáo': '/reports',
  'Cấu hình hệ thống': '/settings',
  'Tùy chỉnh thương hiệu': '/settings/branding',
  'Cấu hình email': '/settings/email',
}

const normalizedEntries = Object.entries(pageRoutes).sort((a, b) => b[1].length - a[1].length)

export const pathForPage = (page: string) => pageRoutes[page] || `/${encodeURIComponent(page.toLowerCase())}`

export const pageForPath = (path: string) => {
  if (path.startsWith('/assets/')) return 'Sổ tài sản'
  if (path === '/transfers') return 'Cấp phát & Thu hồi'
  if (path === '/warehouse/issues') return 'Thanh lý & Hủy bỏ'
  // The standalone scanner page folded into intake; keep older links working.
  if (path === '/barcode') return 'Nhập kho'
  const decoded = decodeURIComponent(path).toLocaleLowerCase('vi-VN')
  if (decoded === '/license & gia hạn' || decoded === '/license và gia hạn') return 'License & Gia hạn'
  return normalizedEntries.find(([, route]) => route === path)?.[0] || 'Tổng quan'
}
