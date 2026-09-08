import {
  ArchiveX,
  ArrowDownRight,
  BarChart3,
  BellRing,
  Box,
  Building2,
  ClipboardCheck,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  Network,
  Router,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Wrench,
} from 'lucide-react'

/**
 * The sidebar, kept out of App.tsx so it can be checked without rendering the application. Every
 * label here is a page name: clicking one navigates to pathForPage(label), and `page` is then read
 * back out of the URL. A label missing from pageRoutes therefore does not fail loudly - it navigates
 * to an encoded fallback path that pageForPath cannot match, and the app quietly lands on Tổng quan.
 * routes.test.ts walks this list against the route table so the two cannot drift apart again.
 */
export const navSections: Array<{ title: string; items: Array<{ label: string; icon: typeof Box; count?: string }> }> =
  [
    { title: '', items: [{ label: 'Tổng quan', icon: LayoutDashboard }] },
    {
      title: 'TÀI SẢN',
      items: [
        { label: 'Sổ tài sản', icon: Box },
        { label: 'Cấp phát & Thu hồi', icon: UserPlus },
        { label: 'Nhập kho', icon: ArrowDownRight },
        { label: 'Kiểm kê', icon: ClipboardCheck },
      ],
    },
    {
      title: 'NGHIỆP VỤ',
      items: [
        { label: 'Nhà cung cấp', icon: Building2 },
        { label: 'License & Gia hạn', icon: KeyRound },
        { label: 'Bảo trì & Sự cố', icon: Wrench },
        { label: 'Thanh lý & Hủy bỏ', icon: ArchiveX },
      ],
    },
    {
      title: 'GIÁM SÁT MẠNG',
      items: [
        { label: 'Sơ đồ mạng', icon: Network },
        { label: 'Thiết bị mạng', icon: Router },
        { label: 'Cảnh báo mạng', icon: BellRing },
      ],
    },
    {
      title: 'TUÂN THỦ ISO',
      items: [
        { label: 'Khung tiêu chuẩn & SoA', icon: ShieldCheck },
        { label: 'Hệ thống tài liệu', icon: FileText },
        { label: 'Đánh giá rủi ro CNTT', icon: ShieldAlert },
      ],
    },
    {
      title: 'BÁO CÁO',
      items: [
        { label: 'Báo cáo', icon: BarChart3 },
        { label: 'Lịch sử / Audit', icon: History },
      ],
    },
  ]
