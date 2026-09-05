import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Globe2,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import { api, ApiError } from '../../services/api-client'

type Kind = 'LICENSE' | 'SSL_CERTIFICATE' | 'DOMAIN'
type Status = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'SUSPENDED' | 'RETIRED'
interface Assignment {
  id: string
  quantity: number
  status: 'ACTIVE' | 'REVOKED'
  assignedAt: string
  person?: { id: string; fullName: string; email?: string }
  asset?: { id: string; assetTag: string; name: string }
  department?: { id: string; name: string }
  actor?: { fullName: string }
}
interface Renewal {
  id: string
  renewalDate: string
  previousExpiryDate: string
  newExpiryDate: string
  amount?: number
  currency: string
  actor?: { fullName: string }
}
interface MicrosoftAssignment {
  id: string
  externalUserId: string
  userPrincipalName: string
  displayName?: string
  assignedByGroup?: string
  assignmentState?: string
  assignmentError?: string
  person?: { id: string; fullName: string; email?: string }
}
interface Entitlement {
  id: string
  code: string
  name: string
  type: Kind
  status: Status
  productName?: string
  domainName?: string
  commonName?: string
  registrar?: string
  issuer?: string
  licenseMetric?: string
  totalQuantity: number
  assignedQuantity?: number
  expiryDate?: string
  remainingDays?: number | null
  externalProvider?: string
  externalAssignedQuantity?: number
  externalAvailableQuantity?: number
  externalLastSyncedAt?: string
  renewalCost?: number
  currency: string
  autoRenew: boolean
  vendor?: { name: string }
  ownerDepartment?: { name: string }
  owner?: { fullName: string }
  assignments?: Assignment[]
  microsoftAssignments?: MicrosoftAssignment[]
  renewals?: Renewal[]
  alerts?: unknown[]
}
interface Summary {
  total: number
  licenses: number
  certificates: number
  domains: number
  expiring30: number
  expired: number
  assignedSeats: number
  totalSeats: number
  openAlerts: number
  forecastCost: number
}
interface Alert {
  id: string
  status: string
  thresholdDays: number
  dueDate: string
  entitlement: {
    id: string
    code: string
    name: string
    type: Kind
    expiryDate: string
  }
}
interface Person {
  id: string
  fullName: string
  email?: string
  department?: { name: string }
}
interface Policy {
  type: Kind
  enabled: boolean
  warningDays: number[]
  overdueEscalationDays: number[]
  recipients: string[]
  notifyOwner: boolean
}
interface DirectoryConfiguration {
  provider: 'M365'
  enabled: boolean
  tenantId?: string
  clientId?: string
  hasSecret?: boolean
  schedule: string
  syncDisabled: boolean
  syncLicenses: boolean
  groupMapping?: string
  departmentAttribute: string
  emailAttribute: string
  employeeCodeAttribute: string
  usernameAttribute: string
  lastLicenseSyncAt?: string
  lastLicenseSyncStatus?: string
  lastLicenseSyncMessage?: string
}
interface EmailConfiguration {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  secure: boolean
  username?: string
  password?: string
  fromName: string
  fromAddress: string
  replyTo?: string
  hasPassword?: boolean
  lastTestAt?: string
  lastTestOk?: boolean
  lastTestMessage?: string
}
type View = 'ALL' | Kind | 'ALERTS'

const kinds: Record<Kind, { label: string; icon: typeof KeyRound }> = {
  LICENSE: { label: 'License', icon: KeyRound },
  SSL_CERTIFICATE: { label: 'Chứng thư SSL', icon: ShieldCheck },
  DOMAIN: { label: 'Tên miền', icon: Globe2 },
}
const statuses: Record<Status, string> = {
  ACTIVE: 'Đang hiệu lực',
  EXPIRING: 'Sắp hết hạn',
  EXPIRED: 'Hết hạn',
  SUSPENDED: 'Tạm dừng',
  RETIRED: 'Ngừng sử dụng',
}
const money = (value: number, currency = 'VND') =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0)
const date = (value?: string) => (value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa khai báo')
const errorText = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Không thể kết nối dịch vụ License & Gia hạn.'
const demo: Entitlement[] = [
  {
    id: 'l1',
    code: 'LIC-M365-001',
    name: 'Microsoft 365 Business Premium',
    type: 'LICENSE',
    status: 'ACTIVE',
    productName: 'Microsoft 365',
    licenseMetric: 'User / tháng',
    totalQuantity: 120,
    assignedQuantity: 96,
    expiryDate: '2026-12-31',
    remainingDays: 128,
    renewalCost: 432000000,
    currency: 'VND',
    autoRenew: false,
    vendor: { name: 'Microsoft CSP' },
  },
  {
    id: 's1',
    code: 'SSL-PORTAL-001',
    name: 'SSL portal.company.vn',
    type: 'SSL_CERTIFICATE',
    status: 'EXPIRING',
    commonName: 'portal.company.vn',
    issuer: "Let's Encrypt",
    totalQuantity: 1,
    assignedQuantity: 0,
    expiryDate: '2026-09-08',
    remainingDays: 14,
    renewalCost: 0,
    currency: 'VND',
    autoRenew: true,
  },
  {
    id: 'd1',
    code: 'DOM-COMPANY-001',
    name: 'company.vn',
    type: 'DOMAIN',
    status: 'EXPIRING',
    domainName: 'company.vn',
    registrar: 'Nhà đăng ký tên miền',
    totalQuantity: 1,
    assignedQuantity: 0,
    expiryDate: '2026-09-24',
    remainingDays: 30,
    renewalCost: 450000,
    currency: 'VND',
    autoRenew: false,
  },
]

export function RenewalManagement({ demoMode, role }: { demoMode: boolean; role: string }) {
  const [items, setItems] = useState<Entitlement[]>(demoMode ? demo : []),
    [summary, setSummary] = useState<Summary>({
      total: 3,
      licenses: 1,
      certificates: 1,
      domains: 1,
      expiring30: 2,
      expired: 0,
      assignedSeats: 96,
      totalSeats: 120,
      openAlerts: 2,
      forecastCost: 450000,
    }),
    [alerts, setAlerts] = useState<Alert[]>([]),
    [policies, setPolicies] = useState<Policy[]>([]),
    [view, setView] = useState<View>('ALL'),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState<Entitlement>(),
    [create, setCreate] = useState(false),
    [configuring, setConfiguring] = useState(false),
    [m365Configuring, setM365Configuring] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [people, setPeople] = useState<Person[]>([]),
    [assigning, setAssigning] = useState(false),
    [renewing, setRenewing] = useState(false)
  const load = async () => {
    if (demoMode) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (view !== 'ALL' && view !== 'ALERTS') params.set('type', view)
      const [list, stats, notices, rules] = await Promise.all([
        api.get<Entitlement[]>(`/renewals?${params}`),
        api.get<Summary>('/renewals/summary'),
        api.get<Alert[]>('/renewals/alerts'),
        api.get<Policy[]>('/renewals/policies'),
      ])
      setItems(list)
      setSummary(stats)
      setAlerts(notices)
      setPolicies(rules)
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [demoMode, view, search])
  useEffect(() => {
    if (demoMode) {
      setPeople([
        {
          id: 'p1',
          fullName: 'Nguyễn Minh Anh',
          email: 'minhanh@company.vn',
          department: { name: 'Marketing' },
        },
        {
          id: 'p2',
          fullName: 'Trần Đức Long',
          email: 'duclong@company.vn',
          department: { name: 'IT' },
        },
      ])
      return
    }
    void api
      .get<{ items: Person[] }>('/people?page=1&limit=200')
      .then(result => setPeople(result.items))
      .catch(() => undefined)
  }, [demoMode])
  const filtered = useMemo(
    () =>
      items
        .filter(item => view === 'ALL' || view === 'ALERTS' || item.type === view)
        .filter(item =>
          `${item.code} ${item.name} ${item.domainName || ''} ${item.commonName || ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
    [items, view, search],
  )
  const open = async (item: Entitlement) => {
    if (demoMode) {
      setSelected(item)
      return
    }
    try {
      setSelected(await api.get<Entitlement>(`/renewals/${item.id}`))
    } catch (reason) {
      setError(errorText(reason))
    }
  }
  const save = async (body: any) => {
    try {
      if (demoMode) {
        setItems(current => [
          {
            ...body,
            id: `demo-${Date.now()}`,
            status: 'ACTIVE',
            assignedQuantity: 0,
            remainingDays: Math.ceil((new Date(body.expiryDate).getTime() - Date.now()) / 86400000),
            currency: 'VND',
          },
          ...current,
        ])
        setCreate(false)
        return
      }
      await api.post('/renewals', body)
      setCreate(false)
      await load()
    } catch (reason) {
      throw new Error(errorText(reason), { cause: reason })
    }
  }
  const assign = async (personId: string, quantity: number) => {
    if (!selected) return
    if (demoMode) {
      setSelected({
        ...selected,
        assignedQuantity: (selected.assignedQuantity || 0) + quantity,
      })
      setAssigning(false)
      return
    }
    await api.post(`/renewals/${selected.id}/assignments`, {
      personId,
      quantity,
    })
    setSelected(await api.get(`/renewals/${selected.id}`))
    setAssigning(false)
    await load()
  }
  const revoke = async (id: string) => {
    if (!confirm('Thu hồi license này? Giao dịch sẽ được lưu vào lịch sử.')) return
    if (demoMode) {
      setSelected(value =>
        value
          ? {
              ...value,
              assignments: value.assignments?.map(x => (x.id === id ? { ...x, status: 'REVOKED' } : x)),
            }
          : value,
      )
      return
    }
    await api.post(`/renewals/assignments/${id}/revoke`, {
      reason: 'Thu hồi bởi IT Manager',
    })
    if (selected) setSelected(await api.get(`/renewals/${selected.id}`))
    await load()
  }
  const renew = async (newExpiryDate: string, amount: number) => {
    if (!selected) return
    if (demoMode) {
      setItems(current =>
        current.map(x =>
          x.id === selected.id
            ? {
                ...x,
                expiryDate: newExpiryDate,
                status: 'ACTIVE',
                renewalCost: amount,
              }
            : x,
        ),
      )
      setSelected({
        ...selected,
        expiryDate: newExpiryDate,
        status: 'ACTIVE',
        renewalCost: amount,
      })
      setRenewing(false)
      return
    }
    if (selected.expiryDate)
      await api.post(`/renewals/${selected.id}/renew`, {
        newExpiryDate,
        amount,
        currency: selected.currency || 'VND',
      })
    else
      await api.patch(`/renewals/${selected.id}/contract`, {
        expiryDate: newExpiryDate,
        renewalCost: amount,
      })
    setRenewing(false)
    setSelected(await api.get(`/renewals/${selected.id}`))
    await load()
  }
  return (
    <div className="renewal-page">
      <header className="renewal-heading">
        <div>
          <span>IT SERVICE PORTFOLIO · ITIL</span>
          <h1>License, SSL & Domain</h1>
          <p>Quản lý quyền sử dụng, cấp phát seat, thu hồi và lịch gia hạn dịch vụ số.</p>
        </div>
        <div className="renewal-heading-actions">
          {role === 'Admin' && (
            <>
              <button onClick={() => setM365Configuring(true)}>
                <Cloud size={16} /> Microsoft 365
              </button>
              <button onClick={() => setConfiguring(true)}>
                <Settings2 size={16} /> Cảnh báo
              </button>
            </>
          )}
          <button className="primary" onClick={() => setCreate(true)}>
            <Plus size={17} /> Thêm mới
          </button>
        </div>
      </header>
      {error && <div className="renewal-error">{error}</div>}
      <section className="renewal-kpis">
        <Kpi
          icon={KeyRound}
          label="License seat"
          value={`${summary.assignedSeats}/${summary.totalSeats}`}
          detail={`${summary.licenses} gói license`}
        />
        <Kpi icon={ShieldCheck} label="SSL" value={summary.certificates} detail="Chứng thư đang quản lý" />
        <Kpi icon={Globe2} label="Domain" value={summary.domains} detail="Tên miền đang quản lý" />
        <Kpi
          icon={CalendarClock}
          label="Hết hạn trong 30 ngày"
          value={summary.expiring30}
          detail="Cần lập kế hoạch gia hạn"
          tone="amber"
        />
        <Kpi
          icon={AlertTriangle}
          label="Cảnh báo mở"
          value={summary.openAlerts}
          detail={`${money(summary.forecastCost)} dự kiến 90 ngày`}
          tone="red"
        />
      </section>
      <div className="renewal-tabs">
        {(
          [
            ['ALL', 'Tất cả'],
            ['LICENSE', 'License'],
            ['SSL_CERTIFICATE', 'SSL'],
            ['DOMAIN', 'Domain'],
            ['ALERTS', 'Cảnh báo'],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button className={view === id ? 'active' : ''} onClick={() => setView(id)} key={id}>
            {label}
            {id === 'ALERTS' && summary.openAlerts > 0 ? <b>{summary.openAlerts}</b> : null}
          </button>
        ))}
      </div>
      {view === 'ALERTS' ? (
        <AlertRegister
          alerts={
            demoMode
              ? [
                  {
                    id: 'a1',
                    status: 'OPEN',
                    thresholdDays: 14,
                    dueDate: '2026-09-08',
                    entitlement: {
                      id: 's1',
                      code: 'SSL-PORTAL-001',
                      name: 'SSL portal.company.vn',
                      type: 'SSL_CERTIFICATE',
                      expiryDate: '2026-09-08',
                    },
                  },
                  {
                    id: 'a2',
                    status: 'OPEN',
                    thresholdDays: 30,
                    dueDate: '2026-09-24',
                    entitlement: {
                      id: 'd1',
                      code: 'DOM-COMPANY-001',
                      name: 'company.vn',
                      type: 'DOMAIN',
                      expiryDate: '2026-09-24',
                    },
                  },
                ]
              : alerts
          }
          onOpen={id => {
            const item = items.find(x => x.id === id)
            if (item) void open(item)
          }}
        />
      ) : (
        <section className="renewal-register">
          <div className="renewal-toolbar">
            <div>
              <Search size={16} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm mã, tên sản phẩm, domain hoặc common name..."
              />
            </div>
            <span>{loading ? 'Đang tải...' : `${filtered.length} bản ghi`}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>MÃ / TÊN</th>
                <th>LOẠI</th>
                <th>CẤP PHÁT</th>
                <th>CHỦ SỞ HỮU / NCC</th>
                <th>NGÀY HẾT HẠN</th>
                <th>TRẠNG THÁI</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const Icon = kinds[item.type].icon
                return (
                  <tr key={item.id} onClick={() => void open(item)}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        {item.code} · {item.domainName || item.commonName || item.productName || '—'}
                      </small>
                    </td>
                    <td>
                      <span className="renewal-kind">
                        <Icon size={15} />
                        {kinds[item.type].label}
                      </span>
                    </td>
                    <td>
                      {item.type === 'LICENSE' ? (
                        <>
                          <b>
                            {item.externalAssignedQuantity ?? item.assignedQuantity ?? 0}/{item.totalQuantity}
                          </b>
                          <small>{item.licenseMetric || 'seat'}</small>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {item.ownerDepartment?.name || item.owner?.fullName || 'IT'}
                      <small>{item.vendor?.name || 'Chưa gán nhà cung cấp'}</small>
                    </td>
                    <td>
                      <b>{date(item.expiryDate)}</b>
                      <small className={(item.remainingDays ?? 999) <= 30 ? 'danger' : ''}>
                        {item.remainingDays != null
                          ? item.remainingDays < 0
                            ? `Quá hạn ${Math.abs(item.remainingDays)} ngày`
                            : `Còn ${item.remainingDays} ngày`
                          : '—'}
                      </small>
                    </td>
                    <td>
                      <span className={`renewal-status ${item.status.toLowerCase()}`}>{statuses[item.status]}</span>
                    </td>
                    <td>
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="renewal-empty">
                    Không có dữ liệu phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      {create && <CreateDialog onClose={() => setCreate(false)} onSave={save} />}{' '}
      {configuring && (
        <PolicyDialog
          policies={policies}
          demoMode={demoMode}
          onClose={() => setConfiguring(false)}
          onSaved={async () => {
            setConfiguring(false)
            await load()
          }}
        />
      )}{' '}
      {m365Configuring && (
        <Microsoft365Dialog
          demoMode={demoMode}
          onClose={() => setM365Configuring(false)}
          onSynced={async () => {
            setM365Configuring(false)
            await load()
          }}
        />
      )}{' '}
      {selected && (
        <Detail
          item={selected}
          onClose={() => setSelected(undefined)}
          onAssign={() => setAssigning(true)}
          onRenew={() => setRenewing(true)}
          onRevoke={revoke}
        />
      )}{' '}
      {assigning && selected && (
        <AssignDialog
          people={people}
          available={
            selected.totalQuantity -
            (selected.assignedQuantity ||
              selected.assignments?.filter(x => x.status === 'ACTIVE').reduce((s, x) => s + x.quantity, 0) ||
              0)
          }
          onClose={() => setAssigning(false)}
          onSave={assign}
        />
      )}{' '}
      {renewing && selected && <RenewDialog item={selected} onClose={() => setRenewing(false)} onSave={renew} />}
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'blue',
}: {
  icon: typeof KeyRound
  label: string
  value: string | number
  detail: string
  tone?: string
}) {
  return (
    <button className={`renewal-kpi ${tone}`}>
      <span>
        <Icon size={19} />
      </span>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <em>{detail}</em>
      </div>
    </button>
  )
}
function AlertRegister({ alerts, onOpen }: { alerts: Alert[]; onOpen: (id: string) => void }) {
  return (
    <section className="renewal-register">
      <div className="renewal-section-title">
        <div>
          <h2>Trung tâm cảnh báo gia hạn</h2>
          <p>Cảnh báo được lưu và theo dõi cho đến khi hoàn tất gia hạn.</p>
        </div>
        <Bell size={20} />
      </div>
      <table>
        <thead>
          <tr>
            <th>ĐỐI TƯỢNG</th>
            <th>LOẠI</th>
            <th>NGƯỠNG CẢNH BÁO</th>
            <th>HẠN</th>
            <th>TRẠNG THÁI</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {alerts.map(item => (
            <tr key={item.id} onClick={() => onOpen(item.entitlement.id)}>
              <td>
                <strong>{item.entitlement.name}</strong>
                <small>{item.entitlement.code}</small>
              </td>
              <td>{kinds[item.entitlement.type].label}</td>
              <td>Trước {item.thresholdDays} ngày</td>
              <td>{date(item.dueDate)}</td>
              <td>
                <span className="renewal-status expiring">Cần xử lý</span>
              </td>
              <td>
                <ChevronRight size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="renewal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <section className="renewal-dialog">
        <header>
          <h2>{title}</h2>
          <button onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
function CreateDialog({ onClose, onSave }: { onClose: () => void; onSave: (body: any) => Promise<void> }) {
  const [type, setType] = useState<Kind>('LICENSE'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  return (
    <Dialog title="Thêm license / SSL / domain" onClose={onClose}>
      <form
        onSubmit={async e => {
          e.preventDefault()
          setBusy(true)
          setMessage('')
          const data = new FormData(e.currentTarget),
            body = Object.fromEntries(data)
          try {
            await onSave({
              ...body,
              type,
              totalQuantity: Number(body.totalQuantity || 1),
              renewalCost: Number(body.renewalCost || 0),
              autoRenew: data.get('autoRenew') === 'on',
              renewalPeriodMonths: 12,
            })
          } catch (reason) {
            setMessage(String(reason))
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="renewal-form-grid">
          <label>
            Loại
            <select name="type" value={type} onChange={e => setType(e.target.value as Kind)}>
              <option value="LICENSE">License</option>
              <option value="SSL_CERTIFICATE">Chứng thư SSL</option>
              <option value="DOMAIN">Tên miền</option>
            </select>
          </label>
          <label>
            Mã quản lý
            <input name="code" required placeholder="VD: LIC-M365-001" />
          </label>
          <label className="wide">
            Tên hiển thị
            <input name="name" required />
          </label>
          {type === 'LICENSE' && (
            <>
              <label>
                Sản phẩm
                <input name="productName" />
              </label>
              <label>
                Tổng số seat
                <input name="totalQuantity" type="number" min="1" defaultValue="1" />
              </label>
            </>
          )}
          {type === 'SSL_CERTIFICATE' && (
            <>
              <label>
                Common name
                <input name="commonName" required placeholder="*.company.vn" />
              </label>
              <label>
                Đơn vị phát hành
                <input name="issuer" />
              </label>
            </>
          )}
          {type === 'DOMAIN' && (
            <>
              <label>
                Tên miền
                <input name="domainName" required placeholder="company.vn" />
              </label>
              <label>
                Nhà đăng ký
                <input name="registrar" />
              </label>
            </>
          )}
          <label>
            Ngày hết hạn
            <input name="expiryDate" required type="date" />
          </label>
          <label>
            Chi phí gia hạn
            <input name="renewalCost" type="number" min="0" defaultValue="0" />
          </label>
          <label className="check">
            <input name="autoRenew" type="checkbox" /> Tự động gia hạn tại nhà cung cấp
          </label>
        </div>
        {message && <div className="renewal-error">{message}</div>}
        <footer>
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Đang lưu...' : 'Lưu hồ sơ'}
          </button>
        </footer>
      </form>
    </Dialog>
  )
}
function Detail({
  item,
  onClose,
  onAssign,
  onRenew,
  onRevoke,
}: {
  item: Entitlement
  onClose: () => void
  onAssign: () => void
  onRenew: () => void
  onRevoke: (id: string) => void
}) {
  const Icon = kinds[item.type].icon,
    active = item.assignments?.filter(x => x.status === 'ACTIVE') || []
  return (
    <Dialog title={item.name} onClose={onClose}>
      <div className="renewal-detail-head">
        <span>
          <Icon size={23} />
        </span>
        <div>
          <b>{item.code}</b>
          <small>
            {kinds[item.type].label} · {statuses[item.status]}
          </small>
        </div>
        <button className="primary" onClick={onRenew}>
          <RefreshCw size={15} /> Gia hạn
        </button>
        {item.type === 'LICENSE' && !item.externalProvider && (
          <button onClick={onAssign}>
            <UserPlus size={15} /> Cấp license
          </button>
        )}
      </div>
      <div className="renewal-facts">
        <div>
          <small>Ngày hết hạn</small>
          <b>{date(item.expiryDate)}</b>
        </div>
        <div>
          <small>Tự động gia hạn</small>
          <b>{item.autoRenew ? 'Có' : 'Không'}</b>
        </div>
        <div>
          <small>Chi phí kỳ tới</small>
          <b>{money(item.renewalCost || 0, item.currency)}</b>
        </div>
        <div>
          <small>Chủ sở hữu</small>
          <b>{item.ownerDepartment?.name || item.owner?.fullName || 'IT'}</b>
        </div>
      </div>
      {item.type === 'LICENSE' && (
        <section className="renewal-subsection">
          <h3>
            Phân bổ license{' '}
            <span>
              {item.externalAssignedQuantity ?? active.reduce((s, x) => s + x.quantity, 0)}/{item.totalQuantity} seat
            </span>
          </h3>
          {item.externalProvider ? (
            item.microsoftAssignments?.length ? (
              item.microsoftAssignments.map(x => (
                <div className="renewal-assignment" key={x.id}>
                  <div>
                    <b>{x.displayName || x.person?.fullName || x.userPrincipalName}</b>
                    <small>
                      {x.userPrincipalName}
                      {x.assignedByGroup ? ` · Qua nhóm ${x.assignedByGroup}` : ' · Gán trực tiếp'}
                    </small>
                  </div>
                  <span className="renewal-status active">{x.assignmentError || x.assignmentState || 'Active'}</span>
                </div>
              ))
            ) : (
              <p className="renewal-empty">Chưa có người dùng được cấp license trong lần đồng bộ gần nhất.</p>
            )
          ) : active.length ? (
            active.map(x => (
              <div className="renewal-assignment" key={x.id}>
                <div>
                  <b>{x.person?.fullName || x.asset?.name || x.department?.name}</b>
                  <small>{x.person?.email || x.asset?.assetTag || `Phòng ban · ${x.quantity} seat`}</small>
                </div>
                <button onClick={() => void onRevoke(x.id)}>
                  <UserMinus size={15} /> Thu hồi
                </button>
              </div>
            ))
          ) : (
            <p className="renewal-empty">Chưa có license đang cấp phát.</p>
          )}
          {item.externalProvider && (
            <p className="renewal-config-help">
              Nguồn: Microsoft 365. Cấp và thu hồi license thực hiện tại Microsoft 365 Admin Center; AssetFlow chỉ đọc
              và đối chiếu.
            </p>
          )}
        </section>
      )}
      <section className="renewal-subsection">
        <h3>Lịch sử gia hạn</h3>
        {item.renewals?.length ? (
          item.renewals.map(x => (
            <div className="renewal-history" key={x.id}>
              <CheckCircle2 size={15} />
              <span>
                {date(x.renewalDate)} · {date(x.previousExpiryDate)} → {date(x.newExpiryDate)}
              </span>
              <b>{money(x.amount || 0, x.currency)}</b>
            </div>
          ))
        ) : (
          <p className="renewal-empty">Chưa có giao dịch gia hạn.</p>
        )}
      </section>
    </Dialog>
  )
}

function Microsoft365Dialog({
  demoMode,
  onClose,
  onSynced,
}: {
  demoMode: boolean
  onClose: () => void
  onSynced: () => Promise<void>
}) {
  const defaults: DirectoryConfiguration = {
    provider: 'M365',
    enabled: false,
    tenantId: '',
    clientId: '',
    schedule: 'EVERY_6_HOURS',
    syncDisabled: false,
    syncLicenses: true,
    groupMapping: 'IT-Asset-Admins = ADMIN\nIT-Asset-Team = IT',
    departmentAttribute: 'department',
    emailAttribute: 'mail',
    employeeCodeAttribute: 'employeeId',
    usernameAttribute: 'userPrincipalName',
  }
  const [value, setValue] = useState<DirectoryConfiguration>(defaults)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (demoMode) return
    void api
      .get<{ data: DirectoryConfiguration[] }>('/directory/configs')
      .then(result => {
        const current = result.data.find(item => item.provider === 'M365')
        if (current) setValue({ ...defaults, ...current })
      })
      .catch(reason => setMessage(errorText(reason)))
  }, [demoMode])
  const save = async () => {
    if (demoMode) return
    await api.put('/directory/configs/M365', {
      enabled: value.enabled,
      tenantId: value.tenantId,
      clientId: value.clientId,
      secret: secret || undefined,
      useTls: true,
      schedule: value.schedule,
      syncDisabled: value.syncDisabled,
      syncLicenses: value.syncLicenses,
      groupMapping: value.groupMapping || '',
      departmentAttribute: value.departmentAttribute,
      emailAttribute: value.emailAttribute,
      employeeCodeAttribute: value.employeeCodeAttribute,
      usernameAttribute: value.usernameAttribute,
    })
  }
  const execute = async (action: 'test' | 'sync') => {
    setBusy(true)
    setMessage('')
    try {
      if (demoMode) {
        setMessage('Chế độ demo không gọi Microsoft Graph.')
        return
      }
      await save()
      const result = await api.post<{ message: string }>(
        action === 'test' ? '/directory/configs/m365/test-licenses' : '/directory/configs/m365/sync-licenses',
        {},
      )
      setMessage(result.message)
      if (action === 'sync') await onSynced()
    } catch (reason) {
      setMessage(errorText(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="Kết nối Microsoft 365 / Entra ID" onClose={onClose}>
      <div className="renewal-policy-note">
        <Cloud size={18} />
        <p>
          Đồng bộ chỉ đọc SKU, số seat đã dùng/còn trống và người được cấp từ Microsoft Graph. Ngày hết hạn hợp đồng và
          chi phí vẫn do IT quản lý trong AssetFlow.
        </p>
      </div>
      <div className="renewal-form-grid renewal-config-form">
        <label>
          Tenant ID
          <input value={value.tenantId || ''} onChange={e => setValue({ ...value, tenantId: e.target.value })} />
        </label>
        <label>
          Application (Client) ID
          <input value={value.clientId || ''} onChange={e => setValue({ ...value, clientId: e.target.value })} />
        </label>
        <label className="wide">
          Client secret {value.hasSecret ? '(đã lưu, để trống nếu không đổi)' : ''}
          <input type="password" autoComplete="new-password" value={secret} onChange={e => setSecret(e.target.value)} />
        </label>
        <label>
          Lịch đồng bộ
          <select value={value.schedule} onChange={e => setValue({ ...value, schedule: e.target.value })}>
            <option value="MANUAL">Thủ công</option>
            <option value="HOURLY">Mỗi giờ</option>
            <option value="EVERY_6_HOURS">Mỗi 6 giờ</option>
            <option value="EVERY_12_HOURS">Mỗi 12 giờ</option>
            <option value="DAILY_02">Hàng ngày lúc 02:00</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={e => setValue({ ...value, enabled: e.target.checked })}
          />{' '}
          Bật đồng bộ Entra ID
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={value.syncLicenses}
            onChange={e => setValue({ ...value, syncLicenses: e.target.checked })}
          />{' '}
          Đồng bộ license cùng lịch người dùng
        </label>
      </div>
      <div className="renewal-config-help">
        Quyền Application cần cấp Admin consent: <b>User.Read.All</b>, <b>GroupMember.Read.All</b> và{' '}
        <b>LicenseAssignment.Read.All</b>. AssetFlow không yêu cầu quyền ghi license.
      </div>
      {value.lastLicenseSyncAt && (
        <div className="renewal-config-status">
          Lần đồng bộ gần nhất: {date(value.lastLicenseSyncAt)} · {value.lastLicenseSyncStatus} ·{' '}
          {value.lastLicenseSyncMessage}
        </div>
      )}
      {message && <div className="renewal-policy-note">{message}</div>}
      <footer>
        <button onClick={onClose}>Đóng</button>
        <button disabled={busy} onClick={() => void execute('test')}>
          Thử kết nối
        </button>
        <button className="primary" disabled={busy} onClick={() => void execute('sync')}>
          {busy ? 'Đang xử lý...' : 'Lưu & đồng bộ ngay'}
        </button>
      </footer>
    </Dialog>
  )
}

function PolicyDialog({
  policies,
  demoMode,
  onClose,
  onSaved,
}: {
  policies: Policy[]
  demoMode: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const defaults: Policy[] = [
    {
      type: 'LICENSE',
      enabled: true,
      warningDays: [90, 60, 30, 14, 7, 1, 0],
      overdueEscalationDays: [1, 3, 7],
      recipients: [],
      notifyOwner: true,
    },
    {
      type: 'SSL_CERTIFICATE',
      enabled: true,
      warningDays: [60, 30, 14, 7, 3, 1, 0],
      overdueEscalationDays: [1, 2, 3],
      recipients: [],
      notifyOwner: true,
    },
    {
      type: 'DOMAIN',
      enabled: true,
      warningDays: [90, 60, 30, 14, 7, 1, 0],
      overdueEscalationDays: [1, 3, 7],
      recipients: [],
      notifyOwner: true,
    },
  ]
  const initial = Object.fromEntries(
    defaults.map(item => [item.type, policies.find(x => x.type === item.type) || item]),
  ) as Record<Kind, Policy>
  const [values, setValues] = useState(initial),
    [email, setEmail] = useState<EmailConfiguration>({
      enabled: false,
      smtpHost: '',
      smtpPort: 587,
      secure: false,
      username: '',
      password: '',
      fromName: 'AssetFlow',
      fromAddress: '',
      replyTo: '',
    }),
    [testRecipient, setTestRecipient] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  useEffect(() => {
    if (demoMode) return
    void api
      .get<EmailConfiguration>('/renewals/notifications/email')
      .then(result => setEmail(current => ({ ...current, ...result, password: '' })))
      .catch(reason => setMessage(errorText(reason)))
  }, [demoMode])
  const change = (type: Kind, patch: Partial<Policy>) =>
    setValues(current => ({
      ...current,
      [type]: { ...current[type], ...patch },
    }))
  const numbers = (text: string) =>
    [
      ...new Set(
        text
          .split(/[,;\s]+/)
          .map(Number)
          .filter(value => Number.isInteger(value) && value >= 0),
      ),
    ].sort((a, b) => b - a)
  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      if (!demoMode) {
        const operations: Promise<unknown>[] = [
          ...(Object.keys(values) as Kind[]).map(type => api.put(`/renewals/policies/${type}`, values[type])),
        ]
        if (email.smtpHost || email.fromAddress || email.enabled)
          operations.push(api.put('/renewals/notifications/email', email))
        await Promise.all(operations)
      }
      await onSaved()
    } catch (reason) {
      setMessage(errorText(reason))
    } finally {
      setBusy(false)
    }
  }
  const testEmail = async () => {
    setBusy(true)
    setMessage('')
    try {
      if (demoMode) {
        setMessage('Chế độ demo không gửi email thật.')
        return
      }
      await api.put('/renewals/notifications/email', email)
      const result = await api.post<{ message: string }>('/renewals/notifications/email/test', {
        recipient: testRecipient,
      })
      setMessage(result.message)
    } catch (reason) {
      setMessage(errorText(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title="Chính sách cảnh báo gia hạn" onClose={onClose}>
      <div className="renewal-policy-note">
        <Bell size={18} />
        <p>Các mốc được tính theo ngày trước hạn. Cảnh báo được lưu trong hệ thống để IT xác nhận và truy vết.</p>
      </div>
      <section className="renewal-policy renewal-email-config">
        <header>
          <b>
            <Mail size={16} /> Kênh gửi email SMTP
          </b>
          <label>
            <input
              type="checkbox"
              checked={email.enabled}
              onChange={e => setEmail({ ...email, enabled: e.target.checked })}
            />{' '}
            Bật gửi email
          </label>
        </header>
        <div className="renewal-form-grid">
          <label>
            SMTP host
            <input
              placeholder="smtp.office365.com"
              value={email.smtpHost}
              onChange={e => setEmail({ ...email, smtpHost: e.target.value })}
            />
          </label>
          <label>
            Cổng
            <input
              type="number"
              min="1"
              max="65535"
              value={email.smtpPort}
              onChange={e => setEmail({ ...email, smtpPort: Number(e.target.value) })}
            />
          </label>
          <label>
            Tài khoản SMTP
            <input value={email.username || ''} onChange={e => setEmail({ ...email, username: e.target.value })} />
          </label>
          <label>
            Mật khẩu {email.hasPassword ? '(đã lưu)' : ''}
            <input
              type="password"
              autoComplete="new-password"
              placeholder={email.hasPassword ? 'Để trống nếu không đổi' : ''}
              value={email.password || ''}
              onChange={e => setEmail({ ...email, password: e.target.value })}
            />
          </label>
          <label>
            Tên người gửi
            <input value={email.fromName} onChange={e => setEmail({ ...email, fromName: e.target.value })} />
          </label>
          <label>
            Email người gửi
            <input
              type="email"
              placeholder="assetflow@company.vn"
              value={email.fromAddress}
              onChange={e => setEmail({ ...email, fromAddress: e.target.value })}
            />
          </label>
          <label className="wide">
            Gửi thư kiểm tra
            <span className="renewal-inline-test">
              <input
                type="email"
                placeholder="it@company.vn"
                value={testRecipient}
                onChange={e => setTestRecipient(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !testRecipient || !email.smtpHost || !email.fromAddress}
                onClick={() => void testEmail()}
              >
                Gửi thử
              </button>
            </span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={email.secure}
              onChange={e => setEmail({ ...email, secure: e.target.checked })}
            />{' '}
            SMTPS trực tiếp (thường dùng cổng 465). Cổng 587 dùng STARTTLS và không chọn mục này.
          </label>
        </div>
        {email.lastTestAt && (
          <div className="renewal-config-status">
            Kiểm tra gần nhất: {date(email.lastTestAt)} · {email.lastTestOk ? 'Thành công' : 'Thất bại'} ·{' '}
            {email.lastTestMessage}
          </div>
        )}
      </section>
      {(Object.keys(values) as Kind[]).map(type => (
        <section className="renewal-policy" key={type}>
          <header>
            <b>{kinds[type].label}</b>
            <label>
              <input
                type="checkbox"
                checked={values[type].enabled}
                onChange={e => change(type, { enabled: e.target.checked })}
              />{' '}
              Bật cảnh báo
            </label>
          </header>
          <div className="renewal-form-grid">
            <label className="wide">
              Nhắc trước (ngày, cách nhau bằng dấu phẩy)
              <input
                value={values[type].warningDays.join(', ')}
                onChange={e => change(type, { warningDays: numbers(e.target.value) })}
              />
            </label>
            <label className="wide">
              Email nhận cảnh báo
              <input
                placeholder="it@company.vn, manager@company.vn"
                value={values[type].recipients.join(', ')}
                onChange={e =>
                  change(type, {
                    recipients: e.target.value
                      .split(/[,;]+/)
                      .map(x => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={values[type].notifyOwner}
                onChange={e => change(type, { notifyOwner: e.target.checked })}
              />{' '}
              Đồng thời thông báo chủ sở hữu
            </label>
          </div>
        </section>
      ))}
      {message && <div className="renewal-error">{message}</div>}
      <footer>
        <button onClick={onClose}>Hủy</button>
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Đang lưu...' : 'Lưu chính sách'}
        </button>
      </footer>
    </Dialog>
  )
}

function AssignDialog({
  people,
  available,
  onClose,
  onSave,
}: {
  people: Person[]
  available: number
  onClose: () => void
  onSave: (personId: string, quantity: number) => Promise<void>
}) {
  const [personId, setPersonId] = useState(''),
    [quantity, setQuantity] = useState(1)
  return (
    <Dialog title="Cấp license" onClose={onClose}>
      <div className="renewal-form-grid">
        <label className="wide">
          Người nhận
          <select value={personId} onChange={e => setPersonId(e.target.value)}>
            <option value="">Chọn nhân sự</option>
            {people.map(x => (
              <option value={x.id} key={x.id}>
                {x.fullName} · {x.department?.name || ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Số lượng
          <input
            type="number"
            min="1"
            max={available}
            value={quantity}
            onChange={e => setQuantity(Number(e.target.value))}
          />
        </label>
        <p>
          Còn khả dụng: <b>{available} seat</b>
        </p>
      </div>
      <footer>
        <button onClick={onClose}>Hủy</button>
        <button
          className="primary"
          disabled={!personId || quantity < 1 || quantity > available}
          onClick={() => void onSave(personId, quantity)}
        >
          Xác nhận cấp
        </button>
      </footer>
    </Dialog>
  )
}
function RenewDialog({
  item,
  onClose,
  onSave,
}: {
  item: Entitlement
  onClose: () => void
  onSave: (date: string, amount: number) => Promise<void>
}) {
  const [expiry, setExpiry] = useState(''),
    [amount, setAmount] = useState(Number(item.renewalCost || 0))
  return (
    <Dialog title={`${item.expiryDate ? 'Gia hạn' : 'Khai báo kỳ hạn'} ${item.name}`} onClose={onClose}>
      <div className="renewal-form-grid">
        <label>
          Hạn hiện tại
          <input value={item.expiryDate?.slice(0, 10) || 'Chưa khai báo'} disabled />
        </label>
        <label>
          Hạn mới
          <input
            type="date"
            min={item.expiryDate?.slice(0, 10)}
            value={expiry}
            onChange={e => setExpiry(e.target.value)}
          />
        </label>
        <label>
          Chi phí
          <input type="number" min="0" value={amount} onChange={e => setAmount(Number(e.target.value))} />
        </label>
      </div>
      <footer>
        <button onClick={onClose}>Hủy</button>
        <button
          className="primary"
          disabled={!expiry || Boolean(item.expiryDate && new Date(expiry) <= new Date(item.expiryDate))}
          onClick={() => void onSave(expiry, amount)}
        >
          {item.expiryDate ? 'Hoàn tất gia hạn' : 'Lưu kỳ hạn hợp đồng'}
        </button>
      </footer>
    </Dialog>
  )
}
