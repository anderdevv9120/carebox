import { useState } from 'react'
import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { isFinal, nextOwner } from '../state/cases'
import { SERVICE_ICON } from '../state/labels'
import { SERVICE_FIELDS } from '../state/assistant'
import { StatusBadge } from '../ui/Badges'
import type { RequestCase, State } from '../state/types'

const TABS = [
  { id: 'open', label: 'Đang xử lý', keep: (c: RequestCase) => !isFinal(c) },
  { id: 'closed', label: 'Đã xong', keep: (c: RequestCase) => isFinal(c) },
  { id: 'all', label: 'Tất cả', keep: () => true },
] as const

export function RequestCard({ c, s, onCancel }: { c: RequestCase; s: State; onCancel?: () => void }) {
  return (
    <div className="card">
      <div className="row">
        <span className="icon-circle">{SERVICE_ICON[c.service]}</span>
        <div className="grow">
          <div className="row between wrap">
            <b>{c.title}</b>
            <span className="row" style={{ gap: 4 }}><StatusBadge c={c} /></span>
          </div>
          <div className="muted small">{c.id} · Tiếp nhận {fmtTime(c.createdAt)}</div>
        </div>
      </div>
      <ul className="fields">
        {SERVICE_FIELDS[c.service].map((f) => (
          <li key={f.key}><span className="muted">{f.label}:</span> {c.fields[f.key] ?? <i className="muted">chưa rõ</i>}</li>
        ))}
      </ul>
      <div className="small"><span className="muted">Phụ trách tiếp theo:</span> <b>{nextOwner(c, s)}</b></div>
      <ul className="timeline">
        {c.history.map((h, i) => <li key={i}><b>{fmtTime(h.at)}</b> {h.text}</li>)}
      </ul>
      {onCancel && !isFinal(c) && <button className="btn ghost sm" onClick={onCancel}>Hủy yêu cầu</button>}
    </div>
  )
}

export function Requests() {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all')
  const keep = TABS.find((t) => t.id === tab)!.keep
  const list = state.cases.filter((c): c is RequestCase => c.kind === 'request').filter(keep).sort((a, b) => b.createdAt - a.createdAt)
  return (
    <div className="elder">
      <h1 className="screen-title">📋 Yêu cầu hỗ trợ</h1>
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {list.map((c) => (
        <RequestCard key={c.id} c={c} s={state}
          onCancel={() => confirm(`Bác muốn hủy yêu cầu "${c.title}"?`) && dispatch({ type: 'request/cancel', id: c.id })} />
      ))}
      {!list.length && <p className="empty">Chưa có yêu cầu nào</p>}
    </div>
  )
}
