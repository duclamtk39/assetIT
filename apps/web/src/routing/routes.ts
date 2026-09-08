/**
 * Every page reachable from the sidebar needs an entry here. `page` is derived from the URL rather
 * than held in state, so a label with no route navigates to an encoded fallback path that
 * pageForPath cannot match, and the app lands back on Tổng quan - the click looks like it did
 * nothing. routes.test.ts asserts the sidebar and this table stay in step.
 */
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
  'Sơ đồ mạng': '/network',
  'Thiết bị mạng': '/network/devices',
  'Cảnh báo mạng': '/network/alerts',
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
