import { GREETING, seed } from './seed.js'
import { approveReminder, cancelReminder, respondReminder, saveReminder } from './reminders.js'
import { disconnect, manualReading, pushReading, reconnect, reportFall } from './devices.js'
import { transition, type CaseAction } from './cases.js'
import { handleUtterance, handoff, resumeRequest, startService } from './assistant.js'
import { sayAi, sayElder } from './helpers.js'
import type { Audience, DeviceKind, Owner, Reading, ReminderInput, ServiceType, State } from './types.js'

export type Action =
  | { type: 'reset' }
  | { type: 'reminder/respond'; id: string; dueAt: number; response: 'received' | 'snooze' | 'cant_do' }
  | ({ type: 'reminder/save'; id: string; by: Owner; requestId?: string } & ReminderInput)
  | { type: 'reminder/approve'; id: string; revision: number }
  | { type: 'reminder/cancel'; id: string; date: string; by: Owner }
  | { type: 'device/manual'; deviceId: Exclude<DeviceKind, 'fall'>; value: Exclude<Reading['value'], 'fall'> }
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
      return respondReminder(s, a.id, a.dueAt, a.response)
    case 'reminder/save':
      return saveReminder(s, a, a.id, a.by, a.requestId)
    case 'reminder/approve':
      return approveReminder(s, a.id, a.revision)
    case 'reminder/cancel':
      return cancelReminder(s, a.id, a.date, a.by)
    case 'device/manual':
      return manualReading(s, a.deviceId, a.value)
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
