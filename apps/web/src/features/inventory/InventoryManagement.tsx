import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, LockKeyhole, Plus, ScanLine } from 'lucide-react'
import type { Asset } from '../../types'
import { env } from '../../config/env'
import { api } from '../../services/api-client'
import {
  exportInventoryReport,
  inventoryResultLabel,
  toLookupList,
  type InventoryReportItem,
  type InventoryReportSession,
  type InventoryResultCode,
} from './inventory-report'

interface InventorySessionListItem {
  id: string
  inventoryNo: string
  name: string
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'
  startedAt: string
  _count: { items: number }
}
interface NamedLookup {
  id: string
  name?: string
  fullName?: string
}
interface InventoryDetail extends InventoryReportSession {
  id: string
  summary: Partial<Record<InventoryResultCode, number>>
}
const demoSession = (assets: Asset[], results: Record<number, InventoryResultCode>): InventoryDetail => ({
  id: 'demo',
  inventoryNo: 'KK-DEMO',
  name: 'Kiểm kê tài sản',
  status: 'OPEN',
  startedAt: new Date().toISOString(),
  summary: {},
  items: assets.map(asset => ({
    id: String(asset.id),
    result: results[asset.id] || 'PENDING',
    asset: {
      assetTag: asset.code,
      name: asset.name,
      serialNumber: asset.serial,
      category: { name: asset.category },
      warehouse: { name: asset.location },
    },
    expectedLocation: { name: asset.location },
    expectedCustodian: asset.assignedTo && asset.assignedTo !== 'Chưa gán' ? { fullName: asset.assignedTo } : null,
  })),
})

export function InventoryManagement({ assets }: { assets: Asset[] }) {
  const [sessions, setSessions] = useState<InventorySessionListItem[]>([]),
    [selectedId, setSelectedId] = useState(''),
    [detail, setDetail] = useState<InventoryDetail>(),
    [demoResults, setDemoResults] = useState<Record<number, InventoryResultCode>>({}),
    [loading, setLoading] = useState(!env.demoMode),
    [working, setWorking] = useState(''),
    [locations, setLocations] = useState<NamedLookup[]>([]),
    [people, setPeople] = useState<NamedLookup[]>([]),
    [message, setMessage] = useState('')
  const loadSessions = async (preferredId?: string) => {
    const response = await api.get<{ data: InventorySessionListItem[] }>('/inventories')
    setSessions(response.data)
    setSelectedId(preferredId || selectedId || response.data[0]?.id || '')
  }
  const loadDetail = async (id: string) => setDetail(await api.get<InventoryDetail>(`/inventories/${id}`))
  useEffect(() => {
    if (env.demoMode) return
    setLoading(true)
    loadSessions()
      .catch(error => setMessage(error instanceof Error ? error.message : 'Không thể tải các đợt kiểm kê.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (env.demoMode || !selectedId) {
      if (!env.demoMode) setDetail(undefined)
      return
    }
    setLoading(true)
    loadDetail(selectedId)
      .catch(error => setMessage(error instanceof Error ? error.message : 'Không thể tải hồ sơ kiểm kê.'))
      .finally(() => setLoading(false))
  }, [selectedId])
  const report = env.demoMode ? demoSession(assets, demoResults) : detail
  const counts = useMemo(() => {
    const items = report?.items || [],
      checked = items.filter(item => item.result !== 'PENDING').length,
      discrepancy = items.filter(item => !['PENDING', 'MATCHED'].includes(item.result)).length
    return { total: items.length, checked, pending: items.length - checked, discrepancy }
  }, [report])
  const run = async (name: string, task: () => Promise<void>) => {
    setWorking(name)
    setMessage('')
    try {
      await task()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể xử lý yêu cầu.')
    } finally {
      setWorking('')
    }
  }
  const createSession = () => {
    const name = window.prompt('Tên đợt kiểm kê:')
    if (!name?.trim()) return
    void run('create', async () => {
      const created = await api.post<{ id: string }>('/inventories', { name: name.trim() })
      await loadSessions(created.id)
      await loadDetail(created.id)
      setMessage('Đã mở đợt kiểm kê và chốt phạm vi tài sản theo sổ tại thời điểm tạo.')
    })
  }
  useEffect(() => {
    if (env.demoMode) return
    // /locations answers with a bare array while /people is paged and answers with { items }.
    // Both are normalised here, and anything unexpected becomes an empty list rather than being
    // handed to .map() further down, where it would take the whole screen with it.
    void Promise.all([api.get<NamedLookup[]>('/locations'), api.get<{ items: NamedLookup[] }>('/people?limit=200')])
      .then(([locationList, peopleResult]) => {
        setLocations(toLookupList<NamedLookup>(locationList))
        setPeople(toLookupList<NamedLookup>(peopleResult))
      })
      .catch(() => undefined)
  }, [])
  const scan = () => {
    if (!detail || detail.status !== 'OPEN') return
    const value = window.prompt('Quét hoặc nhập mã tài sản / Barcode / QR / Serial:')
    if (!value?.trim()) return
    void run('scan', async () => {
      await api.post(`/inventories/${detail.id}/scan`, { value: value.trim() })
      await loadDetail(detail.id)
      setMessage('Đã ghi nhận kết quả kiểm kê và người thực hiện vào hồ sơ.')
    })
  }
  const close = () => {
    if (
      !detail ||
      detail.status !== 'OPEN' ||
      !window.confirm(
        `Chốt đợt ${detail.inventoryNo}? Tài sản chưa kiểm sẽ được ghi nhận là Thiếu và không thể sửa kết quả sau khi chốt.`,
      )
    )
      return
    void run('close', async () => {
      await api.post(`/inventories/${detail.id}/close`)
      await loadDetail(detail.id)
      await loadSessions(detail.id)
      setMessage('Đã chốt đợt kiểm kê. Các tài sản chưa kiểm được ghi nhận là Thiếu.')
    })
  }
  const exportReport = () => {
    if (!report || !report.items.length) return
    void run('export', async () => {
      await exportInventoryReport(report)
      setMessage('Đã tải file Excel đối soát theo đúng dữ liệu hồ sơ kiểm kê.')
    })
  }
  const demoMark = (id: number, value: InventoryResultCode) => setDemoResults(current => ({ ...current, [id]: value }))
  /**
   * Records what the counter actually saw for one asset. The register value is only a default; the
   * point of a count is to be able to disagree with it, which the screen previously had no way to do.
   */
  const reconcile = async (assetTag: string, body: Record<string, unknown>) => {
    if (!detail) return
    await api.post(`/inventories/${detail.id}/scan`, { value: assetTag, ...body })
    await loadDetail(detail.id)
    setMessage(`Đã ghi nhận kết quả đối soát cho ${assetTag}.`)
  }
  return (
    <main className="page inventory-page">
      <section className="page-heading">
        <div>
          <h1>Kiểm kê tài sản</h1>
          <p>
            {report
              ? `${report.inventoryNo} · ${report.name} · ${report.status === 'OPEN' ? 'Đang mở' : report.status === 'CLOSED' ? 'Đã chốt' : 'Đã hủy'}`
              : 'Tạo đợt kiểm kê để chốt phạm vi và dữ liệu theo sổ.'}
          </p>
        </div>
        <div className="heading-actions">
          {!env.demoMode && (
            <button className="btn secondary" onClick={createSession} disabled={Boolean(working)}>
              <Plus size={16} />
              Tạo đợt
            </button>
          )}
          <button className="btn secondary" onClick={exportReport} disabled={!report?.items.length || Boolean(working)}>
            <FileSpreadsheet size={16} />
            {working === 'export' ? 'Đang tạo file…' : 'Xuất đối soát'}
          </button>
          {!env.demoMode && detail?.status === 'OPEN' && (
            <button className="btn secondary" onClick={close} disabled={Boolean(working)}>
              <LockKeyhole size={16} />
              Chốt đợt
            </button>
          )}
          <button
            className="btn primary"
            onClick={env.demoMode ? undefined : scan}
            disabled={!env.demoMode && (!detail || detail.status !== 'OPEN' || Boolean(working))}
          >
            <ScanLine size={17} />
            {working === 'scan' ? 'Đang ghi nhận…' : 'Quét kiểm kê'}
          </button>
        </div>
      </section>
      {!env.demoMode && sessions.length > 0 && (
        <section className="inventory-session-bar">
          <label>
            Đợt kiểm kê
            <select value={selectedId} onChange={event => setSelectedId(event.target.value)}>
              {sessions.map(item => (
                <option value={item.id} key={item.id}>
                  {item.inventoryNo} · {item.name} ·{' '}
                  {item.status === 'OPEN' ? 'Đang mở' : item.status === 'CLOSED' ? 'Đã chốt' : 'Đã hủy'}
                </option>
              ))}
            </select>
          </label>
          <span>Dữ liệu theo sổ được chốt tại thời điểm tạo đợt.</span>
        </section>
      )}
      {message && (
        <div className="directory-message" role="status">
          {message}
        </div>
      )}
      {loading && <div className="directory-message">Đang tải hồ sơ kiểm kê…</div>}
      {!loading && !report && !env.demoMode && (
        <section className="enterprise-panel empty">
          <CheckCircle2 size={32} />
          <h3>Chưa có đợt kiểm kê</h3>
          <p>Tạo đợt để hệ thống chốt phạm vi, vị trí và người giữ theo sổ trước khi kiểm thực tế.</p>
        </section>
      )}
      {report && (
        <>
          <section className="ops-summary inventory-summary">
            {[
              ['Phạm vi', counts.total],
              ['Đã kiểm', counts.checked],
              ['Chưa kiểm', counts.pending],
              ['Chênh lệch', counts.discrepancy],
            ].map(([label, value]) => (
              <article key={String(label)}>
                <span>{label}</span>
                <b>{value}</b>
              </article>
            ))}
          </section>
          <section className="enterprise-panel">
            <div className="panel-heading">
              <div>
                <h2>Danh sách kiểm kê</h2>
                <span>{counts.total} tài sản trong phạm vi</span>
              </div>
              <div className="inventory-progress">
                <span style={{ width: `${counts.total ? (counts.checked / counts.total) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="table-scroll">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>MÃ TÀI SẢN</th>
                    <th>TÊN TÀI SẢN</th>
                    <th>SERIAL</th>
                    <th>VỊ TRÍ THEO SỔ</th>
                    <th>NGƯỜI GIỮ THEO SỔ</th>
                    <th>VỊ TRÍ THỰC TẾ</th>
                    <th>KẾT QUẢ ĐỐI SOÁT</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map(item => (
                    <InventoryRow
                      key={item.id}
                      item={item}
                      demo={env.demoMode}
                      editable={detail?.status === 'OPEN'}
                      locations={locations}
                      people={people}
                      onDemoMark={demoMark}
                      onReconcile={reconcile}
                      onError={setMessage}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function InventoryRow({
  item,
  demo,
  editable,
  locations,
  people,
  onDemoMark,
  onReconcile,
  onError,
}: {
  item: InventoryReportItem
  demo: boolean
  editable: boolean
  locations: NamedLookup[]
  people: NamedLookup[]
  onDemoMark: (id: number, value: InventoryResultCode) => void
  onReconcile: (assetTag: string, body: Record<string, unknown>) => Promise<void>
  onError: (message: string) => void
}) {
  const expectedLocation = item.expectedLocation?.name || item.asset.warehouse?.name || '—'
  const [open, setOpen] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [custodianId, setCustodianId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (found: boolean) => {
    setBusy(true)
    try {
      await onReconcile(item.asset.assetTag, {
        found,
        observedLocationId: found && locationId ? locationId : undefined,
        observedCustodianId: found && custodianId ? custodianId : undefined,
        note: note.trim() || undefined,
      })
      setOpen(false)
      setNote('')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Không ghi nhận được kết quả đối soát.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <tr>
        <td>
          <b className="table-code">{item.asset.assetTag}</b>
        </td>
        <td>{item.asset.name}</td>
        <td>{item.asset.serialNumber || '—'}</td>
        <td>{expectedLocation}</td>
        <td>{item.expectedCustodian?.fullName || 'Chưa gán'}</td>
        <td>{item.observedLocation?.name || '—'}</td>
        <td>
          {demo ? (
            <select
              value={item.result}
              onChange={event => onDemoMark(Number(item.id), event.target.value as InventoryResultCode)}
            >
              <option value="PENDING">Chưa kiểm</option>
              <option value="MATCHED">Khớp</option>
              <option value="LOCATION_MISMATCH">Sai vị trí</option>
              <option value="MISSING">Thiếu</option>
            </select>
          ) : (
            <div className="inventory-result-cell">
              <span className={`inventory-result ${item.result.toLowerCase()}`}>
                {inventoryResultLabel(item.result)}
              </span>
              {editable && (
                <button type="button" className="btn secondary" onClick={() => setOpen(current => !current)}>
                  {open ? 'Đóng' : 'Đối soát'}
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
      {open && (
        <tr className="inventory-reconcile-row">
          <td colSpan={7}>
            <div className="inventory-reconcile">
              <label>
                Vị trí thực tế
                <select value={locationId} onChange={event => setLocationId(event.target.value)}>
                  <option value="">Đúng như sổ ({expectedLocation})</option>
                  {locations.map(location => (
                    <option value={location.id} key={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Người giữ thực tế
                <select value={custodianId} onChange={event => setCustodianId(event.target.value)}>
                  <option value="">Đúng như sổ ({item.expectedCustodian?.fullName || 'Chưa gán'})</option>
                  {people.map(person => (
                    <option value={person.id} key={person.id}>
                      {person.fullName || person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ghi chú
                <input value={note} onChange={event => setNote(event.target.value)} placeholder="Tình trạng ghi nhận" />
              </label>
              <div className="inventory-reconcile-actions">
                <button type="button" className="btn primary" disabled={busy} onClick={() => void submit(true)}>
                  Ghi nhận đã thấy
                </button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => void submit(false)}>
                  Không tìm thấy
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
