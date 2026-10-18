import { useState } from 'react'
import { useStore } from '../state/store'
import { fmtTime } from '../state/helpers'
import { effectivePriority, isFinal, nextOwner } from '../state/cases'
import { PriorityBadge, SourceTag, StatusBadge } from '../ui/Badges'
import type { Case, Priority, State } from '../state/types'

const RANK: Record<Priority, number> = { emergency: 0, priority: 1, uncertain: 2, normal: 3 }

export function sortCases(cases: Case[], now: number): Case[] {
  return [...cases].sort(
    (a, b) => RANK[effectivePriority(a, now).priority] - RANK[effectivePriority(b, now).priority] || a.createdAt - b.createdAt,
  )
}

function counters(s: State) {
  const open = s.cases.filter((c) => !isFinal(c))
  return [
    { n: open.filter((c) => c.kind === 'event' && c.priority === 'emergency').length, label: 'Khẩn cấp', cls: 'alert' },
    { n: open.filter((c) => ['need_info', 'await_confirm', 'await_dispatch'].includes(c.status)).length, label: 'Chờ xử lý', cls: '' },
    {
      n: open.filter((c) => (c.kind === 'request' && c.status === 'await_dispatch' && !c.verifiedBy) || c.status === 'to_verify').length,
      label: 'Cần xác minh', cls: 'attn',
    },
    { n: open.filter((c) => c.status === 'in_progress' || c.status === 'handling').length, label: 'Đang thực hiện', cls: 'prog' },
  ]
}

const FILTERS = [
  { id: 'open', label: 'Đang mở', keep: (c: Case) => !isFinal(c) },
  { id: 'closed', label: 'Đã đóng', keep: (c: Case) => isFinal(c) },
  { id: 'all', label: 'Tất cả', keep: () => true },
] as const

export function Board() {
  const { state, dispatch } = useStore()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('open')
  const keep = FILTERS.find((f) => f.id === filter)!.keep
  const list = sortCases(state.cases.filter(keep), state.now)
  return (
    <div>
      <h1 className="screen-title">Bảng điều phối yêu cầu</h1>
      <div className="counters">
        {counters(state).map((c) => (
          <div key={c.label} className={`counter ${c.cls}`}>
            <b>{String(c.n).padStart(2, '0')}</b>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
      <div className="row between wrap">
        <h2 className="section">Danh sách yêu cầu và sự kiện</h2>
        <div className="tabs" style={{ margin: 0 }}>
          {FILTERS.map((f) => <button key={f.id} className={f.id === filter ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
      </div>
      <div className="case-list">
        {list.map((c) => {
          const p = effectivePriority(c, state.now)
          return (
            <button key={c.id} className={`card case-row p-${p.priority}`} onClick={() => dispatch({ type: 'nav', screen: 'ops-case', caseId: c.id })}>
              <div className="row between wrap">
                <span><b>{c.id}</b> · {c.title}</span>
                <span className="row" style={{ gap: 4 }}><StatusBadge c={c} /></span>
              </div>
              <div className="row wrap small" style={{ gap: 8, marginTop: 6 }}>
                <PriorityBadge c={c} now={state.now} />
                <span className="muted">{p.reason}</span>
              </div>
              <div className="row between wrap small" style={{ marginTop: 6 }}>
                <span className="row" style={{ gap: 6 }}><SourceTag source={c.source} /><span className="muted">Tiếp nhận {fmtTime(c.createdAt)}</span></span>
                <span><span className="muted">Tiếp theo:</span> <b>{nextOwner(c, state)}</b></span>
              </div>
              {c.unclear.length > 0 && <div className="small unclear">Chưa rõ: {c.unclear.join('; ')}</div>}
            </button>
          )
        })}
        {!list.length && <p className="empty">Không có mục nào</p>}
      </div>
      <p className="muted small">Số lượng và mã yêu cầu chỉ nhằm minh họa cách tổ chức màn hình.</p>
    </div>
  )
}
