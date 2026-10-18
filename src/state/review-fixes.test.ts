import { describe, expect, test } from 'vitest'
import { seed } from './seed'
import { reduce, type Action } from './reducer'
import { classify } from './assistant'
import { nextOwner } from './cases'
import type { EventCase, RequestCase, State } from './types'

const s0 = () => seed(new Date(2026, 9, 18, 12, 0))
const run = (s: State, ...as: Action[]) => as.reduce(reduce, s)
const say = (text: string): Action => ({ type: 'chat/say', text })
const newRequest = (s: State) => s.cases.slice(2).find((c): c is RequestCase => c.kind === 'request')!
const events = (s: State) => s.cases.filter((c): c is EventCase => c.kind === 'event')

describe('final review fixes', () => {
  test('pending chat cannot revive a request cancelled from the Requests screen', () => {
    let s = run(s0(), say('Bác muốn đi chợ'))
    s = reduce(s, { type: 'request/cancel', id: newRequest(s).id })
    s = run(s, say('Rau'), say('Sáng mai'), say('Đúng rồi'))
    expect(s.cases.find((c) => c.id === 'CB-003')!.status).toBe('refused')
  })


  test('emergency phrases beyond the base list are recognised', () => {
    for (const t of ['bác bị co giật', 'tôi không thở được', 'thở không nổi', 'tức ngực quá', 'hình như đau tim', 'cứu tôi với', 'bác bị té', 'chảy máu nhiều'])
      expect(classify(t).intent, t).toBe('emergency')
  })

  test('road junction names are not falls', () => {
    expect(classify('nhà ở ngã tư Cầu Giấy').intent).not.toBe('emergency')
    const s = run(s0(), { type: 'chat/startService', service: 'medicine' }, say('Thuốc huyết áp'), say('Hiệu thuốc ở ngã ba đầu ngõ'))
    expect(s.emergency).toBeNull()
    expect(newRequest(s).fields.dia_diem).toBe('Hiệu thuốc ở ngã ba đầu ngõ')
  })

  test('dose change typed mid-collection is refused, not stored as a field', () => {
    const s = run(s0(), { type: 'chat/startService', service: 'medicine' }, say('tôi muốn tăng liều thuốc huyết áp'))
    expect(newRequest(s).fields.thuoc).toBeUndefined()
    expect(newRequest(s).status).toBe('need_info')
    expect(events(s).some((e) => e.title === 'Yêu cầu vượt phạm vi AI: thay đổi thuốc')).toBe(true)
    expect(s.chat.pending).toBeNull()
  })


  test('automatic emergency is not shown as taken by a named person', () => {
    const s = reduce(s0(), { type: 'device/fall' })
    const ev = events(s)[0]
    expect(ev.status).toBe('to_verify')
    expect(ev.handler).toBeUndefined()
    expect(nextOwner(ev, s)).toBe('Chị Minh (xem và tiếp nhận)')
    const taken = reduce(s, { type: 'family/takeEvent', id: 'EVT-001' })
    expect(nextOwner(events(taken)[0], taken)).toBe('Chị Minh')
  })

  test('resolving the emergency clears the overlay', () => {
    const s = run(s0(), { type: 'device/fall' }, { type: 'family/takeEvent', id: 'EVT-001' }, { type: 'family/resolveEvent', id: 'EVT-001', note: 'Đội 115 đã tiếp nhận lúc 07:10' })
    expect(s.emergency).toBeNull()
  })

})
