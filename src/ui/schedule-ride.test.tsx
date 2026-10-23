import { beforeEach, expect, test, vi } from 'vitest'
import { Children, cloneElement, isValidElement, type FormEvent, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScheduleManager } from './ScheduleManager'
import { Ride } from '../elder/Ride'
import { seedBare } from '../state/testing'
import type { useStore } from '../state/store'
import type { Reminder } from '../state/types'

// Node-only interaction harness: preserve hook state across renders and invoke real UI handlers.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState<T>(initial: T | (() => T)) {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [hooks.values[index], (next: T | ((previous: T) => T)) => {
      hooks.values[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.values[index] as T) : next
    }]
  },
}))
const context = vi.hoisted(() => ({ store: undefined as unknown as ReturnType<typeof useStore> }))
vi.mock('../state/store', () => ({ useStore: () => context.store }))

type Props = {
  children?: ReactNode; value?: string; type?: string; required?: boolean
  onClick?: () => unknown; onChange?: (event: { target: { value: string } }) => unknown
  onSubmit?: (event: FormEvent) => unknown
}
type Element = ReactElement<Props>
let elements: Element[]
let html: string
function render(Component: () => ReactNode) {
  hooks.cursor = 0
  elements = []
  function visit(node: ReactNode): ReactNode {
    return Children.map(node, (child) => {
      if (!isValidElement<Props>(child)) return child
      if (typeof child.type === 'function') return visit((child.type as (props: Props) => ReactNode)(child.props))
      const element = cloneElement(child, {}, visit(child.props.children))
      elements.push(element)
      return element
    })
  }
  html = renderToStaticMarkup(visit(Component()))
}
const button = (text: string) => elements.find((el) => el.type === 'button' && renderToStaticMarkup(el).includes(text))!
const dateInputs = () => elements.filter((el) => el.type === 'input' && el.props.type === 'date')
const submit = () => elements.find((el) => el.type === 'form')!.props.onSubmit!({ preventDefault() {} } as FormEvent)

beforeEach(() => {
  hooks.values = []
  context.store = {
    state: seedBare(Date.parse('2026-10-20T08:00:00+07:00')),
    view: { screen: 'f-schedule' }, session: { role: 'family', token: 'test', user: 'family', name: 'Gia đình' },
    dispatch: vi.fn().mockResolvedValue(true), logout: vi.fn(), chatBusy: false,
  }
})

function edit(reminder: Reminder) {
  context.store.state.reminders = [reminder]
  render(ScheduleManager)
  button('Sửa lịch').props.onClick!()
  render(ScheduleManager)
}

test.each(['meal', 'activity'] as const)('editing an unbounded daily %s preserves blank end date when moving start and saving', async (kind) => {
  edit({ id: 'legacy', kind, title: 'Lịch cũ', note: '', daily: true, dueAt: context.store.state.now })
  expect(dateInputs()[1].props.value).toBe('')
  expect(dateInputs()[1].props.required).toBe(false)
  dateInputs()[0].props.onChange!({ target: { value: '2026-10-21' } })
  render(ScheduleManager)
  expect(dateInputs()[1].props.value).toBe('')
  await submit()
  expect(context.store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'reminder/save', id: 'legacy', startDate: '2026-10-21', endDate: '' }))
})

test('new medicine defaults and required end date stay intact', () => {
  render(ScheduleManager)
  button('Thêm lịch trình').props.onClick!()
  render(ScheduleManager)
  expect(dateInputs()[1].props.value).toBe(context.store.state.day)
  expect(dateInputs()[1].props.required).toBe(true)
})

test('existing unbounded daily medicine requires an explicit end date before saving', async () => {
  edit({ ...context.store.state.reminders[0], endDate: undefined })
  expect(dateInputs()[1].props.value).toBe('')
  expect(dateInputs()[1].props.required).toBe(true)
  await submit()
  expect(context.store.dispatch).not.toHaveBeenCalled()
  render(ScheduleManager)
  expect(html).toContain('Ngày bắt đầu và kết thúc không hợp lệ.')
  dateInputs()[1].props.onChange!({ target: { value: '2026-10-30' } })
  render(ScheduleManager)
  await submit()
  expect(context.store.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'reminder/save', id: 'r1', endDate: '2026-10-30' }))
})

test.each([undefined, 7])('approval submits the displayed prescription revision %s', async (revision) => {
  context.store.state.reminders = [{ ...context.store.state.reminders[0], approval: 'pending', ...(revision === undefined ? {} : { revision }) }]
  render(ScheduleManager)
  await button('Xác nhận đơn thuốc').props.onClick!()
  expect(context.store.dispatch).toHaveBeenCalledWith({ type: 'reminder/approve', id: 'r1', revision: revision ?? 0 })
})

function openRide(daily = false) {
  const s = context.store.state
  s.reminders = [{ id: 'clinic', kind: 'clinic', title: 'Khám', note: '', location: 'Bệnh viện', dueAt: Date.parse(`${s.day}T09:00:00+07:00`), daily }]
  context.store.view = { screen: 'ride', reminderId: 'clinic' }
  render(Ride)
}

test('active clinic occurrence can book a simulated ride', () => {
  openRide()
  submit()
  render(Ride)
  expect(html).toContain('Đã đặt xe giả lập')
})

test.each(['cancel', 'expire', 'midnight', 'pending'] as const)('polled %s makes the selected ride unavailable with no booking form', (change) => {
  openRide(change === 'midnight')
  const s = context.store.state
  const r = { ...s.reminders[0] }
  if (change === 'cancel') r.cancelledDates = [context.store.state.day]
  if (change === 'expire') { r.daily = true; r.endDate = '2026-10-19' }
  if (change === 'pending') r.approval = 'pending'
  context.store.state = { ...s, reminders: [r], ...(change === 'midnight' ? { now: Date.parse('2026-10-21T00:01:00+07:00'), day: '2026-10-21' } : {}) }
  render(Ride)
  expect(html).toContain('Lịch khám không còn khả dụng')
  expect(elements.some((el) => el.type === 'form')).toBe(false)
  expect(html).not.toContain('Đã đặt xe giả lập')
})
