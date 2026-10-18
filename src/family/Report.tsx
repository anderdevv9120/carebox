import { useStore } from '../state/store'
import { fmtDate, fmtTime, vnDay } from '../state/helpers'
import { isFinal, nextOwner } from '../state/cases'
import { REMINDER_ICON } from '../elder/Schedule'
import { DeviceBadge, PriorityBadge, ReminderBadge, SourceTag, StatusBadge } from '../ui/Badges'
import type { RequestCase } from '../state/types'

export function Report() {
  const { state } = useStore()
  const day = vnDay(state.now)
  const requests = state.cases.filter((c): c is RequestCase => c.kind === 'request')
  const receivedToday = requests.filter((c) => vnDay(c.createdAt) === day).length
  const done = requests.filter((c) => c.status === 'done')
  const open = requests.filter((c) => !isFinal(c))
  const alerts = state.cases.filter((c) => c.kind === 'event' && !isFinal(c))
  const relationOf = (name: string) => {
    const f = state.family.find((x) => x.name === name)
    return f ? ` (${f.relation.toLowerCase()})` : ''
  }
  return (
    <div>
      <h1 className="screen-title">📄 Báo cáo hằng ngày</h1>
      <p className="muted small">{fmtDate(state.now)} · lập lúc {fmtTime(state.now)}</p>

      <section className="card">
        <div className="row between"><b>Tóm tắt yêu cầu</b><SourceTag source="ai" /></div>
        <p className="small">Hôm nay tiếp nhận {receivedToday} yêu cầu · {done.length} đã hoàn tất (gia đình xác nhận) · {open.length} đang mở.</p>
        {open.map((c) => (
          <div key={c.id} className="row between wrap small line">
            <span>{c.title} — <span className="muted">{nextOwner(c, state)}</span> <SourceTag source={c.source} /></span>
            <StatusBadge c={c} />
          </div>
        ))}
      </section>

      <section className="card">
        <b>Lịch hôm nay</b>
        {[...state.reminders].sort((a, b) => a.dueAt - b.dueAt).map((r) => (
          <div key={r.id} className="row between small line">
            <span>{REMINDER_ICON[r.kind]} {fmtTime(r.dueAt)} {r.title}</span>
            <ReminderBadge r={r} now={state.now} />
          </div>
        ))}
        <p className="muted small">“Đã nhận nhắc” nghĩa là bác đã nhận lời nhắc, không phải đã thực hiện.</p>
      </section>

      <section className="card">
        <b>Cảnh báo cần chú ý</b>
        {!alerts.length && <p className="muted small">Không có cảnh báo đang mở.</p>}
        {alerts.map((c) => (
          <div key={c.id} className="line small">
            <div className="row between wrap"><span>{c.title}</span><PriorityBadge c={c} now={state.now} /></div>
            <div className="muted">Bước tiếp theo: {nextOwner(c, state)} · <SourceTag source={c.source} /></div>
          </div>
        ))}
      </section>

      <section className="card">
        <b>Báo cáo dịch vụ</b>
        {!done.length && <p className="muted small">Chưa có dịch vụ được xác nhận hoàn tất.</p>}
        {done.map((c) => (
          <div key={c.id} className="service-report small">
            <div className="row between"><b>{c.title}</b><span className="muted">{c.id}</span></div>
            <div><span className="muted">Kết quả thực hiện:</span> Đã hoàn tất theo xác nhận của gia đình.</div>
            {c.doneNote && <div className="note">📝 {c.doneNote} <SourceTag source="family" /></div>}
            {c.doneBy && <div><span className="muted">Người xác nhận:</span> {c.doneBy}{relationOf(c.doneBy)}</div>}
            {c.completedAt && <div><span className="muted">Thời điểm hoàn tất:</span> {fmtTime(c.completedAt)} {fmtDate(c.completedAt)}</div>}
          </div>
        ))}
      </section>

      <section className="card">
        <b>Kết nối dữ liệu</b>
        {state.devices.map((d) => (
          <div key={d.id} className="row between small line">
            <span>{d.name} <span className="muted">· {d.readings.at(-1) ? fmtTime(d.readings.at(-1)!.at) : 'chưa có'}</span></span>
            <DeviceBadge d={d} now={state.now} />
          </div>
        ))}
      </section>
      <p className="muted small center">Báo cáo phân biệt dữ liệu thiết bị, lời bác báo, xác nhận của gia đình và nội dung AI tổng hợp.</p>
    </div>
  )
}
