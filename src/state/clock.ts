import { atVN, fmtTime, vnDay } from './helpers.js'
import { sweepReminders } from './reminders.js'
import type { State } from './types.js'

// First read or action of a new Vietnam day: daily reminders move to today, fresh; one-offs are dropped.
export function rollover(s: State, now: number): State {
  const day = vnDay(now)
  if (day === s.day) return s
  const reminders = s.reminders
    .filter((r) => r.daily)
    .map(({ response: _r, respondedAt: _a, snoozedUntil: _s, escalated: _e, ...r }) => ({ ...r, dueAt: atVN(now, fmtTime(r.dueAt)) }))
  return { ...s, day, reminders }
}

export function tick(s: State, now: number): { state: State; changed: boolean } {
  const state = sweepReminders(rollover({ ...s, now }, now))
  return { state, changed: state.day !== s.day || state.reminders !== s.reminders || state.cases !== s.cases }
}
