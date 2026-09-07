import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Link2, Plus, Search, ShieldCheck, X } from 'lucide-react'
import { api, ApiError } from '../../services/api-client'
import {
  Catalogue,
  ComplianceSummary,
  Implementation,
  SoaDecision,
  SoaDetail,
  SoaVersion,
  decisionLabels,
  implementationLabels,
  soaStatusLabels,
  themeLabels,
  viDate,
} from './types'

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Không thể kết nối dịch vụ hồ sơ tuân thủ.'

/**
 * ISO/IEC 27001:2022 Annex A and the Statement of Applicability required by §6.1.3(d).
 *
 * The catalogue itself is served by the API so the codes and titles match what the certification
 * body reads from their own checklist, and every control shows what already evidences it — either a
 * controlled document or, for the controls AssetFlow operates itself, the live records.
 */
export function ControlLibrary({ goRoute }: { goRoute: (route: string) => void }) {
  const [catalogue, setCatalogue] = useState<Catalogue>()
  const [summary, setSummary] = useState<ComplianceSummary>()
  const [versions, setVersions] = useState<SoaVersion[]>([])
  const [detail, setDetail] = useState<SoaDetail>()
  const [tab, setTab] = useState<'controls' | 'soa'>('controls')
  const [theme, setTheme] = useState('')
  const [query, setQuery] = useState('')
  const [onlyGaps, setOnlyGaps] = useState(false)
  const [editing, setEditing] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [cat, sum, list] = await Promise.all([
        api.get<Catalogue>('/compliance/controls'),
        api.get<ComplianceSummary>('/compliance/summary'),
        api.get<SoaVersion[]>('/compliance/soa'),
      ])
      setCatalogue(cat)
      setSummary(sum)
      setVersions(list)
      setError('')
    } catch (reason) {
      setError(message(reason))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const openVersion = async (id: string) => {
    try {
      setDetail(await api.get<SoaDetail>(`/compliance/soa/${id}`))
      setTab('soa')
    } catch (reason) {
      setError(message(reason))
    }
  }

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (catalogue?.controls || []).filter(control => {
      if (theme && control.theme !== theme) return false
      if (onlyGaps && control.decision) return false
      if (!term) return true
      return `${control.code} ${control.title} ${control.titleVi}`.toLowerCase().includes(term)
    })
  }, [catalogue, theme, query, onlyGaps])

  const covered = (catalogue?.controls || []).filter(control => control.decision).length
  const evidenced = (catalogue?.controls || []).filter(
    control => control.evidenceSource || control.documents.length,
  ).length

  const saveEntry = async (
    code: string,
    values: { decision: SoaDecision; justification: string; implementation: Implementation },
  ) => {
    if (!detail) return
    try {
      await api.patch(`/compliance/soa/${detail.id}/entries/${code}`, values)
      setEditing(undefined)
      setNotice(`Đã cập nhật ${code}.`)
      await openVersion(detail.id)
      await load()
    } catch (reason) {
      setError(message(reason))
    }
  }

  const issue = async () => {
    if (!detail) return
    const note = window.prompt(`Ban hành Tuyên bố áp dụng ${detail.version}. Ghi căn cứ phê duyệt:`)?.trim()
    if (!note) return
    try {
      await api.post(`/compliance/soa/${detail.id}/issue`, {
        issuedAt: new Date().toISOString().slice(0, 10),
        note,
      })
      setNotice(`Đã ban hành Tuyên bố áp dụng ${detail.version}.`)
      await openVersion(detail.id)
      await load()
    } catch (reason) {
      setError(message(reason))
    }
  }

  return (
    <main className="page compliance-page">
      <section className="page-heading">
        <div>
          <span className="compliance-standard">{catalogue?.standard || 'ISO/IEC 27001:2022'}</span>
          <h1>Khung tiêu chuẩn &amp; Tuyên bố áp dụng</h1>
          <p>93 kiểm soát Annex A, quyết định áp dụng và bằng chứng tương ứng cho từng kiểm soát.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Phiên bản SoA mới
        </button>
      </section>

      {error && (
        <div className="compliance-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      {notice && <div className="compliance-notice">{notice}</div>}

      <section className="compliance-metrics">
        <div>
          <small>Kiểm soát Annex A</small>
          <b>{summary?.totalControls ?? 93}</b>
          <em>Toàn bộ danh mục tiêu chuẩn</em>
        </div>
        <div>
          <small>Đã có quyết định</small>
          <b>{covered}</b>
          <em>Còn thiếu {(summary?.totalControls ?? 93) - covered} kiểm soát</em>
        </div>
        <div>
          <small>Có bằng chứng</small>
          <b>{evidenced}</b>
          <em>{summary?.linkedEvidence ?? 0} lấy trực tiếp từ dữ liệu hệ thống</em>
        </div>
        <div>
          <small>SoA đang hiệu lực</small>
          <b>{catalogue?.soa?.version || '—'}</b>
          <em>{catalogue?.soa ? `Ban hành ${viDate(catalogue.soa.issuedAt)}` : 'Chưa ban hành phiên bản nào'}</em>
        </div>
      </section>

      <section className="card compliance-body">
        <header className="compliance-tabs">
          <button className={tab === 'controls' ? 'active' : ''} onClick={() => setTab('controls')}>
            Danh mục kiểm soát <b>{catalogue?.controls.length ?? 0}</b>
          </button>
          <button className={tab === 'soa' ? 'active' : ''} onClick={() => setTab('soa')}>
            Tuyên bố áp dụng <b>{versions.length}</b>
          </button>
        </header>

        {tab === 'controls' ? (
          <>
            <div className="compliance-filters">
              <label>
                <Search size={16} />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Tìm mã kiểm soát hoặc tên..."
                />
              </label>
              <select value={theme} onChange={event => setTheme(event.target.value)}>
                <option value="">Tất cả chủ đề</option>
                {(catalogue?.themes || []).map(item => (
                  <option value={item.key} key={item.key}>
                    {item.clause} · {themeLabels[item.key]}
                  </option>
                ))}
              </select>
              <label className="compliance-check">
                <input type="checkbox" checked={onlyGaps} onChange={event => setOnlyGaps(event.target.checked)} />
                Chỉ hiện kiểm soát chưa có quyết định
              </label>
            </div>
            <div className="compliance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>MÃ</th>
                    <th>KIỂM SOÁT</th>
                    <th>CHỦ ĐỀ</th>
                    <th>QUYẾT ĐỊNH</th>
                    <th>TRIỂN KHAI</th>
                    <th>BẰNG CHỨNG</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(control => (
                    <tr key={control.code}>
                      <td>
                        <b className="compliance-code">{control.code}</b>
                      </td>
                      <td>
                        <b>{control.titleVi}</b>
                        <small>{control.title}</small>
                      </td>
                      <td>{themeLabels[control.theme]}</td>
                      <td>
                        {control.decision ? (
                          <span className={`compliance-badge ${control.decision.toLowerCase()}`}>
                            {decisionLabels[control.decision]}
                          </span>
                        ) : (
                          <span className="compliance-badge missing">Chưa quyết định</span>
                        )}
                      </td>
                      <td>{control.implementation ? implementationLabels[control.implementation] : '—'}</td>
                      <td className="compliance-evidence">
                        {control.evidenceSource && (
                          <button
                            className="compliance-link"
                            title={control.evidenceSource.description}
                            onClick={() => goRoute(control.evidenceSource!.route)}
                          >
                            <Link2 size={13} />
                            {control.evidenceSource.module}
                          </button>
                        )}
                        {control.documents.map(document => (
                          <span className="compliance-doc-chip" key={document.id}>
                            {document.documentCode}
                          </span>
                        ))}
                        {!control.evidenceSource && !control.documents.length && (
                          <span className="muted">Chưa có bằng chứng</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {loading && <div className="compliance-empty">Đang tải danh mục kiểm soát…</div>}
            {!loading && !shown.length && <div className="compliance-empty">Không có kiểm soát phù hợp bộ lọc.</div>}
          </>
        ) : (
          <div className="compliance-soa">
            <div className="compliance-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PHIÊN BẢN</th>
                    <th>TRẠNG THÁI</th>
                    <th>BAN HÀNH</th>
                    <th>PHÊ DUYỆT</th>
                    <th>SỐ KIỂM SOÁT</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map(version => (
                    <tr key={version.id} className={detail?.id === version.id ? 'selected' : ''}>
                      <td>
                        <b className="compliance-code">Ver {version.version}</b>
                      </td>
                      <td>
                        <span className={`compliance-badge ${version.status.toLowerCase()}`}>
                          {soaStatusLabels[version.status]}
                        </span>
                      </td>
                      <td>{viDate(version.issuedAt)}</td>
                      <td>{version.approver?.fullName || <span className="muted">Chưa phê duyệt</span>}</td>
                      <td>
                        {version._count?.entries ?? 0} / {catalogue?.controls.length ?? 93}
                      </td>
                      <td>
                        <button className="btn secondary" onClick={() => void openVersion(version.id)}>
                          Mở
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!versions.length && (
              <div className="compliance-empty">
                Chưa có phiên bản Tuyên bố áp dụng nào. Đây là tài liệu bắt buộc theo ISO/IEC 27001 §6.1.3(d).
              </div>
            )}
            {detail && (
              <SoaEditor
                detail={detail}
                editing={editing}
                setEditing={setEditing}
                onSave={saveEntry}
                onIssue={issue}
                onClose={() => setDetail(undefined)}
              />
            )}
          </div>
        )}
      </section>

      {creating && (
        <SoaVersionModal
          versions={versions}
          onClose={() => setCreating(false)}
          onSaved={async id => {
            setCreating(false)
            await load()
            await openVersion(id)
          }}
          onError={setError}
        />
      )}
    </main>
  )
}

function SoaEditor({
  detail,
  editing,
  setEditing,
  onSave,
  onIssue,
  onClose,
}: {
  detail: SoaDetail
  editing?: string
  setEditing: (code?: string) => void
  onSave: (
    code: string,
    values: { decision: SoaDecision; justification: string; implementation: Implementation },
  ) => Promise<void>
  onIssue: () => void
  onClose: () => void
}) {
  const [decision, setDecision] = useState<SoaDecision>('APPLICABLE')
  const [justification, setJustification] = useState('')
  const [implementation, setImplementation] = useState<Implementation>('NOT_STARTED')
  const missing = detail.entries.filter(item => !item.entry).length
  const editable = detail.status === 'DRAFT'

  const begin = (item: SoaDetail['entries'][number]) => {
    setEditing(item.code)
    setDecision(item.entry?.decision || 'APPLICABLE')
    setJustification(item.entry?.justification || '')
    setImplementation(item.entry?.implementation || 'NOT_STARTED')
  }

  return (
    <div className="compliance-soa-detail">
      <header>
        <div>
          <h2>Tuyên bố áp dụng Ver {detail.version}</h2>
          <p>{detail.scope}</p>
        </div>
        <div className="compliance-soa-actions">
          {editable && (
            <button
              className="btn primary"
              disabled={missing > 0}
              onClick={onIssue}
              title={missing ? `Còn ${missing} kiểm soát chưa có quyết định` : undefined}
            >
              <Check size={15} />
              Ban hành
            </button>
          )}
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      {editable ? (
        <p className="compliance-hint">
          {missing > 0
            ? `Còn ${missing} kiểm soát chưa có quyết định và lý do. §6.1.3(d) yêu cầu nêu lý do cho cả kiểm soát áp dụng lẫn loại trừ.`
            : 'Đã có quyết định cho toàn bộ 93 kiểm soát. Có thể ban hành.'}
        </p>
      ) : (
        <p className="compliance-hint">
          Phiên bản đã ban hành chỉ được đọc, giữ đúng nội dung đã trình cho đoàn đánh giá. Muốn thay đổi thì tạo phiên
          bản mới.
        </p>
      )}
      <div className="compliance-table-wrap">
        <table>
          <thead>
            <tr>
              <th>MÃ</th>
              <th>KIỂM SOÁT</th>
              <th>QUYẾT ĐỊNH</th>
              <th>LÝ DO</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {detail.entries.map(item => (
              <tr key={item.code} className={item.entry ? '' : 'compliance-row-missing'}>
                <td>
                  <b className="compliance-code">{item.code}</b>
                </td>
                <td>
                  <b>{item.titleVi}</b>
                  <small>{item.title}</small>
                </td>
                <td>
                  {item.entry ? (
                    <span className={`compliance-badge ${item.entry.decision.toLowerCase()}`}>
                      {decisionLabels[item.entry.decision]}
                    </span>
                  ) : (
                    <span className="compliance-badge missing">Chưa quyết định</span>
                  )}
                </td>
                <td className="compliance-justification">
                  {editing === item.code ? (
                    <div className="compliance-entry-form">
                      <select value={decision} onChange={event => setDecision(event.target.value as SoaDecision)}>
                        {Object.entries(decisionLabels).map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={implementation}
                        onChange={event => setImplementation(event.target.value as Implementation)}
                      >
                        {Object.entries(implementationLabels).map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        rows={2}
                        value={justification}
                        onChange={event => setJustification(event.target.value)}
                        placeholder="Lý do áp dụng hoặc loại trừ kiểm soát này"
                      />
                      <div>
                        <button
                          className="btn primary"
                          disabled={!justification.trim()}
                          onClick={() => void onSave(item.code, { decision, justification, implementation })}
                        >
                          Lưu
                        </button>
                        <button className="btn secondary" onClick={() => setEditing(undefined)}>
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span>{item.entry?.justification || <span className="muted">—</span>}</span>
                  )}
                </td>
                <td>
                  {editable && editing !== item.code && (
                    <button className="btn secondary" onClick={() => begin(item)}>
                      {item.entry ? 'Sửa' : 'Quyết định'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SoaVersionModal({
  versions,
  onClose,
  onSaved,
  onError,
}: {
  versions: SoaVersion[]
  onClose: () => void
  onSaved: (id: string) => Promise<void>
  onError: (message: string) => void
}) {
  const issued = versions.find(item => item.status === 'ISSUED')
  const [version, setVersion] = useState('')
  const [scope, setScope] = useState(issued?.scope || 'Cung cấp các giải pháp phần mềm và các dịch vụ liên quan')
  const [cloneFromId, setCloneFromId] = useState(issued?.id || '')
  const [saving, setSaving] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const created = await api.post<{ id: string }>('/compliance/soa', {
        version: version.trim(),
        scope: scope.trim(),
        cloneFromId: cloneFromId || undefined,
      })
      await onSaved(created.id)
    } catch (reason) {
      onError(message(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Phiên bản Tuyên bố áp dụng mới</h2>
            <p>Sao chép quyết định của phiên bản đang hiệu lực rồi chỉnh những gì thay đổi.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Số phiên bản
            <input required value={version} onChange={event => setVersion(event.target.value)} placeholder="3.0" />
          </label>
          <label>
            Sao chép từ
            <select value={cloneFromId} onChange={event => setCloneFromId(event.target.value)}>
              <option value="">Bắt đầu từ trống</option>
              {versions.map(item => (
                <option value={item.id} key={item.id}>
                  Ver {item.version} ({soaStatusLabels[item.status]})
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Phạm vi áp dụng
            <textarea rows={2} required value={scope} onChange={event => setScope(event.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn primary" disabled={saving || !version.trim()}>
            <ShieldCheck size={16} />
            Tạo phiên bản
          </button>
        </div>
      </form>
    </div>
  )
}
