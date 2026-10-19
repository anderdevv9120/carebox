import { useState } from 'react'
import { useStore } from '../state/store'
import { familyName, fmtDayMonth, fmtTime } from '../state/helpers'
import { can, effectivePriority, nextOwner, type CaseAction } from '../state/cases'
import { SERVICE_FIELDS } from '../state/assistant'
import { PARTNER_PENDING } from '../state/labels'
import { PriorityBadge, SourceTag, StatusBadge } from '../ui/Badges'
import type { Case, RequestCase } from '../state/types'

const MAX_TEXT = 500 // server rejects longer notes
const when = (ms: number) => `${fmtTime(ms)} ${fmtDayMonth(ms)}`

// Mockup 4, "Các bước tiếp theo": static guidance for device alerts.
const DEVICE_STEPS = [
  'Kiểm tra nguồn và thời điểm dữ liệu.',
  'Chuyển nhân viên có trách nhiệm xác minh.',
  'Đánh giá hành động tiếp theo theo quy trình đã thống nhất.',
  'Cập nhật người tiếp nhận và kết quả xử lý.',
]

// Every button asks `can` (the transition guards) instead of repeating them; `probe` stands in for the input when asking.
function ActionButton({ label, action, danger }: { label: string; action: CaseAction; danger?: boolean }) {
  const { state, dispatch } = useStore()
  if (!can(state, action)) return null
  return <button className={`btn ${danger ? 'danger' : ''}`} onClick={() => dispatch(action)}>{label}</button>
}

function InputAction({ label, placeholder, type = 'text', required = true, probe = 'x', danger, build }: {
  label: string; placeholder?: string; type?: 'text' | 'time'; required?: boolean; probe?: string; danger?: boolean; build: (v: string) => CaseAction
}) {
  const { state, dispatch } = useStore()
  const [v, setV] = useState('')
  if (!can(state, build(probe))) return null
  return (
    <div className="action-row wrap">
      <input className={`input ${type === 'time' ? 'time-input' : ''}`} type={type} maxLength={MAX_TEXT} aria-label={label} placeholder={placeholder}
        value={v} onChange={(e) => setV(e.target.value)} />
      <button className={`btn ${danger ? 'danger' : ''}`} disabled={required && !v.trim()} onClick={() => { dispatch(build(v)); setV('') }}>{label}</button>
    </div>
  )
}

function AssignAction({ id }: { id: string }) {
  const { state, dispatch } = useStore()
  const [partner, setPartner] = useState(state.carePartners[0] ?? '')
  const action: CaseAction = { type: 'staff/assign', id, partner }
  if (!can(state, action)) return null
  return (
    <div className="action-row wrap">
      <select className="input" aria-label="Care Partner" value={partner} onChange={(e) => setPartner(e.target.value)}>
        {state.carePartners.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button className="btn" onClick={() => dispatch(action)}>Phân công</button>
    </div>
  )
}

function Actions({ c }: { c: Case }) {
  const { state } = useStore()
  const id = c.id
  return (
    <div className="actions">
      <ActionButton label="Tôi đã tiếp nhận" danger action={{ type: 'case/ack', id, by: 'staff' }} />
      {c.priority !== 'emergency' && <ActionButton label="Tôi xem việc này" action={{ type: 'staff/takeEvent', id }} />}
      <InputAction label="Đã xử lý" placeholder="Ghi chú kết quả xử lý" build={(note) => ({ type: 'staff/resolveEvent', id, note })} />
      <InputAction label="Xác minh" placeholder="Ghi chú xác minh (không bắt buộc)" required={false} probe="" build={(note) => ({ type: 'staff/verify', id, note })} />
      <AssignAction id={id} />
      <InputAction label="Ghi nhận báo cáo" placeholder="Care Partner báo lại điều gì?" build={(note) => ({ type: 'staff/partnerReport', id, note })} />
      <ActionButton label="Xác nhận hoàn tất" action={{ type: 'staff/complete', id }} />
      <InputAction label="Duyệt lịch nhắc" type="time" probe="09:00" build={(time) => ({ type: 'staff/approveReminder', id, time })} />
      <ActionButton label="Đã liên hệ" action={{ type: 'staff/contacted', id }} />
      <InputAction label="Nhờ gia đình hỗ trợ" placeholder={`Câu hỏi gửi ${familyName(state)}`} build={(question) => ({ type: 'staff/askFamily', id, question })} />
      <InputAction label="Từ chối" placeholder="Lý do từ chối (gia đình sẽ thấy)" danger build={(reason) => ({ type: 'staff/decline', id, reason })} />
    </div>
  )
}

function FieldList({ c, known }: { c: RequestCase; known?: boolean }) {
  const fields = SERVICE_FIELDS[c.service].filter((f) => !known || c.fields[f.key] !== undefined)
  return (
    <ul className="fields">
      {fields.map((f) => <li key={f.key}><span className="muted">{f.label}:</span> {c.fields[f.key] ?? <i className="muted">chưa rõ</i>}</li>)}
    </ul>
  )
}

function result(c: Case): string {
  if (c.kind === 'event') return c.status === 'resolved' ? `Đã đóng: ${c.closingNote}` : c.status === 'handling' ? `${c.handler} đang xử lý` : 'Chưa có kết quả'
  if (c.status === 'done') return `Hoàn tất${c.completedAt ? ` lúc ${when(c.completedAt)}` : ''}, nhân viên xác nhận: ${c.doneBy}`
  if (c.status === 'refused') return `Từ chối: ${c.closedReason}`
  if (c.partnerReport) return `Care Partner báo: ${c.partnerReport}`
  return 'Chưa có kết quả'
}

export function CaseDetail() {
  const { state, view, dispatch } = useStore()
  const c = state.cases.find((x) => x.id === view.caseId)
  const back = <button className="btn ghost sm" onClick={() => dispatch({ type: 'nav', screen: 's-board' })}>‹ Bảng điều phối</button>
  if (!c) return <div className="family-page case-screen">{back}<p className="empty">Không tìm thấy việc này.</p></div>

  const req = c.kind === 'request' ? c : undefined
  const p = effectivePriority(c, state.now)
  const absent = req ? SERVICE_FIELDS[req.service].filter((f) => req.fields[f.key] === undefined).map((f) => f.label) : []
  const missing = [...new Set([...c.unclear, ...absent])]
  const verified = req ? (req.verifiedBy ? <>
    {req.verifiedBy}{req.verifiedAt ? ` · ${when(req.verifiedAt)}` : ''}{req.verifyNote ? ` · ${req.verifyNote}` : ''}
    <FieldList c={req} known />
  </> : 'Chưa xác minh') : 'Chưa xác minh'
  return (
    <div className="family-page case-screen">
      {back}
      <div className={`card ${c.priority === 'emergency' ? 'sos-card' : ''}`} style={{ marginTop: 12 }}>
        <div className="row between wrap"><b>{c.id}</b><StatusBadge c={c} /></div>
        <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
          <PriorityBadge c={c} now={state.now} />
          {req?.partnerReport && req.status === 'in_progress' && <span className="badge b-attn">{PARTNER_PENDING}</span>}
          {c.owner === 'family' && <span className="badge b-neutral">Gia đình phụ trách</span>}
        </div>
        <Actions key={c.id} c={c} />
      </div>

      <div className="card">
        <ul className="fields">
          <li><span className="muted">Người liên quan:</span> {state.elder.name} <SourceTag source={c.source} /></li>
          <li>
            <span className="muted">Nội dung:</span> <b>{c.title}</b>
            {c.detail && <div>{c.detail}</div>}
            {req && <FieldList c={req} />}
          </li>
          <li><span className="muted">Thời điểm ghi nhận:</span> {when(c.createdAt)}</li>
          <li><span className="muted">Ưu tiên:</span> {p.reason}</li>
          <li><span className="muted">Thông tin đã xác minh:</span> {verified}</li>
          <li><span className="muted">Chưa rõ / còn thiếu:</span> {missing.join(', ') || 'Không có'}</li>
          <li><span className="muted">Ai làm tiếp:</span> {nextOwner(c, state)}</li>
          <li><span className="muted">Trạng thái và kết quả:</span> <StatusBadge c={c} /> {result(c)}</li>
        </ul>
      </div>

      {c.familyAsk && (
        <div className="card">
          <b>Nhờ gia đình hỗ trợ</b>
          <p className="small">{familyName(state)} được hỏi lúc {when(c.familyAsk.askedAt)}: {c.familyAsk.question}</p>
          <p className="small">
            {c.familyAsk.reply === undefined ? <i className="muted">Chưa có trả lời</i>
              : <>Trả lời{c.familyAsk.repliedAt ? ` lúc ${when(c.familyAsk.repliedAt)}` : ''}: {c.familyAsk.reply}</>}
          </p>
        </div>
      )}

      {c.kind === 'event' && c.source === 'device' && (
        <div className="card">
          <b>Các bước tiếp theo</b>
          <ol className="small">{DEVICE_STEPS.map((t) => <li key={t}>{t}</li>)}</ol>
          <p className="muted small">Nếu có dấu hiệu khẩn cấp từ người dùng hoặc nguồn đáng tin cậy, phải kích hoạt quy trình khẩn cấp phù hợp, không chờ hoàn tất các bước kiểm tra thông thường.</p>
        </div>
      )}

      <div className="card">
        <b>Việc đã làm</b>
        <ul className="timeline">
          {c.history.map((h, i) => <li key={i}><b>{when(h.at)}</b> {h.text} <SourceTag source={h.by} /></li>)}
        </ul>
      </div>
    </div>
  )
}
