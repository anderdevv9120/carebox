import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { isFinal, nextOwner } from '../state/cases'
import { deviceStatus } from '../state/devices'
import { reminderStatus } from '../state/reminders'
import { PriorityBadge, SourceTag, StatusBadge } from '../ui/Badges'
import type { RequestCase, Screen, State } from '../state/types'

export function lastUpdated(s: State): number {
  return Math.max(
    ...s.notifications.map((n) => n.at),
    ...s.devices.flatMap((d) => d.readings.map((r) => r.at)),
    ...s.cases.flatMap((c) => c.history.map((h) => h.at)),
  )
}

export function Dashboard() {
  const { state, dispatch } = useStore()
  const go = (screen: Screen) => dispatch({ type: 'nav', screen })
  const connected = state.devices.filter((d) => d.connected).length
  const attention = state.devices.filter((d) => deviceStatus(d, state.now) === 'attention').length
  const missing = state.devices.filter((d) => deviceStatus(d, state.now) === 'missing').length
  const todayLeft = state.reminders.filter((r) => ['upcoming', 'due', 'snoozed'].includes(reminderStatus(r, state.now))).length
  const openRequests = state.cases.filter((c): c is RequestCase => c.kind === 'request' && !isFinal(c))
  const openEvents = state.cases.filter((c) => c.kind === 'event' && !isFinal(c))
  const activity = state.cases
    .flatMap((c) => c.history.map((h) => ({ ...h, caseId: c.id, title: c.title })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
  const awaitingFamily = openRequests.filter((c) => c.service === 'contact_family' && c.status === 'await_dispatch' && !c.familyRespondedAt)

  return (
    <div>
      <h1 className="screen-title">👨‍👩‍👧 Bảng điều khiển gia đình</h1>
      <div className="card row">
        <span className="avatar-lg">👵</span>
        <div className="grow">
          <div className="bold">Mẹ - {state.elder.name}</div>
          <div className="muted small">Cập nhật lúc {fmtTime(lastUpdated(state))}</div>
        </div>
      </div>
      <div className="card status-box">
        <div className="bold">Tình trạng cập nhật</div>
        <div>Chưa có kết luận tổng thể về sức khỏe.</div>
        <div className="muted small">Thông tin hiển thị dựa trên dữ liệu và báo cáo hiện có.</div>
      </div>
      <div className="tiles">
        <button className="tile" onClick={() => go('f-profile')}>
          <span>📡</span>Thiết bị<b>{connected}/{state.devices.length} đang kết nối</b>
          {attention > 0 && <em className="badge b-attn">{attention} cần chú ý</em>}
          {missing > 0 && <em className="badge b-unsure">{missing} thiếu dữ liệu</em>}
        </button>
        <button className="tile" onClick={() => go('f-report')}>
          <span>🗓️</span>Lịch trình<b>{todayLeft} việc còn lại hôm nay</b>
        </button>
        <button className="tile" onClick={() => go('f-report')}>
          <span>🤝</span>Yêu cầu hỗ trợ<b>{openRequests.length} đang mở</b>
        </button>
        <button className="tile" onClick={() => go('f-report')}>
          <span>📄</span>Báo cáo<b>Hằng ngày</b>
        </button>
      </div>

      {awaitingFamily.map((c) => (
        <div key={c.id} className="card attn-card">
          <div className="bold">📞 Bác nhắn: “{c.fields.loi_nhan ?? 'chưa rõ'}”</div>
          <div className="muted small">{c.id} · gửi tới {c.fields.nguoi ?? 'người thân'}</div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => dispatch({ type: 'family/responded', id: c.id })}>Gia đình đã phản hồi</button>
        </div>
      ))}

      <h2 className="section">Cảnh báo cần chú ý</h2>
      {openEvents.length === 0 && <p className="muted small">Không có cảnh báo đang mở. Điều này không có nghĩa là đã có kết luận về sức khỏe.</p>}
      {openEvents.map((c) => (
        <div key={c.id} className="card">
          <div className="row between wrap"><b>{c.title}</b><PriorityBadge c={c} now={state.now} /></div>
          <div className="small">{c.detail}</div>
          <div className="row between wrap small" style={{ marginTop: 6 }}>
            <span><span className="muted">Tiếp theo:</span> {nextOwner(c, state)}</span>
            <StatusBadge c={c} />
          </div>
        </div>
      ))}

      <h2 className="section">Yêu cầu đang xử lý</h2>
      {openRequests.map((c) => (
        <div key={c.id} className="card row between wrap">
          <div className="grow">
            <b>{c.title}</b>
            <div className="muted small">{c.id} · Phụ trách: {nextOwner(c, state)}</div>
          </div>
          <StatusBadge c={c} />
        </div>
      ))}

      <h2 className="section">Hoạt động gần đây</h2>
      <div className="card">
        <ul className="timeline">
          {activity.map((h, i) => (
            <li key={i}>
              <b>{fmtTime(h.at)}</b> {h.title}: {h.text} <SourceTag source={h.by} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
