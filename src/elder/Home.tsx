import { useStore } from '../state/store'
import { fmtDate, fmtTime } from '../state/helpers'
import { reminderStatus, remindersOnDay } from '../state/reminders'
import { ReminderActions, needsResponse, REMINDER_ICON } from './Schedule'
import type { ReminderKind, Screen, State } from '../state/types'

function nextOf(s: State, kind: ReminderKind) {
  return remindersOnDay(s)
    .filter((r) => r.kind === kind && ['upcoming', 'due', 'snoozed'].includes(reminderStatus(r, s.now)))
    .sort((a, b) => a.dueAt - b.dueAt)[0]
}

export function Home() {
  const { state, dispatch } = useStore()
  const go = (screen: Screen) => dispatch({ type: 'nav', screen })
  const firstName = state.elder.name.split(' ').at(-1)
  const due = remindersOnDay(state).filter((r) => needsResponse(r, state.now))
  const med = nextOf(state, 'medicine')
  const clinic = nextOf(state, 'clinic')
  return (
    <div className="elder home-screen">
      <div className="home-hero">
        <div className="home-copy">
          <p className="home-date">✦ {fmtDate(state.now)}</p>
          <h1 className="hello">Chào bà {firstName}! 👋</h1>
          <p className="home-subtitle">Hôm nay thật đẹp. Bà đã sẵn sàng cho một ngày vui vẻ!</p>
        </div>
        <div className="mascot-card">
          <img className="mascot" src="/carebot.svg" alt="Trợ lý CAREBOX" />
          <div className="bubble">Bà cần gì<br />hôm nay ạ?</div>
        </div>
        <button className="mic" onClick={() => go('chat')} aria-label="Trò chuyện với trợ lý CAREBOX">🎙️</button>
        <p className="center home-hint">Chạm để trò chuyện với trợ lý</p>
      </div>
      {due.map((r) => (
        <div key={r.id} className="card reminder-due">
          <div className="row">
            <span className="icon-circle">{REMINDER_ICON[r.kind]}</span>
            <div className="grow">
              <div className="muted small">Đến giờ · {fmtTime(r.dueAt)}</div>
              <div className="bold">{r.title}</div>
            </div>
          </div>
          <ReminderActions r={r} />
        </div>
      ))}
      <div className="tiles home-tiles">
        <button className="tile" onClick={() => go('medicine')}>
          <span>💊</span>Uống thuốc<b>{med ? fmtTime(med.dueAt) : '—'}</b>
        </button>
        <button className="tile" onClick={() => go('clinic')}>
          <span>🏥</span>Lịch khám<b>{clinic ? fmtTime(clinic.dueAt) : '—'}</b>
        </button>
        <button className="tile" onClick={() => go('services')}>
          <span>🧡</span>Yêu cầu hỗ trợ
        </button>
        <button className="tile" onClick={() => go('requests')}>
          <span>📋</span>Xem yêu cầu
        </button>
      </div>
    </div>
  )
}
