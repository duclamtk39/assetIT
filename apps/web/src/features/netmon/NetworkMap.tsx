import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Network, RefreshCw, Router, Search, Wifi, WifiOff } from 'lucide-react'
import { api } from '../../services/api-client'
import { compareIp, deviceName, sinceLabel, statusLabels, type NetDevice, type NetOverview } from './netmon-model'
import { NetworkDeviceDrawer } from './NetworkDeviceDrawer'

const emptyOverview: NetOverview = {
  totals: { devices: 0, up: 0, down: 0, unknown: 0, paused: 0, linked: 0, openAlerts: 0, subnets: 0 },
  subnets: [],
  groups: [],
  recentEvents: [],
}

/**
 * The map. Devices are grouped by the department of the asset they are linked to, which is the only
 * grouping the register can actually justify - there is no switch topology to read. Anything not yet
 * linked lands in its own group rather than being hidden, so the gap between what is on the network
 * and what is in the register stays visible.
 */
export function NetworkMap({ role }: { role: string }) {
  const [overview, setOverview] = useState<NetOverview>(emptyOverview),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [statusFilter, setStatusFilter] = useState(''),
    [selected, setSelected] = useState<NetDevice>()

  const load = async () => {
    setError('')
    try {
      setOverview(await api.get<NetOverview>('/netmon/overview'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được sơ đồ mạng')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    // The poller writes on its own schedule, so the map refreshes rather than waiting for a reload.
    const timer = setInterval(() => void load(), 30000)
    return () => clearInterval(timer)
  }, [])

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    return overview.groups
      .map(group => ({
        ...group,
        devices: group.devices
          .filter(device => !statusFilter || device.status === statusFilter)
          .filter(
            device =>
              !term ||
              deviceName(device).toLowerCase().includes(term) ||
              device.ipAddress.includes(term) ||
              (device.macAddress || '').toLowerCase().includes(term) ||
              (device.vendor || '').toLowerCase().includes(term),
          )
          .sort((a, b) => compareIp(a.ipAddress, b.ipAddress)),
      }))
      .filter(group => group.devices.length)
  }, [overview, search, statusFilter])

  const { totals } = overview
  const kpis = [
    { label: 'Thiết bị phát hiện', value: totals.devices, icon: Router, tone: '' },
    { label: 'Đang hoạt động', value: totals.up, icon: Wifi, tone: 'up' },
    { label: 'Mất kết nối', value: totals.down, icon: WifiOff, tone: 'down' },
    { label: 'Cảnh báo đang mở', value: totals.openAlerts, icon: AlertTriangle, tone: 'alert' },
    { label: 'Đã gắn tài sản', value: `${totals.linked}/${totals.devices}`, icon: Activity, tone: '' },
  ]

  return (
    <main className="page netmon-page">
      <section className="page-heading">
        <div>
          <h1>Sơ đồ mạng nội bộ</h1>
          <p>
            {totals.subnets
              ? `${totals.subnets} dải mạng đang theo dõi · nhóm theo phòng ban của tài sản đã gắn`
              : 'Chưa khai báo dải mạng nào. Vào Cài đặt → Dải mạng để bắt đầu.'}
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

      <section className="netmon-kpis">
        {kpis.map(kpi => (
          <article key={kpi.label} className={kpi.tone}>
            <span>
              <kpi.icon size={18} />
            </span>
            <div>
              <small>{kpi.label}</small>
              <b>{kpi.value}</b>
            </div>
          </article>
        ))}
      </section>

      {totals.devices > 0 && (
        <section className="netmon-toolbar">
          <label className="netmon-search">
            <Search size={15} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Tìm theo IP, MAC, tên thiết bị, hãng…"
            />
          </label>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {(['UP', 'DOWN', 'UNKNOWN', 'PAUSED'] as const).map(status => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </section>
      )}

      {loading && <div className="directory-message">Đang tải sơ đồ mạng…</div>}

      {!loading && !totals.devices && (
        <section className="enterprise-panel empty">
          <Network size={32} />
          <h3>Chưa có thiết bị nào</h3>
          <p>
            Khai báo dải mạng trong Cài đặt → Dải mạng rồi bấm Quét. Thiết bị tìm được sẽ hiện ở đây và chờ Admin gắn
            vào tài sản.
          </p>
        </section>
      )}

      {groups.map(group => (
        <section className="enterprise-panel netmon-group" key={group.key}>
          <div className="panel-heading">
            <div>
              <h2>{group.name}</h2>
              <span>
                {group.devices.length} thiết bị · {group.devices.filter(device => device.status === 'UP').length} online
              </span>
            </div>
          </div>
          <div className="netmon-grid">
            {group.devices.map(device => (
              <button
                type="button"
                key={device.id}
                className={`netmon-node ${device.status.toLowerCase()}`}
                onClick={() => setSelected(device)}
              >
                <span className="netmon-node-dot" />
                <b>{deviceName(device)}</b>
                <small>{device.ipAddress}</small>
                <small className="netmon-node-meta">
                  {device.vendor || device.subnet?.name || '—'}
                  {device.responseTimeMs !== null && device.responseTimeMs !== undefined && device.status === 'UP'
                    ? ` · ${device.responseTimeMs} ms`
                    : ''}
                </small>
                {device.status === 'DOWN' && (
                  <small className="netmon-node-down">Mất {sinceLabel(device.lastSeenAt)}</small>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}

      {overview.recentEvents.length > 0 && (
        <section className="enterprise-panel">
          <div className="panel-heading">
            <div>
              <h2>Diễn biến gần đây</h2>
              <span>Chỉ ghi khi thiết bị đổi trạng thái</span>
            </div>
          </div>
          <ul className="netmon-events">
            {overview.recentEvents.map(event => (
              <li key={event.id} className={event.toStatus.toLowerCase()}>
                <span className="netmon-node-dot" />
                <div>
                  <b>
                    {event.device?.asset
                      ? `${event.device.asset.assetTag} · ${event.device.asset.name}`
                      : event.device?.label || event.device?.ipAddress}
                  </b>
                  <small>{event.detail || statusLabels[event.toStatus]}</small>
                </div>
                <time>{sinceLabel(event.occurredAt)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <NetworkDeviceDrawer
          deviceId={selected.id}
          role={role}
          onClose={() => setSelected(undefined)}
          onChanged={() => void load()}
        />
      )}
    </main>
  )
}
