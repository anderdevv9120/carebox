import { describe, expect, test } from 'vitest'
import { seedBare } from './testing'
import { reduce } from './reducer'
import { classify, normalize } from './assistant'
import type { EventCase, RequestCase, State } from './types'

const s0 = () => seedBare(Date.UTC(2026, 9, 18, 5, 0)) // 12:00 Vietnam
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

describe('reminder content from the first sentence', () => {
  test('chip "Nhắc lịch uống nước" skips the content question', () => {
    const s = say(s0(), 'Nhắc lịch uống nước')
    expect(newRequest(s).fields).toEqual({ noi_dung: 'Uống nước' })
    expect(lastAi(s)).toBe('Bác muốn CAREBOX nhắc uống nước, đúng không ạ? Cháu nhắc bác vào lúc nào ạ?')
  })

  test('content and "lúc" time go straight to the read-back', () => {
    const s = say(s0(), 'Nhắc bác uống thuốc huyết áp lúc 9h')
    expect(newRequest(s)).toMatchObject({ status: 'await_confirm', fields: { noi_dung: 'Uống thuốc huyết áp', thoi_gian: '9h' } })
    expect(lastAi(s)).toBe('Cháu nhắc lại: Thêm lịch nhắc — Nội dung nhắc: Uống thuốc huyết áp; Thời gian nhắc: 9h. Bác xác nhận giúp cháu, đúng không ạ?')
  })

  test.each(['Nhắc bác với', 'Đặt lịch nhắc giúp bác'])('"%s" has no content → asks what to remind', (text) => {
    const s = say(s0(), text)
    expect(newRequest(s).fields).toEqual({})
    expect(lastAi(s)).toBe('Bác muốn CAREBOX hỗ trợ thêm lịch nhắc, đúng không ạ? Bác muốn cháu nhắc việc gì ạ?')
  })

  test('bare "Không" to the first question still refuses', () => {
    const s = say(s0(), 'Nhắc lịch uống nước', 'Không')
    expect(newRequest(s)).toMatchObject({ status: 'refused', fields: { noi_dung: 'Uống nước' } })
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

  test('chat/clear wipes the conversation to the greeting; the half-filled request stays', () => {
    const s = reduce(say(s0(), 'Bác muốn đi chợ', 'Rau, trứng'), { type: 'chat/clear' })
    expect(s.chat).toMatchObject({ pending: null, misses: 0, recentMisses: [] })
    expect(s.chat.messages).toEqual([expect.objectContaining({ from: 'ai', text: s0().chat.messages[0].text })])
    expect(newRequest(s)).toMatchObject({ status: 'need_info', fields: { danh_sach: 'Rau, trứng' } })
  })

  test('chat/resume picks a dropped request back up; no-op once final', () => {
    let s = reduce(s0(), { type: 'chat/resume', id: 'CB-001' }) // seed: thuoc filled, no pending question
    expect(s.chat.pending).toMatchObject({ caseId: 'CB-001', stage: 'collect', field: 'dia_diem' })
    expect(lastAi(s)).toBe('Bác muốn lấy thuốc ở đâu ạ?')
    s = say(s, 'Hiệu thuốc đầu ngõ', 'Chiều nay', 'Đúng rồi')
    expect(s.cases.find((c) => c.id === 'CB-001')!.status).toBe('await_staff')
    expect(reduce(s, { type: 'chat/resume', id: 'CB-001' })).toBe(s)
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
    expect(newRequest(s).status).toBe('await_staff')
    expect(lastAi(s)).toContain('nhân viên CAREBOX')
    expect(lastAi(s)).toContain('chưa hoàn tất')
    // nothing posts to the chat when Chị Minh acts, so the AI must not promise to report back
    expect(lastAi(s)).not.toContain('sẽ báo bác')
    expect(lastAi(s)).toContain('mục Yêu cầu')
    expect(s.notifications.filter((n) => n.to === 'staff').at(-1)!.text).toBe('Mua thuốc: chờ điều phối')
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
    expect(reply).toContain('11:00') // latest seeded reading, an hour before reset
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
    expect(s.chat.messages.at(-2)).toMatchObject({ from: 'elder', text: 'Tôi cần hỗ trợ sinh hoạt' })
  })

  test('handoff goes to staff and tells family', () => {
    const before = s0()
    const s = reduce(before, { type: 'chat/handoff' })
    expect(newEvents(s)[0]).toMatchObject({
      owner: 'staff', priority: 'uncertain', title: 'AI chưa hiểu yêu cầu', detail: 'Cần nhân viên CAREBOX gọi lại cho bác.',
      priorityReason: 'Người dùng chọn gặp nhân viên', unclear: ['Người cao tuổi chọn gặp nhân viên'],
    })
    expect(s.chat.messages.at(-2)).toMatchObject({ from: 'elder', text: 'Gặp nhân viên' })
    const added = s.notifications.slice(before.notifications.length)
    expect(added.map((n) => n.to)).toEqual(['staff', 'family'])
    expect(added[1].text).toBe('EVT-001: AI chưa hiểu yêu cầu của bác, đã chuyển nhân viên CAREBOX.')
    expect(lastAi(s)).toContain('nhân viên CAREBOX')
  })

  test('handoff copy names staff and Chị Minh', () => {
    const s = reduce(s0(), { type: 'chat/handoff' })
    expect(lastAi(s)).toBe('Cháu đã chuyển cho nhân viên CAREBOX và báo Chị Minh. Nhân viên sẽ liên hệ lại với bác ạ.')
    expect(lastAi(say(s0(), 'abc xyz'))).toContain('Hoặc bác bấm “Gặp nhân viên”.')
    const missed = say(s0(), 'abc xyz', 'qwe rty')
    expect(newEvents(missed)[0].priorityReason).toBe('AI không hiểu sau khi hỏi lại')
  })

  test('problem and medical decision go to staff and family', () => {
    for (const [text, reply] of [
      ['Bác hết thuốc rồi', 'Cháu đã ghi nhận và báo nhân viên CAREBOX, Chị Minh. Nếu bác khó thở hay đau ngực, bác nói ngay để cháu hướng dẫn gọi 115 nhé.'],
      ['Cho bác tăng liều thuốc huyết áp', 'Cháu không thể thay đổi thuốc hay liều. Bác hỏi bác sĩ hoặc dược sĩ nhé; cháu đã báo nhân viên CAREBOX.'],
    ]) {
      const before = s0()
      const s = say(before, text)
      expect(newEvents(s)[0].owner).toBe('staff')
      expect(s.notifications.slice(before.notifications.length).map((n) => n.to)).toEqual(['staff', 'family'])
      expect(lastAi(s)).toBe(reply)
    }
  })

  test('first-question "Không" refuses', () => {
    const s = say(reduce(s0(), { type: 'chat/startService', service: 'medicine' }), 'Không')
    expect(newRequest(s)).toMatchObject({ status: 'refused' })
    expect(newRequest(s).fields.thuoc).toBeUndefined()
  })

  test('later "Không" is a field answer', () => {
    const s = say(reduce(s0(), { type: 'chat/startService', service: 'clinic' }), 'Bệnh viện E', 'Sáng mai', 'Không, bác tự đi được')
    expect(newRequest(s).fields.di_lai).toBe('Không, bác tự đi được')
    expect(newRequest(s).status).toBe('await_confirm')
  })

  test('first-question "Không, bác tự đi được" is not a refusal', () => {
    const s = say(reduce(s0(), { type: 'chat/startService', service: 'clinic' }), 'Không, bác tự đi được')
    expect(newRequest(s).status).toBe('need_info')
    expect(newRequest(s).fields.noi_kham).toBe('Không, bác tự đi được')
  })

  test('doc Mức 3 examples are emergencies', () => {
    for (const t of ['mất ý thức', 'yếu nửa người', 'nói ngọng', 'khó thở']) expect(classify(t).intent).toBe('emergency')
  })

  test('dose paraphrases are medical decisions; generic ones are not', () => {
    for (const t of ['uống thêm 2 viên', 'ngừng thuốc huyết áp']) expect(classify(t).intent).toBe('medical_decision')
    for (const t of ['uống thêm nước', 'ngã tư Sở']) expect(['medical_decision', 'emergency']).not.toContain(classify(t).intent)
  })

  test('dừng thuốc is a medical decision; dùng/đúng thuốc are not', () => {
    expect(classify('dừng thuốc huyết áp').intent).toBe('medical_decision')
    for (const t of ['Bác dùng thuốc rồi', 'cách dùng thuốc', 'đúng thuốc rồi']) expect(classify(t).intent).not.toBe('medical_decision')
  })

  test('"nói khó" is an emergency only with accents and not as "nói khó nghe"', () => {
    for (const t of ['Con bé nói khó nghe quá', 'Chuyện này khó nói lắm', 'Để gạo ở nơi khô ráo']) expect(classify(t).intent).not.toBe('emergency')
    for (const t of ['bác nói khó quá', 'Nói khó']) expect(classify(t).intent).toBe('emergency')
  })

  test('"Mua giúp … thuốc" is medicine, not groceries', () => {
    for (const t of ['Mua giúp bác thuốc huyết áp', 'Mua giúp bác ít thuốc']) expect(classify(t)).toEqual({ intent: 'service', service: 'medicine' })
    expect(classify('Mua giúp bác ít gạo').service).toBe('groceries')
  })

  test('Mua giúp bác ít gạo starts groceries', () => {
    expect(classify('Mua giúp bác ít gạo')).toEqual({ intent: 'service', service: 'groceries' })
    expect(newRequest(say(s0(), 'Mua giúp bác ít gạo')).service).toBe('groceries')
  })
})
