import { DEVICE_STATUS, EVENT_STATUS, PRIORITY, REMINDER_STATUS, REQUEST_STATUS, SOURCE } from '../state/labels'
import { effectivePriority } from '../state/cases'
import { deviceStatus } from '../state/devices'
import { reminderStatus } from '../state/reminders'
import type { Case, Device, DeviceStatus, Priority, Reminder, ReminderStatus, Source } from '../state/types'

const STATUS_CLASS: Record<Case['status'], string> = {
  need_info: 'b-unsure', await_confirm: 'b-unsure', await_family: 'b-attn', await_staff: 'b-attn', to_verify: 'b-attn',
  in_progress: 'b-prog', handling: 'b-prog', done: 'b-ok', resolved: 'b-ok', refused: 'b-neutral',
}

export function StatusBadge({ c }: { c: Case }) {
  const label = c.kind === 'request' ? REQUEST_STATUS[c.status] : EVENT_STATUS[c.status]
  return <span className={`badge ${STATUS_CLASS[c.status]}`}>{label}</span>
}

const PRIORITY_CLASS: Record<Priority, string> = { normal: 'b-neutral', priority: 'b-attn', emergency: 'b-alert', uncertain: 'b-unsure' }

export function PriorityBadge({ c, now }: { c: Case; now: number }) {
  const p = effectivePriority(c, now)
  return <span className={`badge ${PRIORITY_CLASS[p.priority]}`} title={p.reason}>{p.priority === 'emergency' ? '🚨 ' : ''}{PRIORITY[p.priority]}</span>
}

export function SourceTag({ source }: { source: Source }) {
  return <span className="source">{SOURCE[source]}</span>
}

const REMINDER_CLASS: Record<ReminderStatus, string> = {
  upcoming: 'b-neutral', due: 'b-attn', snoozed: 'b-prog', received: 'b-ok', cant_do: 'b-alert', no_confirm: 'b-unsure',
}

export function ReminderBadge({ r, now }: { r: Reminder; now: number }) {
  const st = reminderStatus(r, now)
  return <span className={`badge ${REMINDER_CLASS[st]}`}>{REMINDER_STATUS[st]}</span>
}

const DEVICE_CLASS: Record<DeviceStatus, string> = { normal: 'b-ok', attention: 'b-attn', missing: 'b-unsure', suspicious: 'b-alert' }

export function DeviceBadge({ d, now }: { d: Device; now: number }) {
  // the fall sensor has no threshold, so "Bình thường theo ngưỡng" would be a false claim
  if (d.id === 'fall' && d.connected) return <span className="badge b-ok">Đang kết nối</span>
  const st = deviceStatus(d, now)
  return <span className={`badge ${DEVICE_CLASS[st]}`}>{st === 'missing' ? '⚠ ' : ''}{DEVICE_STATUS[st]}</span>
}
