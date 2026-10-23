import { useState, type FormEvent } from 'react'
import { useStore } from '../state/store'
import { fmtDayMonth, fmtTime, fmtValue, vnDay } from '../state/helpers'
import { deviceStatus, PLAUSIBLE, THRESHOLDS, validManualReading } from '../state/devices'
import { DeviceBadge, SourceTag } from '../ui/Badges'
import { LineChart } from '../ui/LineChart'
import type { Device, DeviceKind } from '../state/types'

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
  const manual = last?.source === 'elder'
  return (
    <div className="card metric">
      <div className="row between">
        <span className="metric-name">{ICON[d.id]} {LABEL[d.id]}</span>
      </div>
      <div className="metric-value">
        {last && (!missing || manual) ? fmtValue(last.value) : '—'} <small>{(!missing || manual) && d.unit}</small>
      </div>
      <DeviceBadge d={d} now={now} />
      {last && <SourceTag source={manual ? 'elder' : 'device'} />}
      <div className="muted small">{last ? (manual ? `Nhập lúc ${fmtTime(last.at)}` : missing ? `Lần cuối: ${fmtTime(last.at)}` : `Đo lúc ${fmtTime(last.at)}`) : 'Chưa có dữ liệu'}</div>
    </div>
  )
}

function ManualReading() {
  const { dispatch } = useStore()
  const [metric, setMetric] = useState<Exclude<DeviceKind, 'fall'>>('bp')
  const [value, setValue] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const reading = metric === 'bp' ? [Number(value), Number(diastolic)] : Number(value)
    if (!validManualReading(metric, reading)) { setError('Bác kiểm tra lại số liệu nhé. Huyết áp tâm thu cần lớn hơn tâm trương.'); return }
    setError('')
    setMessage('')
    setSaving(true)
    const saved = await dispatch({ type: 'device/manual', deviceId: metric, value: reading })
    setSaving(false)
    if (saved) { setMessage(`Đã lưu ${LABEL[metric]}: ${fmtValue(reading)}. Gia đình và nhân viên sẽ được cảnh báo nếu chỉ số vượt ngưỡng.`); setValue(''); setDiastolic('') }
  }
  return <form className="card form-stack" onSubmit={submit} aria-label="Nhập chỉ số sức khỏe">
    <h2>✍️ Nhập chỉ số sức khỏe</h2>
    <label>Chỉ số<select className="input" value={metric} onChange={(e) => { setMetric(e.target.value as typeof metric); setValue(''); setDiastolic(''); setError(''); setMessage('') }}>
      {Object.entries(LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>
    <div className="form-grid">
      <label>{metric === 'bp' ? 'Tâm thu (mmHg)' : `${LABEL[metric]} (${metric === 'hr' ? 'bpm' : metric === 'glucose' ? 'mmol/L' : '%'})`}<input className="input" type="number" inputMode="decimal" required min="0.01" max={metric === 'bp' ? PLAUSIBLE.bp.sys[1] : PLAUSIBLE[metric][1]} step="any" value={value} onChange={(e) => setValue(e.target.value)} /></label>
      {metric === 'bp' && <label>Tâm trương (mmHg)<input className="input" type="number" inputMode="decimal" required min="0.01" max={PLAUSIBLE.bp.dia[1]} step="any" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} /></label>}
    </div>
    {error && <p className="danger-text small" role="alert">{error}</p>}
    {message && <p className="small" role="status">{message}</p>}
    <button className="btn wide" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu chỉ số'}</button>
  </form>
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
      <ManualReading />
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
        <div className="row between wrap"><span className="small muted">Dữ liệu thiết bị và chỉ số bác nhập tay</span><span className="muted small">{chart === 'bp' ? 'Tâm thu (mmHg)' : ''}</span></div>
      </div>
      <p className="muted small center">Ngưỡng giả lập — không phải chỉ định y tế. Không kết luận sức khỏe tổng thể.</p>
      <SimDevices />
    </div>
  )
}
