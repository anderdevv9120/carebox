export type Role = 'elder' | 'family'
export type Screen =
  | 'home' | 'schedule' | 'health' | 'services' | 'requests' | 'chat'
  | 'f-dashboard' | 'f-requests' | 'f-notifications' | 'f-profile' | 'f-report'
export type Priority = 'normal' | 'priority' | 'emergency' | 'uncertain'
export type Source = 'device' | 'elder' | 'family' | 'ai'
export type ServiceType = 'medicine' | 'groceries' | 'clinic' | 'daily_help' | 'contact_family' | 'add_reminder'
export type RequestStatus = 'need_info' | 'await_confirm' | 'await_family' | 'in_progress' | 'done' | 'refused'
export type EventStatus = 'to_verify' | 'handling' | 'resolved'
export type DeviceStatus = 'normal' | 'attention' | 'missing' | 'suspicious'
export type ReminderStatus = 'upcoming' | 'due' | 'snoozed' | 'received' | 'cant_do' | 'no_confirm'

export interface LogEntry { at: number; by: Source; text: string }

interface CaseBase {
  id: string
  title: string
  detail: string
  source: Source
  priority: Priority
  priorityReason: string
  createdAt: number
  history: LogEntry[]
  unclear: string[]
}

export interface RequestCase extends CaseBase {
  kind: 'request'
  service: ServiceType
  fields: Record<string, string>
  status: RequestStatus
  acceptedAt?: number
  completedAt?: number
  doneNote?: string
  doneBy?: string
  closedReason?: string
}

export interface EventCase extends CaseBase {
  kind: 'event'
  status: EventStatus
  handler?: string
  closingNote?: string
  deviceId?: string
  reminderId?: string
}

export type Case = RequestCase | EventCase

export type ReminderKind = 'medicine' | 'meal' | 'clinic' | 'activity'
export interface Reminder {
  id: string
  dueAt: number
  title: string
  note: string
  kind: ReminderKind
  response?: 'received' | 'cant_do'
  respondedAt?: number
  snoozedUntil?: number
  escalated?: boolean
  daily?: boolean
}

export type DeviceKind = 'bp' | 'hr' | 'glucose' | 'spo2' | 'fall'
export interface Reading { at: number; value: number | [number, number] | 'fall' }
export interface Device { id: DeviceKind; name: string; unit: string; connected: boolean; readings: Reading[] }

export type NotifCategory = 'request' | 'health' | 'other'
export interface Notification {
  id: string
  at: number
  text: string
  category: NotifCategory
  source: Source
  caseId?: string
  read: boolean
}

export interface ChatMessage { id: string; from: 'elder' | 'ai'; text: string; at: number }
export interface ChatState {
  messages: ChatMessage[]
  pending: null | { caseId: string; stage: 'collect' | 'readback'; field?: string }
  misses: number
  recentMisses: string[]
}

export interface State {
  version: 2
  rev: number // bumped on every save; clients keep the higher one
  now: number
  day: string // Vietnam date (YYYY-MM-DD) the reminder schedule belongs to
  elder: { name: string; age: number; birthDate: string; phone: string; address: string }
  family: { name: string; relation: string; phone: string }[]
  reminders: Reminder[]
  devices: Device[]
  cases: Case[]
  notifications: Notification[]
  chat: ChatState
  emergency: null | { caseId: string; calling: boolean }
  seq: { cb: number; evt: number; n: number }
}
