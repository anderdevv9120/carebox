import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce } from './reducer'
import { classify, normalize } from './assistant'
import type { EventCase, RequestCase, State } from './types'

const s0 = () => seed(new Date(2026, 9, 18, 12, 0))
const say = (s: State, ...texts: string[]) => texts.reduce((acc, text) => reduce(acc, { type: 'chat/say', text }), s)
const lastAi = (s: State) => s.chat.messages.filter((m) => m.from === 'ai').at(-1)!.text
const newCases = (s: State) => s.cases.slice(2)
const newRequest = (s: State) => newCases(s).find((c): c is RequestCase => c.kind === 'request')!
const newEvents = (s: State) => newCases(s).filter((c): c is EventCase => c.kind === 'event')

describe('classify', () => {
  test('normalize strips diacritics and đ', () => {
    expect(normalize('Đau  NGỰC')).toBe('dau nguc')
  })

  test('classify precedence', () => {
    expect(classify('Bác hết thuốc, mua thuốc giúp bác').intent).toBe('problem')
    expect(classify('nhắc bác uống thuốc lúc 9 giờ')).toEqual({ intent: 'reminder', service: 'add_reminder' })
    expect(classify('tăng liều thuốc huyết áp').intent).toBe('medical_decision')
    expect(classify('lịch hôm nay').intent).toBe('info')
    expect(classify('ngày mai đi chợ')).toEqual({ intent: 'service', service: 'groceries' })
    expect(classify('gọi cho con gái giúp bác')).toEqual({ intent: 'contact', service: 'contact_family' })
    expect(classify('abc xyz').intent).toBe('unknown')
  })
})

describe('handleUtterance', () => {
  test('ignores blank input', () => {
    const s = s0()
    expect(reduce(s, { type: 'chat/say', text: '   ' })).toBe(s)
  })

  test('emergency without diacritics', () => {
    const out = say(s0(), 'DAU NGUC QUA')
    expect(out.emergency).not.toBeNull()
    expect(newEvents(out)[0].priority).toBe('emergency')
  })

  test('emergency interrupts collection', () => {
    const out = say(s0(), 'Ngày mai tôi cần lấy thuốc ở hiệu thuốc', 'Thuốc huyết áp', 'tôi khó thở')
    expect(out.emergency).not.toBeNull()
    expect(newRequest(out).status).toBe('need_info')
    expect(out.chat.pending).toBeNull()
  })

  test('medicine flow', () => {
    let s = say(s0(), 'Ngày mai tôi cần lấy thuốc ở hiệu thuốc')
    const r = newRequest(s)
    expect(r).toMatchObject({ service: 'medicine', status: 'need_info', source: 'elder' })
    expect(s.chat.pending).toMatchObject({ caseId: r.id, stage: 'collect', field: 'thuoc' })
    s = say(s, 'Thuốc huyết áp', 'Hiệu thuốc Long Châu đầu ngõ', 'Sáng mai khoảng 9 giờ')
    expect(newRequest(s).status).toBe('await_confirm')
    expect(newRequest(s).fields).toEqual({ thuoc: 'Thuốc huyết áp', dia_diem: 'Hiệu thuốc Long Châu đầu ngõ', thoi_gian: 'Sáng mai khoảng 9 giờ' })
    expect(lastAi(s)).toContain('đúng không ạ?')
    s = say(s, 'Đúng rồi')
    expect(newRequest(s).status).toBe('await_dispatch')
    expect(s.chat.pending).toBeNull()
    expect(s.cases.filter((c) => c.status === 'done').map((c) => c.id)).toEqual(['CB-002'])
  })

  test('answering a time field with "thời gian" text does not count as refusal', () => {
    const s = say(s0(), 'Bác muốn đi chợ', 'Rau và trứng', 'Thời gian buổi sáng')
    expect(newRequest(s).status).toBe('await_confirm')
  })

  test('khong biet records unclear and continues', () => {
    const s = say(s0(), 'Bác muốn đi chợ', 'không biết')
    const r = newRequest(s)
    expect(r.unclear).toEqual(['Danh sách cần mua'])
    expect(r.fields.danh_sach).toBeUndefined()
    expect(s.chat.pending?.field).toBe('thoi_gian')
  })

  test("readback 'không đúng' refuses", () => {
    const s = say(s0(), 'Bác muốn đi chợ', 'Rau', 'Sáng mai', 'Không đúng')
    expect(newRequest(s).status).toBe('refused')
  })

  test('refusal during collection refuses without pressure', () => {
    const s = say(s0(), 'Bác muốn đi chợ', 'Thôi, bác không cần nữa')
    expect(newRequest(s)).toMatchObject({ status: 'refused', closedReason: 'Người cao tuổi từ chối' })
    expect(s.chat.pending).toBeNull()
  })

  test('two misses hand off to an uncertain event with both utterances in unclear', () => {
    const once = say(s0(), 'abc xyz')
    expect(newEvents(once)).toHaveLength(0)
    const s = say(once, 'qwe rty')
    const ev = newEvents(s)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ priority: 'uncertain', status: 'to_verify', unclear: ['abc xyz', 'qwe rty'] })
    expect(s.chat.misses).toBe(0)
  })

  test('understood input resets misses', () => {
    const s = say(s0(), 'abc xyz', 'lịch hôm nay', 'qwe rty')
    expect(newEvents(s)).toHaveLength(0)
    expect(s.chat.misses).toBe(1)
  })

  test('medical_decision refuses, logs a normal event, and leaves reminders deep-equal', () => {
    const before = s0()
    const s = say(before, 'Cho bác tăng liều thuốc huyết áp')
    expect(lastAi(s)).toContain('bác sĩ')
    expect(newEvents(s)[0]).toMatchObject({ priority: 'normal', title: 'Yêu cầu vượt phạm vi AI: thay đổi thuốc' })
    expect(s.reminders).toEqual(before.reminders)
  })

  test('problem creates a priority event and no request', () => {
    const s = say(s0(), 'Bác hết thuốc rồi')
    expect(newEvents(s)[0]).toMatchObject({ priority: 'priority', source: 'elder' })
    expect(newCases(s).some((c) => c.kind === 'request')).toBe(false)
  })

  test('health info reply contains the source and time and no evaluation words', () => {
    const s = say(s0(), 'Huyết áp của bác bao nhiêu?')
    const reply = lastAi(s).toLowerCase()
    expect(reply).toContain('nguồn: thiết bị giả lập')
    expect(reply).toContain('06:45')
    expect(reply).not.toContain('bình thường')
    expect(reply).not.toContain('tốt')
  })

  test('schedule info lists reminders with status labels', () => {
    expect(lastAi(say(s0(), 'lịch hôm nay'))).toContain('Uống thuốc huyết áp')
  })

  test('clinic today is priority', () => {
    const s = say(s0(), 'Bác cần đi khám bệnh', 'Bệnh viện E', 'Chiều hôm nay')
    expect(newRequest(s)).toMatchObject({ priority: 'priority', priorityReason: 'Cần hỗ trợ đi khám trong ngày' })
  })

  test('startService begins collection for that service', () => {
    const s = reduce(s0(), { type: 'chat/startService', service: 'daily_help' })
    expect(newRequest(s).service).toBe('daily_help')
    expect(s.chat.pending).toMatchObject({ stage: 'collect', field: 'noi_dung' })
  })

  test('handoff creates an uncertain event even with no misses', () => {
    const s = reduce(s0(), { type: 'chat/handoff' })
    expect(newEvents(s)[0]).toMatchObject({ priority: 'uncertain', unclear: ['Người cao tuổi chọn gặp nhân viên'] })
  })
})
