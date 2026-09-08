import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Router, Search } from 'lucide-react'
import { api } from '../../services/api-client'
import { compareIp, deviceName, sinceLabel, statusLabels, toList, type NetDevice, type NetSubnet } from './netmon-model'
import { NetworkDeviceDrawer } from './NetworkDeviceDrawer'

/** The flat register of everything found on the network, and the queue of what still needs linking. */
export function NetworkDevices({ role }: { role: string }) {
  const [devices, setDevices] = useState<NetDevice[]>([]),
    [subnets, setSubnets] = useState<NetSubnet[]>([]),
    [search, setSearch] = useState(''),
    [subnetId, setSubnetId] = useState(''),
    [status, setStatus] = useState(''),
    [link, setLink] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<NetDevice>()

  const load = async () => {
    setError('')
    try {
      const params = new URLSearchParams({ limit: '500' })
      if (search.trim()) params.set('search', search.trim())
      if (subnetId) params.set('subnetId', subnetId)
      if (status) params.set('status', status)
      if (link) params.set('link', link)
      const response = await api.get<{ data: NetDevice[] }>(`/netmon/devices?${params}`)
      setDevices(toList<NetDevice>(response))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được danh sách thiết bị')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [search, subnetId, status, link])
  useEffect(() => {
    void api
      .get<NetSubnet[]>('/netmon/subnets')
      .then(response => setSubnets(toList<NetSubnet>(response)))
      .catch(() => undefined)
  }, [])

  const rows = useMemo(() => [...devices].sort((a, b) => compareIp(a.ipAddress, b.ipAddress)), [devices])
  const unlinked = devices.filter(device => !device.assetId).length

  return (
    <main className="page netmon-page">
      <section className="page-heading">
        <div>
          <h1>Thiết bị mạng</h1>
          <p>
            {devices.length} thiết bị · {unlinked} chưa gắn tài sản
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

      <section className="netmon-toolbar">
        <label className="netmon-search">
          <Search size={15} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Tìm theo IP, MAC, hãng, mã tài sản…"
          />
        </label>
        <select value={subnetId} onChange={event => setSubnetId(event.target.value)}>
          <option value="">Tất cả dải mạng</option>
          {subnets.map(subnet => (
            <option value={subnet.id} key={subnet.id}>
              {subnet.name} · {subnet.cidr}
            </option>
          ))}
        </select>
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {(['UP', 'DOWN', 'UNKNOWN', 'PAUSED'] as const).map(value => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
        <select value={link} onChange={event => setLink(event.target.value)}>
          <option value="">Gắn tài sản: tất cả</option>
          <option value="unlinked">Chưa gắn tài sản</option>
          <option value="linked">Đã gắn tài sản</option>
        </select>
      </section>

      {loading && <div className="directory-message">Đang tải thiết bị…</div>}

      {!loading && !rows.length && (
        <section className="enterprise-panel empty">
          <Router size={32} />
          <h3>Không có thiết bị phù hợp</h3>
          <p>Thử bỏ bớt bộ lọc, hoặc quét lại dải mạng trong Cài đặt → Dải mạng.</p>
        </section>
      )}

      {rows.length > 0 && (
        <section className="enterprise-panel">
          <div className="table-scroll">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>TRẠNG THÁI</th>
                  <th>ĐỊA CHỈ IP</th>
                  <th>THIẾT BỊ</th>
                  <th>MAC / HÃNG</th>
                  <th>DẢI MẠNG</th>
                  <th>PHÒNG BAN</th>
                  <th>NGƯỜI SỬ DỤNG</th>
                  <th>PHẢN HỒI</th>
                  <th>THẤY LẦN CUỐI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(device => (
                  <tr key={device.id} onClick={() => setSelected(device)} className="netmon-row">
                    <td>
                      <span className={`netmon-status ${device.status.toLowerCase()}`}>
                        {statusLabels[device.status]}
                      </span>
                    </td>
                    <td>
                      <b className="table-code">{device.ipAddress}</b>
                    </td>
                    <td>{deviceName(device)}</td>
                    <td>
                      <div className="netmon-cell-stack">
                        <span>{device.macAddress || '—'}</span>
                        <small>{device.vendor || ''}</small>
                      </div>
                    </td>
                    <td>{device.subnet?.name || '—'}</td>
                    <td>{device.asset?.currentCustodian?.department?.name || device.asset?.department?.name || '—'}</td>
                    <td>{device.asset?.currentCustodian?.fullName || '—'}</td>
                    <td>
                      {device.status === 'UP' && device.responseTimeMs !== null && device.responseTimeMs !== undefined
                        ? `${device.responseTimeMs} ms`
                        : '—'}
                    </td>
                    <td>{sinceLabel(device.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
