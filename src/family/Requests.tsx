import { useState } from 'react'
import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { can, familyView, isAbandoned, nextOwner } from '../state/cases'
import { SERVICE_ICON } from '../state/labels'
import { SERVICE_FIELDS } from '../state/assistant'
import { PriorityBadge, SourceTag, StatusBadge } from '../ui/Badges'
import type { Case, EventCase, RequestCase } from '../state/types'

const MAX_TEXT = 500 // server rejects longer notes

// CAREBOX's question for the daughter: the reply box while open, then her answer read-only.
function AskReply({ c }: { c: Case }) {
  const { dispatch } = useStore()
  const [text, setText] = useState('')
  if (!c.familyAsk) return null
  if (c.familyAsk.reply !== undefined) {
    return (
      <div className="note small">
        <b>CAREBOX hỏi:</b> {c.familyAsk.question}
        <div><b>Chị trả lời:</b> {c.familyAsk.reply}</div>
      </div>
    )
  }
  return (
    <div className="note small">
      <b>CAREBOX hỏi:</b> {c.familyAsk.question}
      <div className="action-row wrap">
        <input className="input" maxLength={MAX_TEXT} aria-label="Trả lời CAREBOX" placeholder="Câu trả lời của chị" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" disabled={!text.trim()} onClick={() => { dispatch({ type: 'family/reply', id: c.id, text }); setText('') }}>Gửi trả lời</button>
      </div>
    </div>
  )
}

function AlertCard({ c, now }: { c: EventCase; now: number }) {
  const { state, dispatch } = useStore()
  const sos = c.priority === 'emergency'
  return (
    <div className={`card ${sos ? 'sos-card' : ''}`}>
      <div className="row between wrap"><b>{c.title}</b><PriorityBadge c={c} now={now} /></div>
      <div className="row wrap small" style={{ gap: 6, marginTop: 4 }}>
        <span className="muted">{c.id} · {fmtTime(c.createdAt)}</span><SourceTag source={c.source} /><StatusBadge c={c} />
      </div>
      {c.detail && <p className="small" style={{ marginTop: 6 }}>{c.detail}</p>}
      {c.unclear.length > 0 && <div className="unclear small">Chưa rõ: {[...new Set(c.unclear)].join(', ')}</div>}
      <div className="small"><span className="muted">Phụ trách:</span> <b>{nextOwner(c, state)}</b></div>
      <AskReply c={c} />
      <div className="actions">
        {sos && c.status === 'to_verify' && (
          <button className="btn danger" onClick={() => dispatch({ type: 'case/ack', id: c.id, by: 'family' })}>Tôi đã tiếp nhận</button>
        )}
      </div>
    </div>
  )
}

// Buttons appear only where the reducer would act (`can`), so a request staff took over shows none.
function RequestActions({ c }: { c: RequestCase }) {
  const { state, dispatch } = useStore()
  const [time, setTime] = useState('')
  const [reason, setReason] = useState<string | null>(null) // null = decline box closed

  if (c.status === 'need_info' || c.status === 'await_confirm') return <p className="muted small">Mẹ đang bổ sung / xác nhận</p>

  let main
  if (c.service === 'add_reminder' && can(state, { type: 'family/approveReminder', id: c.id, time: '09:00' })) {
    main = (
      <div className="action-row wrap">
        <input className="input time-input" type="time" aria-label="Giờ nhắc" value={time} onChange={(e) => setTime(e.target.value)} />
        <button className="btn" disabled={!time} onClick={() => dispatch({ type: 'family/approveReminder', id: c.id, time })}>Duyệt lịch nhắc</button>
      </div>
    )
  } else if (c.service === 'contact_family' && can(state, { type: 'family/contacted', id: c.id })) {
    main = <button className="btn" onClick={() => dispatch({ type: 'family/contacted', id: c.id })}>Đã liên hệ</button>
  }
  const declinable = can(state, { type: 'family/decline', id: c.id, reason: 'x' })
  if (!main && !declinable) return null
  return (
    <>
      <div className="action-row wrap">
        {main}
        {declinable && reason === null && <button className="btn ghost danger-text" onClick={() => setReason('')}>Từ chối</button>}
      </div>
      {reason !== null && (
        <div className="action-row col">
          <input className="input" autoFocus maxLength={MAX_TEXT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do từ chối (mẹ sẽ thấy)" />
          <div className="action-row">
            <button className="btn danger" disabled={!reason.trim()} onClick={() => dispatch({ type: 'family/decline', id: c.id, reason })}>Xác nhận từ chối</button>
            <button className="btn ghost" onClick={() => setReason(null)}>Thôi</button>
          </div>
        </div>
      )}
    </>
  )
}

function RequestItem({ c, now, acts }: { c: RequestCase; now: number; acts: boolean }) {
  const { state } = useStore()
  return (
    <div className={`card ${isAbandoned(c, now) ? 'attn-card' : ''}`}>
      <div className="row">
        <span className="icon-circle">{SERVICE_ICON[c.service]}</span>
        <div className="grow">
          <div className="row between wrap"><b>{c.title}</b><StatusBadge c={c} /></div>
          <div className="row wrap small" style={{ gap: 6 }}>
            <span className="muted">{c.id} · {fmtTime(c.createdAt)}</span>
            <SourceTag source={c.source} />
            {isAbandoned(c, now) && <span className="badge b-attn" title="Chưa ai nhận quá 30 phút">Bỏ ngỏ</span>}
          </div>
        </div>
      </div>
      <ul className="fields">
        {SERVICE_FIELDS[c.service].map((f) => (
          <li key={f.key}><span className="muted">{f.label}:</span> {c.fields[f.key] ?? <i className="muted">chưa rõ</i>}</li>
        ))}
      </ul>
      <div className="small"><span className="muted">Phụ trách:</span> <b>{nextOwner(c, state)}</b></div>
      <AskReply c={c} />
      {acts && <div className="actions"><RequestActions c={c} /></div>}
    </div>
  )
}

export function Requests() {
  const { state } = useStore()
  const { asks, mine, others } = familyView(state)
  // acts: she can act on the case itself (her own requests, and a handed-back one that also carries an ask)
  const card = (c: Case, acts: boolean) => c.kind === 'event'
    ? <AlertCard key={c.id} c={c} now={state.now} />
    : <RequestItem key={c.id} c={c} now={state.now} acts={acts} />
  return (
    <div className="family-page family-requests-screen">
      <h1 className="screen-title">📋 Yêu cầu của mẹ</h1>
      <h2 className="section">CAREBOX nhờ hỗ trợ</h2>
      {!asks.length && <p className="muted small">CAREBOX chưa nhờ chị việc nào.</p>}
      <div className="grid-wide">{asks.map((c) => card(c, true))}</div>
      <h2 className="section">Việc của chị</h2>
      {!mine.length && <p className="muted small">Không có việc nào chờ chị.</p>}
      <div className="grid-wide">{mine.map((c) => card(c, true))}</div>
      <h2 className="section">Đang được CAREBOX xử lý</h2>
      {!others.length && <p className="muted small">Không có việc đang mở.</p>}
      <div className="grid-wide">{others.map((c) => card(c, false))}</div>
    </div>
  )
}
