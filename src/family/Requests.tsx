import { useState } from 'react'
import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { familyQueue, isAbandoned } from '../state/cases'
import { SERVICE_ICON } from '../state/labels'
import { SERVICE_FIELDS } from '../state/assistant'
import { PriorityBadge, SourceTag, StatusBadge } from '../ui/Badges'
import type { EventCase, RequestCase } from '../state/types'

const MAX_TEXT = 500 // server rejects longer notes

function AlertCard({ c, now }: { c: EventCase; now: number }) {
  const { dispatch } = useStore()
  const [note, setNote] = useState('')
  const sos = c.priority === 'emergency'
  return (
    <div className={`card ${sos ? 'sos-card' : ''}`}>
      <div className="row between wrap"><b>{c.title}</b><PriorityBadge c={c} now={now} /></div>
      <div className="row wrap small" style={{ gap: 6, marginTop: 4 }}>
        <span className="muted">{c.id} · {fmtTime(c.createdAt)}</span><SourceTag source={c.source} /><StatusBadge c={c} />
      </div>
      {c.detail && <p className="small" style={{ marginTop: 6 }}>{c.detail}</p>}
      {c.unclear.length > 0 && <div className="unclear small">Chưa rõ: {c.unclear.join(', ')}</div>}
      <div className="actions">
        {c.status === 'to_verify' && (
          <button className={`btn ${sos ? 'danger' : ''}`} onClick={() => dispatch({ type: 'family/takeEvent', id: c.id })}>
            {sos ? 'Tôi đã tiếp nhận' : 'Tôi xem việc này'}
          </button>
        )}
        {c.status === 'handling' && (
          <div className="action-row col">
            <input className="input" maxLength={MAX_TEXT} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={sos ? 'Ai đã tiếp nhận? VD: Đã gọi 115, xe cấp cứu đã đến' : 'Ghi chú cách đã xử lý (bắt buộc)'} />
            <button className="btn ok" disabled={!note.trim()} onClick={() => dispatch({ type: 'family/resolveEvent', id: c.id, note })}>Đã xử lý</button>
          </div>
        )}
      </div>
    </div>
  )
}

function RequestActions({ c }: { c: RequestCase }) {
  const { dispatch } = useStore()
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState<string | null>(null) // null = decline box closed

  if (c.status === 'need_info' || c.status === 'await_confirm') return <p className="muted small">Mẹ đang bổ sung / xác nhận</p>
  if (c.status === 'in_progress' && c.service !== 'add_reminder' && c.service !== 'contact_family') {
    return (
      <div className="action-row col">
        <input className="input" maxLength={MAX_TEXT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú đã làm gì (không bắt buộc)" />
        <button className="btn ok" onClick={() => dispatch({ type: 'family/done', id: c.id, note })}>Đã xong</button>
      </div>
    )
  }

  let main
  if (c.service === 'add_reminder') {
    main = (
      <div className="action-row wrap">
        <input className="input time-input" type="time" aria-label="Giờ nhắc" value={time} onChange={(e) => setTime(e.target.value)} />
        <button className="btn" disabled={!time} onClick={() => dispatch({ type: 'family/approveReminder', id: c.id, time })}>Duyệt lịch nhắc</button>
      </div>
    )
  } else if (c.service === 'contact_family') {
    main = <button className="btn" onClick={() => dispatch({ type: 'family/contacted', id: c.id })}>Đã liên hệ</button>
  } else {
    main = <button className="btn" onClick={() => dispatch({ type: 'family/accept', id: c.id })}>Nhận việc</button>
  }
  return (
    <>
      <div className="action-row wrap">
        {main}
        {reason === null && <button className="btn ghost danger-text" onClick={() => setReason('')}>Từ chối</button>}
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

function RequestItem({ c, now }: { c: RequestCase; now: number }) {
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
      <div className="actions"><RequestActions c={c} /></div>
    </div>
  )
}

export function Requests() {
  const { state } = useStore()
  const { alerts, requests } = familyQueue(state)
  return (
    <div className="family-page family-requests-screen">
      <h1 className="screen-title">📋 Yêu cầu của mẹ</h1>
      <h2 className="section">Cảnh báo cần xem</h2>
      {!alerts.length && <p className="muted small">Không có cảnh báo đang mở.</p>}
      <div className="grid-wide">{alerts.map((c) => <AlertCard key={c.id} c={c} now={state.now} />)}</div>
      <h2 className="section">Yêu cầu đang mở</h2>
      {!requests.length && <p className="muted small">Không có yêu cầu đang mở.</p>}
      <div className="grid-wide">{requests.map((c) => <RequestItem key={c.id} c={c} now={state.now} />)}</div>
    </div>
  )
}
