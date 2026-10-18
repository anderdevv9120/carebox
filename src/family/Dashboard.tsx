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
  const toHandle = state.cases.filter((c) => c.status === 'await_family' || c.status === 'to_verify').length
  const activity = state.cases
    .flatMap((c) => c.history.map((h) => ({ ...h, caseId: c.id, title: c.title })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)

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
      {toHandle > 0 && (
        <button className="card attn-card todo-card" onClick={() => go('f-requests')}>
          <span className="grow"><b className="block">Cần chị xử lý</b><span className="muted small">{toHandle} việc chờ chị nhận hoặc xem</span></span>
          <span className="chev">›</span>
        </button>
      )}
      <div className="tiles">
        <button className="tile" onClick={() => go('f-profile')}>
          <span>📡</span>Thiết bị<b>{connected}/{state.devices.length} đang kết nối</b>
          {attention > 0 && <em className="badge b-attn">{attention} cần chú ý</em>}
          {missing > 0 && <em className="badge b-unsure">{missing} thiếu dữ liệu</em>}
        </button>
        <button className="tile" onClick={() => go('f-report')}>
          <span>🗓️</span>Lịch trình<b>{todayLeft} việc còn lại hôm nay</b>
        </button>
        <button className="tile" onClick={() => go('f-requests')}>
          <span>🤝</span>Yêu cầu hỗ trợ<b>{openRequests.length} đang mở</b>
        </button>
        <button className="tile" onClick={() => go('f-report')}>
          <span>📄</span>Báo cáo<b>Hằng ngày</b>
        </button>
      </div>

      <h2 className="section">Cảnh báo cần chú ý</h2>
      {openEvents.length === 0 && <p className="muted small">Không có cảnh báo đang mở. Điều này không có nghĩa là đã có kết luận về sức khỏe.</p>}
      {openEvents.map((c) => (
        <div key={c.id} className="card">
          <div className="row between wrap"><b>{c.title}</b><PriorityBadge c={c} now={state.now} /></div>
          <SourceTag source={c.source} />
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
            <div className="muted small">{c.id} · Phụ trách: {nextOwner(c, state)} <SourceTag source={c.source} /></div>
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
