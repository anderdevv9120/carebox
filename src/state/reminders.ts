import { MIN, createEvent, familyName, fmtTime, notify, notifyAlert, staffName, updateCase, vnDay } from './helpers.js'
import type { Owner, Reminder, ReminderInput, ReminderStatus, Role, State } from './types.js'

export const NO_CONFIRM_AFTER = 30 // demo minutes after due
export const SNOOZE = 10
export class ReminderError extends Error {}

export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00+07:00`)) && vnDay(Date.parse(`${value}T12:00:00+07:00`)) === value

export function validateSchedule(data: ReminderInput): string | null {
  if (!['medicine', 'meal', 'clinic', 'activity'].includes(data.kind) || !['daily', 'once'].includes(data.repeat)) return 'Loại lịch không hợp lệ.'
  if (![data.title, data.note, data.times, data.startDate, data.endDate, data.medicine, data.dose, data.instructions, data.location].every((v) => typeof v === 'string' && v.length <= 500)) return 'Nội dung lịch không hợp lệ.'
  if (!data.title.trim()) return 'Vui lòng nhập tên lịch.'
  if (!validDate(data.startDate) || (data.endDate ? !validDate(data.endDate) || data.endDate < data.startDate : data.kind === 'medicine' || data.repeat === 'once')) return 'Ngày bắt đầu và kết thúc không hợp lệ.'
  const times = data.times.split(',')
  if (!times.length || times.length > 12 || times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || new Set(times).size !== times.length) return 'Vui lòng chọn giờ hợp lệ, không trùng nhau (tối đa 12 giờ).'
  if (data.repeat === 'once' && (data.endDate !== data.startDate || times.length !== 1)) return 'Lịch một lần cần một ngày và một giờ.'
  if (data.kind === 'medicine' && (data.repeat !== 'daily' || !data.medicine.trim() || !data.dose.trim() || !data.instructions.trim())) return 'Lịch thuốc cần tên thuốc, liều dùng, cách dùng và lặp hằng ngày.'
  if (data.kind === 'clinic' && !data.location.trim()) return 'Vui lòng nhập địa điểm khám.'
  return null
}

export function occursOn(r: Reminder, day: string): boolean {
  return (r.daily ? (!r.startDate || day >= r.startDate) && (!r.endDate || day <= r.endDate) : vnDay(r.dueAt) === day)
}

// Project another day without carrying today's response into tomorrow's dose.
export function reminderOnDay(r: Reminder, day: string): Reminder {
  if (vnDay(r.dueAt) === day) return r
  const { response: _response, respondedAt: _at, snoozedUntil: _snooze, escalated: _escalated, ...rest } = r
  return { ...rest, dueAt: Date.parse(`${day}T${fmtTime(r.dueAt)}:00+07:00`) }
}

export function remindersOnDay(s: State, day = vnDay(s.now), includeInactive = false): Reminder[] {
  return s.reminders.filter((r) => occursOn(r, day)).map((r) => reminderOnDay(r, day))
    .filter((r) => includeInactive || (r.approval !== 'pending' && !r.cancelledDates?.includes(day)))
    .sort((a, b) => a.dueAt - b.dueAt)
}

export function notifySchedule(s: State, by: Owner, text: string): State {
  let out = s
  for (const to of ['elder', 'family', 'staff'] as Role[]) if (to !== by) out = notify(out, to, text, 'other', by)
  return out
}

export function saveReminder(s: State, data: ReminderInput, id: string, by: Owner, requestId?: string): State {
  const error = validateSchedule(data)
  if (error) throw new ReminderError(error)
  const old = id ? s.reminders.find((r) => r.id === id) : undefined
  if (id && !old) throw new ReminderError('Lịch không còn tồn tại. Vui lòng tải lại.')
  const request = requestId ? s.cases.find((c) => c.id === requestId) : undefined
  if (requestId && (!request || request.kind !== 'request' || request.service !== 'add_reminder' ||
    (by === 'staff' ? request.status !== 'await_staff' : !['await_family', 'await_staff'].includes(request.status)))) throw new ReminderError('Yêu cầu không còn chờ tạo lịch. Vui lòng tải lại.')
  const times = data.times.split(',')
  if (id && times.length !== 1) throw new ReminderError('Chỉnh sửa từng giờ nhắc riêng biệt.')
  const day = s.day < data.startDate ? data.startDate : data.endDate && s.day > data.endDate ? data.endDate : s.day
  const approval = data.kind === 'medicine' && by === 'staff' ? 'pending' : 'confirmed'
  const entries = times.map((time, index): Reminder => ({
    id: old ? old.id : `schedule-${s.seq.n}-${index}`,
    title: data.title.trim(), kind: data.kind, note: data.note.trim(),
    dueAt: Date.parse(`${data.repeat === 'daily' ? day : data.startDate}T${time}:00+07:00`),
    daily: data.repeat === 'daily', startDate: data.startDate, endDate: data.endDate || undefined,
    medicine: data.kind === 'medicine' ? data.medicine.trim() : undefined,
    dose: data.kind === 'medicine' ? data.dose.trim() : undefined,
    instructions: data.kind === 'medicine' ? data.instructions.trim() : undefined,
    location: data.kind === 'clinic' ? data.location.trim() : undefined,
    createdBy: old?.createdBy ?? by, updatedBy: by, approval, activatedAt: s.now,
    revision: (old?.revision ?? 0) + 1,
    cancelledDates: old?.cancelledDates,
  }))
  if (old && old.dueAt === entries[0].dueAt && old.kind === entries[0].kind && (old.approval ?? 'confirmed') === approval &&
    old.medicine === entries[0].medicine && old.dose === entries[0].dose && old.instructions === entries[0].instructions) {
    Object.assign(entries[0], { response: old.response, respondedAt: old.respondedAt, snoozedUntil: old.snoozedUntil, escalated: old.escalated, activatedAt: old.activatedAt })
  }
  let out = { ...s, reminders: old ? s.reminders.map((r) => r.id === id ? entries[0] : r) : [...s.reminders, ...entries] }
  out = notifySchedule(out, by, `${id ? 'Đã cập nhật' : 'Đã thêm'} lịch: ${data.title.trim()} · ${times.join(', ')} · ${data.startDate}${data.endDate ? ` đến ${data.endDate}` : ' · chưa đặt ngày kết thúc'}.${approval === 'pending' ? ' Chờ gia đình xác nhận đơn thuốc.' : ''}`)
  if (request) out = updateCase(out, request.id, { status: 'done', completedAt: s.now, doneBy: by === 'staff' ? staffName(s) : familyName(s) }, { by, text: `Đã nhập lịch từ yêu cầu.${approval === 'pending' ? ' Chờ gia đình xác nhận đơn thuốc; lịch chưa có hiệu lực.' : ' Lịch đã có hiệu lực.'}` })
  return out
}

export function approveReminder(s: State, id: string, revision: number): State {
  const r = s.reminders.find((x) => x.id === id)
  if (!r || r.approval !== 'pending') return s
  if (revision !== (r.revision ?? 0)) throw new ReminderError('Đơn thuốc đã thay đổi. Vui lòng tải lại và kiểm tra trước khi xác nhận.')
  if (!r.medicine || !r.dose || !r.instructions) throw new ReminderError('Vui lòng sửa lịch để bổ sung tên thuốc, liều dùng và cách dùng trước khi xác nhận.')
  return notifySchedule(patch(s, id, { approval: 'confirmed', activatedAt: s.now }), 'family', `Gia đình đã xác nhận đơn thuốc: ${r.title} · ${fmtTime(r.dueAt)}.`)
}

export function cancelReminder(s: State, id: string, date: string, by: Owner): State {
  const r = s.reminders.find((x) => x.id === id)
  if (!validDate(date)) throw new ReminderError('Ngày hủy không hợp lệ.')
  if (!r || !occursOn(r, date) || r.cancelledDates?.includes(date)) return s
  return notifySchedule(patch(s, id, { cancelledDates: [...(r.cancelledDates ?? []), date], revision: (r.revision ?? 0) + 1 }), by, `Đã hủy một lần: ${r.title} · ${fmtTime(r.dueAt)} ngày ${date}. Các lần khác giữ nguyên.`)
}

export function reminderStatus(r: Reminder, now: number): ReminderStatus {
  if (r.approval === 'pending') return 'pending'
  if (!occursOn(r, vnDay(now)) || vnDay(r.dueAt) !== vnDay(now)) return 'inactive'
  if (r.cancelledDates?.includes(vnDay(now))) return 'cancelled'
  if (r.response === 'received') return 'received'
  if (r.response === 'cant_do') return 'cant_do'
  if (r.snoozedUntil && r.snoozedUntil > now) return 'snoozed'
  if (now < r.dueAt) return 'upcoming'
  if (now >= Math.max(r.dueAt, r.activatedAt ?? r.dueAt) + NO_CONFIRM_AFTER * MIN) return 'no_confirm'
  return 'due'
}

const patch = (s: State, id: string, p: Partial<Reminder>): State => ({
  ...s,
  reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...p } : r)),
})

export function respondReminder(s: State, id: string, dueAt: number, response: 'received' | 'snooze' | 'cant_do'): State {
  const r = s.reminders.find((x) => x.id === id)
  if (!r || r.dueAt !== dueAt || r.response || ['pending', 'cancelled', 'inactive'].includes(reminderStatus(r, s.now))) return s
  if (response === 'snooze') return patch(s, id, { snoozedUntil: s.now + SNOOZE * MIN })
  let out = patch(s, id, { response, respondedAt: s.now, snoozedUntil: undefined })
  if (response === 'cant_do') {
    let evId: string
    ;[out, evId] = createEvent(out, {
      title: `Không thực hiện được: ${r.title}`,
      detail: `Người cao tuổi báo không thực hiện được hoạt động theo lịch nhắc. Cần liên hệ hỏi bác.`,
      priority: r.kind === 'medicine' ? 'priority' : 'normal',
      priorityReason: r.kind === 'medicine' ? 'Liên quan lịch uống thuốc' : 'Hoạt động sinh hoạt',
      source: 'elder', reminderId: id,
    })
    out = notifyAlert(out, `Bác báo không thực hiện được: ${r.title}.`, 'other', 'elder', evId)
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
    out = notifyAlert(out, `Chưa có xác nhận sau lịch nhắc "${r.title}". Không kết luận bác đã thực hiện.`, 'other', 'ai', evId)
  }
  return out
}
