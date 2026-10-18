import { useState } from 'react'
import { useStore } from '../state/store'
import type { ServiceType } from '../state/types'

const ROWS: { service?: ServiceType; icon: string; title: string; sub: string }[] = [
  { service: 'medicine', icon: '💊', title: 'Mua thuốc', sub: 'Theo đơn' },
  { service: 'groceries', icon: '🛒', title: 'Đi chợ', sub: 'Thực phẩm, đồ dùng' },
  { service: 'clinic', icon: '🏥', title: 'Đi khám bệnh', sub: 'Đặt lịch, đưa đi' },
  { service: 'daily_help', icon: '🧹', title: 'Hỗ trợ sinh hoạt', sub: 'Dọn dẹp, giặt giũ…' },
  { icon: '💬', title: 'Trò chuyện', sub: 'Tâm sự, đồng hành' },
]

export function Services() {
  const { dispatch } = useStore()
  const [q, setQ] = useState('')
  const rows = ROWS.filter((r) => `${r.title} ${r.sub}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="elder services-screen">
      <h1 className="screen-title">🧡 Dịch vụ hỗ trợ</h1>
      <input className="input" placeholder="🔍 Tìm dịch vụ…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ marginTop: 12 }}>
        {rows.map((r) => (
          <button
            key={r.title}
            className="card service-row"
            onClick={() => {
              if (r.service) dispatch({ type: 'chat/startService', service: r.service })
              dispatch({ type: 'nav', screen: 'chat' })
            }}
          >
            <span className="icon-circle">{r.icon}</span>
            <span className="grow">
              <b>{r.title}</b>
              <span className="muted small block">{r.sub}</span>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
        {!rows.length && <p className="empty">Không tìm thấy dịch vụ</p>}
      </div>
    </div>
  )
}
