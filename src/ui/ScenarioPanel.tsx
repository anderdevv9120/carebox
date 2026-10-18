import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { SCENARIOS } from '../scenarios'
import type { DeviceKind } from '../state/types'

const METRICS: { id: Exclude<DeviceKind, 'fall'>; label: string }[] = [
  { id: 'bp', label: 'Huyết áp' },
  { id: 'hr', label: 'Nhịp tim' },
  { id: 'glucose', label: 'Đường huyết' },
  { id: 'spo2', label: 'SpO₂' },
]

export function ScenarioPanel() {
  const { state, dispatch } = useStore()
  return (
    <aside className="panel">
      <details open>
        <summary>🧪 Kịch bản kiểm thử (doc §8)</summary>
        {SCENARIOS.map((sc) => (
          <div key={sc.id} className="scenario">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <b>{sc.id}. {sc.title}</b>
              <button className="btn sm" onClick={() => sc.actions.forEach(dispatch)}>Chạy</button>
            </div>
            <div className="small"><span className="muted">Mong đợi:</span> {sc.expected}</div>
            <div className="small"><span className="muted">Tiêu chí đạt:</span> {sc.criterion}</div>
          </div>
        ))}
      </details>

      <details open>
        <summary>📡 Thiết bị giả lập</summary>
        {METRICS.map((m) => {
          const d = state.devices.find((x) => x.id === m.id)!
          return (
            <div key={m.id} className="sim-row">
              <span className="sim-label">{m.label}</span>
              <button onClick={() => dispatch({ type: 'device/push', deviceId: m.id, mode: 'normal' })}>Bình thường</button>
              <button onClick={() => dispatch({ type: 'device/push', deviceId: m.id, mode: 'high' })}>Vượt ngưỡng</button>
              <button onClick={() => dispatch({ type: 'device/push', deviceId: m.id, mode: 'suspicious' })}>Đáng nghi</button>
              {d.connected
                ? <button onClick={() => dispatch({ type: 'device/disconnect', deviceId: m.id })}>Mất kết nối</button>
                : <button onClick={() => dispatch({ type: 'device/reconnect', deviceId: m.id })}>Kết nối lại</button>}
            </div>
          )
        })}
        <div className="sim-row">
          <span className="sim-label">Té ngã</span>
          <button className="danger-text" onClick={() => dispatch({ type: 'device/fall' })}>Báo té ngã</button>
        </div>
      </details>

      <details open>
        <summary>⏱️ Đồng hồ demo · {fmtTime(state.now)}</summary>
        <div className="sim-row">
          <button onClick={() => dispatch({ type: 'clock/advance', minutes: 15 })}>+15 phút</button>
          <button onClick={() => dispatch({ type: 'clock/nextReminder' })}>Tới giờ nhắc tiếp theo</button>
        </div>
        <p className="muted small">Đồng hồ chỉ chạy khi bấm, để mọi người xem cùng một trạng thái.</p>
      </details>

      <button className="btn ghost wide" onClick={() => confirm('Khôi phục dữ liệu demo ban đầu?') && dispatch({ type: 'reset' })}>↺ Reset demo</button>
    </aside>
  )
}
