import { sweepFamilyFallback } from './cases.js'
import { sweepDevices } from './devices.js'
import { vnDay } from './helpers.js'
import { reminderOnDay, sweepReminders } from './reminders.js'
import type { State } from './types.js'

// Preserve dated appointments and managed schedules; only expired legacy one-offs are dropped.
export function rollover(s: State, now: number): State {
  const day = vnDay(now)
  if (day === s.day) return s
  const reminders = s.reminders
    .filter((r) => r.daily || r.startDate || vnDay(r.dueAt) >= day)
    .map((r) => r.daily ? reminderOnDay(r, day < (r.startDate ?? day) ? r.startDate! : day) : r)
  return { ...s, day, reminders }
}

export function tick(s: State, now: number): { state: State; changed: boolean } {
  const state = sweepDevices(sweepFamilyFallback(sweepReminders(rollover({ ...s, now }, now))))
  return { state, changed: state.day !== s.day || state.reminders !== s.reminders || state.cases !== s.cases || state.notifications !== s.notifications }
}
