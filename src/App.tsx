import type { ReactNode } from 'react'
import { TabBar, type TabItem } from './ui/TabBar'
import { EmergencyOverlay } from './ui/EmergencyOverlay'
import { useStore } from './state/store'
import { familyTodo, isFinal, staffBoard } from './state/cases'
import { notificationsFor } from './state/helpers'
import type { EventCase, Screen } from './state/types'
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
import { Requests as FamilyRequests } from './family/Requests'
import { Board } from './staff/Board'
import { CaseDetail } from './staff/CaseDetail'

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
  'f-dashboard': Dashboard, 'f-requests': FamilyRequests, 'f-profile': Profile, 'f-notifications': Notifications, 'f-report': Report,
}

const STAFF: Partial<Record<Screen, () => ReactNode>> = {
  's-board': Board, 's-case': CaseDetail, 's-notifications': Notifications, 's-report': Report, 's-profile': Profile,
}

export default function App() {
  const { state, dispatch, view, session, logout } = useStore()
  const go = (screen: Screen) => dispatch({ type: 'nav', screen })
  const elder = session.role === 'elder'
  const staff = session.role === 'staff'

  let View: () => ReactNode
  let tabs: TabItem<Screen>[]
  if (elder) {
    View = ELDER[view.screen] ?? Home
    tabs = ELDER_TABS
  } else if (staff) {
    View = STAFF[view.screen] ?? Board
    tabs = [
      { id: 's-board', label: 'Bảng điều phối', icon: '🗂️', badge: staffBoard(state).counters.verify },
      { id: 's-notifications', label: 'Thông báo', icon: '🔔', badge: notificationsFor(state, 'staff').filter((n) => !n.read).length },
      { id: 's-report', label: 'Báo cáo', icon: '📄' },
      { id: 's-profile', label: 'Hồ sơ & thiết bị', icon: '👵' },
    ]
  } else {
    View = FAMILY[view.screen] ?? Dashboard
    tabs = [
      { id: 'f-dashboard', label: 'Tổng quan', icon: '🏠' },
      { id: 'f-requests', label: 'Yêu cầu của mẹ', icon: '📋', badge: familyTodo(state) },
      { id: 'f-notifications', label: 'Thông báo', icon: '🔔', badge: notificationsFor(state, 'family').filter((n) => !n.read).length },
      { id: 'f-profile', label: 'Hồ sơ & thiết bị', icon: '👵' },
      { id: 'f-report', label: 'Báo cáo', icon: '📄' },
    ]
  }

  // The bar follows the open emergency event, not the elder's overlay: only "Tôi đã tiếp nhận" changes its wording.
  const sos = elder ? undefined : state.cases.find((c): c is EventCase => c.kind === 'event' && c.priority === 'emergency' && !isFinal(c))
  const reset = () => dispatch({ type: 'reset' })

  return (
    <div className={`shell ${elder ? 'is-elder' : 'is-family'}`}>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/favicon.svg" alt="" />
          <span className="brand-name">CAREBOX{!elder && <small> {staff ? 'Operations' : 'Family'}</small>}</span>
        </div>
        <div className="topbar-right">
          <span className="who">{session.name}</span>
          <button className="icon-btn" onClick={reset} title="Đặt lại dữ liệu" aria-label="Đặt lại dữ liệu">↺</button>
          <button className="btn ghost sm" onClick={logout}>Đăng xuất</button>
        </div>
      </header>
      <TabBar items={tabs} active={view.screen === 's-case' ? 's-board' : view.screen} onSelect={go} />
      <main className="content">
        {sos && (
          <div className="emergency-banner" role="alert">
            <span>
              🚨 Khẩn cấp {sos.id}: {sos.title} —{' '}
              {sos.status === 'to_verify' ? 'chưa có người xác nhận tiếp nhận.' : `${sos.handler} đã tiếp nhận, chưa đóng.`}
            </span>
            <button onClick={() => (staff ? dispatch({ type: 'nav', screen: 's-case', caseId: sos.id }) : go('f-requests'))}>Xem</button>
          </div>
        )}
        <View />
      </main>
      {elder && <EmergencyOverlay />}
    </div>
  )
}
