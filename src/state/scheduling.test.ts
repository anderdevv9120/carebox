import { describe, expect, test } from 'vitest'
import { seedBare } from './testing'
import { reduce } from './reducer'
import { rollover } from './clock'
import { atVN, MIN } from './helpers'
import { reminderStatus, remindersOnDay, sweepReminders, validateSchedule } from './reminders'
import type { ReminderInput } from './types'

const NOW = Date.UTC(2026, 9, 20, 0) // 07:00 Vietnam
const DAY = 24 * 60 * MIN
const input: ReminderInput = {
  kind: 'medicine', title: 'Thuốc huyết áp', note: '', times: '08:00,20:00',
  startDate: '2026-10-20', endDate: '2026-10-22', repeat: 'daily',
  medicine: 'Amlodipin 5mg', dose: '1 viên', instructions: 'Sau ăn', location: '',
}
const create = (by: 'family' | 'staff' = 'family', data = input) =>
  reduce(seedBare(NOW), { type: 'reminder/save', id: '', by, ...data })

describe('managed schedules', () => {
  test('family medication is confirmed immediately, with every dose and notifications to the other roles', () => {
    const s = create()
    const added = s.reminders.slice(-2)
    expect(added.map((r) => r.dueAt)).toEqual([atVN(NOW, '08:00'), atVN(NOW, '20:00')])
    expect(added[0]).toMatchObject({ daily: true, approval: 'confirmed', createdBy: 'family', medicine: input.medicine, dose: '1 viên', instructions: 'Sau ăn' })
    expect(s.notifications.slice(-2).map((n) => n.to).sort()).toEqual(['elder', 'staff'])
    expect(remindersOnDay(s, s.day).filter((r) => added.some((a) => a.id === r.id))).toHaveLength(2)
  })

  test('staff medication waits for family approval and cannot be responded to or escalated', () => {
    const s = create('staff')
    const r = s.reminders.at(-1)!
    expect(r.approval).toBe('pending')
    expect(reminderStatus(r, r.dueAt + 60 * MIN)).toBe('pending')
    expect(remindersOnDay(s, s.day).some((x) => x.id === r.id)).toBe(false)
    expect(reduce(s, { type: 'reminder/respond', id: r.id, dueAt: r.dueAt, response: 'received' })).toBe(s)
    expect(sweepReminders({ ...s, now: r.dueAt + 60 * MIN }).cases.filter((c) => c.kind === 'event' && c.reminderId === r.id)).toEqual([])
    const approved = reduce(s, { type: 'reminder/approve', id: r.id, revision: r.revision ?? 0 })
    expect(approved.reminders.at(-1)!.approval).toBe('confirmed')
    expect(approved.notifications.slice(-2).map((n) => n.to).sort()).toEqual(['elder', 'staff'])
  })

  test('staff changes to an approved prescription need confirmation again', () => {
    const s = create()
    const id = s.reminders.at(-1)!.id
    const edited = reduce(s, { type: 'reminder/save', id, by: 'staff', ...input, times: '21:00', dose: '2 viên' })
    expect(edited.reminders.at(-1)).toMatchObject({ approval: 'pending', dose: '2 viên', createdBy: 'family', updatedBy: 'staff' })
    expect(remindersOnDay(edited, s.day).some((r) => r.id === id)).toBe(false)
  })

  test('family cannot approve a prescription changed since it was displayed, even within the same clock tick', () => {
    const s = create('staff')
    const r = s.reminders.at(-1)!
    const approval = { type: 'reminder/approve' as const, id: r.id, revision: r.revision ?? 0 }
    const edited = reduce(s, { type: 'reminder/save', id: r.id, by: 'staff', ...input, times: '20:00', dose: '3 viên' })
    expect(() => reduce(edited, approval)).toThrow('Đơn thuốc đã thay đổi')
    expect(edited.reminders.at(-1)).toMatchObject({ approval: 'pending', dose: '3 viên' })
    const approved = reduce(edited, { ...approval, revision: edited.reminders.at(-1)!.revision ?? 0 })
    expect(approved.reminders.at(-1)).toMatchObject({ approval: 'confirmed', dose: '3 viên' })
  })

  test('old pending prescriptions can be approved at revision zero and do not change revision on daily rollover', () => {
    const s = create('staff')
    const r = s.reminders.at(-1)!
    const legacy = { ...s, reminders: s.reminders.map((x) => x.id === r.id ? { ...x, revision: undefined } : x) }
    const tomorrow = rollover({ ...legacy, now: NOW + DAY }, NOW + DAY)
    const approved = reduce(tomorrow, { type: 'reminder/approve', id: r.id, revision: 0 })
    expect(approved.reminders.at(-1)).toMatchObject({ approval: 'confirmed', dueAt: atVN(NOW + DAY, '20:00') })
  })

  test('renaming an unbounded daily meal preserves future occurrences and its selected time', () => {
    const s = seedBare(NOW)
    const edited = reduce(s, { type: 'reminder/save', id: 'r2', by: 'family', ...input,
      kind: 'meal', title: 'Ăn sáng cùng gia đình', times: '08:00', endDate: '', medicine: '', dose: '', instructions: '' })
    expect(edited.reminders.find((r) => r.id === 'r2')?.endDate).toBeUndefined()
    const tomorrow = rollover({ ...edited, now: NOW + DAY }, NOW + DAY)
    expect(remindersOnDay(tomorrow).find((r) => r.id === 'r2')).toMatchObject({ title: 'Ăn sáng cùng gia đình', dueAt: atVN(NOW + DAY, '08:00') })
  })

  test('canceling one occurrence preserves tomorrow and the other dose today', () => {
    const s = create()
    const r = s.reminders.at(-2)!
    const canceled = reduce(s, { type: 'reminder/cancel', id: r.id, date: s.day, by: 'staff' })
    expect(reminderStatus(canceled.reminders.find((x) => x.id === r.id)!, NOW)).toBe('cancelled')
    expect(remindersOnDay(canceled, s.day).some((x) => x.id === r.id)).toBe(false)
    expect(remindersOnDay(canceled, s.day).some((x) => x.id === s.reminders.at(-1)!.id)).toBe(true)
    const tomorrow = rollover(canceled, NOW + DAY)
    expect(remindersOnDay(tomorrow, tomorrow.day).find((x) => x.id === r.id)?.dueAt).toBe(atVN(NOW + DAY, '08:00'))
    expect(reduce(canceled, { type: 'reminder/cancel', id: r.id, date: s.day, by: 'staff' })).toBe(canceled)
  })

  test('date bounds are inclusive and future appointments survive midnight', () => {
    const s = create('family', { ...input, startDate: '2026-10-21', endDate: '2026-10-22' })
    const id = s.reminders.at(-1)!.id
    expect(remindersOnDay(s, '2026-10-20').some((r) => r.id === id)).toBe(false)
    expect(remindersOnDay(s, '2026-10-21').some((r) => r.id === id)).toBe(true)
    expect(remindersOnDay(s, '2026-10-22').some((r) => r.id === id)).toBe(true)
    expect(remindersOnDay(rollover(s, NOW + 3 * DAY), '2026-10-23').some((r) => r.id === id)).toBe(false)
    const clinic = create('staff', { ...input, kind: 'clinic', title: 'Tái khám', startDate: '2026-10-23', endDate: '2026-10-23', times: '09:30', repeat: 'once', location: 'Bệnh viện E' })
    const appointment = clinic.reminders.at(-1)!
    expect(appointment.approval).toBe('confirmed')
    expect(rollover(clinic, NOW + DAY).reminders.find((r) => r.id === appointment.id)).toMatchObject({ location: 'Bệnh viện E', dueAt: atVN(NOW + 3 * DAY, '09:30') })
  })

  test('rejects invalid dates, reversed periods, missing medication details, duplicate and invalid times', () => {
    expect(validateSchedule(input)).toBeNull()
    for (const patch of [
      { startDate: '2026-02-30' }, { endDate: '2026-10-19' }, { endDate: '' }, { times: '25:00' },
      { times: '08:00,08:00' }, { medicine: ' ' }, { dose: '' }, { instructions: '' }, { repeat: 'once' },
      { kind: 'clinic', location: '' },
    ]) expect(validateSchedule({ ...input, ...patch } as ReminderInput)).not.toBeNull()
  })

  test('approving an earlier dose starts its response window at approval, not before it existed', () => {
    const s = create('staff')
    const id = s.reminders.at(-2)!.id
    const now = atVN(NOW, '12:00')
    const approved = reduce({ ...s, now }, { type: 'reminder/approve', id, revision: s.reminders.at(-2)!.revision ?? 0 })
    const r = approved.reminders.find((x) => x.id === id)!
    expect(reminderStatus(r, now)).toBe('due')
    expect(reminderStatus(r, now + 30 * MIN)).toBe('no_confirm')
  })

  test('editing a note preserves a received dose, while changing its time resets the response', () => {
    let s = create()
    const id = s.reminders.at(-2)!.id
    s = reduce({ ...s, now: atVN(NOW, '08:00') }, { type: 'reminder/respond', id, dueAt: s.reminders.at(-2)!.dueAt, response: 'received' })
    const edited = reduce(s, { type: 'reminder/save', id, by: 'family', ...input, times: '08:00', note: 'Ghi chú mới' })
    expect(edited.reminders.find((r) => r.id === id)?.response).toBe('received')
    const rescheduled = reduce(edited, { type: 'reminder/save', id, by: 'family', ...input, times: '09:00' })
    expect(rescheduled.reminders.find((r) => r.id === id)?.response).toBeUndefined()
  })

  test('a delayed response after midnight cannot acknowledge the next daily dose', () => {
    const s = create('family', { ...input, times: '23:59' })
    const r = s.reminders.at(-1)!
    const tomorrow = rollover({ ...s, now: NOW + DAY }, NOW + DAY)
    const out = reduce(tomorrow, { type: 'reminder/respond', id: r.id, dueAt: r.dueAt, response: 'received' })
    expect(out.reminders.find((x) => x.id === r.id)?.response).toBeUndefined()
    expect(reminderStatus(out.reminders.find((x) => x.id === r.id)!, tomorrow.now)).toBe('upcoming')
  })

  test('a legacy reminder request is completed through the structured staff form, with medication still pending family confirmation', () => {
    const s = seedBare(NOW)
    const template = s.cases.find((c) => c.kind === 'request')!
    const request = { ...template, id: 'CB-TEST', kind: 'request' as const, service: 'add_reminder' as const, status: 'await_staff' as const, fields: { noi_dung: 'Amlodipin 5mg' } }
    const before = { ...s, cases: [...s.cases, request] }
    const out = reduce(before, { type: 'reminder/save', id: '', requestId: request.id, by: 'staff', ...input })
    expect(out.cases.find((c) => c.id === request.id)).toMatchObject({ status: 'done', doneBy: 'Anh Nam' })
    expect(out.reminders.slice(-2).map((r) => r.approval)).toEqual(['pending', 'pending'])
    expect(out.notifications.slice(-2).map((n) => n.to).sort()).toEqual(['elder', 'family'])
    expect(() => reduce(out, { type: 'reminder/save', id: '', requestId: request.id, by: 'staff', ...input })).toThrow('Yêu cầu không còn chờ tạo lịch')
  })
})
