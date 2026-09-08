import { createElement, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  Cloud,
  HardDrive,
  Laptop,
  Monitor,
  Network,
  Printer,
  RefreshCw,
  Router,
  Server,
  Smartphone,
  Wifi,
  XCircle,
} from 'lucide-react'
import { api } from '../../services/api-client'
import { sinceLabel, type NetDevice } from './netmon-model'
import {
  emptyDashboard,
  hourLabel,
  linePoints,
  niceScale,
  outageDuration,
  ringDash,
  severityLabels,
  share,
  siteStatusLabels,
  type Bucket,
  type NetDashboard,
} from './netmon-dashboard'
import { NetworkDeviceDrawer } from './NetworkDeviceDrawer'

const CHART_WIDTH = 640
const CHART_HEIGHT = 150

/**
 * Category names are free text, so the icon is matched on what the name contains. It is rendered
 * through createElement rather than assigned to a capitalised local: the lint rule cannot tell that
 * lookup from defining a component inside render, and a component defined there resets its state on
 * every pass.
 */
function iconFor(name: string) {
  const value = name.toLowerCase()
  if (value.includes('server') || value.includes('máy chủ')) return Server
  if (value.includes('laptop')) return Laptop
  if (value.includes('pc') || value.includes('desktop') || value.includes('máy tính')) return Monitor
  if (value.includes('camera')) return Camera
  if (value.includes('wifi') || value.includes('wi-fi') || value.includes('access point')) return Wifi
  if (value.includes('switch') || value.includes('router') || value.includes('firewall') || value.includes('mạng'))
    return Router
  if (value.includes('in') && value.includes('máy')) return Printer
  if (value.includes('phone') || value.includes('điện thoại')) return Smartphone
  if (value.includes('nas') || value.includes('storage') || value.includes('lưu trữ')) return HardDrive
  return Network
}

export function NetworkDashboard({ role }: { role: string }) {
  const [data, setData] = useState<NetDashboard>(emptyDashboard),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [clock, setClock] = useState(() => new Date()),
    [device, setDevice] = useState<NetDevice>()

  const load = async () => {
    setError('')
    try {
      setData(await api.get<NetDashboard>('/netmon/dashboard'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được tổng quan hạ tầng')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    const refresh = setInterval(() => void load(), 30000)
    const tick = setInterval(() => setClock(new Date()), 1000)
    return () => {
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [])

  const { totals, healthPercent } = data
  const avgScale = useMemo(
    () => niceScale(data.responseSeries.flatMap(point => [point.avgResponseMs, point.maxResponseMs])),
    [data.responseSeries],
  )
  const avgLine = linePoints(
    data.responseSeries.map(point => point.avgResponseMs),
    avgScale,
    CHART_WIDTH,
    CHART_HEIGHT,
  )
  const maxLine = linePoints(
    data.responseSeries.map(point => point.maxResponseMs),
    avgScale,
    CHART_WIDTH,
    CHART_HEIGHT,
  )
  const latest = [...data.responseSeries].reverse().find(point => point.avgResponseMs !== null)
  const measured = data.responseSeries.filter(point => point.avgResponseMs !== null)
  const overallAvg = measured.length
    ? Math.round(measured.reduce((sum, point) => sum + (point.avgResponseMs || 0), 0) / measured.length)
    : null
  const peak = measured.length ? Math.max(...measured.map(point => point.maxResponseMs || 0)) : null
  const ring = ringDash(healthPercent, 52)

  const kpis = [
    {
      key: 'total',
      label: 'Tổng thiết bị',
      value: totals.devices,
      icon: Router,
      tone: 'blue',
      note: data.trend.newDevices ? `+${data.trend.newDevices} phát hiện mới trong 7 ngày` : 'Không có thiết bị mới',
    },
    {
      key: 'up',
      label: 'Hoạt động',
      value: totals.healthy,
      icon: CheckCircle2,
      tone: 'green',
      note: `${share(totals.healthy, totals.devices)}% tổng số`,
    },
    {
      key: 'warn',
      label: 'Cảnh báo',
      value: totals.warning,
      icon: AlertTriangle,
      tone: 'amber',
      note: `${share(totals.warning, totals.devices)}% · đã mất gói nhưng chưa quá ngưỡng`,
    },
    {
      key: 'down',
      label: 'Mất kết nối',
      value: totals.down,
      icon: XCircle,
      tone: 'red',
      note: `${share(totals.down, totals.devices)}% · ${data.trend.outagesOpened} sự cố trong 7 ngày`,
    },
  ]

  return (
    <main className="page netmon-page netmon-dash">
      <section className="netmon-dash-head">
        <div>
          <h1>Tổng quan hạ tầng</h1>
          <p>Giám sát toàn bộ thiết bị mạng của doanh nghiệp</p>
        </div>
        <div className="netmon-dash-clock">
          <span>
            <CalendarDays size={15} />
            {clock.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <b>{clock.toLocaleTimeString('vi-VN', { hour12: false })}</b>
        </div>
        <button className="btn secondary" onClick={() => void load()}>
          <RefreshCw size={16} />
          Làm mới
        </button>
      </section>

      {error && (
        <div className="directory-message" role="alert">
          {error}
        </div>
      )}
      {loading && <div className="directory-message">Đang tải tổng quan hạ tầng…</div>}

      {!loading && !totals.devices && (
        <section className="enterprise-panel empty">
          <Network size={32} />
          <h3>Chưa có thiết bị nào để giám sát</h3>
          <p>Khai báo dải mạng trong Cài đặt → Dải mạng rồi bấm Quét; số liệu ở đây sinh ra từ kết quả quét.</p>
        </section>
      )}

      {totals.devices > 0 && (
        <>
          <section className="netmon-dash-kpis">
            {kpis.map(kpi => (
              <article key={kpi.key} className={kpi.tone}>
                <span>
                  <kpi.icon size={20} />
                </span>
                <div>
                  <small>{kpi.label}</small>
                  <b>{kpi.value}</b>
                  <em>{kpi.note}</em>
                </div>
              </article>
            ))}
            <article className="netmon-health">
              <svg viewBox="0 0 120 120" role="img" aria-label={`Sức khỏe hệ thống ${healthPercent}%`}>
                <circle cx="60" cy="60" r="52" className="netmon-ring-track" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  className={`netmon-ring-value ${healthPercent >= 95 ? 'good' : healthPercent >= 80 ? 'warn' : 'bad'}`}
                  strokeDasharray={ring.circumference}
                  strokeDashoffset={ring.offset}
                />
                <text x="60" y="66" textAnchor="middle" className="netmon-ring-label">
                  {healthPercent}%
                </text>
              </svg>
              <div>
                <small>Sức khỏe hệ thống</small>
                <ul>
                  <li className="up">
                    <i /> Hoạt động <b>{totals.healthy}</b>
                  </li>
                  <li className="warn">
                    <i /> Cảnh báo <b>{totals.warning}</b>
                  </li>
                  <li className="down">
                    <i /> Mất kết nối <b>{totals.down}</b>
                  </li>
                  <li className="total">
                    <i /> Tổng <b>{totals.devices}</b>
                  </li>
                </ul>
              </div>
            </article>
          </section>

          <section className="netmon-dash-grid">
            <article className="enterprise-panel">
              <div className="panel-heading">
                <div>
                  <h2>Trạng thái theo loại thiết bị</h2>
                  <span>Loại lấy từ nhóm tài sản đã gắn</span>
                </div>
              </div>
              <div className="netmon-type-grid">
                {data.categories.map(category => (
                  <CategoryCard key={category.key} bucket={category} />
                ))}
              </div>
            </article>

            <article className="enterprise-panel">
              <div className="panel-heading">
                <div>
                  <h2>Thời gian phản hồi mạng</h2>
                  <span>24 giờ gần nhất · trung bình theo giờ</span>
                </div>
              </div>
              <div className="netmon-chart">
                <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img">
                  {avgScale.ticks.map(tick => {
                    const y = CHART_HEIGHT - (tick / avgScale.max) * CHART_HEIGHT
                    return <line key={tick} x1="0" x2={CHART_WIDTH} y1={y} y2={y} className="netmon-grid-line" />
                  })}
                  {maxLine && <polyline points={maxLine} className="netmon-line max" />}
                  {avgLine && <polyline points={avgLine} className="netmon-line avg" />}
                </svg>
                <div className="netmon-chart-axis">
                  {avgScale.ticks
                    .slice()
                    .reverse()
                    .map(tick => (
                      <span key={tick}>{tick} ms</span>
                    ))}
                </div>
              </div>
              <div className="netmon-chart-hours">
                {data.responseSeries
                  .filter((_, index) => index % 4 === 0)
                  .map(point => (
                    <span key={point.hour}>{hourLabel(point.hour)}</span>
                  ))}
              </div>
              <div className="netmon-chart-legend">
                <span className="avg">
                  <i /> Trung bình <b>{latest?.avgResponseMs ?? '—'} ms</b> · 24h <b>{overallAvg ?? '—'} ms</b>
                </span>
                <span className="max">
                  <i /> Cao nhất <b>{peak ?? '—'} ms</b>
                </span>
              </div>
              {!data.capabilities.bandwidth && (
                <p className="netmon-note">
                  Chưa đo được băng thông vào/ra: số liệu đó phải đọc counter cổng switch qua SNMP, hệ thống hiện chưa
                  thu thập. Biểu đồ này là thời gian phản hồi đo thật từ chính các lượt kiểm tra.
                </p>
              )}
            </article>

            <article className="enterprise-panel">
              <div className="panel-heading">
                <div>
                  <h2>Cảnh báo ưu tiên</h2>
                  <span>Xếp theo mức độ rồi đến thời gian mất kết nối</span>
                </div>
              </div>
              {data.alerts.length ? (
                <ul className="netmon-alert-list">
                  {data.alerts.slice(0, 8).map(alert => (
                    <li key={alert.id}>
                      <span className={`netmon-sev ${alert.severity.toLowerCase()}`}>
                        {severityLabels[alert.severity]}
                      </span>
                      <div>
                        <b>{alert.name}</b>
                        <small>
                          {alert.ipAddress} · {alert.site}
                        </small>
                      </div>
                      <em>{outageDuration(alert.minutesDown)}</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="netmon-note">Không có thiết bị nào đang mất kết nối.</p>
              )}
              <p className="netmon-note">
                Mức độ tính từ thời gian mất kết nối: dưới 15 phút là Trung bình, từ 15 phút là Cao, từ 60 phút là
                Nghiêm trọng. Thiết bị hạ tầng (switch, router, firewall, máy chủ) được nâng thêm một mức.
              </p>
            </article>

            <article className="enterprise-panel">
              <div className="panel-heading">
                <div>
                  <h2>Trạng thái theo vị trí</h2>
                  <span>Vị trí lấy từ tài sản, thiếu thì lấy theo dải mạng</span>
                </div>
              </div>
              <div className="table-scroll">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>VỊ TRÍ</th>
                      <th>THIẾT BỊ</th>
                      <th>HOẠT ĐỘNG</th>
                      <th>CẢNH BÁO</th>
                      <th>MẤT KẾT NỐI</th>
                      <th>TRẠNG THÁI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sites.map(site => (
                      <tr key={site.key}>
                        <td>
                          <span className="netmon-site-name">
                            <Building2 size={14} />
                            {site.name}
                          </span>
                        </td>
                        <td>{site.devices}</td>
                        <td>{site.up}</td>
                        <td className={site.warning ? 'netmon-num-warn' : ''}>{site.warning}</td>
                        <td className={site.down ? 'netmon-num-down' : ''}>{site.down}</td>
                        <td>
                          <span className={`netmon-site-status ${site.status.toLowerCase()}`}>
                            {siteStatusLabels[site.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="enterprise-panel netmon-topology-panel">
              <div className="panel-heading">
                <div>
                  <h2>Sơ đồ mạng tổng quan</h2>
                  <span>Theo dải mạng đã khai và nhóm tài sản</span>
                </div>
              </div>
              <div className="netmon-topology">
                <div className="netmon-topo-root">
                  <Cloud size={20} />
                  <b>Internet</b>
                </div>
                <div className="netmon-topo-subnets">
                  {data.topology.map(subnet => (
                    <div className="netmon-topo-subnet" key={subnet.id}>
                      <div className={`netmon-topo-node ${subnet.down ? 'down' : subnet.warning ? 'warn' : 'up'}`}>
                        <Network size={17} />
                        <b>{subnet.name}</b>
                        <small>{subnet.cidr}</small>
                        <small>{subnet.devices} thiết bị</small>
                      </div>
                      <div className="netmon-topo-leaves">
                        {subnet.groups.map(group => (
                          <div
                            className={`netmon-topo-leaf ${group.down ? 'down' : group.warning ? 'warn' : 'up'}`}
                            key={group.key}
                          >
                            {createElement(iconFor(group.name), { size: 16 })}
                            <b>{group.name}</b>
                            <small>{group.devices} thiết bị</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {!data.capabilities.topologyDiscovery && (
                <p className="netmon-note">
                  Đây là sơ đồ theo cấu trúc khai báo, không phải sơ đồ đấu nối vật lý. Muốn vẽ đúng thiết bị nào cắm
                  cổng nào của switch thì phải đọc bảng MAC và LLDP qua SNMP.
                </p>
              )}
            </article>

            <article className="enterprise-panel">
              <div className="panel-heading">
                <div>
                  <h2>Diễn biến gần đây</h2>
                  <span>Chỉ ghi khi thiết bị đổi trạng thái</span>
                </div>
              </div>
              {data.recentEvents.length ? (
                <ul className="netmon-events">
                  {data.recentEvents.map(event => (
                    <li key={event.id} className={event.toStatus.toLowerCase()}>
                      <span className="netmon-node-dot" />
                      <div>
                        <b>
                          {event.device?.asset
                            ? `${event.device.asset.assetTag} · ${event.device.asset.name}`
                            : event.device?.label || event.device?.ipAddress}
                        </b>
                        <small>{event.detail || ''}</small>
                      </div>
                      <time>{sinceLabel(event.occurredAt)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="netmon-note">Chưa ghi nhận lần đổi trạng thái nào.</p>
              )}
            </article>
          </section>
        </>
      )}

      {device && (
        <NetworkDeviceDrawer
          deviceId={device.id}
          role={role}
          onClose={() => setDevice(undefined)}
          onChanged={() => void load()}
        />
      )}
    </main>
  )
}

function CategoryCard({ bucket }: { bucket: Bucket }) {
  return (
    <div className="netmon-type-card">
      <span>{createElement(iconFor(bucket.name), { size: 19 })}</span>
      <div>
        <small>{bucket.name}</small>
        <b>{bucket.devices}</b>
        <ul>
          <li className="up">
            <i />
            {bucket.up}
          </li>
          <li className="warn">
            <i />
            {bucket.warning}
          </li>
          <li className="down">
            <i />
            {bucket.down}
          </li>
        </ul>
      </div>
    </div>
  )
}
