import { useState, type FormEvent } from 'react'
import { useStore } from '../state/store'
import { fmtTime, vnDay } from '../state/helpers'
import { remindersOnDay } from '../state/reminders'

export function Ride() {
  const { state, view, dispatch } = useStore()
  const [selectedDate] = useState(() => vnDay(state.now))
  const appointment = vnDay(state.now) === selectedDate
    ? remindersOnDay(state).find((r) => r.id === view.reminderId && r.kind === 'clinic') : undefined
  const [pickup, setPickup] = useState(state.elder.address)
  const [destination, setDestination] = useState(appointment?.location ?? appointment?.note ?? '')
  const [time, setTime] = useState(() => {
    const at = appointment ? Math.max(appointment.dueAt, state.now) : state.now
    return `${vnDay(at)}T${fmtTime(at)}`
  })
  const [booked, setBooked] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!appointment) return
    if (pickup.trim() && destination.trim()) setBooked(true)
  }
  return (
    <div className="elder">
      <button className="btn ghost" onClick={() => dispatch({ type: 'nav', screen: 'clinic' })}>‹ Lịch khám</button>
      <h1 className="screen-title">🚕 Đặt xe giả lập</h1>
      {!appointment ? <p className="empty">Lịch khám không còn khả dụng hoặc đã bị hủy. Bác quay lại chọn lịch nhé.</p> : booked ? (
        <div className="card stack" role="status">
          <h2>Đã đặt xe giả lập</h2>
          <p>Điểm đón: {pickup}</p>
          <p>Điểm đến: {destination}</p>
          <p>Giờ đón: {time.slice(11)} ngày {time.slice(0, 10)}</p>
          <p className="muted">Đây là mô phỏng. Chưa có xe thật được đặt.</p>
          <button className="btn wide" onClick={() => dispatch({ type: 'nav', screen: 'clinic' })}>Về lịch khám</button>
        </div>
      ) : (
        <form className="card form-stack" onSubmit={submit}>
          <p className="bold">{appointment.title}</p>
          <label>Điểm đón<input className="input" required maxLength={500} value={pickup} onChange={(e) => setPickup(e.target.value)} /></label>
          <label>Điểm đến<input className="input" required maxLength={500} value={destination} onChange={(e) => setDestination(e.target.value)} /></label>
          <label>Ngày giờ đón<input className="input" type="datetime-local" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <p className="muted small">Chỉ mô phỏng đặt xe, không gọi xe thật.</p>
          <button className="btn wide" type="submit">Đặt xe giả lập</button>
        </form>
      )}
    </div>
  )
}
