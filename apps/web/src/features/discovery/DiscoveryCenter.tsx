import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Cloud,
  Download,
  HardDrive,
  KeyRound,
  Laptop,
  Link2,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react'
import { api } from '../../services/api-client'

type Role = 'Admin' | 'IT' | 'HCNS' | 'User'
type Lookup = { id: string; code: string; name: string; location?: Lookup }
type DiscoveryStatus = 'PENDING' | 'MATCHED' | 'CONFLICT' | 'LINKED' | 'CREATED' | 'IGNORED'
type AssetReference = {
  id: string
  assetTag: string
  name: string
  serialNumber?: string | null
  macAddress?: string | null
}
type SnapshotPayload = {
  device: {
    hostname: string
    os: { family: string; name: string; version?: string; arch: string }
    hardware: {
      manufacturer?: string
      model?: string
      serial_number?: string
      system_uuid?: string
      cpu_model?: string
      logical_cpus: number
      memory_bytes?: number
      disks?: Array<{ name: string; model?: string; size_bytes?: number }>
    }
    network_interfaces: Array<{ name: string; mac_address?: string; addresses?: string[] }>
  }
}
type InboxItem = {
  id: string
  status: DiscoveryStatus
  matchConfidence: number
  conflictReason?: string | null
  resolutionNote?: string | null
  lastObservedAt: string
  suggestedAsset?: AssetReference | null
  resolvedAsset?: AssetReference | null
  agent: {
    id: string
    agentKey: string
    hostname: string
    fingerprint: string
    siteCode?: string | null
    agentVersion: string
    osFamily: string
    lastSeenAt: string
    linkedAsset?: AssetReference | null
    snapshots: Array<{ id: string; collectedAt: string; payload: SnapshotPayload }>
  }
}
type Summary = { pending: number; matched: number; conflict: number; linked: number; ignored: number; agents: number }
type Downloads = {
  windows: { label: string; url: string }
  linuxAmd64: { label: string; url: string }
  linuxArm64: { label: string; url: string }
  checksums: string
}
type EnrollmentToken = {
  id: string
  name: string
  siteCode?: string | null
  expiresAt: string
  maxEnrollments: number
  enrollmentCount: number
  revokedAt?: string | null
}

const labels: Record<DiscoveryStatus, string> = {
  PENDING: 'Chờ xác nhận',
  MATCHED: 'Có gợi ý khớp',
  CONFLICT: 'Xung đột',
  LINKED: 'Đã liên kết',
  CREATED: 'Đã tạo tài sản',
  IGNORED: 'Đã bỏ qua',
}
const statusClass: Record<DiscoveryStatus, string> = {
  PENDING: 'pending',
  MATCHED: 'matched',
  CONFLICT: 'conflict',
  LINKED: 'linked',
  CREATED: 'created',
  IGNORED: 'ignored',
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Không thể xử lý yêu cầu')
const formatBytes = (value?: number) =>
  !value
    ? '—'
    : value >= 1099511627776
      ? `${(value / 1099511627776).toFixed(1)} TB`
      : `${Math.round(value / 1073741824)} GB`

export function DiscoveryCenter(props: {
  role: Role
  categories: Lookup[]
  warehouses: Lookup[]
  demoMode: boolean
  onAssetCreated: () => Promise<void>
}) {
  const { role, categories, warehouses, demoMode, onAssetCreated } = props
  const [tab, setTab] = useState<'inbox' | 'agent' | 'network'>('inbox')
  const [summary, setSummary] = useState<Summary>({
    pending: 0,
    matched: 0,
    conflict: 0,
    linked: 0,
    ignored: 0,
    agents: 0,
  })
  const [items, setItems] = useState<InboxItem[]>([])
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloads, setDownloads] = useState<Downloads>()
  const [tokens, setTokens] = useState<EnrollmentToken[]>([])
  const [issuedToken, setIssuedToken] = useState('')
  const [tokenName, setTokenName] = useState('Triển khai Endpoint Agent')
  const [siteCode, setSiteCode] = useState('')
  const [assetQuery, setAssetQuery] = useState('')
  const [assetResults, setAssetResults] = useState<AssetReference[]>([])
  const [assetId, setAssetId] = useState('')
  const [note, setNote] = useState('')
  const [createForm, setCreateForm] = useState({ assetTag: '', name: '', barcode: '', categoryId: '', warehouseId: '' })
  const selected = items.find(item => item.id === selectedId)
  const snapshot = selected?.agent.snapshots[0]?.payload
  const canAdmin = role === 'Admin'

  const load = async () => {
    if (demoMode) {
      setError('Discovery Inbox cần API/PostgreSQL; chế độ demo không nhận dữ liệu Agent.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        ...(status ? { status } : {}),
        ...(query.trim() ? { search: query.trim() } : {}),
      })
      const suffix = params.toString()
      const [summaryResult, listResult, downloadResult] = await Promise.all([
        api.get<Summary>('/discovery/summary'),
        api.get<{ data: InboxItem[] }>(`/discovery/inbox${suffix ? `?${suffix}` : ''}`),
        api.get<Downloads>('/discovery/agent-downloads'),
      ])
      setSummary(summaryResult)
      setItems(listResult.data)
      setDownloads(downloadResult)
      if (canAdmin) setTokens(await api.get<EnrollmentToken[]>('/discovery/enrollment-tokens'))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [status])
  useEffect(() => {
    if (!selected) return
    const hardware = selected.agent.snapshots[0]?.payload.device.hardware
    setCreateForm(value => ({
      ...value,
      name:
        value.name || [hardware?.manufacturer, hardware?.model].filter(Boolean).join(' ') || selected.agent.hostname,
    }))
  }, [selectedId])

  const refreshItem = async (result: InboxItem) => {
    setItems(values => values.map(value => (value.id === result.id ? result : value)))
    setSelectedId(result.id)
    await load()
  }
  const searchAssets = async () => {
    if (!assetQuery.trim()) return
    try {
      const result = await api.get<{ data: Array<any> }>(
        `/assets?limit=10&search=${encodeURIComponent(assetQuery.trim())}`,
      )
      setAssetResults(
        result.data.map(value => ({
          id: value.id,
          assetTag: value.assetTag,
          name: value.name,
          serialNumber: value.serialNumber,
          macAddress: value.macAddress,
        })),
      )
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }
  const link = async () => {
    if (!selected || !assetId) return
    try {
      await refreshItem(
        await api.post<InboxItem>(`/discovery/inbox/${selected.id}/link`, { assetId, note: note || undefined }),
      )
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }
  const ignore = async () => {
    if (!selected || !note.trim()) {
      setError('Phải nhập lý do bỏ qua thiết bị.')
      return
    }
    try {
      await refreshItem(await api.post<InboxItem>(`/discovery/inbox/${selected.id}/ignore`, { note }))
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }
  const createAsset = async () => {
    if (!selected || Object.values(createForm).some(value => !value)) {
      setError('Nhập đủ mã, tên, barcode, nhóm tài sản và kho.')
      return
    }
    try {
      await api.post(`/discovery/inbox/${selected.id}/create-asset`, { ...createForm, note: note || undefined })
      await onAssetCreated()
      setSelectedId(undefined)
      setCreateForm({ assetTag: '', name: '', barcode: '', categoryId: '', warehouseId: '' })
      await load()
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }
  const createToken = async () => {
    try {
      const result = await api.post<EnrollmentToken & { token: string }>('/discovery/enrollment-tokens', {
        name: tokenName,
        siteCode: siteCode || undefined,
        expiresInDays: 30,
        maxEnrollments: 100,
      })
      setIssuedToken(result.token)
      await load()
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }
  const revokeToken = async (id: string) => {
    if (!confirm('Thu hồi enrollment token này? Agent đã enroll vẫn tiếp tục hoạt động.')) return
    try {
      await api.delete(`/discovery/enrollment-tokens/${id}`)
      await load()
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }
  const revokeAgent = async () => {
    if (
      !selected ||
      !canAdmin ||
      !confirm(`Thu hồi Agent trên ${selected.agent.hostname}? Thiết bị phải enroll lại bằng token mới.`)
    )
      return
    try {
      await api.delete(`/discovery/agents/${selected.agent.id}`)
      setSelectedId(undefined)
      await load()
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }
  const installationConfig = useMemo(
    () =>
      JSON.stringify(
        {
          server_url: window.location.origin,
          enrollment_token: issuedToken || '<TOKEN_TỪ_ASSETFLOW>',
          site_code: siteCode || 'HN-OFFICE',
          interval: '30m',
          request_timeout: '20s',
          ca_file: '',
          state_file: '',
          allow_http: window.location.protocol === 'http:',
        },
        null,
        2,
      ),
    [issuedToken, siteCode],
  )

  return (
    <main className="page discovery-page">
      <section className="page-heading">
        <div>
          <h1>Khám phá thiết bị & Endpoint Agent</h1>
          <p>Đối chiếu inventory từ Windows/Linux trước khi đưa thiết bị vào sổ tài sản.</p>
        </div>
        <button className="btn secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? 'Đang tải' : 'Làm mới'}
        </button>
      </section>
      <div className="discovery-tabs">
        <button className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>
          <Cloud size={16} />
          Discovery Inbox
        </button>
        <button className={tab === 'agent' ? 'active' : ''} onClick={() => setTab('agent')}>
          <Laptop size={16} />
          Tải & cài Agent
        </button>
        <button className={tab === 'network' ? 'active' : ''} onClick={() => setTab('network')}>
          <Network size={16} />
          Network Discovery / SNMP
        </button>
      </div>
      {error && (
        <div className="discovery-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {tab === 'inbox' && (
        <InboxView
          summary={summary}
          items={items}
          selected={selected}
          snapshot={snapshot}
          status={status}
          query={query}
          loading={loading}
          categories={categories}
          warehouses={warehouses}
          assetResults={assetResults}
          assetId={assetId}
          assetQuery={assetQuery}
          note={note}
          createForm={createForm}
          setStatus={setStatus}
          setQuery={setQuery}
          load={load}
          setSelectedId={setSelectedId}
          setAssetId={setAssetId}
          setAssetQuery={setAssetQuery}
          searchAssets={searchAssets}
          setNote={setNote}
          setCreateForm={setCreateForm}
          link={link}
          ignore={ignore}
          createAsset={createAsset}
          canAdmin={canAdmin}
          revokeAgent={revokeAgent}
          reopen={async () => {
            if (selected) await refreshItem(await api.post<InboxItem>(`/discovery/inbox/${selected.id}/reopen`))
          }}
        />
      )}
      {tab === 'agent' && (
        <AgentSetup
          canAdmin={canAdmin}
          downloads={downloads}
          tokens={tokens}
          issuedToken={issuedToken}
          tokenName={tokenName}
          siteCode={siteCode}
          installationConfig={installationConfig}
          setTokenName={setTokenName}
          setSiteCode={setSiteCode}
          createToken={createToken}
          revokeToken={revokeToken}
        />
      )}
      {tab === 'network' && <NetworkPlanned />}
    </main>
  )
}

type InboxProps = {
  summary: Summary
  items: InboxItem[]
  selected?: InboxItem
  snapshot?: SnapshotPayload
  status: string
  query: string
  loading: boolean
  categories: Lookup[]
  warehouses: Lookup[]
  assetResults: AssetReference[]
  assetId: string
  assetQuery: string
  note: string
  createForm: { assetTag: string; name: string; barcode: string; categoryId: string; warehouseId: string }
  setStatus: (value: string) => void
  setQuery: (value: string) => void
  load: () => Promise<void>
  setSelectedId: (value: string) => void
  setAssetId: (value: string) => void
  setAssetQuery: (value: string) => void
  searchAssets: () => Promise<void>
  setNote: (value: string) => void
  setCreateForm: (value: InboxProps['createForm']) => void
  link: () => Promise<void>
  ignore: () => Promise<void>
  createAsset: () => Promise<void>
  reopen: () => Promise<void>
  canAdmin: boolean
  revokeAgent: () => Promise<void>
}

function InboxView(props: InboxProps) {
  const metrics = [
    ['Chờ xử lý', props.summary.pending],
    ['Gợi ý khớp', props.summary.matched],
    ['Xung đột', props.summary.conflict],
    ['Đã quản lý', props.summary.linked],
    ['Agent hoạt động', props.summary.agents],
  ]
  return (
    <>
      <section className="discovery-metrics">
        {metrics.map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </section>
      <section className="discovery-workspace">
        <div className="card discovery-list">
          <header>
            <div>
              <h2>Thiết bị phát hiện</h2>
              <span>{props.items.length} bản ghi</span>
            </div>
            <div>
              <label>
                <Search size={15} />
                <input
                  value={props.query}
                  onChange={event => props.setQuery(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') void props.load()
                  }}
                  placeholder="Hostname, fingerprint, mã tài sản"
                />
              </label>
              <select value={props.status} onChange={event => props.setStatus(event.target.value)}>
                <option value="">Tất cả trạng thái</option>
                {Object.entries(labels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button onClick={() => void props.load()}>Tìm</button>
            </div>
          </header>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>THIẾT BỊ</th>
                  <th>HỆ ĐIỀU HÀNH</th>
                  <th>SERIAL / UUID</th>
                  <th>TRẠNG THÁI</th>
                  <th>LẦN CUỐI</th>
                </tr>
              </thead>
              <tbody>
                {props.items.map(item => {
                  const payload = item.agent.snapshots[0]?.payload.device
                  return (
                    <tr
                      className={props.selected?.id === item.id ? 'selected' : ''}
                      onClick={() => props.setSelectedId(item.id)}
                      key={item.id}
                    >
                      <td>
                        <b>{item.agent.hostname}</b>
                        <small>
                          {payload?.hardware.manufacturer} {payload?.hardware.model}
                        </small>
                      </td>
                      <td>
                        {payload?.os.name || item.agent.osFamily}
                        <small>Agent {item.agent.agentVersion}</small>
                      </td>
                      <td>
                        {payload?.hardware.serial_number || '—'}
                        <small>{payload?.hardware.system_uuid || item.agent.fingerprint.slice(0, 16)}</small>
                      </td>
                      <td>
                        <span className={`discovery-status ${statusClass[item.status]}`}>{labels[item.status]}</span>
                        {item.suggestedAsset && <small>Gợi ý: {item.suggestedAsset.assetTag}</small>}
                      </td>
                      <td>{new Date(item.lastObservedAt).toLocaleString('vi-VN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!props.items.length && !props.loading && (
            <div className="discovery-empty">
              <Cloud size={28} />
              <b>Chưa có thiết bị</b>
              <span>Cài Agent và tạo enrollment token để bắt đầu nhận inventory.</span>
            </div>
          )}
        </div>
        <DiscoveryDetail {...props} />
      </section>
    </>
  )
}

function DiscoveryDetail(props: InboxProps) {
  const { selected, snapshot } = props
  if (!selected || !snapshot)
    return (
      <aside className="card discovery-detail">
        <div className="discovery-empty">
          <Cloud size={28} />
          <b>Chọn một thiết bị</b>
          <span>Xem snapshot và quyết định liên kết, tạo mới hoặc bỏ qua.</span>
        </div>
      </aside>
    )
  const hardware = snapshot.device.hardware
  const open = ['PENDING', 'MATCHED', 'CONFLICT'].includes(selected.status)
  return (
    <aside className="card discovery-detail">
      <header>
        <div>
          <h2>{selected.agent.hostname}</h2>
          <span className={`discovery-status ${statusClass[selected.status]}`}>{labels[selected.status]}</span>
        </div>
        <div className="discovery-agent-admin">
          <small>Fingerprint: {selected.agent.fingerprint}</small>
          {props.canAdmin && (
            <button className="btn secondary danger" onClick={() => void props.revokeAgent()}>
              Thu hồi Agent
            </button>
          )}
        </div>
      </header>
      <section className="discovery-facts">
        <div>
          <Laptop size={17} />
          <span>
            <small>Thiết bị</small>
            <b>
              {hardware.manufacturer || '—'} {hardware.model || ''}
            </b>
          </span>
        </div>
        <div>
          <Server size={17} />
          <span>
            <small>CPU / RAM</small>
            <b>
              {hardware.cpu_model || '—'} · {formatBytes(hardware.memory_bytes)}
            </b>
          </span>
        </div>
        <div>
          <HardDrive size={17} />
          <span>
            <small>Ổ đĩa</small>
            <b>
              {hardware.disks?.map(disk => `${disk.model || disk.name} ${formatBytes(disk.size_bytes)}`).join('; ') ||
                '—'}
            </b>
          </span>
        </div>
        <div>
          <Wifi size={17} />
          <span>
            <small>Network</small>
            <b>
              {snapshot.device.network_interfaces
                .filter(value => value.mac_address)
                .map(value => value.mac_address)
                .join(', ') || '—'}
            </b>
          </span>
        </div>
      </section>
      {selected.conflictReason && (
        <div className="conflict-note">
          <AlertTriangle size={16} />
          {selected.conflictReason}
        </div>
      )}
      {open ? (
        <div className="discovery-actions">
          <section>
            <h3>Liên kết tài sản hiện có</h3>
            {selected.suggestedAsset && (
              <button className="suggested-asset" onClick={() => props.setAssetId(selected.suggestedAsset!.id)}>
                <Check size={15} />
                <span>
                  <b>{selected.suggestedAsset.assetTag}</b>
                  {selected.suggestedAsset.name}
                </span>
                <em>{selected.matchConfidence}%</em>
              </button>
            )}
            <div className="asset-search">
              <input
                value={props.assetQuery}
                onChange={event => props.setAssetQuery(event.target.value)}
                placeholder="Mã, serial hoặc tên tài sản"
              />
              <button onClick={() => void props.searchAssets()}>
                <Search size={15} />
              </button>
            </div>
            {props.assetResults.map(asset => (
              <label className="asset-result" key={asset.id}>
                <input type="radio" checked={props.assetId === asset.id} onChange={() => props.setAssetId(asset.id)} />
                <span>
                  <b>{asset.assetTag}</b>
                  {asset.name} · {asset.serialNumber || 'Không serial'}
                </span>
              </label>
            ))}
            <button className="btn primary" disabled={!props.assetId} onClick={() => void props.link()}>
              <Link2 size={15} />
              Liên kết
            </button>
          </section>
          <section>
            <h3>Tạo tài sản mới từ snapshot</h3>
            <div className="discovery-create-grid">
              <input
                value={props.createForm.assetTag}
                onChange={event =>
                  props.setCreateForm({
                    ...props.createForm,
                    assetTag: event.target.value,
                    barcode: props.createForm.barcode || event.target.value,
                  })
                }
                placeholder="Mã tài sản *"
              />
              <input
                value={props.createForm.barcode}
                onChange={event => props.setCreateForm({ ...props.createForm, barcode: event.target.value })}
                placeholder="Barcode / QR *"
              />
              <input
                className="wide"
                value={props.createForm.name}
                onChange={event => props.setCreateForm({ ...props.createForm, name: event.target.value })}
                placeholder="Tên tài sản *"
              />
              <select
                value={props.createForm.categoryId}
                onChange={event => props.setCreateForm({ ...props.createForm, categoryId: event.target.value })}
              >
                <option value="">Chọn nhóm tài sản *</option>
                {props.categories.map(value => (
                  <option value={value.id} key={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
              <select
                value={props.createForm.warehouseId}
                onChange={event => props.setCreateForm({ ...props.createForm, warehouseId: event.target.value })}
              >
                <option value="">Chọn kho nhập *</option>
                {props.warehouses.map(value => (
                  <option value={value.id} key={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={props.note}
              onChange={event => props.setNote(event.target.value)}
              placeholder="Ghi chú xử lý / lý do bỏ qua"
            />
            <div className="discovery-decision-buttons">
              <button className="btn primary" onClick={() => void props.createAsset()}>
                <Plus size={15} />
                Tạo tài sản
              </button>
              <button className="btn secondary danger" onClick={() => void props.ignore()}>
                <X size={15} />
                Bỏ qua
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="resolution-box">
          <ShieldCheck size={20} />
          <div>
            <b>Thiết bị đã được xử lý</b>
            <span>
              {selected.resolvedAsset
                ? `${selected.resolvedAsset.assetTag} · ${selected.resolvedAsset.name}`
                : selected.resolutionNote || labels[selected.status]}
            </span>
          </div>
          {selected.status === 'IGNORED' && <button onClick={() => void props.reopen()}>Mở lại</button>}
        </div>
      )}
    </aside>
  )
}

function AgentSetup(props: {
  canAdmin: boolean
  downloads?: Downloads
  tokens: EnrollmentToken[]
  issuedToken: string
  tokenName: string
  siteCode: string
  installationConfig: string
  setTokenName: (value: string) => void
  setSiteCode: (value: string) => void
  createToken: () => Promise<void>
  revokeToken: (id: string) => Promise<void>
}) {
  const binaries = props.downloads
    ? [props.downloads.windows, props.downloads.linuxAmd64, props.downloads.linuxArm64]
    : []
  return (
    <section className="agent-setup-grid">
      <article className="card agent-downloads">
        <header>
          <h2>1. Tải Endpoint Agent</h2>
          <span>Binary đúng phiên bản từ máy chủ AssetFlow, kèm SHA-256 để kiểm tra toàn vẹn.</span>
        </header>
        <div>
          {binaries.map((item, index) => (
            <a href={item.url} key={item.label}>
              <span>
                {index === 0 ? <Laptop size={21} /> : <Server size={21} />}
                <b>{item.label}</b>
              </span>
              <Download size={17} />
            </a>
          ))}
        </div>
        {props.downloads && (
          <a className="checksum-link" href={props.downloads.checksums}>
            Tải SHA256SUMS
          </a>
        )}
      </article>
      <article className="card enrollment-card">
        <header>
          <h2>2. Tạo enrollment token</h2>
          <span>Token chỉ hiển thị một lần. Chỉ Admin được quản lý.</span>
        </header>
        {props.canAdmin ? (
          <>
            <div className="token-form">
              <input
                value={props.tokenName}
                onChange={event => props.setTokenName(event.target.value)}
                placeholder="Tên đợt triển khai"
              />
              <input
                value={props.siteCode}
                onChange={event => props.setSiteCode(event.target.value)}
                placeholder="Mã site"
              />
              <button className="btn primary" onClick={() => void props.createToken()}>
                <KeyRound size={15} />
                Tạo token
              </button>
            </div>
            {props.issuedToken && (
              <div className="issued-token">
                <b>Token vừa tạo — sao chép ngay</b>
                <code>{props.issuedToken}</code>
                <button onClick={() => void navigator.clipboard.writeText(props.issuedToken)}>Sao chép</button>
              </div>
            )}
            <div className="token-list">
              {props.tokens.map(token => (
                <div key={token.id}>
                  <span>
                    <b>{token.name}</b>
                    <small>
                      {token.siteCode || 'Mọi site'} · {token.enrollmentCount}/{token.maxEnrollments} thiết bị · hết hạn{' '}
                      {new Date(token.expiresAt).toLocaleDateString('vi-VN')}
                    </small>
                  </span>
                  <em className={token.revokedAt ? 'revoked' : ''}>{token.revokedAt ? 'Đã thu hồi' : 'Hoạt động'}</em>
                  {!token.revokedAt && <button onClick={() => void props.revokeToken(token.id)}>Thu hồi</button>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="permission-note">
            <ShieldCheck size={17} />
            Liên hệ Admin để nhận enrollment token theo site.
          </div>
        )}
      </article>
      <article className="card agent-config">
        <header>
          <h2>3. Cấu hình và cài đặt</h2>
          <span>Lưu file dưới quyền SYSTEM/root; không gửi token qua email hoặc chat.</span>
        </header>
        <pre>{props.installationConfig}</pre>
        <div className="install-notes">
          <p>
            <b>Windows:</b> lưu binary tại <code>C:\Program Files\AssetFlow\assetflow-agent.exe</code>, cấu hình tại{' '}
            <code>C:\ProgramData\AssetFlow\agent.json</code>; chạy lệnh <code>assetflow-agent.exe once</code> trước khi
            tạo Scheduled Task.
          </p>
          <p>
            <b>Linux:</b> lưu binary tại <code>/usr/local/bin/assetflow-agent</code>, cấu hình{' '}
            <code>/etc/assetflow/agent.json</code> với mode 0600; chạy <code>assetflow-agent once</code> trước khi bật
            systemd service.
          </p>
          <p>Sau lần enroll đầu có thể xóa `enrollment_token` khi Agent đã lưu credential riêng.</p>
          {window.location.protocol === 'http:' && (
            <p className="agent-http-warning">
              <AlertTriangle size={15} />
              <span>
                URL hiện tại dùng HTTP. Chỉ dùng trong mạng nội bộ cô lập; hãy cấu hình HTTPS và CA nội bộ trước khi mở
                rộng triển khai.
              </span>
            </p>
          )}
        </div>
      </article>
    </section>
  )
}

function NetworkPlanned() {
  return (
    <section className="card network-planned">
      <span>
        <Network size={34} />
      </span>
      <h2>Network Discovery & SNMP</h2>
      <p>
        Giai đoạn tiếp theo dành cho switch, firewall, máy in và camera. Discovery Probe sẽ quét subnet được ủy quyền,
        ưu tiên SNMPv3 và vẫn đưa thiết bị vào Discovery Inbox để IT xác nhận.
      </p>
      <div>
        <b>Thiết kế đã khóa</b>
        <ul>
          <li>Không scan từ trình duyệt hoặc API public.</li>
          <li>Probe riêng theo site, chỉ outbound về AssetFlow.</li>
          <li>Không tự tạo tài sản, không lưu SNMP community dạng rõ.</li>
          <li>Có allowlist subnet, lịch quét và giới hạn tốc độ.</li>
        </ul>
      </div>
      <button className="btn secondary" disabled>
        <Wifi size={16} />
        Chưa khả dụng trong phiên bản này
      </button>
    </section>
  )
}
