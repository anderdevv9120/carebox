import type { ReactNode } from 'react'
import { PhoneFrame } from './ui/PhoneFrame'
import { TabBar } from './ui/TabBar'
import { EmergencyOverlay } from './ui/EmergencyOverlay'
import { ScenarioPanel } from './ui/ScenarioPanel'
import { useStore } from './state/store'
import { fmtTime } from './state/helpers'
import { isFinal } from './state/cases'
import type { EventCase, Role, Screen } from './state/types'
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
import { Board } from './ops/Board'
import { CaseDetail } from './ops/CaseDetail'

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
  // Banner follows the open emergency event, not the elder's overlay: closing the overlay acknowledges nothing.
  const openEmergency = state.cases.find((c): c is EventCase => c.kind === 'event' && c.priority === 'emergency' && !isFinal(c))

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
    stage = (
      <section className="ops-panel">
        <div className="ops-head">
          <span className="bold">CAREBOX Operations</span>
          <span className="row" style={{ gap: 8 }}><span className="demo-chip">Dữ liệu minh họa</span><span className="muted">{time} · {state.staff} (điều phối)</span></span>
        </div>
        {screen === 'ops-case' ? <CaseDetail key={state.view.caseId} /> : <Board />}
      </section>
    )
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
          {role !== 'elder' && openEmergency && (
            <div className="emergency-banner">
              <span>
                🚨 Khẩn cấp {openEmergency.id}: {openEmergency.title} —{' '}
                {openEmergency.status === 'to_verify' ? 'chưa có người xác nhận tiếp nhận.' : `${openEmergency.handler} đang xử lý, chưa đóng.`}
              </span>
              <button onClick={() => dispatch({ type: 'nav', role: 'ops', screen: 'ops-case', caseId: openEmergency.id })}>Xem</button>
            </div>
          )}
          {stage}
        </main>
        <ScenarioPanel />
      </div>
    </div>
  )
}
