import { RiskLevel } from '@prisma/client'

/**
 * Risk criteria per ISO/IEC 27005:2022 §5 (context establishment) and ISO/IEC 27001:2022 §6.1.2(a),
 * which require the organization to define and keep documented information about the criteria used
 * to perform risk assessments, including the criteria for accepting risk.
 *
 * These values are the organization's decision, not a property of the software. They are stated here
 * once and served to every consumer through GET /risk-assessments/criteria so that the API, the web
 * client and an auditor all read the same definitions. Changing them changes how risk is scored, so
 * treat an edit as a change to the ISMS and re-approve open assessments afterwards.
 */

export interface ScaleLevel {
  value: number
  label: string
  definition: string
}

/** ISO/IEC 27005:2022 §7.3.3 — likelihood expressed as an expected frequency, not as a feeling. */
export const likelihoodScale: ScaleLevel[] = [
  { value: 1, label: 'Hiếm', definition: 'Trên 5 năm một lần. Chưa từng ghi nhận tại tổ chức và chưa có dấu hiệu.' },
  { value: 2, label: 'Khó xảy ra', definition: 'Khoảng 2–5 năm một lần. Đã xảy ra ở đơn vị có quy mô tương tự.' },
  { value: 3, label: 'Có thể xảy ra', definition: 'Khoảng 1–2 năm một lần. Đã từng xảy ra tại tổ chức.' },
  { value: 4, label: 'Nhiều khả năng', definition: 'Vài lần mỗi năm. Kiểm soát hiện có chưa đủ để ngăn chặn.' },
  {
    value: 5,
    label: 'Gần như chắc chắn',
    definition: 'Hằng tháng hoặc thường xuyên hơn. Không có kiểm soát nào đang hiệu lực.',
  },
]

/**
 * ISO/IEC 27005:2022 §7.3.2 — consequences are judged on several dimensions at once. A scenario takes
 * the highest level it reaches on any single dimension; one catastrophic consequence must not be
 * averaged away by being harmless on the others.
 */
export const impactDimensions = ['Tài chính', 'Gián đoạn dịch vụ', 'Dữ liệu', 'Tuân thủ pháp lý', 'Uy tín'] as const

export type ImpactDimension = (typeof impactDimensions)[number]

export interface ImpactLevel extends ScaleLevel {
  dimensions: Record<ImpactDimension, string>
}

export const impactScale: ImpactLevel[] = [
  {
    value: 1,
    label: 'Không đáng kể',
    definition: 'Xử lý được trong công việc hằng ngày, không cần báo cáo ra ngoài bộ phận.',
    dimensions: {
      'Tài chính': 'Dưới 10 triệu đồng',
      'Gián đoạn dịch vụ': 'Dưới 1 giờ, ảnh hưởng vài người dùng',
      'Dữ liệu': 'Không lộ lọt dữ liệu',
      'Tuân thủ pháp lý': 'Không vi phạm',
      'Uy tín': 'Không có bên ngoài nào biết',
    },
  },
  {
    value: 2,
    label: 'Nhẹ',
    definition: 'Cần bộ phận CNTT can thiệp nhưng không ảnh hưởng cam kết dịch vụ.',
    dimensions: {
      'Tài chính': '10–100 triệu đồng',
      'Gián đoạn dịch vụ': 'Dưới 4 giờ, ảnh hưởng một nhóm',
      'Dữ liệu': 'Dữ liệu nội bộ không nhạy cảm',
      'Tuân thủ pháp lý': 'Vi phạm quy định nội bộ, xử lý nội bộ',
      'Uy tín': 'Phàn nàn trong nội bộ',
    },
  },
  {
    value: 3,
    label: 'Trung bình',
    definition: 'Phải báo cáo lãnh đạo và thông báo cho các bên bị ảnh hưởng.',
    dimensions: {
      'Tài chính': '100–500 triệu đồng',
      'Gián đoạn dịch vụ': 'Dưới 1 ngày làm việc, ảnh hưởng một phòng ban',
      'Dữ liệu': 'Dữ liệu nội bộ nhạy cảm, chưa gồm dữ liệu cá nhân',
      'Tuân thủ pháp lý': 'Không đạt yêu cầu đã cam kết trong hợp đồng',
      'Uy tín': 'Khách hàng trực tiếp biết và phản ánh',
    },
  },
  {
    value: 4,
    label: 'Nghiêm trọng',
    definition: 'Kích hoạt quy trình xử lý sự cố cấp tổ chức và nghĩa vụ thông báo ra bên ngoài.',
    dimensions: {
      'Tài chính': '500 triệu – 2 tỷ đồng',
      'Gián đoạn dịch vụ': '1–3 ngày làm việc, ảnh hưởng nhiều phòng ban',
      'Dữ liệu': 'Lộ lọt dữ liệu cá nhân ở quy mô hạn chế',
      'Tuân thủ pháp lý': 'Bị cơ quan quản lý nhắc nhở hoặc xử phạt',
      'Uy tín': 'Báo chí hoặc mạng xã hội đưa tin',
    },
  },
  {
    value: 5,
    label: 'Thảm khốc',
    definition: 'Đe dọa khả năng tiếp tục hoạt động của tổ chức.',
    dimensions: {
      'Tài chính': 'Trên 2 tỷ đồng',
      'Gián đoạn dịch vụ': 'Trên 3 ngày hoặc mất dịch vụ trọng yếu',
      'Dữ liệu': 'Lộ lọt dữ liệu cá nhân quy mô lớn hoặc mất dữ liệu không khôi phục được',
      'Tuân thủ pháp lý': 'Bị đình chỉ hoạt động hoặc truy cứu trách nhiệm',
      'Uy tín': 'Tổn hại kéo dài, mất khách hàng trọng yếu',
    },
  },
]

/**
 * ISO/IEC 27005:2022 Annex A — the level is assigned per cell rather than derived from likelihood ×
 * impact. A product cannot tell 1×5 from 5×1, yet a rare catastrophe and a constant nuisance call for
 * completely different decisions. This grid is deliberately weighted toward impact: nothing that can
 * be catastrophic is ever merely "Trung bình", and nothing negligible ever reaches "Nghiêm trọng".
 *
 * Indexed as matrix[impact][likelihood], both 1-based.
 */
const matrix: Record<number, Record<number, RiskLevel>> = {
  5: { 1: RiskLevel.HIGH, 2: RiskLevel.HIGH, 3: RiskLevel.CRITICAL, 4: RiskLevel.CRITICAL, 5: RiskLevel.CRITICAL },
  4: { 1: RiskLevel.MEDIUM, 2: RiskLevel.HIGH, 3: RiskLevel.HIGH, 4: RiskLevel.CRITICAL, 5: RiskLevel.CRITICAL },
  3: { 1: RiskLevel.LOW, 2: RiskLevel.MEDIUM, 3: RiskLevel.MEDIUM, 4: RiskLevel.HIGH, 5: RiskLevel.HIGH },
  2: { 1: RiskLevel.LOW, 2: RiskLevel.LOW, 3: RiskLevel.MEDIUM, 4: RiskLevel.MEDIUM, 5: RiskLevel.HIGH },
  1: { 1: RiskLevel.LOW, 2: RiskLevel.LOW, 3: RiskLevel.LOW, 4: RiskLevel.LOW, 5: RiskLevel.MEDIUM },
}

export function riskLevelFor(likelihood: number, impact: number): RiskLevel {
  const level = matrix[impact]?.[likelihood]
  if (!level) throw new Error('Risk likelihood and impact must be integers from 1 to 5')
  return level
}

export interface AcceptanceRule {
  level: RiskLevel
  label: string
  /** ISO/IEC 27005:2022 §7.4 — whether this level may be retained without a treatment plan. */
  treatmentRequired: boolean
  /** ISO/IEC 27001:2022 §8.3 — whether residual risk at this level may be accepted at all. */
  acceptable: boolean
  /** Who may sign the acceptance. Never the risk owner: §6.1.3(f) requires an independent approval. */
  approver: string
  reviewMonths: number
  rule: string
}

export const acceptanceCriteria: AcceptanceRule[] = [
  {
    level: RiskLevel.LOW,
    label: 'Thấp',
    treatmentRequired: false,
    acceptable: true,
    approver: 'Chủ sở hữu rủi ro',
    reviewMonths: 12,
    rule: 'Chấp nhận và theo dõi định kỳ. Chỉ xử lý khi chi phí không đáng kể.',
  },
  {
    level: RiskLevel.MEDIUM,
    label: 'Trung bình',
    treatmentRequired: false,
    acceptable: true,
    approver: 'Trưởng đơn vị hoặc Quản trị viên',
    reviewMonths: 6,
    rule: 'Xử lý khi chi phí hợp lý. Nếu chấp nhận thì phải ghi rõ lý do.',
  },
  {
    level: RiskLevel.HIGH,
    label: 'Cao',
    treatmentRequired: true,
    acceptable: true,
    approver: 'Quản trị viên',
    reviewMonths: 3,
    rule: 'Bắt buộc có kế hoạch xử lý. Chỉ chấp nhận rủi ro còn lại khi đã hết biện pháp khả thi và có phê duyệt độc lập.',
  },
  {
    level: RiskLevel.CRITICAL,
    label: 'Nghiêm trọng',
    treatmentRequired: true,
    acceptable: false,
    approver: 'Không được chấp nhận',
    reviewMonths: 1,
    rule: 'Phải xử lý ngay. Không được chấp nhận ở mức này; bắt buộc đưa rủi ro còn lại xuống Cao trở xuống trước khi phê duyệt.',
  },
]

export function acceptanceRuleFor(level: RiskLevel): AcceptanceRule {
  const rule = acceptanceCriteria.find(item => item.level === level)
  if (!rule) throw new Error(`No acceptance rule defined for risk level ${level}`)
  return rule
}

/** ISO/IEC 27005:2022 §6 — the process an assessment moves through, used to explain state in the UI. */
export const riskProcessSteps = [
  {
    key: 'CONTEXT',
    name: 'Thiết lập bối cảnh',
    clause: 'ISO 27005 §5',
    summary: 'Phạm vi, tiêu chí rủi ro và tiêu chí chấp nhận.',
  },
  {
    key: 'IDENTIFICATION',
    name: 'Nhận diện rủi ro',
    clause: 'ISO 27005 §7.2',
    summary: 'Tài sản, đe dọa, điểm yếu và kiểm soát hiện có.',
  },
  {
    key: 'ANALYSIS',
    name: 'Phân tích rủi ro',
    clause: 'ISO 27005 §7.3',
    summary: 'Xác định xác suất, ảnh hưởng và mức rủi ro vốn có.',
  },
  {
    key: 'EVALUATION',
    name: 'Định giá rủi ro',
    clause: 'ISO 27005 §7.4',
    summary: 'So mức rủi ro với tiêu chí chấp nhận để quyết định ưu tiên xử lý.',
  },
  {
    key: 'TREATMENT',
    name: 'Xử lý rủi ro',
    clause: 'ISO 27005 §8',
    summary: 'Chọn phương án, xác định kiểm soát và lập kế hoạch.',
  },
  {
    key: 'ACCEPTANCE',
    name: 'Chấp nhận rủi ro còn lại',
    clause: 'ISO 27001 §8.3',
    summary: 'Phê duyệt độc lập mức rủi ro còn lại trước khi đóng.',
  },
  {
    key: 'MONITORING',
    name: 'Theo dõi và rà soát',
    clause: 'ISO 27005 §10',
    summary: 'Rà soát định kỳ và khi có thay đổi đáng kể.',
  },
] as const

export const riskCriteria = {
  methodology: 'ISO/IEC 27005:2022 · ISO/IEC 27001:2022 · NIST SP 800-30 Rev.1',
  likelihoodScale,
  impactScale,
  impactDimensions,
  matrix: Object.entries(matrix).flatMap(([impact, row]) =>
    Object.entries(row).map(([likelihood, level]) => ({
      impact: Number(impact),
      likelihood: Number(likelihood),
      level,
    })),
  ),
  acceptanceCriteria,
  processSteps: riskProcessSteps,
}
