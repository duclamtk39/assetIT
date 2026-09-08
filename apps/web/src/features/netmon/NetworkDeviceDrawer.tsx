import { useEffect, useState } from 'react'
import { Link2, Link2Off, PauseCircle, PlayCircle, Trash2, X } from 'lucide-react'
import { api } from '../../services/api-client'
import {
  deviceName,
  sinceLabel,
  statusLabels,
  uptimeFromSamples,
  type NetAlert,
  type NetDevice,
  type NetEvent,
  type NetSample,
} from './netmon-model'

interface DeviceDetail extends NetDevice {
  events: NetEvent[]
  samples: NetSample[]
  alerts: NetAlert[]
  uptimePercent?: number
}

interface AssetOption {
  id: string
  assetTag: string
  name: string
  confidence?: number
  reason?: string
}

/**
 * Everything known about one address, and the two decisions a person makes about it: which asset it
 * is, and whether it should be watched. Linking is deliberately a person's action - the scanner only
 * suggests - so this is where the register actually gets its network data.
 */
export function NetworkDeviceDrawer({
  deviceId,
  role,
  onClose,
  onChanged,
}: {
  deviceId: string
  role: string
  onClose: () => void
  onChanged: () => void
}) {
  const [device, setDevice] = useState<DeviceDetail>(),
    [suggestions, setSuggestions] = useState<AssetOption[]>([]),
    [assets, setAssets] = useState<AssetOption[]>([]),
    [assetId, setAssetId] = useState(''),
    [copyFields, setCopyFields] = useState(true),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const canManage = role === 'Admin' || role === 'IT'

  const load = async () => {
    try {
      const detail = await api.get<DeviceDetail>(`/netmon/devices/${deviceId}?days=7`)
      setDevice(detail)
      if (!detail.assetId) {
        const hints = await api.get<AssetOption[]>(`/netmon/devices/${deviceId}/suggestions`)
        setSuggestions(hints)
        setAssetId(hints[0]?.id || '')
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Không tải được thiết bị')
    }
  }
  useEffect(() => {
    void load()
  }, [deviceId])
  useEffect(() => {
    if (!canManage) return
    void api
      .get<{ data: Array<{ id: string; assetTag: string; name: string }> }>('/assets?limit=500')
      .then(response => setAssets(response.data || []))
      .catch(() => undefined)
  }, [canManage])

  const act = async (task: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setMessage('')
    try {
      await task()
      await load()
      onChanged()
      setMessage(success)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Không thực hiện được')
    } finally {
      setBusy(false)
    }
  }

  if (!device)
    return (
      <div className="netmon-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
        <aside className="netmon-drawer">
          <div className="directory-message">{message || 'Đang tải thiết bị…'}</div>
        </aside>
      </div>
    )

  const uptime = device.uptimePercent ?? uptimeFromSamples(device.samples)
  const facts: Array<[string, string]> = [
    ['Địa chỉ IP', device.ipAddress],
    ['Địa chỉ MAC', device.macAddress || 'Không đọc được (thiết bị khác lớp mạng)'],
    ['Hãng (theo OUI)', device.vendor || '—'],
    ['Dải mạng', device.subnet ? `${device.subnet.name} · ${device.subnet.cidr}` : '—'],
    ['VLAN', device.subnet?.vlanId ? String(device.subnet.vlanId) : '—'],
    ['Cổng mở', device.openPorts.length ? device.openPorts.join(', ') : '—'],
    [
      'Phản hồi gần nhất',
      device.responseTimeMs === null || device.responseTimeMs === undefined ? '—' : `${device.responseTimeMs} ms`,
    ],
    ['Thấy lần cuối', sinceLabel(device.lastSeenAt)],
    ['Kiểm tra lần cuối', sinceLabel(device.lastCheckedAt)],
    ['Uptime 7 ngày', uptime === undefined ? 'Chưa đủ dữ liệu' : `${uptime}%`],
  ]

  return (
    <div className="netmon-drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="netmon-drawer">
        <header>
          <div>
            <span className={`netmon-status ${device.status.toLowerCase()}`}>{statusLabels[device.status]}</span>
            <h2>{deviceName(device)}</h2>
            <p>{device.ipAddress}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {message && (
          <div className="directory-message" role="status">
            {message}
          </div>
        )}

        <section className="netmon-facts">
          <dl>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="netmon-drawer-section">
          <h3>Tài sản trong sổ</h3>
          {device.asset ? (
            <>
              <dl className="netmon-asset">
                <div>
                  <dt>Mã tài sản</dt>
                  <dd>
                    {device.asset.assetTag} · {device.asset.name}
                  </dd>
                </div>
                <div>
                  <dt>Loại</dt>
                  <dd>{device.asset.category?.name || '—'}</dd>
                </div>
                <div>
                  <dt>Người sử dụng</dt>
                  <dd>{device.asset.currentCustodian?.fullName || 'Chưa gán'}</dd>
                </div>
                <div>
                  <dt>Phòng ban</dt>
                  <dd>{device.asset.currentCustodian?.department?.name || device.asset.department?.name || '—'}</dd>
                </div>
                <div>
                  <dt>Vị trí</dt>
                  <dd>{device.asset.location?.name || '—'}</dd>
                </div>
              </dl>
              {canManage && (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(() => api.post(`/netmon/devices/${device.id}/unlink`), 'Đã gỡ liên kết tài sản.')
                  }
                >
                  <Link2Off size={15} />
                  Gỡ liên kết
                </button>
              )}
            </>
          ) : (
            <>
              <p className="netmon-hint">
                Thiết bị này chưa gắn với tài sản nào, nên nó chưa có phòng ban và người sử dụng trên sơ đồ.
              </p>
              {suggestions.length > 0 && (
                <p className="netmon-hint">
                  Gợi ý: <b>{suggestions[0].assetTag}</b> — {suggestions[0].reason} ({suggestions[0].confidence}%)
                </p>
              )}
              {canManage && (
                <div className="netmon-link-form">
                  <select value={assetId} onChange={event => setAssetId(event.target.value)}>
                    <option value="">Chọn tài sản…</option>
                    {assets.map(asset => (
                      <option value={asset.id} key={asset.id}>
                        {asset.assetTag} · {asset.name}
                      </option>
                    ))}
                  </select>
                  <label className="netmon-check">
                    <input
                      type="checkbox"
                      checked={copyFields}
                      onChange={event => setCopyFields(event.target.checked)}
                    />
                    Ghi IP/MAC vào hồ sơ tài sản
                  </label>
                  <button
                    className="btn primary"
                    disabled={!assetId || busy}
                    onClick={() =>
                      void act(
                        () => api.post(`/netmon/devices/${device.id}/link`, { assetId, copyNetworkFields: copyFields }),
                        'Đã gắn thiết bị vào tài sản.',
                      )
                    }
                  >
                    <Link2 size={15} />
                    Gắn tài sản
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {canManage && (
          <section className="netmon-drawer-section">
            <h3>Theo dõi</h3>
            <div className="netmon-actions">
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => api.patch(`/netmon/devices/${device.id}`, { monitored: !device.monitored }),
                    device.monitored ? 'Đã tạm dừng theo dõi thiết bị.' : 'Đã bật theo dõi lại.',
                  )
                }
              >
                {device.monitored ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                {device.monitored ? 'Tạm dừng theo dõi' : 'Bật theo dõi'}
              </button>
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Xóa bản ghi thiết bị ${device.ipAddress}? Lần quét sau sẽ tìm lại nếu nó còn online.`,
                    )
                  )
                    return
                  void act(() => api.delete(`/netmon/devices/${device.id}`), 'Đã xóa bản ghi thiết bị.').then(onClose)
                }}
              >
                <Trash2 size={15} />
                Xóa bản ghi
              </button>
            </div>
          </section>
        )}

        <section className="netmon-drawer-section">
          <h3>Lịch sử 7 ngày</h3>
          {device.events.length ? (
            <ul className="netmon-events">
              {device.events.map(event => (
                <li key={event.id} className={event.toStatus.toLowerCase()}>
                  <span className="netmon-node-dot" />
                  <div>
                    <b>{statusLabels[event.toStatus]}</b>
                    <small>{event.detail || ''}</small>
                  </div>
                  <time>{sinceLabel(event.occurredAt)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="netmon-hint">Chưa ghi nhận lần đổi trạng thái nào.</p>
          )}
        </section>
      </aside>
    </div>
  )
}
