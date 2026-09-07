import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Download, FileText, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { api, ApiError } from '../../services/api-client'
import { env } from '../../config/env'
import {
  ComplianceDocument,
  ComplianceSummary,
  Catalogue,
  DocumentFile,
  DocumentStatus,
  DocumentType,
  Lookup,
  documentStatusLabels,
  documentTypeLabels,
  fileSize,
  viDate,
} from './types'

const message = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Không thể kết nối dịch vụ hồ sơ tuân thủ.'

/**
 * ISO/IEC 27001:2022 §7.5 — documented information under version control.
 *
 * A document is a draft until it is issued, and issuing requires at least one attached file, because
 * a controlled document with nothing attached is not evidence of anything. Issued and withdrawn
 * records become read-only so what was shown to an auditor cannot be edited afterwards.
 */
export function DocumentLibrary() {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([])
  const [summary, setSummary] = useState<ComplianceSummary>()
  const [catalogue, setCatalogue] = useState<Catalogue>()
  const [operators, setOperators] = useState<Lookup[]>([])
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [reviewDue, setReviewDue] = useState(false)
  const [selected, setSelected] = useState<ComplianceDocument>()
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', limit: '100' })
      if (query.trim()) params.set('search', query.trim())
      if (type) params.set('type', type)
      if (status) params.set('status', status)
      if (reviewDue) params.set('reviewDue', 'true')
      const [list, sum] = await Promise.all([
        api.get<{ data: ComplianceDocument[] }>(`/compliance/documents?${params}`),
        api.get<ComplianceSummary>('/compliance/summary'),
      ])
      setDocuments(list.data)
      setSummary(sum)
      setError('')
    } catch (reason) {
      setError(message(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0)
    return () => clearTimeout(timer)
  }, [query, type, status, reviewDue])

  useEffect(() => {
    void Promise.all([api.get<Catalogue>('/compliance/controls'), api.get<Lookup[]>('/compliance/operators')])
      .then(([cat, users]) => {
        setCatalogue(cat)
        setOperators(users)
      })
      .catch(() => undefined)
  }, [])

  const refreshSelected = async (id: string) => {
    setSelected(await api.get<ComplianceDocument>(`/compliance/documents/${id}`))
    await load()
  }

  return (
    <main className="page compliance-page">
      <section className="page-heading">
        <div>
          <span className="compliance-standard">ISO/IEC 27001:2022 §7.5</span>
          <h1>Hệ thống tài liệu</h1>
          <p>Chính sách, quy trình, quy định và biểu mẫu của hệ thống quản lý an toàn thông tin.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          Tài liệu mới
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
          <small>Đang hiệu lực</small>
          <b>{summary?.documentsIssued ?? 0}</b>
          <em>Tài liệu đã ban hành</em>
        </div>
        <div>
          <small>Đến hạn soát xét</small>
          <b>{summary?.reviewDue ?? 0}</b>
          <em>Quá ngày rà soát tiếp theo</em>
        </div>
        {(summary?.documentsByStatus || [])
          .filter(item => item.label === 'DRAFT' || item.label === 'WITHDRAWN')
          .map(item => (
            <div key={item.label}>
              <small>{documentStatusLabels[item.label as DocumentStatus]}</small>
              <b>{item.count}</b>
              <em>{item.label === 'DRAFT' ? 'Chờ ban hành' : 'Đã ngừng áp dụng'}</em>
            </div>
          ))}
      </section>

      <section className="card compliance-body">
        <div className="compliance-filters">
          <label>
            <Search size={16} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Tìm mã tài liệu, tên hoặc mô tả..."
            />
          </label>
          <select value={type} onChange={event => setType(event.target.value)}>
            <option value="">Tất cả loại</option>
            {Object.entries(documentTypeLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {Object.entries(documentStatusLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="compliance-check">
            <input type="checkbox" checked={reviewDue} onChange={event => setReviewDue(event.target.checked)} />
            Chỉ hiện tài liệu đến hạn soát xét
          </label>
        </div>

        <div className="compliance-table-wrap">
          <table>
            <thead>
              <tr>
                <th>MÃ TÀI LIỆU</th>
                <th>TÊN</th>
                <th>LOẠI</th>
                <th>PHIÊN BẢN</th>
                <th>CHỦ SỞ HỮU</th>
                <th>HIỆU LỰC</th>
                <th>SOÁT XÉT</th>
                <th>KIỂM SOÁT</th>
                <th>TỆP</th>
                <th>TRẠNG THÁI</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(document => (
                <tr key={document.id} onClick={() => setSelected(document)}>
                  <td>
                    <b className="compliance-code">{document.documentCode}</b>
                  </td>
                  <td>
                    <b>{document.title}</b>
                    {document.summary && <small>{document.summary}</small>}
                  </td>
                  <td>{documentTypeLabels[document.type]}</td>
                  <td>{document.version}</td>
                  <td>{document.owner.fullName}</td>
                  <td>{viDate(document.effectiveFrom)}</td>
                  <td
                    className={document.nextReviewAt && new Date(document.nextReviewAt) < new Date() ? 'overdue' : ''}
                  >
                    {viDate(document.nextReviewAt)}
                  </td>
                  <td className="compliance-evidence">
                    {document.controls.slice(0, 3).map(control => (
                      <span className="compliance-doc-chip" key={control.controlCode}>
                        {control.controlCode}
                      </span>
                    ))}
                    {document.controls.length > 3 && <span className="muted">+{document.controls.length - 3}</span>}
                  </td>
                  <td>{document.files.length}</td>
                  <td>
                    <span className={`compliance-badge ${document.status.toLowerCase()}`}>
                      {documentStatusLabels[document.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="compliance-empty">Đang tải hệ thống tài liệu…</div>}
        {!loading && !documents.length && <div className="compliance-empty">Chưa có tài liệu phù hợp bộ lọc.</div>}
      </section>

      {selected && (
        <DocumentDetail
          document={selected}
          onClose={() => setSelected(undefined)}
          onChanged={refreshSelected}
          onError={setError}
          onNotice={setNotice}
        />
      )}
      {creating && (
        <DocumentModal
          operators={operators}
          catalogue={catalogue}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false)
            await load()
          }}
          onError={setError}
        />
      )}
    </main>
  )
}

function DocumentDetail({
  document: record,
  onClose,
  onChanged,
  onError,
  onNotice,
}: {
  document: ComplianceDocument
  onClose: () => void
  onChanged: (id: string) => Promise<void>
  onError: (message: string) => void
  onNotice: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const editable = record.status === 'DRAFT'

  const upload = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    try {
      await api.upload(`/compliance/documents/${record.id}/files`, file)
      await onChanged(record.id)
      onNotice(`Đã đính kèm ${file.name}.`)
    } catch (reason) {
      onError(message(reason))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const removeFile = async (file: DocumentFile) => {
    if (!window.confirm(`Gỡ tệp ${file.originalName}?`)) return
    try {
      await api.delete(`/compliance/files/${file.id}`)
      await onChanged(record.id)
    } catch (reason) {
      onError(message(reason))
    }
  }

  const issue = async () => {
    const note = window
      .prompt(`Ban hành ${record.documentCode} phiên bản ${record.version}. Ghi căn cứ phê duyệt:`)
      ?.trim()
    if (!note) return
    try {
      await api.post(`/compliance/documents/${record.id}/issue`, {
        effectiveFrom: new Date().toISOString().slice(0, 10),
        note,
      })
      await onChanged(record.id)
      onNotice(`Đã ban hành ${record.documentCode}.`)
    } catch (reason) {
      onError(message(reason))
    }
  }

  const withdraw = async () => {
    const reason = window.prompt(`Thu hồi ${record.documentCode}. Ghi lý do:`)?.trim()
    if (!reason) return
    try {
      await api.post(`/compliance/documents/${record.id}/withdraw`, { reason })
      await onChanged(record.id)
      onNotice(`Đã thu hồi ${record.documentCode}.`)
    } catch (reason2) {
      onError(message(reason2))
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="modal compliance-detail">
        <div className="modal-head">
          <div>
            <h2>
              {record.documentCode} · {record.title}
            </h2>
            <p>
              {documentTypeLabels[record.type]} · Phiên bản {record.version} · {documentStatusLabels[record.status]}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="compliance-detail-body">
          <dl className="compliance-facts">
            <div>
              <dt>Chủ sở hữu</dt>
              <dd>{record.owner.fullName}</dd>
            </div>
            <div>
              <dt>Ngày hiệu lực</dt>
              <dd>{viDate(record.effectiveFrom)}</dd>
            </div>
            <div>
              <dt>Soát xét tiếp theo</dt>
              <dd>{viDate(record.nextReviewAt)}</dd>
            </div>
            <div>
              <dt>Người phê duyệt</dt>
              <dd>{record.approver?.fullName || '—'}</dd>
            </div>
          </dl>

          <section>
            <h3>Kiểm soát Annex A được chứng minh</h3>
            <div className="compliance-evidence">
              {record.controls.length ? (
                record.controls.map(control => (
                  <span className="compliance-doc-chip" key={control.controlCode}>
                    {control.controlCode}
                  </span>
                ))
              ) : (
                <span className="muted">Chưa gắn kiểm soát nào.</span>
              )}
            </div>
          </section>

          <section>
            <h3>Tệp đính kèm</h3>
            {record.files.map(file => (
              <article className="compliance-file" key={file.id}>
                <FileText size={16} />
                <div>
                  <b>{file.originalName}</b>
                  <small>
                    {fileSize(file.fileSize)} · {file.uploader.fullName} · {viDate(file.createdAt)}
                  </small>
                  <code title="SHA-256 để đối chiếu toàn vẹn">{file.checksumSha256.slice(0, 16)}…</code>
                </div>
                <a
                  className="btn secondary"
                  href={`${env.apiBaseUrl}/compliance/files/${file.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={15} />
                  Tải
                </a>
                {editable && (
                  <button className="icon-btn" onClick={() => void removeFile(file)} title="Gỡ tệp">
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            ))}
            {!record.files.length && <p className="muted">Chưa có tệp nào. Phải đính kèm trước khi ban hành.</p>}
            {editable && (
              <div className="compliance-upload">
                <input
                  ref={input}
                  type="file"
                  onChange={event => void upload(event.target.files?.[0])}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv,.zip"
                />
                <small>Tối đa 25 MB. Chấp nhận PDF, Word, Excel, PowerPoint, ảnh, văn bản và ZIP.</small>
                {busy && <span>Đang tải lên…</span>}
              </div>
            )}
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Đóng
          </button>
          {record.status === 'ISSUED' && (
            <button className="btn secondary" onClick={() => void withdraw()}>
              Thu hồi
            </button>
          )}
          {editable && (
            <button className="btn primary" disabled={!record.files.length} onClick={() => void issue()}>
              <Check size={16} />
              Ban hành
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DocumentModal({
  operators,
  catalogue,
  onClose,
  onSaved,
  onError,
}: {
  operators: Lookup[]
  catalogue?: Catalogue
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (message: string) => void
}) {
  const [form, setForm] = useState({
    documentCode: '',
    title: '',
    type: 'PROCEDURE' as DocumentType,
    version: '1.0',
    summary: '',
    ownerId: operators[0]?.id || '',
    nextReviewAt: '',
  })
  const [codes, setCodes] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }))

  const options = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (catalogue?.controls || [])
      .filter(control => !term || `${control.code} ${control.titleVi}`.toLowerCase().includes(term))
      .slice(0, 30)
  }, [catalogue, search])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      await api.post('/compliance/documents', {
        ...form,
        summary: form.summary.trim() || undefined,
        nextReviewAt: form.nextReviewAt || undefined,
        controlCodes: codes,
      })
      await onSaved()
    } catch (reason) {
      onError(message(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form className="modal compliance-form-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <h2>Tài liệu mới</h2>
            <p>Tạo ở trạng thái bản nháp; đính kèm tệp rồi mới ban hành.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Mã tài liệu
            <input
              required
              value={form.documentCode}
              onChange={event => set('documentCode', event.target.value.toUpperCase())}
              placeholder="QT-CNTT-01"
            />
          </label>
          <label>
            Phiên bản
            <input required value={form.version} onChange={event => set('version', event.target.value)} />
          </label>
          <label className="span-2">
            Tên tài liệu
            <input required value={form.title} onChange={event => set('title', event.target.value)} />
          </label>
          <label>
            Loại
            <select value={form.type} onChange={event => set('type', event.target.value)}>
              {Object.entries(documentTypeLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Chủ sở hữu
            <select required value={form.ownerId} onChange={event => set('ownerId', event.target.value)}>
              <option value="">Chọn người chịu trách nhiệm</option>
              {operators.map(item => (
                <option value={item.id} key={item.id}>
                  {item.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Soát xét tiếp theo
            <input type="date" value={form.nextReviewAt} onChange={event => set('nextReviewAt', event.target.value)} />
          </label>
          <label className="span-2">
            Tóm tắt
            <textarea rows={2} value={form.summary} onChange={event => set('summary', event.target.value)} />
          </label>
          <div className="span-2 compliance-control-picker">
            <label>
              Kiểm soát Annex A được chứng minh
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Tìm A.5.11, thu hồi tài sản..."
              />
            </label>
            <div className="compliance-picked">
              {codes.map(code => (
                <button type="button" key={code} onClick={() => setCodes(codes.filter(item => item !== code))}>
                  {code} <X size={11} />
                </button>
              ))}
              {!codes.length && <span className="muted">Chưa chọn kiểm soát nào.</span>}
            </div>
            <div className="compliance-options">
              {options.map(control => (
                <button
                  type="button"
                  key={control.code}
                  className={codes.includes(control.code) ? 'active' : ''}
                  onClick={() =>
                    setCodes(current =>
                      current.includes(control.code)
                        ? current.filter(item => item !== control.code)
                        : [...current, control.code],
                    )
                  }
                >
                  <b>{control.code}</b>
                  <span>{control.titleVi}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn primary" disabled={saving || !form.ownerId}>
            <Upload size={16} />
            Tạo bản nháp
          </button>
        </div>
      </form>
    </div>
  )
}
