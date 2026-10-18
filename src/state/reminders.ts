import { MIN, createEvent, familyName, notify } from './helpers.js'
import type { Reminder, ReminderStatus, State } from './types.js'

export const NO_CONFIRM_AFTER = 30 // demo minutes after due
export const SNOOZE = 10

export function reminderStatus(r: Reminder, now: number): ReminderStatus {
  if (r.response === 'received') return 'received'
  if (r.response === 'cant_do') return 'cant_do'
  if (r.snoozedUntil && r.snoozedUntil > now) return 'snoozed'
  if (now < r.dueAt) return 'upcoming'
  if (now >= r.dueAt + NO_CONFIRM_AFTER * MIN) return 'no_confirm'
  return 'due'
}

const patch = (s: State, id: string, p: Partial<Reminder>): State => ({
  ...s,
  reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...p } : r)),
})

export function respondReminder(s: State, id: string, response: 'received' | 'snooze' | 'cant_do'): State {
  const r = s.reminders.find((x) => x.id === id)
  if (!r || r.response) return s
  if (response === 'snooze') return patch(s, id, { snoozedUntil: s.now + SNOOZE * MIN })
  let out = patch(s, id, { response, respondedAt: s.now, snoozedUntil: undefined })
  if (response === 'cant_do') {
    let evId: string
    ;[out, evId] = createEvent(out, {
      title: `Không thực hiện được: ${r.title}`,
      detail: `Người cao tuổi báo không thực hiện được hoạt động theo lịch nhắc. Cần ${familyName(s)} liên hệ hỏi bác.`,
      priority: r.kind === 'medicine' ? 'priority' : 'normal',
      priorityReason: r.kind === 'medicine' ? 'Liên quan lịch uống thuốc' : 'Hoạt động sinh hoạt',
      source: 'elder', reminderId: id,
    })
    out = notify(out, `Bác báo không thực hiện được: ${r.title}. Cần ${familyName(s)} liên hệ hỏi bác.`, 'other', 'elder', evId)
  }
  return out
}

export function sweepReminders(s: State): State {
  let out = s
  for (const r of s.reminders) {
    if (r.escalated || reminderStatus(r, s.now) !== 'no_confirm') continue
    let evId: string
    ;[out, evId] = createEvent(out, {
      title: `Chưa có xác nhận: ${r.title}`,
      detail: 'Không có phản hồi sau nhắc. Không kết luận người cao tuổi đã thực hiện.',
      priority: 'uncertain', priorityReason: 'Người dùng không xác nhận', source: 'ai', reminderId: r.id,
    })
    out = patch(out, r.id, { escalated: true })
    out = notify(out, `Chưa có xác nhận sau lịch nhắc "${r.title}". Không kết luận bác đã thực hiện.`, 'other', 'ai', evId)
  }
  return out
}
