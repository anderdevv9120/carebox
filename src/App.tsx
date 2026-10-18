import type { ReactNode } from 'react'
import { PhoneFrame } from './ui/PhoneFrame'
import { TabBar } from './ui/TabBar'
import { EmergencyOverlay } from './ui/EmergencyOverlay'
import { useStore } from './state/store'
import { fmtTime } from './state/helpers'
import type { Role, Screen } from './state/types'
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

const ROLES: { id: Role; label: string }[] = [
  { id: 'elder', label: 'Người cao tuổi' },
  { id: 'family', label: 'Gia đình' },
  { id: 'ops', label: 'Điều phối' },
]

const ELDER: Partial<Record<Screen, () => ReactNode>> = {
  home: Home, schedule: Schedule, health: Health, services: Services, requests: Requests, chat: Chat,
}
const ELDER_TABS: { id: Screen; label: string; icon: string }[] = [
  { id: 'home', label: 'Trang chủ', icon: '🏠' },
  { id: 'schedule', label: 'Lịch trình', icon: '🗓️' },
  { id: 'health', label: 'Sức khỏe', icon: '❤️' },
  { id: 'services', label: 'Dịch vụ', icon: '🤝' },
  { id: 'requests', label: 'Yêu cầu', icon: '📋' },
]

const FAMILY: Partial<Record<Screen, () => ReactNode>> = {
  'f-dashboard': Dashboard, 'f-profile': Profile, 'f-notifications': Notifications, 'f-report': Report,
}

export default function App() {
  const { state, dispatch } = useStore()
  const { role, screen } = state.view
  const go = (s: Screen) => dispatch({ type: 'nav', screen: s })
  const time = fmtTime(state.now)

  let stage: ReactNode
  if (role === 'elder') {
    const View = ELDER[screen] ?? Home
    stage = (
      <PhoneFrame time={time} overlay={<EmergencyOverlay />} footer={<TabBar items={ELDER_TABS} active={screen} onSelect={go} />}>
        <View />
      </PhoneFrame>
    )
  } else if (role === 'family') {
    const View = FAMILY[screen] ?? Dashboard
    const unread = state.notifications.filter((n) => n.audience === 'family' && !n.read).length
    const tabs = [
      { id: 'f-dashboard' as const, label: 'Tổng quan', icon: '🏠' },
      { id: 'f-profile' as const, label: 'Hồ sơ', icon: '👵' },
      { id: 'f-notifications' as const, label: 'Thông báo', icon: '🔔', badge: unread },
      { id: 'f-report' as const, label: 'Báo cáo', icon: '📄' },
    ]
    stage = (
      <PhoneFrame time={time} className="family" footer={<TabBar<Screen> items={tabs} active={screen} onSelect={go} />}>
        <View />
      </PhoneFrame>
    )
  } else {
    stage = <PhoneFrame time={time}><p className="empty">{screen}</p></PhoneFrame>
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">🧡</span>
          <div>
            <div className="brand-name">CAREBOX</div>
            <div className="brand-tag">AI watches. Family knows. CAREBOX steps in.</div>
          </div>
        </div>
        <span className="demo-note">Bản demo — không phải ứng dụng thật</span>
        <div className="role-switch">
          {ROLES.map((r) => (
            <button key={r.id} className={r.id === role ? 'active' : ''} onClick={() => dispatch({ type: 'nav', role: r.id })}>{r.label}</button>
          ))}
        </div>
      </header>
      <div className="layout">
        <main className="stage">
          {role !== 'elder' && state.emergency && (
            <div className="emergency-banner">
              <span>🚨 Tình huống khẩn cấp đang diễn ra ({state.emergency.caseId}) — cần người xác nhận đã tiếp nhận.</span>
              <button onClick={() => dispatch({ type: 'nav', role: 'ops', screen: 'ops-case', caseId: state.emergency!.caseId })}>Xem</button>
            </div>
          )}
          {stage}
        </main>
        <aside />
      </div>
    </div>
  )
}
