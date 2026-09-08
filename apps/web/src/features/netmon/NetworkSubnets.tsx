import { useEffect, useState } from 'react'
import { Plus, Radar, Trash2 } from 'lucide-react'
import { api } from '../../services/api-client'
import { probeLabels, sinceLabel, toList, type NetSubnet, type ProbeMethod } from './netmon-model'

const blank = {
  name: '',
  cidr: '',
  vlanId: '',
  description: '',
  probeMethod: 'BOTH' as ProbeMethod,
  tcpPorts: '445, 3389, 80, 443, 22, 554, 9100',
  scanIntervalMinutes: 360,
  checkIntervalSeconds: 120,
  failureThreshold: 3,
}

/**
 * Where an administrator says what may be probed. Nothing on the network is touched until a subnet
 * exists here and is enabled, which is what keeps the scanner inside ranges the organisation owns.
 */
export function NetworkSubnets({ role }: { role: string }) {
  const [subnets, setSubnets] = useState<NetSubnet[]>([]),
    [form, setForm] = useState(blank),
    [adding, setAdding] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('')
  const isAdmin = role === 'Admin'

  const load = async () => {
    try {
      setSubnets(toList<NetSubnet>(await api.get<NetSubnet[]>('/netmon/subnets')))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được danh sách dải mạng')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const create = async () => {
    setError('')
    setMessage('')
    setBusy('create')
    try {
      await api.post('/netmon/subnets', {
        name: form.name.trim(),
        cidr: form.cidr.trim(),
        vlanId: form.vlanId ? Number(form.vlanId) : undefined,
        description: form.description.trim() || undefined,
        probeMethod: form.probeMethod,
        tcpPorts: form.tcpPorts
          .split(',')
          .map(value => Number(value.trim()))
          .filter(value => Number.isInteger(value) && value > 0 && value <= 65535),
        scanIntervalMinutes: Number(form.scanIntervalMinutes),
        checkIntervalSeconds: Number(form.checkIntervalSeconds),
        failureThreshold: Number(form.failureThreshold),
      })
      setForm(blank)
      setAdding(false)
      await load()
      setMessage('Đã khai báo dải mạng. Bấm Quét để tìm thiết bị.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được dải mạng')
    } finally {
      setBusy('')
    }
  }

  const scan = async (subnet: NetSubnet) => {
    setError('')
    setMessage('')
    setBusy(subnet.id)
    try {
      const result = await api.post<{ hostsProbed: number; hostsAnswered: number; devicesAdded: number }>(
        `/netmon/subnets/${subnet.id}/scan`,
      )
      await load()
      setMessage(
        `Quét ${subnet.cidr}: ${result.hostsAnswered}/${result.hostsProbed} địa chỉ phản hồi, thêm mới ${result.devicesAdded} thiết bị.`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không quét được dải mạng')
    } finally {
      setBusy('')
    }
  }

  const remove = async (subnet: NetSubnet) => {
    if (
      !window.confirm(
        `Xóa dải ${subnet.name} (${subnet.cidr})? ${subnet._count?.devices || 0} thiết bị đã phát hiện cùng lịch sử giám sát sẽ bị xóa theo.`,
      )
    )
      return
    setBusy(subnet.id)
    try {
      await api.delete(`/netmon/subnets/${subnet.id}`)
      await load()
      setMessage('Đã xóa dải mạng.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không xóa được dải mạng')
    } finally {
      setBusy('')
    }
  }

  const toggle = async (subnet: NetSubnet) => {
    setBusy(subnet.id)
    try {
      await api.put(`/netmon/subnets/${subnet.id}`, { enabled: !subnet.enabled })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không cập nhật được')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="enterprise-panel netmon-subnets">
      <div className="panel-heading">
        <div>
          <h2>Dải mạng giám sát</h2>
          <span>Hệ thống chỉ dò trong những dải khai báo ở đây và đang bật</span>
        </div>
        {isAdmin && (
          <button className="btn secondary" onClick={() => setAdding(value => !value)}>
            <Plus size={16} />
            {adding ? 'Đóng' : 'Thêm dải'}
          </button>
        )}
      </div>

      {message && (
        <div className="directory-message" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="directory-message" role="alert">
          {error}
        </div>
      )}

      {adding && isAdmin && (
        <div className="form-grid netmon-subnet-form">
          <label>
            Tên dải
            <input
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder="VD: LAN Văn phòng Hà Nội"
            />
          </label>
          <label>
            CIDR
            <input
              value={form.cidr}
              onChange={event => setForm({ ...form, cidr: event.target.value })}
              placeholder="192.168.50.0/24"
            />
            <small>Tối đa /22 (1022 địa chỉ). Dải rộng hơn phải chia nhỏ.</small>
          </label>
          <label>
            VLAN (nếu có)
            <input
              value={form.vlanId}
              onChange={event => setForm({ ...form, vlanId: event.target.value })}
              placeholder="50"
            />
          </label>
          <label>
            Cách dò
            <select
              value={form.probeMethod}
              onChange={event => setForm({ ...form, probeMethod: event.target.value as ProbeMethod })}
            >
              {(Object.keys(probeLabels) as ProbeMethod[]).map(method => (
                <option value={method} key={method}>
                  {probeLabels[method]}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Cổng TCP kiểm tra
            <input value={form.tcpPorts} onChange={event => setForm({ ...form, tcpPorts: event.target.value })} />
            <small>Camera thường mở 80/554, PC mở 445/3389, switch mở 22/443, máy in mở 9100.</small>
          </label>
          <label>
            Chu kỳ quét (phút)
            <input
              type="number"
              value={form.scanIntervalMinutes}
              onChange={event => setForm({ ...form, scanIntervalMinutes: Number(event.target.value) })}
            />
          </label>
          <label>
            Chu kỳ kiểm tra (giây)
            <input
              type="number"
              value={form.checkIntervalSeconds}
              onChange={event => setForm({ ...form, checkIntervalSeconds: Number(event.target.value) })}
            />
          </label>
          <label>
            Số lần lỗi liên tiếp mới báo
            <input
              type="number"
              value={form.failureThreshold}
              onChange={event => setForm({ ...form, failureThreshold: Number(event.target.value) })}
            />
            <small>Một gói tin rơi là bình thường; đặt 1 sẽ rất nhiều cảnh báo giả.</small>
          </label>
          <label className="span-2">
            Ghi chú
            <input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
          </label>
          <div className="span-2">
            <button
              className="btn primary"
              disabled={!form.name.trim() || !form.cidr.trim() || busy === 'create'}
              onClick={() => void create()}
            >
              Lưu dải mạng
            </button>
          </div>
        </div>
      )}

      {!subnets.length && (
        <p className="netmon-hint">Chưa khai báo dải nào, nên hệ thống chưa dò bất kỳ địa chỉ nào.</p>
      )}

      {subnets.length > 0 && (
        <div className="table-scroll">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>TÊN DẢI</th>
                <th>CIDR</th>
                <th>VLAN</th>
                <th>CÁCH DÒ</th>
                <th>THIẾT BỊ</th>
                <th>QUÉT GẦN NHẤT</th>
                <th>TRẠNG THÁI</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {subnets.map(subnet => (
                <tr key={subnet.id}>
                  <td>
                    <div className="netmon-cell-stack">
                      <b>{subnet.name}</b>
                      <small>{subnet.description || ''}</small>
                    </div>
                  </td>
                  <td>
                    <b className="table-code">{subnet.cidr}</b>
                  </td>
                  <td>{subnet.vlanId || '—'}</td>
                  <td>{probeLabels[subnet.probeMethod]}</td>
                  <td>{subnet._count?.devices ?? 0}</td>
                  <td>{sinceLabel(subnet.lastScanAt)}</td>
                  <td>
                    <span className={`netmon-status ${subnet.enabled ? 'up' : 'paused'}`}>
                      {subnet.enabled ? 'Đang bật' : 'Đang tắt'}
                    </span>
                  </td>
                  <td>
                    <div className="netmon-actions">
                      <button
                        className="btn secondary"
                        disabled={!subnet.enabled || busy === subnet.id}
                        onClick={() => void scan(subnet)}
                      >
                        <Radar size={15} />
                        {busy === subnet.id ? 'Đang quét…' : 'Quét'}
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            className="btn secondary"
                            disabled={busy === subnet.id}
                            onClick={() => void toggle(subnet)}
                          >
                            {subnet.enabled ? 'Tắt' : 'Bật'}
                          </button>
                          <button
                            className="btn danger"
                            disabled={busy === subnet.id}
                            onClick={() => void remove(subnet)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
