/**
 * The ISO/IEC 27001:2022 Annex A control set: 93 controls in four themes.
 *
 * This is reference data from the standard itself, identical for every organization, so it lives in
 * code and is served read-only, the same way the risk criteria are. What differs per organization is
 * the Statement of Applicability — which controls apply, why, and how far they are implemented — and
 * that is stored per entry in the database against `code`.
 *
 * English titles are the ones the standard uses, so they match what an auditor reads from their own
 * checklist; the Vietnamese titles are for the people preparing the evidence.
 */

export type AnnexTheme = 'ORGANIZATIONAL' | 'PEOPLE' | 'PHYSICAL' | 'TECHNOLOGICAL'

export interface AnnexControl {
  code: string
  theme: AnnexTheme
  title: string
  titleVi: string
}

export const annexThemes: Array<{ key: AnnexTheme; clause: string; name: string; nameVi: string }> = [
  { key: 'ORGANIZATIONAL', clause: 'A.5', name: 'Organizational controls', nameVi: 'Kiểm soát về tổ chức' },
  { key: 'PEOPLE', clause: 'A.6', name: 'People controls', nameVi: 'Kiểm soát về con người' },
  { key: 'PHYSICAL', clause: 'A.7', name: 'Physical controls', nameVi: 'Kiểm soát về vật lý' },
  { key: 'TECHNOLOGICAL', clause: 'A.8', name: 'Technological controls', nameVi: 'Kiểm soát về công nghệ' },
]

const organizational: Array<[string, string, string]> = [
  ['A.5.1', 'Policies for information security', 'Chính sách an toàn thông tin'],
  ['A.5.2', 'Information security roles and responsibilities', 'Vai trò và trách nhiệm an toàn thông tin'],
  ['A.5.3', 'Segregation of duties', 'Phân tách trách nhiệm'],
  ['A.5.4', 'Management responsibilities', 'Trách nhiệm của lãnh đạo'],
  ['A.5.5', 'Contact with authorities', 'Liên hệ với cơ quan chức năng'],
  ['A.5.6', 'Contact with special interest groups', 'Liên hệ với các nhóm chuyên môn'],
  ['A.5.7', 'Threat intelligence', 'Thông tin tình báo về mối đe dọa'],
  ['A.5.8', 'Information security in project management', 'An toàn thông tin trong quản lý dự án'],
  ['A.5.9', 'Inventory of information and other associated assets', 'Kiểm kê thông tin và các tài sản liên quan'],
  [
    'A.5.10',
    'Acceptable use of information and other associated assets',
    'Sử dụng hợp lệ thông tin và các tài sản liên quan',
  ],
  ['A.5.11', 'Return of assets', 'Thu hồi tài sản'],
  ['A.5.12', 'Classification of information', 'Phân loại thông tin'],
  ['A.5.13', 'Labelling of information', 'Gán nhãn thông tin'],
  ['A.5.14', 'Information transfer', 'Truyền đưa thông tin'],
  ['A.5.15', 'Access control', 'Kiểm soát truy cập'],
  ['A.5.16', 'Identity management', 'Quản lý định danh'],
  ['A.5.17', 'Authentication information', 'Thông tin xác thực'],
  ['A.5.18', 'Access rights', 'Quyền truy cập'],
  ['A.5.19', 'Information security in supplier relationships', 'An toàn thông tin trong quan hệ nhà cung cấp'],
  [
    'A.5.20',
    'Addressing information security within supplier agreements',
    'Quy định an toàn thông tin trong thỏa thuận với nhà cung cấp',
  ],
  [
    'A.5.21',
    'Managing information security in the ICT supply chain',
    'Quản lý an toàn thông tin trong chuỗi cung ứng CNTT',
  ],
  [
    'A.5.22',
    'Monitoring, review and change management of supplier services',
    'Giám sát, soát xét và quản lý thay đổi dịch vụ nhà cung cấp',
  ],
  ['A.5.23', 'Information security for use of cloud services', 'An toàn thông tin khi sử dụng dịch vụ đám mây'],
  [
    'A.5.24',
    'Information security incident management planning and preparation',
    'Hoạch định và chuẩn bị quản lý sự cố an toàn thông tin',
  ],
  [
    'A.5.25',
    'Assessment and decision on information security events',
    'Đánh giá và quyết định về sự kiện an toàn thông tin',
  ],
  ['A.5.26', 'Response to information security incidents', 'Ứng phó sự cố an toàn thông tin'],
  ['A.5.27', 'Learning from information security incidents', 'Rút kinh nghiệm từ sự cố an toàn thông tin'],
  ['A.5.28', 'Collection of evidence', 'Thu thập bằng chứng'],
  ['A.5.29', 'Information security during disruption', 'An toàn thông tin trong thời gian gián đoạn'],
  ['A.5.30', 'ICT readiness for business continuity', 'Mức sẵn sàng CNTT cho liên tục kinh doanh'],
  [
    'A.5.31',
    'Legal, statutory, regulatory and contractual requirements',
    'Yêu cầu pháp lý, luật định, chế định và hợp đồng',
  ],
  ['A.5.32', 'Intellectual property rights', 'Quyền sở hữu trí tuệ'],
  ['A.5.33', 'Protection of records', 'Bảo vệ hồ sơ'],
  [
    'A.5.34',
    'Privacy and protection of personal identifiable information (PII)',
    'Quyền riêng tư và bảo vệ dữ liệu cá nhân',
  ],
  ['A.5.35', 'Independent review of information security', 'Soát xét độc lập về an toàn thông tin'],
  [
    'A.5.36',
    'Compliance with policies, rules and standards for information security',
    'Tuân thủ chính sách, quy tắc và tiêu chuẩn an toàn thông tin',
  ],
  ['A.5.37', 'Documented operating procedures', 'Quy trình vận hành dạng văn bản'],
]

const people: Array<[string, string, string]> = [
  ['A.6.1', 'Screening', 'Thẩm tra nhân sự'],
  ['A.6.2', 'Terms and conditions of employment', 'Điều khoản và điều kiện lao động'],
  [
    'A.6.3',
    'Information security awareness, education and training',
    'Nhận thức, giáo dục và đào tạo về an toàn thông tin',
  ],
  ['A.6.4', 'Disciplinary process', 'Quy trình kỷ luật'],
  [
    'A.6.5',
    'Responsibilities after termination or change of employment',
    'Trách nhiệm sau khi chấm dứt hoặc thay đổi công việc',
  ],
  ['A.6.6', 'Confidentiality or non-disclosure agreements', 'Thỏa thuận bảo mật thông tin'],
  ['A.6.7', 'Remote working', 'Làm việc từ xa'],
  ['A.6.8', 'Information security event reporting', 'Báo cáo sự kiện an toàn thông tin'],
]

const physical: Array<[string, string, string]> = [
  ['A.7.1', 'Physical security perimeters', 'Vành đai an ninh vật lý'],
  ['A.7.2', 'Physical entry', 'Kiểm soát ra vào'],
  ['A.7.3', 'Securing offices, rooms and facilities', 'Bảo vệ văn phòng, phòng làm việc và cơ sở vật chất'],
  ['A.7.4', 'Physical security monitoring', 'Giám sát an ninh vật lý'],
  ['A.7.5', 'Protecting against physical and environmental threats', 'Bảo vệ trước mối đe dọa vật lý và môi trường'],
  ['A.7.6', 'Working in secure areas', 'Làm việc trong khu vực an toàn'],
  ['A.7.7', 'Clear desk and clear screen', 'Bàn làm việc sạch và màn hình sạch'],
  ['A.7.8', 'Equipment siting and protection', 'Bố trí và bảo vệ thiết bị'],
  ['A.7.9', 'Security of assets off-premises', 'An toàn tài sản mang ra ngoài trụ sở'],
  ['A.7.10', 'Storage media', 'Phương tiện lưu trữ'],
  ['A.7.11', 'Supporting utilities', 'Hạ tầng phụ trợ'],
  ['A.7.12', 'Cabling security', 'An toàn hệ thống cáp'],
  ['A.7.13', 'Equipment maintenance', 'Bảo trì thiết bị'],
  ['A.7.14', 'Secure disposal or re-use of equipment', 'Thanh lý hoặc tái sử dụng thiết bị an toàn'],
]

const technological: Array<[string, string, string]> = [
  ['A.8.1', 'User endpoint devices', 'Thiết bị đầu cuối người dùng'],
  ['A.8.2', 'Privileged access rights', 'Quyền truy cập đặc quyền'],
  ['A.8.3', 'Information access restriction', 'Hạn chế truy cập thông tin'],
  ['A.8.4', 'Access to source code', 'Truy cập mã nguồn'],
  ['A.8.5', 'Secure authentication', 'Xác thực an toàn'],
  ['A.8.6', 'Capacity management', 'Quản lý năng lực'],
  ['A.8.7', 'Protection against malware', 'Phòng chống mã độc'],
  ['A.8.8', 'Management of technical vulnerabilities', 'Quản lý lỗ hổng kỹ thuật'],
  ['A.8.9', 'Configuration management', 'Quản lý cấu hình'],
  ['A.8.10', 'Information deletion', 'Xóa thông tin'],
  ['A.8.11', 'Data masking', 'Che giấu dữ liệu'],
  ['A.8.12', 'Data leakage prevention', 'Ngăn ngừa rò rỉ dữ liệu'],
  ['A.8.13', 'Information backup', 'Sao lưu thông tin'],
  ['A.8.14', 'Redundancy of information processing facilities', 'Dự phòng cơ sở xử lý thông tin'],
  ['A.8.15', 'Logging', 'Ghi nhật ký'],
  ['A.8.16', 'Monitoring activities', 'Hoạt động giám sát'],
  ['A.8.17', 'Clock synchronization', 'Đồng bộ thời gian'],
  ['A.8.18', 'Use of privileged utility programs', 'Sử dụng tiện ích đặc quyền'],
  ['A.8.19', 'Installation of software on operational systems', 'Cài đặt phần mềm trên hệ thống vận hành'],
  ['A.8.20', 'Networks security', 'An toàn mạng'],
  ['A.8.21', 'Security of network services', 'An toàn dịch vụ mạng'],
  ['A.8.22', 'Segregation of networks', 'Phân tách mạng'],
  ['A.8.23', 'Web filtering', 'Lọc truy cập web'],
  ['A.8.24', 'Use of cryptography', 'Sử dụng mật mã'],
  ['A.8.25', 'Secure development life cycle', 'Vòng đời phát triển an toàn'],
  ['A.8.26', 'Application security requirements', 'Yêu cầu an toàn cho ứng dụng'],
  [
    'A.8.27',
    'Secure system architecture and engineering principles',
    'Nguyên tắc kiến trúc và kỹ thuật hệ thống an toàn',
  ],
  ['A.8.28', 'Secure coding', 'Lập trình an toàn'],
  ['A.8.29', 'Security testing in development and acceptance', 'Kiểm thử an toàn trong phát triển và nghiệm thu'],
  ['A.8.30', 'Outsourced development', 'Phát triển thuê ngoài'],
  [
    'A.8.31',
    'Separation of development, test and production environments',
    'Tách biệt môi trường phát triển, kiểm thử và vận hành',
  ],
  ['A.8.32', 'Change management', 'Quản lý thay đổi'],
  ['A.8.33', 'Test information', 'Thông tin dùng để kiểm thử'],
  [
    'A.8.34',
    'Protection of information systems during audit testing',
    'Bảo vệ hệ thống thông tin khi kiểm thử đánh giá',
  ],
]

const build = (theme: AnnexTheme, rows: Array<[string, string, string]>): AnnexControl[] =>
  rows.map(([code, title, titleVi]) => ({ code, theme, title, titleVi }))

export const annexControls: AnnexControl[] = [
  ...build('ORGANIZATIONAL', organizational),
  ...build('PEOPLE', people),
  ...build('PHYSICAL', physical),
  ...build('TECHNOLOGICAL', technological),
]

const byCode = new Map(annexControls.map(control => [control.code, control]))

export const findAnnexControl = (code: string) => byCode.get(code)

export const isAnnexControlCode = (code: string) => byCode.has(code)

/**
 * Controls whose evidence AssetFlow already produces as a by-product of normal operation. The
 * compliance screen links straight to those records so an auditor is shown live data rather than a
 * document describing what the data would look like. Everything not listed here is evidenced by an
 * uploaded document.
 */
export const evidenceSources: Record<string, { module: string; route: string; description: string }> = {
  'A.5.9': { module: 'Sổ tài sản', route: '/assets', description: 'Danh mục tài sản đang quản lý.' },
  'A.5.10': {
    module: 'Cấp phát & Thu hồi',
    route: '/assignments',
    description: 'Biên bản bàn giao có cam kết sử dụng của người nhận.',
  },
  'A.5.11': {
    module: 'Cấp phát & Thu hồi',
    route: '/assignments',
    description: 'Phiếu thu hồi tài sản khi nhân sự nghỉ hoặc đổi vị trí.',
  },
  'A.5.12': { module: 'Sổ tài sản', route: '/assets', description: 'Nhóm và phân loại tài sản.' },
  'A.5.13': { module: 'Barcode / QR', route: '/barcode', description: 'Nhãn mã vạch và QR dán trên tài sản.' },
  'A.5.19': {
    module: 'Nhà cung cấp',
    route: '/vendors',
    description: 'Hồ sơ nhà cung cấp và phiếu chấm điểm theo tiêu chí ISO.',
  },
  'A.5.22': {
    module: 'Nhà cung cấp',
    route: '/vendors',
    description: 'Kết quả đánh giá định kỳ và trạng thái hợp tác.',
  },
  'A.5.24': {
    module: 'Bảo trì & Sự cố',
    route: '/maintenance',
    description: 'Quy trình tiếp nhận và phân loại sự cố.',
  },
  'A.5.25': { module: 'Bảo trì & Sự cố', route: '/maintenance', description: 'Đánh giá và quyết định xử lý sự cố.' },
  'A.5.26': { module: 'Bảo trì & Sự cố', route: '/maintenance', description: 'Hồ sơ ứng phó và khắc phục sự cố.' },
  'A.5.27': {
    module: 'Bảo trì & Sự cố',
    route: '/maintenance',
    description: 'Nguyên nhân gốc, hành động phòng ngừa và bài học kinh nghiệm.',
  },
  'A.5.30': {
    module: 'Sao lưu và khôi phục',
    route: '/settings',
    description: 'Nhật ký sao lưu và diễn tập khôi phục.',
  },
  'A.5.33': { module: 'Lịch sử / Audit', route: '/audit', description: 'Nhật ký kiểm toán bất biến.' },
  'A.6.8': { module: 'Bảo trì & Sự cố', route: '/maintenance', description: 'Kênh báo cáo sự kiện an toàn thông tin.' },
  'A.7.13': { module: 'Bảo trì & Sự cố', route: '/maintenance', description: 'Phiếu bảo trì thiết bị.' },
  'A.7.14': {
    module: 'Thanh lý & Hủy bỏ',
    route: '/disposals',
    description: 'Hồ sơ thanh lý kèm xác minh xóa dữ liệu và phê duyệt.',
  },
  'A.8.1': { module: 'Sổ tài sản', route: '/assets', description: 'Thiết bị đầu cuối và tình trạng sử dụng.' },
  'A.8.15': { module: 'Lịch sử / Audit', route: '/audit', description: 'Nhật ký thao tác của người dùng.' },
  'A.8.16': { module: 'Khám phá & Agent', route: '/discovery', description: 'Giám sát thiết bị qua Endpoint Agent.' },
}
