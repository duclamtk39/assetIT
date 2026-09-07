import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react'
import type { Asset } from '../../types'
import { api, ApiError } from '../../services/api-client'

type Level = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type RiskStatus = 'IDENTIFIED' | 'ASSESSED' | 'TREATMENT_PLANNED' | 'TREATING' | 'MONITORING' | 'ACCEPTED' | 'CLOSED'
type AssessmentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'TREATMENT' | 'MONITORING' | 'CLOSED' | 'CANCELLED'
type TreatmentStrategy = 'AVOID' | 'MITIGATE' | 'TRANSFER' | 'ACCEPT'
interface Lookup {
  id: string
  name?: string
  fullName?: string
  email?: string
  role?: string
  department?: { id: string; name: string }
}
interface Assessment {
  id: string
  assessmentNo: string
  title: string
  scope: string
  methodology: string
  status: AssessmentStatus
  startDate: string
  targetDate?: string
  nextReviewAt?: string
  owner: Lookup
  approver?: Lookup
  department?: Lookup
  _count?: { risks: number }
}
interface Control {
  id: string
  controlCode?: string
  title: string
  framework?: string
  status: string
  effectiveness?: number
  evidence?: string
}
interface Treatment {
  id: string
  title: string
  description?: string
  status: string
  progress: number
  dueDate: string
  outcome?: string
  assignee: Lookup
}
interface Risk {
  id: string
  riskNo: string
  title: string
  category: string
  scenario: string
  threat: string
  vulnerability: string
  existingControls?: string
  status: RiskStatus
  likelihood: number
  impact: number
  inherentScore: number
  inherentLevel: Level
  residualLikelihood?: number
  residualImpact?: number
  residualScore?: number
  residualLevel?: Level
  treatmentStrategy: TreatmentStrategy
  acceptanceRationale?: string
  dueDate?: string
  nextReviewAt?: string
  owner: Lookup
  department?: Lookup
  assessment: Assessment
  assets: Array<{ asset: { id: string; assetTag: string; name: string; serialNumber?: string } }>
  incidents: Array<{ incident: { id: string; incidentNo: string; title: string; status: string } }>
  controls: Control[]
  treatments: Treatment[]
}
interface MatrixCell {
  impact: number
  likelihood: number
  count: number
}
interface Summary {
  totalOpen: number
  critical: number
  high: number
  overdue: number
  reviewDue: number
  treatments: number
  byCategory: Array<{ label: string; count: number }>
  byLevel: Array<{ label: string; count: number }>
  byStatus: Array<{ label: string; count: number }>
  residualMissing: number
  matrix: MatrixCell[]
  residualMatrix: MatrixCell[]
}

/**
 * The documented risk criteria of ISO/IEC 27001:2022 §6.1.2(a). The server owns them and this screen
 * renders whatever it is told, so the scale definitions, the matrix and the acceptance rules cannot
 * drift away from the levels the API actually stores.
 */
interface ScaleLevel {
  value: number
  label: string
  definition: string
}
interface ImpactLevel extends ScaleLevel {
  dimensions: Record<string, string>
}
interface AcceptanceRule {
  level: Level
  label: string
  treatmentRequired: boolean
  acceptable: boolean
  approver: string
  reviewMonths: number
  rule: string
}
interface ProcessStep {
  key: string
  name: string
  clause: string
  summary: string
}
interface Criteria {
  methodology: string
  likelihoodScale: ScaleLevel[]
  impactScale: ImpactLevel[]
  impactDimensions: string[]
  matrix: Array<{ impact: number; likelihood: number; level: Level }>
  acceptanceCriteria: AcceptanceRule[]
  processSteps: ProcessStep[]
}

const levelLabels: Record<Level, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Nghiêm trọng' }
const statusLabels: Record<RiskStatus, string> = {
  IDENTIFIED: 'Đã nhận diện',
  ASSESSED: 'Đã đánh giá',
  TREATMENT_PLANNED: 'Đã lập kế hoạch',
  TREATING: 'Đang xử lý',
  MONITORING: 'Đang theo dõi',
  ACCEPTED: 'Đã chấp nhận',
  CLOSED: 'Đã đóng',
}
const assessmentLabels: Record<AssessmentStatus, string> = {
  DRAFT: 'Bản nháp',
  IN_REVIEW: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  TREATMENT: 'Đang xử lý',
  MONITORING: 'Đang theo dõi',
  CLOSED: 'Đã đóng',
  CANCELLED: 'Đã hủy',
}
const strategyLabels: Record<TreatmentStrategy, string> = {
  AVOID: 'Tránh',
  MITIGATE: 'Giảm thiểu',
  TRANSFER: 'Chuyển giao',
  ACCEPT: 'Chấp nhận',
}
const emptyMatrix = (): MatrixCell[] =>
  Array.from({ length: 25 }, (_, i) => ({ impact: 5 - Math.floor(i / 5), likelihood: (i % 5) + 1, count: 0 }))
const emptySummary: Summary = {
  totalOpen: 0,
  critical: 0,
  high: 0,
  overdue: 0,
  reviewDue: 0,
  treatments: 0,
  byCategory: [],
  byLevel: [],
  byStatus: [],
  residualMissing: 0,
  matrix: emptyMatrix(),
  residualMatrix: emptyMatrix(),
}
const apiMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Không thể kết nối dịch vụ đánh giá rủi ro.'
const date = (value?: string) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—')
/** Reads the level out of the served criteria. The client never decides a threshold of its own. */
const cellLevel = (criteria: Criteria | undefined, likelihood: number, impact: number): Level | undefined =>
  criteria?.matrix.find(cell => cell.likelihood === likelihood && cell.impact === impact)?.level

/**
 * Demo-only sample of what the server serves at /risk-assessments/criteria, kept beside the other
 * demo fixtures. The authoritative definition lives in the API; nothing here is used in production.
 */
const demoCriteria: Criteria = {
  methodology: 'ISO/IEC 27005:2022 · ISO/IEC 27001:2022 · NIST SP 800-30 Rev.1',
  likelihoodScale: [
    { value: 1, label: 'Hiếm', definition: 'Trên 5 năm một lần.' },
    { value: 2, label: 'Khó xảy ra', definition: 'Khoảng 2–5 năm một lần.' },
    { value: 3, label: 'Có thể xảy ra', definition: 'Khoảng 1–2 năm một lần.' },
    { value: 4, label: 'Nhiều khả năng', definition: 'Vài lần mỗi năm.' },
    { value: 5, label: 'Gần như chắc chắn', definition: 'Hằng tháng hoặc thường xuyên hơn.' },
  ],
  impactScale: [1, 2, 3, 4, 5].map(value => ({
    value,
    label: ['Không đáng kể', 'Nhẹ', 'Trung bình', 'Nghiêm trọng', 'Thảm khốc'][value - 1],
    definition: 'Xem tiêu chí đầy đủ do máy chủ cung cấp.',
    dimensions: { 'Tài chính': '—', 'Gián đoạn dịch vụ': '—', 'Dữ liệu': '—', 'Tuân thủ pháp lý': '—', 'Uy tín': '—' },
  })),
  impactDimensions: ['Tài chính', 'Gián đoạn dịch vụ', 'Dữ liệu', 'Tuân thủ pháp lý', 'Uy tín'],
  matrix: (
    [
      [5, ['HIGH', 'HIGH', 'CRITICAL', 'CRITICAL', 'CRITICAL']],
      [4, ['MEDIUM', 'HIGH', 'HIGH', 'CRITICAL', 'CRITICAL']],
      [3, ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH']],
      [2, ['LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH']],
      [1, ['LOW', 'LOW', 'LOW', 'LOW', 'MEDIUM']],
    ] as Array<[number, Level[]]>
  ).flatMap(([impact, row]) => row.map((level, index) => ({ impact, likelihood: index + 1, level }))),
  acceptanceCriteria: [
    {
      level: 'LOW',
      label: 'Thấp',
      treatmentRequired: false,
      acceptable: true,
      approver: 'Chủ sở hữu rủi ro',
      reviewMonths: 12,
      rule: 'Chấp nhận và theo dõi định kỳ.',
    },
    {
      level: 'MEDIUM',
      label: 'Trung bình',
      treatmentRequired: false,
      acceptable: true,
      approver: 'Trưởng đơn vị hoặc Quản trị viên',
      reviewMonths: 6,
      rule: 'Xử lý khi chi phí hợp lý, nếu chấp nhận phải ghi rõ lý do.',
    },
    {
      level: 'HIGH',
      label: 'Cao',
      treatmentRequired: true,
      acceptable: true,
      approver: 'Quản trị viên',
      reviewMonths: 3,
      rule: 'Bắt buộc có kế hoạch xử lý và phê duyệt độc lập.',
    },
    {
      level: 'CRITICAL',
      label: 'Nghiêm trọng',
      treatmentRequired: true,
      acceptable: false,
      approver: 'Không được chấp nhận',
      reviewMonths: 1,
      rule: 'Phải đưa rủi ro còn lại xuống Cao trở xuống trước khi phê duyệt.',
    },
  ],
  processSteps: [
    { key: 'CONTEXT', name: 'Thiết lập bối cảnh', clause: 'ISO 27005 §5', summary: 'Phạm vi và tiêu chí rủi ro.' },
    {
      key: 'IDENTIFICATION',
      name: 'Nhận diện rủi ro',
      clause: 'ISO 27005 §7.2',
      summary: 'Tài sản, đe dọa, điểm yếu.',
    },
    {
      key: 'ANALYSIS',
      name: 'Phân tích rủi ro',
      clause: 'ISO 27005 §7.3',
      summary: 'Xác suất, ảnh hưởng, mức vốn có.',
    },
    { key: 'EVALUATION', name: 'Định giá rủi ro', clause: 'ISO 27005 §7.4', summary: 'So với tiêu chí chấp nhận.' },
    { key: 'TREATMENT', name: 'Xử lý rủi ro', clause: 'ISO 27005 §8', summary: 'Kiểm soát và kế hoạch xử lý.' },
    { key: 'ACCEPTANCE', name: 'Chấp nhận rủi ro còn lại', clause: 'ISO 27001 §8.3', summary: 'Phê duyệt độc lập.' },
    { key: 'MONITORING', name: 'Theo dõi và rà soát', clause: 'ISO 27005 §10', summary: 'Rà soát định kỳ.' },
  ],
}

const demoAssessment: Assessment = {
  id: 'demo-assessment',
  assessmentNo: 'DGRR-2026-0001',
  title: 'Đánh giá rủi ro hạ tầng CNTT 2026',
  scope: 'Thiết bị đầu cuối, hạ tầng mạng, phòng máy chủ và dịch vụ đám mây.',
  methodology: 'ISO 27005 / NIST SP 800-30',
  status: 'APPROVED',
  startDate: '2026-08-01',
  targetDate: '2026-09-15',
  nextReviewAt: '2026-11-01',
  owner: { id: 'it-1', fullName: 'Trần Đức Long' },
  approver: { id: 'admin-1', fullName: 'Quản trị viên' },
  department: { id: 'd-it', name: 'IT' },
  _count: { risks: 3 },
}
const demoRisks: Risk[] = [
  {
    id: 'r1',
    riskNo: 'RR-2026-0001',
    title: 'Gián đoạn kết nối Internet tại văn phòng chính',
    category: 'Hạ tầng mạng',
    scenario: 'Đường truyền chính và thiết bị biên đồng thời gặp sự cố.',
    threat: 'Lỗi nhà mạng hoặc thiết bị biên',
    vulnerability: 'Chưa kiểm thử chuyển mạch dự phòng định kỳ',
    existingControls: 'Hai đường truyền từ hai ISP, firewall HA',
    status: 'TREATING',
    likelihood: 4,
    impact: 5,
    inherentScore: 20,
    inherentLevel: 'CRITICAL',
    residualLikelihood: 2,
    residualImpact: 4,
    residualScore: 8,
    residualLevel: 'MEDIUM',
    treatmentStrategy: 'MITIGATE',
    dueDate: '2026-09-05',
    nextReviewAt: '2026-10-01',
    owner: { id: 'it-1', fullName: 'Trần Đức Long' },
    department: { id: 'd-it', name: 'IT' },
    assessment: demoAssessment,
    assets: [],
    incidents: [],
    controls: [
      {
        id: 'c1',
        controlCode: 'A.8.14',
        title: 'Dự phòng cơ sở xử lý thông tin',
        framework: 'ISO/IEC 27001',
        status: 'PARTIAL',
        effectiveness: 60,
      },
    ],
    treatments: [
      {
        id: 't1',
        title: 'Diễn tập failover hai đường truyền',
        status: 'IN_PROGRESS',
        progress: 60,
        dueDate: '2026-09-05',
        assignee: { id: 'it-1', fullName: 'Trần Đức Long' },
      },
    ],
  },
  {
    id: 'r2',
    riskNo: 'RR-2026-0002',
    title: 'Mã độc mã hóa dữ liệu máy người dùng',
    category: 'An toàn thông tin',
    scenario: 'Người dùng mở tệp đính kèm độc hại, mã độc lan qua thư mục dùng chung.',
    threat: 'Phishing và ransomware',
    vulnerability: 'Nhận thức người dùng và phân quyền thư mục chưa đồng đều',
    existingControls: 'EDR, email filtering, backup hằng ngày',
    status: 'ASSESSED',
    likelihood: 3,
    impact: 5,
    inherentScore: 15,
    inherentLevel: 'HIGH',
    residualLikelihood: 2,
    residualImpact: 4,
    residualScore: 8,
    residualLevel: 'MEDIUM',
    treatmentStrategy: 'MITIGATE',
    dueDate: '2026-09-20',
    owner: { id: 'it-1', fullName: 'Trần Đức Long' },
    department: { id: 'd-it', name: 'IT' },
    assessment: demoAssessment,
    assets: [],
    incidents: [],
    controls: [],
    treatments: [],
  },
  {
    id: 'r3',
    riskNo: 'RR-2026-0003',
    title: 'Hết hạn chứng thư SSL dịch vụ khách hàng',
    category: 'Dịch vụ số',
    scenario: 'Chứng thư hết hạn làm trình duyệt từ chối kết nối.',
    threat: 'Bỏ sót lịch gia hạn',
    vulnerability: 'Phụ thuộc theo dõi thủ công',
    existingControls: 'Cảnh báo gia hạn AssetFlow',
    status: 'MONITORING',
    likelihood: 2,
    impact: 4,
    inherentScore: 8,
    inherentLevel: 'MEDIUM',
    residualLikelihood: 1,
    residualImpact: 3,
    residualScore: 3,
    residualLevel: 'LOW',
    treatmentStrategy: 'MITIGATE',
    nextReviewAt: '2026-09-01',
    owner: { id: 'admin-1', fullName: 'Quản trị viên' },
    department: { id: 'd-it', name: 'IT' },
    assessment: demoAssessment,
    assets: [],
    incidents: [],
    controls: [],
    treatments: [],
  },
]

function summarize(items: Risk[]): Summary {
  const open = items.filter(item => !['ACCEPTED', 'CLOSED'].includes(item.status)),
    now = new Date()
  const by = (values: string[]) =>
    Object.entries(
      values.reduce(
        (acc, value) => {
          acc[value] = (acc[value] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      ),
    )
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
  return {
    totalOpen: open.length,
    critical: open.filter(item => (item.residualLevel || item.inherentLevel) === 'CRITICAL').length,
    high: open.filter(item => (item.residualLevel || item.inherentLevel) === 'HIGH').length,
    overdue: open.filter(item => item.dueDate && new Date(item.dueDate) < now).length,
    reviewDue: open.filter(item => item.nextReviewAt && new Date(item.nextReviewAt) < now).length,
    treatments: open.filter(item => ['TREATMENT_PLANNED', 'TREATING'].includes(item.status)).length,
    byCategory: by(open.map(item => item.category)),
    byLevel: by(open.map(item => item.residualLevel || item.inherentLevel)),
    byStatus: by(open.map(item => item.status)),
    residualMissing: open.filter(item => item.status !== 'IDENTIFIED' && !item.residualLevel).length,
    matrix: grid(open, item => [item.likelihood, item.impact]),
    residualMatrix: grid(open, item => [item.residualLikelihood, item.residualImpact]),
  }
}

const grid = (items: Risk[], pick: (item: Risk) => [number | undefined, number | undefined]): MatrixCell[] =>
  Array.from({ length: 25 }, (_, i) => {
    const impact = 5 - Math.floor(i / 5),
      likelihood = (i % 5) + 1
    return {
      impact,
      likelihood,
      count: items.filter(item => {
        const [itemLikelihood, itemImpact] = pick(item)
        return itemLikelihood === likelihood && itemImpact === impact
      }).length,
    }
  })

export function RiskManagement({
  assets,
  demoMode,
  currentUserName,
}: {
  assets: Asset[]
  demoMode: boolean
  currentUserName: string
}) {
  const [summary, setSummary] = useState<Summary>(demoMode ? summarize(demoRisks) : emptySummary)
  const [risks, setRisks] = useState<Risk[]>(demoMode ? demoRisks : [])
  const [assessments, setAssessments] = useState<Assessment[]>(demoMode ? [demoAssessment] : [])
  const [operators, setOperators] = useState<Lookup[]>(
    demoMode
      ? [
          { id: 'admin-1', fullName: 'Quản trị viên', role: 'ADMIN' },
          { id: 'it-1', fullName: 'Trần Đức Long', role: 'IT' },
        ]
      : [],
  )
  const [departments, setDepartments] = useState<Lookup[]>(demoMode ? [{ id: 'd-it', name: 'IT' }] : [])
  const [criteria, setCriteria] = useState<Criteria | undefined>(demoMode ? demoCriteria : undefined)
  const [tab, setTab] = useState<'register' | 'assessments'>('register')
  const [basis, setBasis] = useState<'INHERENT' | 'RESIDUAL'>('INHERENT')
  const [cell, setCell] = useState<{ likelihood: number; impact: number }>()
  const [showCriteria, setShowCriteria] = useState(false)
  const [query, setQuery] = useState(''),
    [level, setLevel] = useState(''),
    [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Risk>(),
    [creatingRisk, setCreatingRisk] = useState(false),
    [creatingAssessment, setCreatingAssessment] = useState(false)
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('')

  const load = async () => {
    if (demoMode) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: '1', limit: '100' })
      if (query) params.set('search', query)
      if (level) params.set('level', level)
      // A stage may filter several statuses at once; the API takes them as `statuses`.
      if (status) params.set(status.includes(',') ? 'statuses' : 'status', status)
      if (cell) {
        params.set('basis', basis)
        params.set('likelihood', String(cell.likelihood))
        params.set('impact', String(cell.impact))
      }
      const [stats, riskResult, assessmentResult] = await Promise.all([
        api.get<Summary>('/risk-assessments/summary'),
        api.get<{ data: Risk[] }>(`/risk-assessments/risks?${params}`),
        api.get<{ data: Assessment[] }>('/risk-assessments?limit=100'),
      ])
      setSummary(stats)
      setRisks(riskResult.data)
      setAssessments(assessmentResult.data)
    } catch (reason) {
      setError(apiMessage(reason))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0)
    return () => clearTimeout(timer)
  }, [demoMode, query, level, status, cell, basis])
  useEffect(() => {
    if (demoMode) return
    void Promise.all([api.get<Lookup[]>('/risk-assessments/operators'), api.get<Lookup[]>('/departments')])
      .then(([users, deps]) => {
        setOperators(users)
        setDepartments(deps)
      })
      .catch(() => undefined)
    void api
      .get<Criteria>('/risk-assessments/criteria')
      .then(setCriteria)
      .catch(() => undefined)
  }, [demoMode])
  const shown = useMemo(
    () =>
      demoMode
        ? risks.filter(
            item =>
              (!query ||
                `${item.riskNo} ${item.title} ${item.category} ${item.threat} ${item.vulnerability}`
                  .toLowerCase()
                  .includes(query.toLowerCase())) &&
              (!level || (item.residualLevel || item.inherentLevel) === level) &&
              (!status || status.split(',').includes(item.status)) &&
              (!cell ||
                (basis === 'RESIDUAL'
                  ? item.residualLikelihood === cell.likelihood && item.residualImpact === cell.impact
                  : item.likelihood === cell.likelihood && item.impact === cell.impact)),
          )
        : risks,
    [demoMode, risks, query, level, status, cell, basis],
  )

  /**
   * ISO/IEC 27001:2022 §8.3 — residual risk has to be signed off by someone other than the risk
   * owner. The API already enforces that and the acceptance criteria; the UI simply had no way to
   * ask for it, which left the whole decision step invisible.
   */
  const reviewRisk = async (id: string, decision: 'ACCEPT_RESIDUAL' | 'CLOSE', note: string) => {
    if (demoMode) {
      setError('Chế độ demo không ghi nhận phê duyệt.')
      return
    }
    await api.post(`/risk-assessments/risks/${id}/reviews`, { decision, note })
    setSelected(await api.get<Risk>(`/risk-assessments/risks/${id}`))
    await load()
  }
  const reviewAssessment = async (id: string, decision: 'SUBMIT' | 'APPROVE' | 'RETURN_FOR_CHANGES', note: string) => {
    if (demoMode) {
      setError('Chế độ demo không ghi nhận phê duyệt.')
      return
    }
    await api.post(`/risk-assessments/${id}/reviews`, { decision, note })
    await load()
  }

  const submitAssessment = async (item: Assessment, decision: 'SUBMIT' | 'APPROVE' | 'RETURN_FOR_CHANGES') => {
    const prompts: Record<typeof decision, string> = {
      SUBMIT: `Trình duyệt ${item.assessmentNo}. Ghi căn cứ trình duyệt:`,
      APPROVE: `Phê duyệt ${item.assessmentNo}. Ghi căn cứ phê duyệt:`,
      RETURN_FOR_CHANGES: `Trả lại ${item.assessmentNo}. Ghi nội dung cần sửa:`,
    }
    // ISO/IEC 27005 §8.6 keeps the rationale with the decision, and the API rejects an empty note.
    const note = window.prompt(prompts[decision])?.trim()
    if (!note) return
    try {
      await reviewAssessment(item.id, decision, note)
    } catch (reason) {
      setError(apiMessage(reason))
    }
  }

  const openDetail = async (item: Risk) => {
    if (demoMode) return setSelected(item)
    try {
      setSelected(await api.get<Risk>(`/risk-assessments/risks/${item.id}`))
    } catch (reason) {
      setError(apiMessage(reason))
    }
  }
  const saveAssessment = async (body: any) => {
    if (demoMode) {
      const created = {
        ...body,
        id: `assessment-${Date.now()}`,
        assessmentNo: `DGRR-DEMO-${assessments.length + 1}`,
        status: 'DRAFT',
        owner: operators.find(x => x.id === body.ownerId)!,
        approver: operators.find(x => x.id === body.approverId),
        department: departments.find(x => x.id === body.departmentId),
        _count: { risks: 0 },
      } as Assessment
      setAssessments(items => [created, ...items])
      setCreatingAssessment(false)
      return
    }
    await api.post('/risk-assessments', body)
    setCreatingAssessment(false)
    await load()
  }
  const saveRisk = async (body: any) => {
    if (demoMode) {
      const inherentScore = body.likelihood * body.impact,
        residualScore =
          body.residualLikelihood && body.residualImpact ? body.residualLikelihood * body.residualImpact : undefined,
        assessment = assessments.find(x => x.id === body.assessmentId)!
      const created: Risk = {
        ...body,
        id: `risk-${Date.now()}`,
        riskNo: `RR-DEMO-${risks.length + 1}`,
        status: 'IDENTIFIED',
        inherentScore,
        inherentLevel: cellLevel(criteria, body.likelihood, body.impact),
        residualScore,
        residualLevel: residualScore
          ? cellLevel(criteria, Number(body.residualLikelihood), Number(body.residualImpact))
          : undefined,
        owner: operators.find(x => x.id === body.ownerId)!,
        department: departments.find(x => x.id === body.departmentId),
        assessment,
        assets: [],
        incidents: [],
        controls: [],
        treatments: [],
      }
      setRisks(items => [created, ...items])
      setSummary(summarize([created, ...risks]))
      setCreatingRisk(false)
      return
    }
    const { assessmentId, ...payload } = body
    await api.post(`/risk-assessments/${assessmentId}/risks`, payload)
    setCreatingRisk(false)
    await load()
  }
  const addControl = async (riskId: string, body: any) => {
    if (demoMode) {
      setSelected(current =>
        current ? { ...current, controls: [...current.controls, { ...body, id: `control-${Date.now()}` }] } : current,
      )
      return
    }
    await api.post(`/risk-assessments/risks/${riskId}/controls`, body)
    setSelected(await api.get<Risk>(`/risk-assessments/risks/${riskId}`))
    await load()
  }
  const addTreatment = async (riskId: string, body: any) => {
    if (demoMode) {
      setSelected(current =>
        current
          ? {
              ...current,
              status: 'TREATMENT_PLANNED',
              treatments: [
                ...current.treatments,
                {
                  ...body,
                  id: `treatment-${Date.now()}`,
                  status: 'PLANNED',
                  progress: 0,
                  assignee: operators.find(x => x.id === body.assigneeId)!,
                },
              ],
            }
          : current,
      )
      return
    }
    await api.post(`/risk-assessments/risks/${riskId}/treatments`, body)
    setSelected(await api.get<Risk>(`/risk-assessments/risks/${riskId}`))
    await load()
  }
  const completeTreatment = async (riskId: string, treatment: Treatment) => {
    const outcome = window.prompt(
      'Kết quả thực hiện hành động xử lý:',
      treatment.outcome || 'Đã hoàn tất và kiểm tra hiệu lực',
    )
    if (!outcome) return
    if (demoMode) {
      setSelected(current =>
        current
          ? {
              ...current,
              treatments: current.treatments.map(item =>
                item.id === treatment.id ? { ...item, status: 'COMPLETED', progress: 100, outcome } : item,
              ),
            }
          : current,
      )
      return
    }
    await api.patch(`/risk-assessments/treatments/${treatment.id}`, { status: 'COMPLETED', progress: 100, outcome })
    setSelected(await api.get<Risk>(`/risk-assessments/risks/${riskId}`))
    await load()
  }

  const activeMatrix = basis === 'RESIDUAL' ? summary.residualMatrix : summary.matrix
  const statusOptions = Object.keys(statusLabels)
  const countByStatus = (...values: RiskStatus[]) =>
    values.reduce((total, value) => total + (summary.byStatus.find(item => item.label === value)?.count || 0), 0)
  const switchBasis = (next: 'INHERENT' | 'RESIDUAL') => {
    setBasis(next)
    // The same coordinates mean a different set of risks on the other grid, so a cell selection made
    // on one basis must not silently carry over to the other.
    setCell(undefined)
  }
  const selectCell = (item: MatrixCell) => {
    if (!item.count && !(cell?.likelihood === item.likelihood && cell?.impact === item.impact)) return
    setCell(current =>
      current?.likelihood === item.likelihood && current?.impact === item.impact
        ? undefined
        : { likelihood: item.likelihood, impact: item.impact },
    )
  }
  const likelihoodHint = (value: number) => {
    const step = criteria?.likelihoodScale.find(item => item.value === value)
    return step ? `${step.label}: ${step.definition}` : ''
  }
  const impactHint = (value: number) => {
    const step = criteria?.impactScale.find(item => item.value === value)
    return step ? `${step.label}: ${step.definition}` : ''
  }
  const filterByStatus =
    (...values: RiskStatus[]) =>
    () => {
      setCell(undefined)
      setLevel('')
      setTab('register')
      // Joined, so the register shows exactly the set the stage counted rather than a subset of it.
      const next = values.join(',')
      setStatus(current => (current === next ? '' : next))
    }
  /**
   * The ISO/IEC 27005 process with the live count of risks sitting at each stage, so the panel says
   * where the work actually is rather than describing the standard in the abstract.
   */
  const processStages = (criteria?.processSteps || []).map(step => {
    if (step.key === 'CONTEXT') return { ...step, count: undefined, onOpen: () => setShowCriteria(true) }
    if (step.key === 'IDENTIFICATION')
      return { ...step, count: countByStatus('IDENTIFIED'), onOpen: filterByStatus('IDENTIFIED') }
    // Every open risk already carries an inherent score, so analysis is done for all of them and the
    // stage reports coverage rather than a queue of its own.
    if (step.key === 'ANALYSIS') return { ...step, count: summary.totalOpen, onOpen: undefined }
    if (step.key === 'EVALUATION')
      return { ...step, count: countByStatus('ASSESSED'), onOpen: filterByStatus('ASSESSED') }
    if (step.key === 'TREATMENT')
      return {
        ...step,
        count: countByStatus('TREATMENT_PLANNED', 'TREATING'),
        onOpen: filterByStatus('TREATMENT_PLANNED', 'TREATING'),
      }
    if (step.key === 'ACCEPTANCE')
      return { ...step, count: countByStatus('MONITORING'), onOpen: filterByStatus('MONITORING') }
    return { ...step, count: summary.reviewDue, onOpen: undefined }
  })

  const metrics = [
    { key: '', label: 'Rủi ro đang mở', value: summary.totalOpen, note: 'Cần theo dõi và xử lý', icon: ShieldAlert },
    {
      key: 'CRITICAL',
      label: 'Nghiêm trọng',
      value: summary.critical,
      note: 'Vượt ngưỡng ưu tiên',
      icon: AlertTriangle,
    },
    { key: 'HIGH', label: 'Mức cao', value: summary.high, note: 'Cần kế hoạch kiểm soát', icon: Target },
    {
      key: 'overdue',
      label: 'Quá hạn xử lý',
      value: summary.overdue,
      note: 'Cần điều phối ngay',
      icon: ClipboardCheck,
    },
    { key: 'review', label: 'Đến hạn rà soát', value: summary.reviewDue, note: 'Chờ đánh giá lại', icon: FileCheck2 },
  ]
  return (
    <main className="risk-management">
      <header className="risk-heading">
        <div>
          <span>GRC · ISO/IEC 27005 · NIST SP 800-30</span>
          <h1>Đánh giá rủi ro CNTT</h1>
          <p>Nhận diện, đánh giá, xử lý và theo dõi rủi ro gắn với tài sản, sự cố và đơn vị chịu trách nhiệm.</p>
        </div>
        <div>
          <button className="btn secondary" onClick={() => setCreatingAssessment(true)}>
            <ClipboardCheck size={16} />
            Tạo đợt đánh giá
          </button>
          <button
            className="btn primary"
            onClick={() => (assessments.length ? setCreatingRisk(true) : setCreatingAssessment(true))}
          >
            <Plus size={16} />
            Ghi nhận rủi ro
          </button>
        </div>
      </header>
      {error && (
        <div className="risk-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      <section className="risk-metrics">
        {metrics.map((item, index) => (
          <button
            key={item.label}
            className={(index === 1 && level === 'CRITICAL') || (index === 2 && level === 'HIGH') ? 'active' : ''}
            onClick={() => {
              if (item.key === 'CRITICAL' || item.key === 'HIGH')
                setLevel(current => (current === item.key ? '' : item.key))
              else if (item.key === '') {
                setLevel('')
                setStatus('')
              }
            }}
          >
            <item.icon />
            <span>
              <small>{item.label}</small>
              <b>{item.value}</b>
              <em>{item.note}</em>
            </span>
          </button>
        ))}
      </section>
      <section className="risk-overview-grid">
        <article className="risk-panel risk-matrix">
          <header>
            <div>
              <h2>Ma trận rủi ro 5 × 5</h2>
              <p>Mức của từng ô lấy từ tiêu chí đã phê duyệt. Nhấp ô để xem đúng các rủi ro trong ô đó.</p>
            </div>
            <div className="risk-basis-toggle">
              <button className={basis === 'INHERENT' ? 'active' : ''} onClick={() => switchBasis('INHERENT')}>
                Vốn có
              </button>
              <button className={basis === 'RESIDUAL' ? 'active' : ''} onClick={() => switchBasis('RESIDUAL')}>
                Còn lại
              </button>
            </div>
          </header>
          <div className="matrix-body">
            <div className="matrix-axis">
              {[5, 4, 3, 2, 1].map(value => (
                <b key={value} title={impactHint(value)}>
                  {value}
                </b>
              ))}
            </div>
            <div className="matrix-cells">
              {activeMatrix.map(item => {
                const itemLevel = cellLevel(criteria, item.likelihood, item.impact)
                const active = cell?.likelihood === item.likelihood && cell?.impact === item.impact
                return (
                  <button
                    key={`${item.impact}-${item.likelihood}`}
                    className={`${(itemLevel || 'low').toLowerCase()}${active ? ' selected' : ''}`}
                    onClick={() => selectCell(item)}
                    title={`Xác suất ${item.likelihood} — ${likelihoodHint(item.likelihood)}
Ảnh hưởng ${item.impact} — ${impactHint(item.impact)}
Mức: ${itemLevel ? levelLabels[itemLevel] : '—'}`}
                  >
                    <b>{item.count}</b>
                    <small>
                      {item.likelihood}×{item.impact}
                    </small>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="matrix-footer">
            <div className="matrix-legend">
              <span className="low">Thấp</span>
              <span className="medium">Trung bình</span>
              <span className="high">Cao</span>
              <span className="critical">Nghiêm trọng</span>
            </div>
            <button className="risk-link" onClick={() => setShowCriteria(true)}>
              <FileCheck2 size={14} />
              Tiêu chí đánh giá
            </button>
          </div>
          {basis === 'RESIDUAL' && summary.residualMissing > 0 && (
            <p className="matrix-note">
              {summary.residualMissing} rủi ro chưa chấm điểm còn lại nên không xuất hiện trong lưới này.
            </p>
          )}
          {cell && (
            <p className="matrix-note">
              Đang lọc ô xác suất {cell.likelihood} × ảnh hưởng {cell.impact} (
              {basis === 'RESIDUAL' ? 'còn lại' : 'vốn có'}).{' '}
              <button className="risk-link" onClick={() => setCell(undefined)}>
                Bỏ lọc
              </button>
            </p>
          )}
        </article>
        <article className="risk-panel risk-categories">
          <header>
            <div>
              <h2>Rủi ro theo nhóm</h2>
              <p>Phạm vi rủi ro đang mở.</p>
            </div>
            <BarChart3 size={18} />
          </header>
          <div>
            {summary.byCategory.slice(0, 7).map(item => {
              const max = Math.max(...summary.byCategory.map(x => x.count), 1)
              return (
                <button key={item.label} onClick={() => setQuery(item.label)}>
                  <span>{item.label}</span>
                  <i>
                    <em style={{ width: `${Math.max(5, (item.count / max) * 100)}%` }} />
                  </i>
                  <b>{item.count}</b>
                </button>
              )
            })}
            {!summary.byCategory.length && <p className="risk-empty">Chưa có rủi ro trong phạm vi.</p>}
          </div>
        </article>
        <article className="risk-panel risk-workflow">
          <header>
            <div>
              <h2>Quy trình quản lý rủi ro</h2>
              <p>{criteria?.methodology || 'ISO/IEC 27005'}</p>
            </div>
            <ShieldCheck size={18} />
          </header>
          <ol>
            {processStages.map((stage, index) => (
              <li key={stage.key} className={stage.count ? 'has-work' : ''}>
                <b>{index + 1}</b>
                <span>
                  <em>
                    {stage.name}
                    <i>{stage.clause}</i>
                  </em>
                  <small>{stage.summary}</small>
                </span>
                {stage.onOpen ? (
                  <button className="risk-stage-count" onClick={stage.onOpen}>
                    {stage.count === undefined ? 'Xem' : stage.count}
                  </button>
                ) : (
                  <span className="risk-stage-count muted">{stage.count ?? '—'}</span>
                )}
              </li>
            ))}
          </ol>
        </article>
      </section>
      <section className="risk-register">
        <header>
          <div className="risk-tabs">
            <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>
              Sổ đăng ký rủi ro <b>{risks.length}</b>
            </button>
            <button className={tab === 'assessments' ? 'active' : ''} onClick={() => setTab('assessments')}>
              Đợt đánh giá <b>{assessments.length}</b>
            </button>
          </div>
        </header>
        {tab === 'register' ? (
          <>
            <div className="risk-filters">
              <label>
                <Search size={16} />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Tìm mã, tiêu đề, mối đe dọa, điểm yếu hoặc tài sản..."
                />
              </label>
              <select value={level} onChange={event => setLevel(event.target.value)}>
                <option value="">Tất cả mức rủi ro</option>
                {Object.entries(levelLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={statusOptions.includes(status) ? status : ''}
                onChange={event => setStatus(event.target.value)}
              >
                <option value="">
                  {status && !statusOptions.includes(status) ? 'Nhiều trạng thái' : 'Tất cả trạng thái'}
                </option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="risk-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>MÃ RỦI RO</th>
                    <th>KỊCH BẢN RỦI RO</th>
                    <th>NHÓM / PHẠM VI</th>
                    <th>CHỦ SỞ HỮU</th>
                    <th>VỐN CÓ</th>
                    <th>CÒN LẠI</th>
                    <th>CHIẾN LƯỢC</th>
                    <th>HẠN XỬ LÝ</th>
                    <th>TRẠNG THÁI</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(item => (
                    <tr key={item.id} onClick={() => void openDetail(item)}>
                      <td>
                        <b className="risk-code">{item.riskNo}</b>
                      </td>
                      <td>
                        <b>{item.title}</b>
                        <small>{item.threat}</small>
                      </td>
                      <td>
                        {item.category}
                        <small>{item.department?.name || 'Toàn công ty'}</small>
                      </td>
                      <td>{item.owner.fullName}</td>
                      <td>
                        <span className={`risk-level ${item.inherentLevel.toLowerCase()}`}>
                          {item.inherentScore} · {levelLabels[item.inherentLevel]}
                        </span>
                      </td>
                      <td>
                        {item.residualLevel ? (
                          <span className={`risk-level ${item.residualLevel.toLowerCase()}`}>
                            {item.residualScore} · {levelLabels[item.residualLevel]}
                          </span>
                        ) : (
                          <span className="muted">Chưa đánh giá</span>
                        )}
                      </td>
                      <td>{strategyLabels[item.treatmentStrategy]}</td>
                      <td className={item.dueDate && new Date(item.dueDate) < new Date() ? 'risk-overdue' : ''}>
                        {date(item.dueDate)}
                      </td>
                      <td>
                        <span className={`risk-status ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span>
                      </td>
                      <td>
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading && <div className="risk-loading">Đang tải sổ đăng ký rủi ro…</div>}
            {!loading && !shown.length && <div className="risk-empty-table">Không có rủi ro phù hợp với bộ lọc.</div>}
          </>
        ) : (
          <div className="risk-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>MÃ ĐỢT</th>
                  <th>TÊN / PHẠM VI</th>
                  <th>CHỦ SỞ HỮU</th>
                  <th>PHÊ DUYỆT</th>
                  <th>THỜI GIAN</th>
                  <th>SỐ RỦI RO</th>
                  <th>TRẠNG THÁI</th>
                  <th>PHÊ DUYỆT</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map(item => (
                  <tr key={item.id}>
                    <td>
                      <b className="risk-code">{item.assessmentNo}</b>
                    </td>
                    <td>
                      <b>{item.title}</b>
                      <small>{item.scope}</small>
                    </td>
                    <td>{item.owner.fullName}</td>
                    <td>{item.approver?.fullName || <span className="muted">Chưa chỉ định</span>}</td>
                    <td>
                      {date(item.startDate)} → {date(item.targetDate)}
                    </td>
                    <td>{item._count?.risks || 0}</td>
                    <td>
                      <span className={`assessment-status ${item.status.toLowerCase()}`}>
                        {assessmentLabels[item.status]}
                      </span>
                    </td>
                    <td className="risk-assessment-actions">
                      {item.status === 'DRAFT' && (
                        <button className="btn secondary" onClick={() => void submitAssessment(item, 'SUBMIT')}>
                          Trình duyệt
                        </button>
                      )}
                      {item.status === 'IN_REVIEW' && (
                        <>
                          <button className="btn primary" onClick={() => void submitAssessment(item, 'APPROVE')}>
                            Phê duyệt
                          </button>
                          <button
                            className="btn secondary"
                            onClick={() => void submitAssessment(item, 'RETURN_FOR_CHANGES')}
                          >
                            Trả lại
                          </button>
                        </>
                      )}
                      {item.status !== 'DRAFT' && item.status !== 'IN_REVIEW' && <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="risk-standard-note">
        <ShieldCheck size={20} />
        <div>
          <b>Quản trị dựa trên bằng chứng và phân tách trách nhiệm</b>
          <p>
            Điểm rủi ro được tính tại API; chủ sở hữu không được tự phê duyệt hoặc tự chấp nhận rủi ro còn lại. Mọi thay
            đổi được ghi audit log. Việc sử dụng quy trình tham chiếu không đồng nghĩa doanh nghiệp đã được chứng nhận
            ISO.
          </p>
        </div>
      </section>
      {creatingAssessment && (
        <AssessmentModal
          operators={operators}
          departments={departments}
          currentUserName={currentUserName}
          onClose={() => setCreatingAssessment(false)}
          onSave={saveAssessment}
        />
      )}
      {showCriteria && criteria && <CriteriaModal criteria={criteria} onClose={() => setShowCriteria(false)} />}
      {creatingRisk && (
        <RiskModal
          assessments={assessments}
          operators={operators}
          departments={departments}
          assets={assets}
          criteria={criteria}
          onClose={() => setCreatingRisk(false)}
          onSave={saveRisk}
        />
      )}
      {selected && (
        <RiskDetail
          risk={selected}
          operators={operators}
          criteria={criteria}
          reviewRisk={reviewRisk}
          onClose={() => setSelected(undefined)}
          addControl={addControl}
          addTreatment={addTreatment}
          completeTreatment={completeTreatment}
        />
      )}
    </main>
  )
}

function AssessmentModal({
  operators,
  departments,
  onClose,
  onSave,
}: {
  operators: Lookup[]
  departments: Lookup[]
  currentUserName: string
  onClose: () => void
  onSave: (body: any) => Promise<void>
}) {
  const [form, setForm] = useState<any>({
      title: '',
      description: '',
      scope: '',
      methodology: 'ISO_27005_NIST_800_30',
      ownerId: operators[0]?.id || '',
      approverId: operators[1]?.id || '',
      departmentId: '',
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: '',
      nextReviewAt: '',
    }),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const set = (key: string, value: unknown) => setForm((current: any) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        approverId: form.approverId || undefined,
        departmentId: form.departmentId || undefined,
        targetDate: form.targetDate || undefined,
        nextReviewAt: form.nextReviewAt || undefined,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo đợt đánh giá')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="modal risk-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Tạo đợt đánh giá rủi ro</h2>
            <p>Xác định phạm vi, trách nhiệm và chu kỳ rà soát trước khi ghi nhận rủi ro.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="risk-form-grid">
          <label className="wide">
            Tên đợt đánh giá
            <input autoFocus required value={form.title} onChange={e => set('title', e.target.value)} />
          </label>
          <label className="wide">
            Phạm vi đánh giá
            <textarea
              required
              rows={3}
              value={form.scope}
              onChange={e => set('scope', e.target.value)}
              placeholder="Hệ thống, tài sản, dịch vụ, dữ liệu và quy trình nằm trong phạm vi..."
            />
          </label>
          <label>
            Chủ sở hữu
            <select required value={form.ownerId} onChange={e => set('ownerId', e.target.value)}>
              <option value="">Chọn người chịu trách nhiệm</option>
              {operators.map(item => (
                <option value={item.id} key={item.id}>
                  {item.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Người phê duyệt
            <select value={form.approverId} onChange={e => set('approverId', e.target.value)}>
              <option value="">Chỉ định sau</option>
              {operators
                .filter(item => item.id !== form.ownerId)
                .map(item => (
                  <option value={item.id} key={item.id}>
                    {item.fullName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Phòng ban / phạm vi
            <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
              <option value="">Toàn công ty</option>
              {departments.map(item => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phương pháp
            <select value={form.methodology} onChange={e => set('methodology', e.target.value)}>
              <option value="ISO_27005_NIST_800_30">ISO/IEC 27005 + NIST SP 800-30</option>
              <option value="NIST_CSF_2">NIST CSF 2.0</option>
              <option value="INTERNAL">Khung nội bộ</option>
            </select>
          </label>
          <label>
            Ngày bắt đầu
            <input type="date" required value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </label>
          <label>
            Ngày hoàn thành dự kiến
            <input type="date" value={form.targetDate} onChange={e => set('targetDate', e.target.value)} />
          </label>
          <label>
            Ngày rà soát tiếp theo
            <input type="date" value={form.nextReviewAt} onChange={e => set('nextReviewAt', e.target.value)} />
          </label>
          <label>
            Mô tả
            <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
          </label>
          {error && <div className="risk-form-error wide">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn primary" disabled={saving}>
            <Check size={16} />
            {saving ? 'Đang lưu…' : 'Tạo đợt đánh giá'}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * ISO/IEC 27001:2022 §6.1.2(a) requires the risk criteria to be documented information. This renders
 * exactly what the API serves, so what an auditor reads on screen is what the API used to score.
 */
function CriteriaModal({ criteria, onClose }: { criteria: Criteria; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="modal risk-criteria-modal">
        <div className="modal-head">
          <div>
            <h2>Tiêu chí đánh giá rủi ro</h2>
            <p>{criteria.methodology}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="risk-criteria-body">
          <section>
            <h3>Thang xác suất</h3>
            <table className="risk-criteria-table">
              <thead>
                <tr>
                  <th>Mức</th>
                  <th>Tên gọi</th>
                  <th>Định nghĩa</th>
                </tr>
              </thead>
              <tbody>
                {criteria.likelihoodScale.map(item => (
                  <tr key={item.value}>
                    <td>
                      <b>{item.value}</b>
                    </td>
                    <td>{item.label}</td>
                    <td>{item.definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h3>Thang ảnh hưởng</h3>
            <p className="risk-criteria-hint">
              Kịch bản lấy mức cao nhất mà nó chạm tới ở bất kỳ khía cạnh nào, không lấy trung bình.
            </p>
            <div className="risk-table-wrap">
              <table className="risk-criteria-table">
                <thead>
                  <tr>
                    <th>Mức</th>
                    <th>Tên gọi</th>
                    {criteria.impactDimensions.map(dimension => (
                      <th key={dimension}>{dimension}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {criteria.impactScale.map(item => (
                    <tr key={item.value}>
                      <td>
                        <b>{item.value}</b>
                      </td>
                      <td>{item.label}</td>
                      {criteria.impactDimensions.map(dimension => (
                        <td key={dimension}>{item.dimensions[dimension]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h3>Tiêu chí chấp nhận rủi ro</h3>
            <table className="risk-criteria-table">
              <thead>
                <tr>
                  <th>Mức</th>
                  <th>Bắt buộc xử lý</th>
                  <th>Được chấp nhận</th>
                  <th>Thẩm quyền phê duyệt</th>
                  <th>Chu kỳ rà soát</th>
                  <th>Quy định</th>
                </tr>
              </thead>
              <tbody>
                {criteria.acceptanceCriteria.map(item => (
                  <tr key={item.level}>
                    <td>
                      <span className={`risk-level ${item.level.toLowerCase()}`}>{item.label}</span>
                    </td>
                    <td>{item.treatmentRequired ? 'Có' : 'Không'}</td>
                    <td>{item.acceptable ? 'Có' : 'Không'}</td>
                    <td>{item.approver}</td>
                    <td>{item.reviewMonths} tháng</td>
                    <td>{item.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="risk-criteria-source">
            Tiêu chí do máy chủ cung cấp tại <code>GET /api/v1/risk-assessments/criteria</code> và được dùng chung cho
            việc chấm điểm ở API lẫn hiển thị tại đây. Sửa tiêu chí là sửa hệ thống quản lý an toàn thông tin: phải phê
            duyệt lại các đợt đánh giá đang mở.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

function RiskModal({
  assessments,
  operators,
  departments,
  assets,
  criteria,
  onClose,
  onSave,
}: {
  assessments: Assessment[]
  operators: Lookup[]
  departments: Lookup[]
  assets: Asset[]
  criteria?: Criteria
  onClose: () => void
  onSave: (body: any) => Promise<void>
}) {
  const [form, setForm] = useState<any>({
      assessmentId: assessments[0]?.id || '',
      title: '',
      category: 'An toàn thông tin',
      scenario: '',
      threat: '',
      vulnerability: '',
      existingControls: '',
      likelihood: 3,
      impact: 3,
      residualLikelihood: '',
      residualImpact: '',
      treatmentStrategy: 'MITIGATE',
      acceptanceRationale: '',
      ownerId: operators[0]?.id || '',
      departmentId: '',
      dueDate: '',
      nextReviewAt: '',
      assetId: '',
    }),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const set = (key: string, value: unknown) => setForm((current: any) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        likelihood: Number(form.likelihood),
        impact: Number(form.impact),
        residualLikelihood: form.residualLikelihood ? Number(form.residualLikelihood) : undefined,
        residualImpact: form.residualImpact ? Number(form.residualImpact) : undefined,
        acceptanceRationale: form.acceptanceRationale || undefined,
        departmentId: form.departmentId || undefined,
        dueDate: form.dueDate || undefined,
        nextReviewAt: form.nextReviewAt || undefined,
        assetIds: form.assetId ? [form.assetId] : [],
        incidentIds: [],
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể ghi nhận rủi ro')
    } finally {
      setSaving(false)
    }
  }
  const inherent = Number(form.likelihood) * Number(form.impact),
    inherentLevel = cellLevel(criteria, Number(form.likelihood), Number(form.impact)),
    residual =
      form.residualLikelihood && form.residualImpact
        ? Number(form.residualLikelihood) * Number(form.residualImpact)
        : 0,
    residualLevel =
      form.residualLikelihood && form.residualImpact
        ? cellLevel(criteria, Number(form.residualLikelihood), Number(form.residualImpact))
        : undefined,
    residualRule = residualLevel ? criteria?.acceptanceCriteria.find(item => item.level === residualLevel) : undefined
  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="modal risk-modal risk-item-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Ghi nhận rủi ro CNTT</h2>
            <p>Mô tả theo kịch bản: tài sản/phạm vi – mối đe dọa – điểm yếu – ảnh hưởng.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="risk-form-grid">
          <label>
            Đợt đánh giá
            <select required value={form.assessmentId} onChange={e => set('assessmentId', e.target.value)}>
              {assessments
                .filter(item => !['CLOSED', 'CANCELLED'].includes(item.status))
                .map(item => (
                  <option value={item.id} key={item.id}>
                    {item.assessmentNo} · {item.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Nhóm rủi ro
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              {[
                'An toàn thông tin',
                'Hạ tầng mạng',
                'Phần cứng',
                'Phần mềm',
                'Dịch vụ số',
                'Dữ liệu',
                'Nhà cung cấp',
                'Liên tục kinh doanh',
                'Tuân thủ',
                'Khác',
              ].map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Tiêu đề rủi ro
            <input autoFocus required value={form.title} onChange={e => set('title', e.target.value)} />
          </label>
          <label className="wide">
            Kịch bản rủi ro
            <textarea
              required
              rows={2}
              value={form.scenario}
              onChange={e => set('scenario', e.target.value)}
              placeholder="Điều gì có thể xảy ra và gây ra kết quả nào?"
            />
          </label>
          <label>
            Mối đe dọa
            <textarea required rows={2} value={form.threat} onChange={e => set('threat', e.target.value)} />
          </label>
          <label>
            Điểm yếu / lỗ hổng
            <textarea
              required
              rows={2}
              value={form.vulnerability}
              onChange={e => set('vulnerability', e.target.value)}
            />
          </label>
          <label className="wide">
            Biện pháp kiểm soát hiện có
            <textarea rows={2} value={form.existingControls} onChange={e => set('existingControls', e.target.value)} />
          </label>
          <h3 className="wide">Đánh giá rủi ro vốn có</h3>
          <label>
            Xác suất (1–5)
            <select value={form.likelihood} onChange={e => set('likelihood', e.target.value)}>
              {[1, 2, 3, 4, 5].map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Ảnh hưởng (1–5)
            <select value={form.impact} onChange={e => set('impact', e.target.value)}>
              {[1, 2, 3, 4, 5].map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className={`risk-score-preview ${(inherentLevel || '').toLowerCase()}`}>
            <span>Rủi ro vốn có</span>
            <b>{inherentLevel ? `${inherent} · ${levelLabels[inherentLevel]}` : `${inherent}`}</b>
          </div>
          <label>
            Chiến lược
            <select value={form.treatmentStrategy} onChange={e => set('treatmentStrategy', e.target.value)}>
              {Object.entries(strategyLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <h3 className="wide">Rủi ro còn lại sau kiểm soát</h3>
          <label>
            Xác suất còn lại
            <select value={form.residualLikelihood} onChange={e => set('residualLikelihood', e.target.value)}>
              <option value="">Chưa đánh giá</option>
              {[1, 2, 3, 4, 5].map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Ảnh hưởng còn lại
            <select value={form.residualImpact} onChange={e => set('residualImpact', e.target.value)}>
              <option value="">Chưa đánh giá</option>
              {[1, 2, 3, 4, 5].map(item => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className={`risk-score-preview ${(residualLevel || '').toLowerCase()}`}>
            <span>Rủi ro còn lại</span>
            <b>{residualLevel ? `${residual} · ${levelLabels[residualLevel]}` : 'Chưa đánh giá'}</b>
            {residualRule && !residualRule.acceptable && <small>{residualRule.rule}</small>}
          </div>
          <label>
            Chủ sở hữu
            <select required value={form.ownerId} onChange={e => set('ownerId', e.target.value)}>
              {operators.map(item => (
                <option value={item.id} key={item.id}>
                  {item.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phòng ban
            <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
              <option value="">Toàn công ty</option>
              {departments.map(item => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tài sản liên quan
            <select value={form.assetId} onChange={e => set('assetId', e.target.value)}>
              <option value="">Không gắn tài sản cụ thể</option>
              {assets
                .filter(item => item.apiId)
                .map(item => (
                  <option value={item.apiId} key={item.apiId}>
                    {item.code} · {item.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Hạn xử lý
            <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </label>
          {form.treatmentStrategy === 'ACCEPT' && (
            <label className="wide">
              Lý do chấp nhận
              <textarea
                required
                rows={2}
                value={form.acceptanceRationale}
                onChange={e => set('acceptanceRationale', e.target.value)}
              />
            </label>
          )}
          {error && <div className="risk-form-error wide">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn primary" disabled={saving}>
            <Plus size={16} />
            {saving ? 'Đang lưu…' : 'Ghi nhận rủi ro'}
          </button>
        </div>
      </form>
    </div>
  )
}

function RiskDetail({
  risk,
  operators,
  criteria,
  onClose,
  addControl,
  addTreatment,
  completeTreatment,
  reviewRisk,
}: {
  risk: Risk
  operators: Lookup[]
  criteria?: Criteria
  onClose: () => void
  addControl: (id: string, body: any) => Promise<void>
  addTreatment: (id: string, body: any) => Promise<void>
  completeTreatment: (id: string, treatment: Treatment) => Promise<void>
  reviewRisk: (id: string, decision: 'ACCEPT_RESIDUAL' | 'CLOSE', note: string) => Promise<void>
}) {
  const [control, setControl] = useState({ controlCode: '', title: '', framework: 'ISO/IEC 27001', status: 'PLANNED' }),
    [treatment, setTreatment] = useState({ title: '', assigneeId: operators[0]?.id || '', dueDate: '' }),
    [reviewNote, setReviewNote] = useState(''),
    [message, setMessage] = useState('')
  const residualRule = risk.residualLevel
    ? criteria?.acceptanceCriteria.find(item => item.level === risk.residualLevel)
    : undefined
  const decided = risk.status === 'ACCEPTED' || risk.status === 'CLOSED'
  // The API is the authority on all three conditions; mirroring them here only keeps the button from
  // offering an action that is certain to be refused.
  const canAccept = Boolean(residualRule?.acceptable && risk.residualLevel && risk.acceptanceRationale)
  const submitReview = async (decision: 'ACCEPT_RESIDUAL' | 'CLOSE') => {
    try {
      await reviewRisk(risk.id, decision, reviewNote)
      setReviewNote('')
      setMessage(decision === 'ACCEPT_RESIDUAL' ? 'Đã ghi nhận chấp nhận rủi ro còn lại.' : 'Đã đóng hồ sơ rủi ro.')
    } catch (error) {
      setMessage(apiMessage(error))
    }
  }
  const saveControl = async () => {
    if (!control.title.trim()) return
    try {
      await addControl(risk.id, control)
      setControl({ controlCode: '', title: '', framework: 'ISO/IEC 27001', status: 'PLANNED' })
      setMessage('Đã bổ sung biện pháp kiểm soát.')
    } catch (error) {
      setMessage(apiMessage(error))
    }
  }
  const saveTreatment = async () => {
    if (!treatment.title.trim() || !treatment.assigneeId || !treatment.dueDate) return
    try {
      await addTreatment(risk.id, treatment)
      setTreatment({ title: '', assigneeId: operators[0]?.id || '', dueDate: '' })
      setMessage('Đã giao hành động xử lý.')
    } catch (error) {
      setMessage(apiMessage(error))
    }
  }
  return (
    <div className="risk-detail-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="risk-detail">
        <header>
          <div>
            <span className={`risk-level ${risk.inherentLevel.toLowerCase()}`}>
              {risk.inherentScore} · {levelLabels[risk.inherentLevel]}
            </span>
            <small>
              {risk.riskNo} · {risk.assessment.assessmentNo}
            </small>
            <h2>{risk.title}</h2>
            <p>
              {risk.category} · Chủ sở hữu: {risk.owner.fullName}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="risk-detail-body">
          <section>
            <h3>Kịch bản và phạm vi</h3>
            <dl>
              <div>
                <dt>Trạng thái</dt>
                <dd>{statusLabels[risk.status]}</dd>
              </div>
              <div>
                <dt>Chiến lược</dt>
                <dd>{strategyLabels[risk.treatmentStrategy]}</dd>
              </div>
              <div>
                <dt>Hạn xử lý</dt>
                <dd>{date(risk.dueDate)}</dd>
              </div>
              <div>
                <dt>Rà soát tiếp theo</dt>
                <dd>{date(risk.nextReviewAt)}</dd>
              </div>
            </dl>
            <article>
              <b>Kịch bản rủi ro</b>
              <p>{risk.scenario}</p>
            </article>
            <article>
              <b>Mối đe dọa</b>
              <p>{risk.threat}</p>
            </article>
            <article>
              <b>Điểm yếu / lỗ hổng</b>
              <p>{risk.vulnerability}</p>
            </article>
            <article>
              <b>Kiểm soát hiện có</b>
              <p>{risk.existingControls || 'Chưa ghi nhận'}</p>
            </article>
            {risk.assets.length > 0 && (
              <article>
                <b>Tài sản liên quan</b>
                {risk.assets.map(item => (
                  <p key={item.asset.id}>
                    {item.asset.assetTag} · {item.asset.name}
                  </p>
                ))}
              </article>
            )}
          </section>
          <section className="risk-score-detail">
            <h3>Đánh giá rủi ro</h3>
            <div>
              <span>
                <small>Vốn có</small>
                <b className={risk.inherentLevel.toLowerCase()}>{risk.inherentScore}</b>
                <em>
                  Xác suất {risk.likelihood} × Ảnh hưởng {risk.impact}
                </em>
              </span>
              <ChevronRight />
              <span>
                <small>Còn lại</small>
                <b className={(risk.residualLevel || 'LOW').toLowerCase()}>{risk.residualScore || '—'}</b>
                <em>
                  {risk.residualScore
                    ? `Xác suất ${risk.residualLikelihood} × Ảnh hưởng ${risk.residualImpact}`
                    : 'Chưa đánh giá'}
                </em>
              </span>
            </div>
            <h3>Biện pháp kiểm soát</h3>
            {risk.controls.map(item => (
              <article key={item.id}>
                <b>
                  {item.controlCode && `${item.controlCode} · `}
                  {item.title}
                </b>
                <span>
                  {item.framework || 'Nội bộ'} · {item.status}
                  {item.effectiveness !== undefined && ` · Hiệu lực ${item.effectiveness}%`}
                </span>
              </article>
            ))}
            <div className="risk-inline-form">
              <input
                value={control.controlCode}
                onChange={e => setControl({ ...control, controlCode: e.target.value })}
                placeholder="Mã kiểm soát"
              />
              <input
                value={control.title}
                onChange={e => setControl({ ...control, title: e.target.value })}
                placeholder="Tên biện pháp kiểm soát"
              />
              <button className="btn secondary" onClick={() => void saveControl()}>
                Thêm kiểm soát
              </button>
            </div>
          </section>
          <section>
            <h3>Kế hoạch xử lý</h3>
            {risk.treatments.map(item => (
              <article className="risk-treatment" key={item.id}>
                <div>
                  <b>{item.title}</b>
                  <span>
                    {item.assignee.fullName} · Hạn {date(item.dueDate)}
                  </span>
                  <progress max="100" value={item.progress} />
                </div>
                <strong>{item.progress}%</strong>
                {item.status !== 'COMPLETED' && (
                  <button className="btn secondary" onClick={() => void completeTreatment(risk.id, item)}>
                    Hoàn tất
                  </button>
                )}
              </article>
            ))}
            <div className="risk-treatment-form">
              <input
                value={treatment.title}
                onChange={e => setTreatment({ ...treatment, title: e.target.value })}
                placeholder="Hành động giảm thiểu / xử lý"
              />
              <select
                value={treatment.assigneeId}
                onChange={e => setTreatment({ ...treatment, assigneeId: e.target.value })}
              >
                <option value="">Chọn người xử lý</option>
                {operators.map(item => (
                  <option value={item.id} key={item.id}>
                    {item.fullName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={treatment.dueDate}
                onChange={e => setTreatment({ ...treatment, dueDate: e.target.value })}
              />
              <button className="btn primary" onClick={() => void saveTreatment()}>
                <Plus size={15} />
                Giao xử lý
              </button>
            </div>
            {message && <p className="risk-detail-message">{message}</p>}
          </section>
          <section className="risk-acceptance">
            <h3>Chấp nhận rủi ro còn lại</h3>
            {!residualRule ? (
              <p className="risk-acceptance-note">
                Chưa chấm điểm rủi ro còn lại. Phải có mức rủi ro còn lại trước khi trình phê duyệt theo ISO/IEC 27001
                §8.3.
              </p>
            ) : (
              <>
                <p className="risk-acceptance-note">
                  Mức còn lại{' '}
                  <span className={`risk-level ${residualRule.level.toLowerCase()}`}>{residualRule.label}</span> · thẩm
                  quyền: {residualRule.approver} · rà soát mỗi {residualRule.reviewMonths} tháng.
                </p>
                <p className="risk-acceptance-rule">{residualRule.rule}</p>
              </>
            )}
            {decided ? (
              <p className="risk-acceptance-note">
                Hồ sơ đã ở trạng thái {statusLabels[risk.status]}, không cần quyết định thêm.
              </p>
            ) : (
              <>
                <textarea
                  rows={2}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  placeholder="Căn cứ phê duyệt: biện pháp đã áp dụng, lý do chấp nhận hoặc lý do đóng hồ sơ"
                />
                <div className="risk-acceptance-actions">
                  <button
                    className="btn primary"
                    disabled={!canAccept || !reviewNote.trim()}
                    title={
                      residualRule && !residualRule.acceptable
                        ? residualRule.rule
                        : !risk.acceptanceRationale
                          ? 'Cần ghi lý do chấp nhận trong hồ sơ rủi ro trước'
                          : undefined
                    }
                    onClick={() => void submitReview('ACCEPT_RESIDUAL')}
                  >
                    <Check size={15} />
                    Chấp nhận rủi ro còn lại
                  </button>
                  <button
                    className="btn secondary"
                    disabled={!reviewNote.trim()}
                    onClick={() => void submitReview('CLOSE')}
                  >
                    Đóng hồ sơ
                  </button>
                </div>
                <small className="risk-acceptance-note">
                  Chủ sở hữu rủi ro không được tự phê duyệt. Quyết định được ghi vào nhật ký kiểm toán.
                </small>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
