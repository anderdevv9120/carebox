import { GREETING, seed } from './seed.js'
import { respondReminder } from './reminders.js'
import { disconnect, pushReading, reconnect, reportFall } from './devices.js'
import { transition, type CaseAction } from './cases.js'
import { handleUtterance, handoff, resumeRequest, startService } from './assistant.js'
import { sayAi, sayElder } from './helpers.js'
import type { Audience, DeviceKind, ServiceType, State } from './types.js'

export type Action =
  | { type: 'reset' }
  | { type: 'reminder/respond'; id: string; response: 'received' | 'snooze' | 'cant_do' }
  | { type: 'device/push'; deviceId: Exclude<DeviceKind, 'fall'>; mode: 'normal' | 'high' | 'suspicious' }
  | { type: 'device/disconnect'; deviceId: DeviceKind }
  | { type: 'device/reconnect'; deviceId: DeviceKind }
  | { type: 'device/fall' }
  | { type: 'chat/say'; text: string }
  | { type: 'chat/startService'; service: ServiceType }
  | { type: 'chat/handoff' }
  | { type: 'chat/clear' }
  | { type: 'chat/resume'; id: string }
  | { type: 'notif/readAll'; to: Audience }
  | CaseAction

export function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'reset':
      return seed(s.now)
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
      return handoff(sayElder(s, 'Gặp nhân viên'))
    case 'chat/clear':
      // starts over from the greeting; any half-collected request stays on the board in its current status (resumable via chat/resume)
      return sayAi({ ...s, chat: { messages: [], pending: null, misses: 0, recentMisses: [] } }, GREETING)
    case 'chat/resume':
      return resumeRequest(s, a.id)
    case 'notif/readAll':
      if (!s.notifications.some((n) => n.to === a.to && !n.read)) return s
      return { ...s, notifications: s.notifications.map((n) => (n.to === a.to ? { ...n, read: true } : n)) }
    default:
      return transition(s, a)
  }
}
