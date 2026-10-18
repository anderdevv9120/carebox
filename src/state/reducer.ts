import { MIN } from './helpers'
import { seed } from './seed'
import { respondReminder, sweepReminders } from './reminders'
import { disconnect, pushReading, reconnect, reportFall } from './devices'
import { transition, type CaseAction } from './cases'
import { handleUtterance, handoff, startService } from './assistant'
import type { DeviceKind, Role, Screen, ServiceType, State } from './types'

export type Action =
  | { type: 'reset' }
  | { type: 'nav'; role?: Role; screen?: Screen; caseId?: string }
  | { type: 'clock/advance'; minutes: number }
  | { type: 'clock/nextReminder' }
  | { type: 'reminder/respond'; id: string; response: 'received' | 'snooze' | 'cant_do' }
  | { type: 'device/push'; deviceId: Exclude<DeviceKind, 'fall'>; mode: 'normal' | 'high' | 'suspicious' }
  | { type: 'device/disconnect'; deviceId: DeviceKind }
  | { type: 'device/reconnect'; deviceId: DeviceKind }
  | { type: 'device/fall' }
  | { type: 'chat/say'; text: string }
  | { type: 'chat/startService'; service: ServiceType }
  | { type: 'chat/handoff' }
  | { type: 'notif/readAll'; audience: 'family' | 'ops' }
  | CaseAction

const HOME: Record<Role, Screen> = { elder: 'home', family: 'f-dashboard', ops: 'ops-board' }

export function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'reset':
      return seed(new Date(s.now))
    case 'nav': {
      const role = a.role ?? s.view.role
      return { ...s, view: { role, screen: a.screen ?? HOME[role], caseId: a.caseId } }
    }
    case 'clock/advance':
      return sweepReminders({ ...s, now: s.now + a.minutes * MIN })
    case 'clock/nextReminder': {
      const next = s.reminders
        .filter((r) => !r.response)
        .map((r) => (r.snoozedUntil && r.snoozedUntil > s.now ? r.snoozedUntil : r.dueAt))
        .filter((t) => t > s.now)
        .sort((x, y) => x - y)[0]
      return next ? sweepReminders({ ...s, now: next }) : s
    }
    case 'reminder/respond':
      return respondReminder(s, a.id, a.response)
    case 'device/push':
      return pushReading(s, a.deviceId, a.mode)
    case 'device/disconnect':
      return disconnect(s, a.deviceId)
    case 'device/reconnect':
      return reconnect(s, a.deviceId)
    case 'device/fall':
      return reportFall(s)
    case 'chat/say':
      return handleUtterance(s, a.text)
    case 'chat/startService':
      return startService(s, a.service)
    case 'chat/handoff':
      return handoff(s)
    case 'notif/readAll':
      if (!s.notifications.some((n) => n.audience === a.audience && !n.read)) return s
      return { ...s, notifications: s.notifications.map((n) => (n.audience === a.audience ? { ...n, read: true } : n)) }
    default:
      return transition(s, a)
  }
}
