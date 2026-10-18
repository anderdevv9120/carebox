import { useState } from 'react'
import { useStore } from '../state/store'
import { fmtDayMonth, fmtTime, fmtValue, vnDay } from '../state/helpers'
import { deviceStatus, THRESHOLDS } from '../state/devices'
import { DeviceBadge, SourceTag } from '../ui/Badges'
import { LineChart } from '../ui/LineChart'
import type { Device } from '../state/types'

const ICON: Record<string, string> = { bp: '❤️', hr: '💓', glucose: '🩸', spo2: '🫁', fall: '🛡️' }
const LABEL: Record<string, string> = { bp: 'Huyết áp', hr: 'Nhịp tim', glucose: 'Đường huyết', spo2: 'SpO₂' }
const CHARTS = [
  { id: 'bp', label: 'Huyết áp', band: THRESHOLDS.bp.sys },
  { id: 'hr', label: 'Nhịp tim', band: THRESHOLDS.hr },
  { id: 'glucose', label: 'Đường huyết', band: THRESHOLDS.glucose },
] as const

export function DeviceCard({ d, now }: { d: Device; now: number }) {
  const last = d.readings.at(-1)
  const missing = deviceStatus(d, now) === 'missing'
  return (
    <div className="card metric">
      <div className="row between">
        <span className="metric-name">{ICON[d.id]} {LABEL[d.id]}</span>
      </div>
      <div className="metric-value">
        {last && !missing ? fmtValue(last.value) : '—'} <small>{!missing && d.unit}</small>
      </div>
      <DeviceBadge d={d} now={now} />
      <div className="muted small">{last ? (missing ? `Lần cuối: ${fmtTime(last.at)}` : `Đo lúc ${fmtTime(last.at)}`) : 'Chưa có dữ liệu'}</div>
    </div>
  )
}

// Demo-only device controls; each button sends the same action a real device feed would cause.
function SimDevices() {
  const { state, dispatch } = useStore()
  return (
    <details className="card sim-devices">
      <summary className="bold">🧪 Thiết bị giả lập</summary>
      {state.devices.filter((d) => d.id !== 'fall').map((d) => {
        const id = d.id as Exclude<typeof d.id, 'fall'>
        return (
          <div key={id} className="sim-row">
            <span className="sim-label">{ICON[id]} {LABEL[id]}</span>
            <button onClick={() => dispatch({ type: 'device/push', deviceId: id, mode: 'normal' })}>Bình thường</button>
            <button onClick={() => dispatch({ type: 'device/push', deviceId: id, mode: 'high' })}>Vượt ngưỡng</button>
            <button onClick={() => dispatch({ type: 'device/push', deviceId: id, mode: 'suspicious' })}>Đáng nghi</button>
            {d.connected
              ? <button onClick={() => dispatch({ type: 'device/disconnect', deviceId: id })}>Mất kết nối</button>
              : <button onClick={() => dispatch({ type: 'device/reconnect', deviceId: id })}>Kết nối lại</button>}
          </div>
        )
      })}
      <button className="btn danger wide" onClick={() => dispatch({ type: 'device/fall' })}>🛡️ Báo té ngã</button>
    </details>
  )
}

export function Health() {
  const { state } = useStore()
  const [chart, setChart] = useState<(typeof CHARTS)[number]['id']>('bp')
  const metrics = state.devices.filter((d) => d.id !== 'fall')
  const fall = state.devices.find((d) => d.id === 'fall')!
  const lastFall = fall.readings.at(-1)
  const spec = CHARTS.find((c) => c.id === chart)!
  const series = state.devices.find((d) => d.id === chart)!.readings.slice(-7).map((r) => ({
    label: vnDay(r.at) === vnDay(state.now) ? fmtTime(r.at) : fmtDayMonth(r.at),
    value: Array.isArray(r.value) ? r.value[0] : (r.value as number),
  }))
  return (
    <div className="elder health-screen">
      <h1 className="screen-title">📈 Sức khỏe của bà</h1>
      <div className="grid2">
        {metrics.map((d) => <DeviceCard key={d.id} d={d} now={state.now} />)}
      </div>
      <div className="card row">
        <span className="icon-circle">{ICON.fall}</span>
        <div className="grow">
          <div className="bold">{fall.name}</div>
          <div className="muted small">
            {!fall.connected ? 'Mất kết nối — không đủ dữ liệu' : lastFall ? `Tín hiệu té ngã lúc ${fmtTime(lastFall.at)}` : 'Chưa ghi nhận tín hiệu té ngã'}
          </div>
          <DeviceBadge d={fall} now={state.now} />
        </div>
      </div>
      <div className="card">
        <div className="bold">Biểu đồ theo dõi</div>
        <div className="tabs" style={{ marginTop: 8 }}>
          {CHARTS.map((c) => (
            <button key={c.id} className={c.id === chart ? 'active' : ''} onClick={() => setChart(c.id)}>{c.label}</button>
          ))}
        </div>
        <LineChart points={series} band={[...spec.band] as [number, number]} />
        <div className="row between"><SourceTag source="device" /><span className="muted small">{chart === 'bp' ? 'Tâm thu (mmHg)' : ''}</span></div>
      </div>
      <p className="muted small center">Ngưỡng giả lập — không phải chỉ định y tế. Không kết luận sức khỏe tổng thể.</p>
      <SimDevices />
    </div>
  )
}
