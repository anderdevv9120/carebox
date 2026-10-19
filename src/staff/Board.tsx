import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { effectivePriority, nextOwner, staffBoard } from '../state/cases'
import { PriorityBadge, SourceTag, StatusBadge } from '../ui/Badges'
import type { Case } from '../state/types'

function CaseCard({ c }: { c: Case }) {
  const { state, dispatch } = useStore()
  const last = c.history[c.history.length - 1]
  const p = effectivePriority(c, state.now)
  return (
    <button className={`card case-card ${p.priority === 'emergency' ? 'sos-card' : ''}`}
      onClick={() => dispatch({ type: 'nav', screen: 's-case', caseId: c.id })}>
      <span className="row between wrap"><b>{c.title}</b><PriorityBadge c={c} now={state.now} /></span>
      <span className="row wrap small" style={{ gap: 6, marginTop: 4 }}>
        <span className="muted">{c.id} · {fmtTime(c.createdAt)}</span><SourceTag source={c.source} />
        {c.owner === 'family' && <span className="badge b-neutral">Gia đình phụ trách (chỉ xem)</span>}
      </span>
      {c.detail && <span className="txt small">{c.detail}</span>}
      <span className="txt small muted">Lý do ưu tiên: {p.reason}</span>
      <span className="txt small">Bước tiếp theo: <b>{nextOwner(c, state)}</b></span>
      <span className="row wrap small" style={{ gap: 6, marginTop: 6 }}>
        <StatusBadge c={c} />
        {last && <span className="muted">{fmtTime(last.at)} {last.text}</span>}
      </span>
    </button>
  )
}

export function Board() {
  const { state } = useStore()
  const { counters, cases } = staffBoard(state)
  return (
    <div className="family-page board-screen">
      <h1 className="screen-title">🗂️ Bảng điều phối</h1>
      <div className="tiles three">
        <div className="tile"><span>{counters.verify}</span>Cần xác minh</div>
        <div className="tile"><span>{counters.waiting}</span>Chờ xử lý</div>
        <div className="tile"><span>{counters.doing}</span>Đang thực hiện</div>
      </div>
      <h2 className="section">Việc đang mở</h2>
      {!cases.length && <p className="muted small">Không có việc đang mở.</p>}
      <div className="grid-wide">{cases.map((c) => <CaseCard key={c.id} c={c} />)}</div>
    </div>
  )
}
