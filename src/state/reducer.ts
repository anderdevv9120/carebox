import { MIN } from './helpers'
import { seed } from './seed'
import { respondReminder, sweepReminders } from './reminders'
import { disconnect, pushReading, reconnect, reportFall } from './devices'
import type { DeviceKind, Role, Screen, State } from './types'

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
  }
}
