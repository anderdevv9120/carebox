import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { familyNotifications, fmtTime } from '../state/helpers'
import { SourceTag } from '../ui/Badges'
import type { NotifCategory } from '../state/types'

const TABS: { id: NotifCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'request', label: 'Yêu cầu' },
  { id: 'health', label: 'Sức khỏe' },
  { id: 'other', label: 'Khác' },
]
const ICON: Record<NotifCategory, string> = { request: '🛒', health: '💓', other: '🔔' }

export function Notifications() {
  const { state, dispatch } = useStore()
  const [tab, setTab] = useState<NotifCategory | 'all'>('all')
  const [unreadAtOpen] = useState(() => new Set(familyNotifications(state).filter((n) => !n.read).map((n) => n.id)))
  useEffect(() => {
    dispatch({ type: 'notif/readAll', to: 'family' })
  }, [dispatch, state.notifications.length])
  const list = familyNotifications(state)
    .filter((n) => tab === 'all' || n.category === tab)
    .sort((a, b) => b.at - a.at)
  return (
    <div className="family-page notifications-screen">
      <h1 className="screen-title">🔔 Thông báo</h1>
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {list.map((n) => (
        <div key={n.id} className={`card row notif ${unreadAtOpen.has(n.id) ? 'unread' : ''}`}>
          <span className="icon-circle">{ICON[n.category]}</span>
          <div className="grow">
            <div className="small">{n.text}</div>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <span className="muted small">{fmtTime(n.at)}</span>
              <SourceTag source={n.source} />
            </div>
          </div>
        </div>
      ))}
      {!list.length && <p className="empty">Chưa có thông báo</p>}
      <p className="muted small center">“Đã gửi thông báo” không có nghĩa là đã có người đọc hoặc đã xử lý.</p>
    </div>
  )
}
