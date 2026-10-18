import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { reminderStatus } from '../state/reminders'
import { ReminderBadge } from '../ui/Badges'
import type { Reminder, ReminderKind } from '../state/types'

export const REMINDER_ICON: Record<ReminderKind, string> = { medicine: '💊', meal: '🍚', clinic: '🏥', activity: '🚶' }
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function needsResponse(r: Reminder, now: number) {
  return ['due', 'snoozed', 'no_confirm'].includes(reminderStatus(r, now))
}

export function ReminderActions({ r }: { r: Reminder }) {
  const { dispatch } = useStore()
  const respond = (response: 'received' | 'snooze' | 'cant_do') => dispatch({ type: 'reminder/respond', id: r.id, response })
  return (
    <div className="reminder-actions">
      <button className="btn ok" onClick={() => respond('received')}>Đã nhận</button>
      <button className="btn ghost" onClick={() => respond('snooze')}>Nhắc lại</button>
      <button className="btn ghost danger-text" onClick={() => respond('cant_do')}>Không thực hiện được</button>
    </div>
  )
}

export function Schedule() {
  const { state, dispatch } = useStore()
  const today = new Date(state.now)
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
  const list = [...state.reminders].sort((a, b) => a.dueAt - b.dueAt)
  return (
    <div className="elder">
      <h1 className="screen-title">🗓️ Lịch trình hôm nay</h1>
      <div className="week">
        {days.map((d) => (
          <div key={d.getTime()} className={`day ${d.getDate() === today.getDate() ? 'today' : ''}`}>
            <span>{DOW[d.getDay()]}</span>
            <b>{d.getDate()}</b>
          </div>
        ))}
      </div>
      {list.map((r) => (
        <div key={r.id} className={`card reminder ${needsResponse(r, state.now) ? 'reminder-due' : ''}`}>
          <div className="row">
            <span className="time">{fmtTime(r.dueAt)}</span>
            <span className="icon-circle">{REMINDER_ICON[r.kind]}</span>
            <div className="grow">
              <div className="bold">{r.title}</div>
              {r.note && <div className="muted small">{r.note}</div>}
              <ReminderBadge r={r} now={state.now} />
            </div>
          </div>
          {needsResponse(r, state.now) && <ReminderActions r={r} />}
        </div>
      ))}
      <button
        className="btn wide"
        onClick={() => {
          dispatch({ type: 'chat/startService', service: 'add_reminder' })
          dispatch({ type: 'nav', screen: 'chat' })
        }}
      >
        Thêm lịch trình ＋
      </button>
      <p className="muted small center">Lịch thuốc chỉ theo đơn đã được xác nhận. AI không tự thay đổi thuốc hay giờ uống.</p>
    </div>
  )
}
