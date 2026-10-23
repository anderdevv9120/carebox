import { useState, type FormEvent } from 'react'
import { useStore } from '../state/store'
import { fmtTime, vnDay } from '../state/helpers'
import { occursOn, reminderOnDay, validateSchedule } from '../state/reminders'
import { REMINDER_ICON, ReminderDetails } from '../elder/Schedule'
import { REMINDER_KIND } from '../state/labels'
import { ReminderBadge } from './Badges'
import type { Reminder, ReminderInput, RequestCase } from '../state/types'

function ScheduleForm({ reminder, request, onClose }: { reminder?: Reminder; request?: RequestCase; onClose: () => void }) {
  const { state, session, dispatch } = useStore()
  const startDate = reminder?.startDate ?? (reminder ? vnDay(reminder.dueAt) : state.day)
  const [data, setData] = useState<ReminderInput>({
    kind: reminder?.kind ?? 'medicine', title: reminder?.title ?? request?.fields.noi_dung ?? '', note: reminder?.note ?? request?.detail ?? '',
    times: reminder ? fmtTime(reminder.dueAt) : '08:00',
    startDate, endDate: reminder?.endDate ?? (reminder?.daily ? '' : startDate),
    repeat: !reminder || reminder.kind === 'medicine' || reminder.daily ? 'daily' : 'once',
    medicine: reminder?.medicine ?? '', dose: reminder?.dose ?? '', instructions: reminder?.instructions ?? '', location: reminder?.location ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key: keyof ReminderInput, value: string) => setData((d) => ({ ...d, [key]: value }))
  const times = data.times.split(',')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || session.role === 'elder') return
    const invalid = validateSchedule(data)
    if (invalid) { setError(invalid); return }
    setError('')
    setSaving(true)
    const saved = await dispatch({ type: 'reminder/save', id: reminder?.id ?? '', requestId: request?.id, by: session.role, ...data })
    setSaving(false)
    if (saved) onClose()
  }
  return (
    <form className="card form-stack" onSubmit={submit} aria-label={reminder ? 'Sửa lịch trình' : 'Thêm lịch trình'}>
      <h2>{reminder ? 'Sửa lịch trình' : 'Thêm lịch trình'}</h2>
      <label>Loại lịch<select className="input" value={data.kind} onChange={(e) => {
        const kind = e.target.value as ReminderInput['kind']
        setData((d) => ({ ...d, kind, repeat: kind === 'medicine' ? 'daily' : 'once', endDate: d.startDate, times: d.times.split(',')[0] }))
      }}>{Object.entries(REMINDER_KIND).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
      <label>Tên lịch<input className="input" autoFocus required maxLength={500} value={data.title} onChange={(e) => set('title', e.target.value)} placeholder="Ví dụ: Uống thuốc huyết áp" /></label>
      {data.kind === 'medicine' && <>
        <label>Tên thuốc và hàm lượng<input className="input" required maxLength={500} value={data.medicine} onChange={(e) => set('medicine', e.target.value)} placeholder="Ví dụ: Amlodipin 5mg" /></label>
        <label>Liều dùng<input className="input" required maxLength={500} value={data.dose} onChange={(e) => set('dose', e.target.value)} placeholder="Ví dụ: 1 viên" /></label>
        <label>Cách dùng<input className="input" required maxLength={500} value={data.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Ví dụ: Uống sau ăn" /></label>
      </>}
      {data.kind === 'clinic' && <label>Địa điểm khám<input className="input" required maxLength={500} value={data.location} onChange={(e) => set('location', e.target.value)} placeholder="Tên bệnh viện, phòng khám và địa chỉ" /></label>}
      {data.kind !== 'medicine' && <label>Lặp lại<select className="input" value={data.repeat} onChange={(e) => setData((d) => ({ ...d, repeat: e.target.value as ReminderInput['repeat'], endDate: d.startDate, times: d.times.split(',')[0] }))}><option value="once">Một lần</option><option value="daily">Hằng ngày</option></select></label>}
      <div className="form-grid">
        <label>{data.repeat === 'daily' ? 'Ngày bắt đầu' : 'Ngày thực hiện'}<input className="input" type="date" required value={data.startDate} onChange={(e) => setData((d) => ({ ...d, startDate: e.target.value, endDate: d.repeat === 'once' || (d.endDate !== '' && d.endDate < e.target.value) ? e.target.value : d.endDate }))} /></label>
        {data.repeat === 'daily' && <label>Ngày kết thúc{data.kind !== 'medicine' ? ' (không bắt buộc)' : ''}<input className="input" type="date" required={data.kind === 'medicine'} min={data.startDate} value={data.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>}
      </div>
      {times.map((time, index) => <div className="row" key={index}>
        <label className="grow">Giờ nhắc {times.length > 1 ? index + 1 : ''}<input className="input" type="time" required value={time} onChange={(e) => set('times', times.map((t, i) => i === index ? e.target.value : t).join(','))} /></label>
        {index > 0 && <button type="button" className="btn ghost sm" onClick={() => set('times', times.filter((_, i) => i !== index).join(','))} aria-label={`Bỏ giờ nhắc ${index + 1}`}>Bỏ</button>}
      </div>)}
      {!reminder && data.repeat === 'daily' && times.length < 12 && <button type="button" className="btn ghost" onClick={() => set('times', `${data.times},`)}>＋ Thêm giờ nhắc</button>}
      <label>Ghi chú<textarea className="input" rows={2} maxLength={500} value={data.note} onChange={(e) => set('note', e.target.value)} /></label>
      {data.kind === 'medicine' && <p className="note small">{session.role === 'staff' ? 'Lịch thuốc chỉ có hiệu lực sau khi gia đình xác nhận. Mỗi lần nhân viên sửa đơn đều cần gia đình xác nhận lại.' : 'Gia đình lưu lịch thuốc là xác nhận đơn; lịch có hiệu lực ngay.'}</p>}
      {error && <p className="danger-text small" role="alert">{error}</p>}
      <div className="row wrap">
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu lịch trình'}</button>
        <button className="btn ghost" type="button" disabled={saving} onClick={onClose}>Đóng</button>
      </div>
    </form>
  )
}

export function ScheduleManager() {
  const { state, session, view, dispatch } = useStore()
  const [request, setRequest] = useState(() => state.cases.find((c): c is RequestCase => c.id === view.caseId && c.kind === 'request' && c.service === 'add_reminder' && ['await_staff', 'await_family'].includes(c.status)))
  const [editing, setEditing] = useState<Reminder | 'new' | null>(() => request ? 'new' : null)
  const [day, setDay] = useState(state.day)
  const [busy, setBusy] = useState(false)
  if (session.role === 'elder') return null
  const by = session.role
  const pending = state.reminders.filter((r) => r.approval === 'pending')
  const list = [...state.reminders].sort((a, b) => a.dueAt - b.dueAt)
  const act = async (action: Parameters<typeof dispatch>[0]) => {
    if (busy) return
    setBusy(true)
    await dispatch(action)
    setBusy(false)
  }
  return (
    <div className="family-page schedule-manager">
      <div className="row between wrap">
        <h1 className="screen-title">🗓️ Lịch trình</h1>
        <button className="btn" onClick={() => { setRequest(undefined); setEditing('new') }}>Thêm lịch trình ＋</button>
      </div>
      <p className="muted small">Gia đình và nhân viên CAREBOX có thể thêm, sửa lịch. Hủy lịch chỉ bỏ một lần vào ngày được chọn.</p>
      {editing && <ScheduleForm key={editing === 'new' ? request?.id ?? 'new' : editing.id} reminder={editing === 'new' ? undefined : editing} request={editing === 'new' ? request : undefined} onClose={() => { setEditing(null); setRequest(undefined) }} />}
      {pending.length > 0 && <section className="card stack">
        <h2>Chờ gia đình xác nhận ({pending.length})</h2>
        {pending.map((r) => <div className="line" key={r.id}>
          <b>{r.title} · {fmtTime(r.dueAt)}</b>
          <ReminderDetails r={r} />
          <div className="muted small">{r.startDate ?? vnDay(r.dueAt)} → {r.endDate ?? 'Hằng ngày'}</div>
          {by === 'family' && (r.medicine && r.dose && r.instructions
            ? <button className="btn ok sm" disabled={busy} onClick={() => act({ type: 'reminder/approve', id: r.id, revision: r.revision ?? 0 })}>Xác nhận đơn thuốc</button>
            : <button className="btn ghost sm" onClick={() => setEditing(r)}>Bổ sung thông tin đơn thuốc</button>)}
        </div>)}
      </section>}
      <h2 className="section">Lịch đã cài đặt</h2>
      <label className="schedule-date">Ngày xem và hủy một lần<input className="input" type="date" required value={day} onChange={(e) => { if (e.target.value) setDay(e.target.value) }} /></label>
      {list.map((r) => {
        const occurs = occursOn(r, day)
        const occurrence = occurs ? reminderOnDay(r, day) : r
        const canceled = r.cancelledDates?.includes(day)
        return <article className="card" key={r.id}>
          <div className="row between wrap">
            <b>{REMINDER_ICON[r.kind]} {fmtTime(r.dueAt)} · {r.title}</b>
            {!occurs ? <span className="badge b-neutral">Không có lịch vào ngày đã chọn</span>
              : r.approval === 'pending' || canceled || day === state.day ? <ReminderBadge r={occurrence} now={day === state.day ? state.now : Date.parse(`${day}T12:00:00+07:00`)} />
                : <span className="badge b-neutral">Có lịch vào ngày đã chọn</span>}
          </div>
          <ReminderDetails r={r} />
          <div className="muted small">{r.daily ? 'Hằng ngày' : 'Một lần'} · {r.startDate ?? vnDay(r.dueAt)}{r.daily ? ` → ${r.endDate ?? 'Chưa đặt ngày kết thúc'}` : ''}</div>
          <div className="row wrap schedule-controls">
            <button className="btn ghost sm" onClick={() => setEditing(r)}>Sửa lịch</button>
            {occurs && !canceled && <button className="btn ghost sm danger-text" disabled={busy} onClick={() => act({ type: 'reminder/cancel', id: r.id, date: day, by })}>Hủy lần {fmtTime(r.dueAt)} ngày {day}</button>}
            {canceled && <span className="muted small">Đã hủy lần này; các lần khác giữ nguyên.</span>}
          </div>
        </article>
      })}
      {!list.length && <p className="empty">Chưa có lịch trình. Chọn “Thêm lịch trình” để bắt đầu.</p>}
    </div>
  )
}
