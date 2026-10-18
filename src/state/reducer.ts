import { MIN } from './helpers'
import { seed } from './seed'
import type { Role, Screen, State } from './types'

export type Action =
  | { type: 'reset' }
  | { type: 'nav'; role?: Role; screen?: Screen; caseId?: string }
  | { type: 'clock/advance'; minutes: number }
  | { type: 'clock/nextReminder' }

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
      return { ...s, now: s.now + a.minutes * MIN }
    case 'clock/nextReminder': {
      const next = s.reminders
        .filter((r) => !r.response)
        .map((r) => (r.snoozedUntil && r.snoozedUntil > s.now ? r.snoozedUntil : r.dueAt))
        .filter((t) => t > s.now)
        .sort((x, y) => x - y)[0]
      return next ? { ...s, now: next } : s
    }
  }
}
