import { useStore } from '../state/store'
import { VN_OFFSET, atVN, fmtTime, vnDay } from '../state/helpers'
import { reminderStatus, remindersOnDay } from '../state/reminders'
import { ReminderBadge } from '../ui/Badges'
import type { Reminder, ReminderKind } from '../state/types'

export const REMINDER_ICON: Record<ReminderKind, string> = { medicine: '💊', meal: '🍚', clinic: '🏥', activity: '🚶' }
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function needsResponse(r: Reminder, now: number) {
  return ['due', 'snoozed', 'no_confirm'].includes(reminderStatus(r, now))
}

export function ReminderActions({ r }: { r: Reminder }) {
  const { dispatch } = useStore()
  const respond = (response: 'received' | 'snooze' | 'cant_do') => dispatch({ type: 'reminder/respond', id: r.id, dueAt: r.dueAt, response })
  return (
    <div className="reminder-actions">
      <button className="btn ok" onClick={() => respond('received')}>Đã nhận</button>
      <button className="btn ghost" onClick={() => respond('snooze')}>Nhắc lại</button>
      <button className="btn ghost danger-text" onClick={() => respond('cant_do')}>Không thực hiện được</button>
    </div>
  )
}

export function ReminderDetails({ r }: { r: Reminder }) {
  return <>
    {r.kind === 'medicine' && r.medicine && <div className="small medication-details">{r.medicine} · {r.dose} · {r.instructions}</div>}
    {r.kind === 'clinic' && r.location && <div className="small">📍 {r.location}</div>}
    {r.note && <div className="muted small">{r.note === 'Lịch nhắc thử, đến giờ sau khi khôi phục dữ liệu demo' ? 'Theo lịch nhắc đã cài đặt' : r.note}</div>}
    {r.createdBy && <div className="muted small">{r.createdBy === 'family' ? 'Gia đình' : 'Nhân viên CAREBOX'} nhập lịch</div>}
  </>
}

export function Schedule() {
  const { state, dispatch, view } = useStore()
  const kind = view.screen === 'medicine' ? 'medicine' : view.screen === 'clinic' ? 'clinic' : undefined
  // Vietnam calendar week (Mon–Sun) around today; noon keeps each day clear of the midnight edge
  const vnDate = (ms: number) => new Date(ms + VN_OFFSET)
  const fromMonday = (vnDate(state.now).getUTCDay() + 6) % 7
  const days = Array.from({ length: 7 }, (_, i) => atVN(state.now, '12:00', i - fromMonday))
  const list = remindersOnDay(state).filter((r) => !kind || r.kind === kind)
  return (
    <div className="elder schedule-screen">
      <h1 className="screen-title">{kind === 'medicine' ? '💊 Uống thuốc hôm nay' : kind === 'clinic' ? '🏥 Lịch khám hôm nay' : '🗓️ Lịch trình hôm nay'}</h1>
      <div className="tabs" aria-label="Loại lịch">
        {(['schedule', 'medicine', 'clinic'] as const).map((screen) => <button key={screen} aria-pressed={view.screen === screen} className={view.screen === screen ? 'active' : ''} onClick={() => dispatch({ type: 'nav', screen })}>{screen === 'schedule' ? 'Tất cả' : screen === 'medicine' ? 'Uống thuốc' : 'Lịch khám'}</button>)}
      </div>
      <div className="week">
        {days.map((d) => (
          <div key={d} className={`day ${vnDay(d) === vnDay(state.now) ? 'today' : ''}`}>
            <span>{DOW[vnDate(d).getUTCDay()]}</span>
            <b>{vnDate(d).getUTCDate()}</b>
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
              <ReminderDetails r={r} />
              <ReminderBadge r={r} now={state.now} />
            </div>
          </div>
          {needsResponse(r, state.now) && <ReminderActions r={r} />}
          {r.kind === 'clinic' && <button className="btn ghost wide" onClick={() => dispatch({ type: 'nav', screen: 'ride', reminderId: r.id })}>🚕 Hỗ trợ gọi xe</button>}
        </div>
      ))}
      {!list.length && <p className="empty">{kind === 'medicine' ? 'Hôm nay chưa có lịch uống thuốc đã xác nhận.' : kind === 'clinic' ? 'Hôm nay chưa có lịch khám.' : 'Hôm nay chưa có lịch trình.'}</p>}
      <p className="muted small center">Gia đình và nhân viên CAREBOX thêm, điều chỉnh lịch cho bác.</p>
      <p className="muted small center">Lịch thuốc chỉ theo đơn đã được xác nhận. AI không tự thay đổi thuốc hay giờ uống.</p>
    </div>
  )
}
