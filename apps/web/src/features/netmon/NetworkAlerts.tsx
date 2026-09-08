import { useEffect, useState } from 'react'
import { BellRing, CheckCircle2, RefreshCw } from 'lucide-react'
import { api } from '../../services/api-client'
import { deviceName, outageLabel, sinceLabel, toList, type NetAlert } from './netmon-model'
import { NetworkDeviceDrawer } from './NetworkDeviceDrawer'

/**
 * Open outages. An alert closes itself the moment the device answers again, so anything listed here
 * is still down - acknowledging only records that somebody has picked it up.
 */
export function NetworkAlerts({ role }: { role: string }) {
  const [alerts, setAlerts] = useState<NetAlert[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [selectedDevice, setSelectedDevice] = useState<string>()
  const canManage = role === 'Admin' || role === 'IT'

  const load = async () => {
    setError('')
    try {
      setAlerts(toList<NetAlert>(await api.get<NetAlert[]>('/netmon/alerts')))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được cảnh báo')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 30000)
    return () => clearInterval(timer)
  }, [])

  const acknowledge = async (alert: NetAlert) => {
    const note = window.prompt(`Ghi chú xử lý cho ${deviceName(alert.device)}:`, 'Đang kiểm tra')
    if (note === null) return
    setBusy(alert.id)
    try {
      await api.post(`/netmon/alerts/${alert.id}/acknowledge`, { note: note.trim() || undefined })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không ghi nhận được')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="page netmon-page">
      <section className="page-heading">
        <div>
          <h1>Cảnh báo mạng</h1>
          <p>
            {alerts.length ? `${alerts.length} thiết bị đang mất kết nối` : 'Không có thiết bị nào đang mất kết nối'}
          </p>
        </div>
        <div className="heading-actions">
          <button className="btn secondary" onClick={() => void load()}>
            <RefreshCw size={16} />
            Làm mới
          </button>
        </div>
      </section>

      {error && (
        <div className="directory-message" role="alert">
          {error}
        </div>
      )}
      {loading && <div className="directory-message">Đang tải cảnh báo…</div>}

      {!loading && !alerts.length && (
        <section className="enterprise-panel empty">
          <CheckCircle2 size={32} />
          <h3>Mạng đang ổn định</h3>
          <p>Cảnh báo tự đóng ngay khi thiết bị phản hồi trở lại, nên danh sách trống nghĩa là không còn sự cố.</p>
        </section>
      )}

      {alerts.length > 0 && (
        <section className="enterprise-panel">
          <div className="table-scroll">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>THIẾT BỊ</th>
                  <th>ĐỊA CHỈ IP</th>
                  <th>PHÒNG BAN</th>
                  <th>NGƯỜI SỬ DỤNG</th>
                  <th>MẤT KẾT NỐI TỪ</th>
                  <th>ĐÃ KÉO DÀI</th>
                  <th>TÌNH TRẠNG</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map(alert => (
                  <tr key={alert.id}>
                    <td>
                      <button type="button" className="text-link" onClick={() => setSelectedDevice(alert.device.id)}>
                        {deviceName(alert.device)}
                      </button>
                    </td>
                    <td>
                      <b className="table-code">{alert.device.ipAddress}</b>
                    </td>
                    <td>
                      {alert.device.asset?.currentCustodian?.department?.name ||
                        alert.device.asset?.department?.name ||
                        'Chưa gán'}
                    </td>
                    <td>{alert.device.asset?.currentCustodian?.fullName || '—'}</td>
                    <td>{sinceLabel(alert.downSince)}</td>
                    <td>
                      <b>{outageLabel(alert.downSince)}</b>
                    </td>
                    <td>
                      {alert.status === 'ACKNOWLEDGED' ? (
                        <div className="netmon-cell-stack">
                          <span className="netmon-status paused">Đã tiếp nhận</span>
                          <small>
                            {alert.acknowledger?.fullName || ''}
                            {alert.note ? ` · ${alert.note}` : ''}
                          </small>
                        </div>
                      ) : (
                        <span className="netmon-status down">Chưa xử lý</span>
                      )}
                    </td>
                    <td>
                      {canManage && alert.status === 'OPEN' && (
                        <button
                          className="btn secondary"
                          disabled={busy === alert.id}
                          onClick={() => void acknowledge(alert)}
                        >
                          <BellRing size={15} />
                          Tiếp nhận
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedDevice && (
        <NetworkDeviceDrawer
          deviceId={selectedDevice}
          role={role}
          onClose={() => setSelectedDevice(undefined)}
          onChanged={() => void load()}
        />
      )}
    </main>
  )
}
