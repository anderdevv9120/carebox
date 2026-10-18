import type { Case, NotifCategory, Source, State } from './types'

export const MIN = 60_000
const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

export function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}`
}

export function nextCaseId(s: State, kind: 'request' | 'event'): [State, string] {
  if (kind === 'request') return [{ ...s, seq: { ...s.seq, cb: s.seq.cb + 1 } }, `CB-${pad3(s.seq.cb)}`]
  return [{ ...s, seq: { ...s.seq, evt: s.seq.evt + 1 } }, `EVT-${pad3(s.seq.evt)}`]
}
const pad3 = (n: number) => String(n).padStart(3, '0')

function nextN(s: State): [State, string] {
  return [{ ...s, seq: { ...s.seq, n: s.seq.n + 1 } }, `n${s.seq.n}`]
}

export function addCase(s: State, c: Case): State {
  return { ...s, cases: [...s.cases, c] }
}

export function updateCase(s: State, id: string, patch: Partial<Case>, log?: { by: Source; text: string }): State {
  return {
    ...s,
    cases: s.cases.map((c) =>
      c.id !== id ? c : ({ ...c, ...patch, history: log ? [...c.history, { at: s.now, ...log }] : c.history } as Case),
    ),
  }
}

export function notify(s: State, audience: ('family' | 'ops')[], text: string, category: NotifCategory, source: Source, caseId?: string): State {
  let out = s
  for (const a of audience) {
    let id: string
    ;[out, id] = nextN(out)
    out = { ...out, notifications: [...out.notifications, { id, at: s.now, audience: a, text, category, source, caseId, read: false }] }
  }
  return out
}

export function sayAi(s: State, text: string): State {
  const [out, id] = nextN(s)
  return { ...out, chat: { ...out.chat, messages: [...out.chat.messages, { id, from: 'ai', text, at: s.now }] } }
}

export function sayElder(s: State, text: string): State {
  const [out, id] = nextN(s)
  return { ...out, chat: { ...out.chat, messages: [...out.chat.messages, { id, from: 'elder', text, at: s.now }] } }
}
