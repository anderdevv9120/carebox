import type { ReactNode } from 'react'
import { TabBar, type TabItem } from './ui/TabBar'
import { EmergencyOverlay } from './ui/EmergencyOverlay'
import { useStore } from './state/store'
import type { Screen } from './state/types'
import { Home } from './elder/Home'
import { Schedule } from './elder/Schedule'
import { Health } from './elder/Health'
import { Services } from './elder/Services'
import { Requests } from './elder/Requests'
import { Chat } from './elder/Chat'
import { Dashboard } from './family/Dashboard'
import { Profile } from './family/Profile'
import { Notifications } from './family/Notifications'
import { Report } from './family/Report'

const ELDER: Partial<Record<Screen, () => ReactNode>> = {
  home: Home, schedule: Schedule, health: Health, services: Services, requests: Requests, chat: Chat,
}
const ELDER_TABS: TabItem<Screen>[] = [
  { id: 'home', label: 'Trang chủ', icon: '🏠' },
  { id: 'schedule', label: 'Lịch trình', icon: '🗓️' },
  { id: 'health', label: 'Sức khỏe', icon: '❤️' },
  { id: 'services', label: 'Dịch vụ', icon: '🤝' },
  { id: 'requests', label: 'Yêu cầu', icon: '📋' },
  // on phones the assistant opens from the Home mic, so the bottom bar keeps five tabs
  { id: 'chat', label: 'Trợ lý', icon: '🤖', className: 'wide-only' },
]

const FAMILY: Partial<Record<Screen, () => ReactNode>> = {
  'f-dashboard': Dashboard, 'f-profile': Profile, 'f-notifications': Notifications, 'f-report': Report,
}

export default function App() {
  const { state, dispatch, view, session, logout } = useStore()
  const go = (screen: Screen) => dispatch({ type: 'nav', screen })
  const elder = session.role === 'elder'

  let View: () => ReactNode
  let tabs: TabItem<Screen>[]
  if (elder) {
    View = ELDER[view.screen] ?? Home
    tabs = ELDER_TABS
  } else {
    View = FAMILY[view.screen] ?? Dashboard
    const toHandle = state.cases.filter((c) => c.status === 'await_family' || c.status === 'to_verify').length
    tabs = [
      { id: 'f-dashboard', label: 'Tổng quan', icon: '🏠' },
      { id: 'f-requests', label: 'Yêu cầu của mẹ', icon: '📋', badge: toHandle },
      { id: 'f-notifications', label: 'Thông báo', icon: '🔔', badge: state.notifications.filter((n) => !n.read).length },
      { id: 'f-profile', label: 'Hồ sơ & thiết bị', icon: '👵' },
      { id: 'f-report', label: 'Báo cáo', icon: '📄' },
    ]
  }

  const reset = () => confirm('Khôi phục dữ liệu demo cho cả hai tài khoản?') && dispatch({ type: 'reset' })

  return (
    <div className={`shell ${elder ? 'is-elder' : 'is-family'}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">🧡</span>
          <span className="brand-name">CAREBOX{!elder && <small> Family</small>}</span>
        </div>
        <div className="topbar-right">
          <span className="demo-chip">Dữ liệu minh họa</span>
          <span className="who">{session.name}</span>
          <button className="icon-btn" onClick={reset} title="Khôi phục dữ liệu demo" aria-label="Khôi phục dữ liệu demo">↺</button>
          <button className="btn ghost sm" onClick={logout}>Đăng xuất</button>
        </div>
      </header>
      <TabBar items={tabs} active={view.screen} onSelect={go} />
      <main className="content">
        <View />
      </main>
      {elder && <EmergencyOverlay />}
    </div>
  )
}
