# CAREBOX Demo SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clickable, backend-free CAREBOX demo where elderly, family and staff roles share one localStorage-backed state, and every doc.pdf rule (statuses, priorities, emergency bypass, honest data) can be played through.

**Architecture:** Pure state module (`src/state/*`): typed `State`, a single `reduce(state, action)` and pure helpers. It is fully unit-tested with Vitest in the node environment. React UI (`src/elder`, `src/family`, `src/ops`, `src/ui`) reads state through one context (`useStore`) and only dispatches actions. Navigation is part of state (`state.view`), so there is no router and Vercel needs no rewrites. The demo clock is `state.now` and moves only by action.

**Tech Stack:** React 19.2, TypeScript 6, Vite 8, Vitest 4. No other runtime dependencies: plain CSS, emoji icons, inline-SVG chart, native `<input type="time">`.

**Spec:** `docs/superpowers/specs/2026-10-18-carebox-demo-design.md` (sources: `doc.pdf`, `design.jpg` in repo root).

## Global Constraints

- No backend, no network calls, no real AI. All state lives in `localStorage` key `carebox-demo-v1`.
- No runtime deps beyond `react` and `react-dom`. Dev deps: what `create-vite` react-ts gives, plus `vitest`.
- `npm run build` must produce static `dist/` deployable to Vercel with zero config. There is no client router; navigation lives in `state.view`.
- All UI copy is Vietnamese. AI tone is "Bác … cháu …", short sentences.
- Every phone screen and the ops panel shows a "Dữ liệu minh họa" chip, and the app header says "Bản demo — không phải ứng dụng thật".
- Banned copy anywhere in `src/` (non-test): `khỏe mạnh`, `Ổn định`, `Đã hoàn thành`, `Không có dấu hiệu bất thường`. Use the labels in `src/state/labels.ts`.
- The AI never sets `done`/`resolved`; only `ops/*` actions do. An emergency never waits on any confirmation.
- Missing or stale device data is shown as `Thiếu dữ liệu` with the last reading time, never as normal.
- Thresholds are labeled "ngưỡng giả lập". The 30-minute abandoned-request window is labeled "giả định thử nghiệm".
- Palette from design.jpg: cream background `#FFF8EC`, primary `#F5A623`, deep orange `#E8891C`, text `#3A2A12`, ok-green `#3BA55D`, alert-red `#E5484D`, attention-amber `#F2B33D`. Font: Be Vietnam Pro (Google Fonts). Elder screens use base font ≥ 18px and tap targets ≥ 48px. Phone frame width is 390px.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Corrupt, old-version or missing localStorage.** The app boots from fresh seed and doesn't crash. Test: Task 2 `loadState`.
2. **Chat input that is empty or whitespace.** It is ignored: no message is added and the miss count is unchanged. Test: Task 5 `ignores blank input`.
3. **Emergency text typed without diacritics or in caps** (`DAU NGUC`, `kho tho`). It still triggers an emergency. Test: Task 5 `emergency without diacritics`.
4. **Double-clicked staff buttons** (confirm twice, assign twice). The second click is a no-op: no duplicate history or notifications. Test: Task 4 `illegal transition is a no-op`.
5. **Emergency typed mid-way through collecting a service request.** The emergency fires immediately, and the half-filled request stays `need_info` on the staff board. Test: Task 5 `emergency interrupts collection`.

---

## File Structure

```
index.html                     # Be Vietnam Pro font link, title "CAREBOX Demo"
vite.config.ts                 # + vitest config (environment: node)
src/main.tsx                   # mounts <StoreProvider><App/></StoreProvider>
src/App.tsx                    # header, RoleSwitcher, frame, ScenarioPanel, screen switch
src/index.css                  # tokens + all styles
src/state/types.ts             # all domain types
src/state/labels.ts            # every Vietnamese status/priority/source/service label
src/state/helpers.ts           # time fmt, ids, addCase, log, notify
src/state/seed.ts              # seed(today) -> State
src/state/reminders.ts         # reminderStatus, respond, sweepReminders
src/state/devices.ts           # thresholds, evaluate, deviceStatus, push/disconnect/fall
src/state/cases.ts             # ops transitions, cancel, familyResponded, effectivePriority, nextOwner
src/state/assistant.ts         # normalize, classify, handleUtterance, startService, handoff
src/state/reducer.ts           # Action union, reduce()
src/state/store.tsx            # loadState, StoreProvider, useStore
src/scenarios.ts               # 8 doc §8 scenarios as Action lists
src/ui/PhoneFrame.tsx  src/ui/TabBar.tsx  src/ui/Badges.tsx
src/ui/EmergencyOverlay.tsx  src/ui/ScenarioPanel.tsx  src/ui/LineChart.tsx
src/elder/{Home,Schedule,Health,Services,Requests,Chat}.tsx
src/family/{Dashboard,Profile,Notifications,Report}.tsx
src/ops/{Board,CaseDetail}.tsx
tests: src/state/*.test.ts, src/scenarios.test.ts, src/copy.test.ts
README.md
```

---

### Task 1: Scaffold, shell and tooling

**Files:**
- Create: Vite react-ts scaffold at repo root, `src/App.tsx`, `src/index.css`, `src/ui/PhoneFrame.tsx`, `src/ui/TabBar.tsx`, `src/smoke.test.ts`
- Modify: `vite.config.ts`, `package.json`, `index.html`

**Interfaces:**
- Produces: `<PhoneFrame title?: string>{children}</PhoneFrame>`, which renders a 390px phone with a status bar showing the demo clock (the time arrives as a `time: string` prop for now) and a "Dữ liệu minh họa" chip. Also `<TabBar items={{id, label, icon}[]} active onSelect(id)/>`.

- [ ] **Step 1: Scaffold.** The root isn't empty, so run `npm create vite@latest _scaffold -- --template react-ts`. Move its contents (including dotfiles) to the repo root, then delete `_scaffold`. Run `npm i` and `npm i -D vitest`. Remove the template's demo assets and `App.css`.
- [ ] **Step 2: Git.** Run `git init`. Make sure `.gitignore` covers `node_modules` and `dist`.
- [ ] **Step 3: Vitest.** In `vite.config.ts` add `/// <reference types="vitest/config" />` and `test: { environment: 'node' }`. Add the script `"test": "vitest run"`.
- [ ] **Step 4: Write the smoke test.** `src/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run `npm test`. Expected: 1 passed.
- [ ] **Step 5: Shell.**
  - `index.html`: title "CAREBOX Demo" and the Be Vietnam Pro `<link>`.
  - `src/index.css`: `:root` tokens from Global Constraints, plus card, button and badge base styles.
  - `App.tsx`: the header "CAREBOX · AI watches. Family knows. CAREBOX steps in." with the demo disclaimer, a 3-button role switcher (Người cao tuổi / Gia đình / Điều phối) held in local `useState` for now, and a centered `PhoneFrame` holding a placeholder. On viewports ≥ 1100px, the right column is reserved for the scenario panel; below that, the panel stacks underneath.
- [ ] **Step 6: Verify.** Run `npm run build`. Expected: exits 0 and `dist/index.html` exists. Run `npm run dev` and check that the page shows the header, switcher and phone frame.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "chore: scaffold vite react-ts shell with vitest"`

---

### Task 2: Types, labels, seed, store core

**Files:**
- Create: `src/state/types.ts`, `src/state/labels.ts`, `src/state/helpers.ts`, `src/state/seed.ts`, `src/state/reducer.ts`, `src/state/store.tsx`
- Test: `src/state/core.test.ts`
- Delete: `src/smoke.test.ts`

**Interfaces (Produces). All later tasks use these exact names.**

```ts
// types.ts
export type Role = 'elder' | 'family' | 'ops'
export type Screen = 'home'|'schedule'|'health'|'services'|'requests'|'chat'
  |'f-dashboard'|'f-profile'|'f-notifications'|'f-report'|'ops-board'|'ops-case'
export type Priority = 'normal' | 'priority' | 'emergency' | 'uncertain'
export type Source = 'device' | 'elder' | 'staff' | 'ai'
export type ServiceType = 'medicine'|'groceries'|'clinic'|'daily_help'|'contact_family'|'add_reminder'
export type RequestStatus = 'need_info'|'await_confirm'|'await_dispatch'|'in_progress'|'done'|'intervention'|'refused'
export type EventStatus = 'to_verify' | 'handling' | 'resolved'
export interface LogEntry { at: number; by: Source; text: string }
interface CaseBase { id: string; title: string; detail: string; source: Source; priority: Priority;
  priorityReason: string; createdAt: number; history: LogEntry[]; unclear: string[] }
export interface RequestCase extends CaseBase { kind: 'request'; service: ServiceType;
  fields: Record<string, string>; status: RequestStatus; verifiedBy?: string; assignee?: string;
  cpReport?: { text: string; at: number }; familyRespondedAt?: number; completedAt?: number; closedReason?: string }
export interface EventCase extends CaseBase { kind: 'event'; status: EventStatus; handler?: string;
  closingNote?: string; deviceId?: string; reminderId?: string }
export type Case = RequestCase | EventCase
export type ReminderKind = 'medicine' | 'meal' | 'clinic' | 'activity'
export interface Reminder { id: string; dueAt: number; title: string; note: string; kind: ReminderKind;
  response?: 'received' | 'cant_do'; respondedAt?: number; snoozedUntil?: number; escalated?: boolean }
export type DeviceKind = 'bp' | 'hr' | 'glucose' | 'spo2' | 'fall'
export interface Reading { at: number; value: number | [number, number] | 'fall' }
export interface Device { id: DeviceKind; name: string; unit: string; connected: boolean; readings: Reading[] }
export type NotifCategory = 'request' | 'health' | 'other'
export interface Notification { id: string; at: number; audience: 'family' | 'ops'; text: string;
  category: NotifCategory; source: Source; caseId?: string; read: boolean }
export interface ChatMessage { id: string; from: 'elder' | 'ai'; text: string; at: number }
export interface ChatState { messages: ChatMessage[];
  pending: null | { caseId: string; stage: 'collect' | 'readback'; field?: string }; misses: number; recentMisses: string[] }
export interface State { version: 1; now: number;
  view: { role: Role; screen: Screen; caseId?: string };
  elder: { name: string; age: number; birthDate: string; phone: string; address: string };
  family: { name: string; relation: string; phone: string }[]; staff: string; partners: string[];
  reminders: Reminder[]; devices: Device[]; cases: Case[]; notifications: Notification[];
  chat: ChatState; emergency: null | { caseId: string; calling: boolean };
  seq: { cb: number; evt: number; n: number } }
```

```ts
// helpers.ts
export const MIN = 60_000
export function fmtTime(ms: number): string            // "HH:MM"
export function fmtDate(ms: number): string            // "Thứ 4, 12 tháng 10"
export function nextCaseId(s: State, kind: 'request'|'event'): [State, string]  // "CB-003" / "EVT-001", zero-padded 3
export function addCase(s: State, c: Case): State
export function updateCase(s: State, id: string, patch: Partial<Case>, log?: { by: Source; text: string }): State
export function notify(s: State, audience: ('family'|'ops')[], text: string, category: NotifCategory, source: Source, caseId?: string): State
export function sayAi(s: State, text: string): State   // appends AI chat message at s.now
// labels.ts. Copy is verbatim; tests and UI import these.
export const REQUEST_STATUS: Record<RequestStatus, string>
//  need_info 'Chờ bổ sung thông tin', await_confirm 'Chờ xác nhận', await_dispatch 'Chờ điều phối',
//  in_progress 'Đang xử lý', done 'Hoàn tất', intervention 'Cần can thiệp', refused 'Đã từ chối'
export const EVENT_STATUS: Record<EventStatus, string>  // 'Cần xác minh' | 'Đang xử lý' | 'Đã xử lý'
export const PRIORITY: Record<Priority, string>         // 'Thông thường' | 'Cần chú ý' | 'Khẩn cấp' | 'Chưa chắc chắn'
export const SOURCE: Record<Source, string>             // 'Thiết bị (giả lập)' | 'Người cao tuổi báo' | 'Nhân viên xác minh' | 'AI tổng hợp'
export const SERVICE: Record<ServiceType, string>       // 'Mua thuốc' | 'Đi chợ' | 'Đi khám bệnh' | 'Hỗ trợ sinh hoạt' | 'Liên hệ người thân' | 'Thêm lịch nhắc'
export const DEVICE_STATUS: Record<DeviceStatus, string>
//  normal 'Bình thường theo ngưỡng đã cấu hình', attention 'Cần chú ý', missing 'Thiếu dữ liệu', suspicious 'Dữ liệu đáng nghi'
export const REMINDER_STATUS: Record<ReminderStatus, string>
//  upcoming 'Sắp tới', due 'Đến giờ', snoozed 'Nhắc lại sau', received 'Đã nhận nhắc', cant_do 'Không thực hiện được', no_confirm 'Chưa có xác nhận'
// (DeviceStatus / ReminderStatus types are declared in types.ts: see Tasks 3 for values)
// seed.ts
export function seed(today: Date): State
// reducer.ts (grows in later tasks)
export type Action = { type: 'reset' } | { type: 'nav'; role?: Role; screen?: Screen; caseId?: string }
  | { type: 'clock/advance'; minutes: number } | { type: 'clock/nextReminder' } /* + later tasks */
export function reduce(s: State, a: Action): State
// store.tsx
export const STORAGE_KEY = 'carebox-demo-v1'
export function loadState(raw: string | null, today: Date): State
export function StoreProvider(props: { children: React.ReactNode }): JSX.Element
export function useStore(): { state: State; dispatch: (a: Action) => void }
```

Also add `DeviceStatus = 'normal'|'attention'|'missing'|'suspicious'` and `ReminderStatus = 'upcoming'|'due'|'snoozed'|'received'|'cant_do'|'no_confirm'` to `types.ts`.

**Seed values (spec, design.jpg):**
- **Clock:** `now` = today 07:00 local. View: `{ role: 'elder', screen: 'home' }`.
- **Elder:** Bà Nguyễn Thị Lan, age 72, birthDate `12/03/1954`, phone `0987 654 321`, address `Quận Cầu Giấy, Hà Nội`.
- **Family:** `[{ name: 'Chị Minh', relation: 'Con gái', phone: '0901 234 567' }]`. **Staff:** `'Chị Hà'`. **Partners:** `['Anh Tuấn', 'Chị Mai']`.
- **Reminders** (today):
  - r1 07:30 "Uống thuốc huyết áp" (medicine; note "Theo đơn đã được gia đình cung cấp và nhân viên kiểm tra")
  - r2 08:00 "Ăn sáng" (meal)
  - r3 09:00 "Đi khám định kỳ" (clinic)
  - r4 12:00 "Uống thuốc bổ" (medicine)
  - r5 16:00 "Đi dạo" (activity)
- **Devices:** bp (mmHg), hr (bpm), glucose (mmol/L), spo2 (%), and fall ("Thiết bị phát hiện té ngã", no readings). All are connected. Each of the four metric devices has 7 daily readings at 06:45 for days −6…0, all within the simulated thresholds (Task 3).
- **Cases:**
  - CB-001: request, medicine, "Hỗ trợ lấy thuốc", status `need_info`, `fields: { thuoc: 'Thuốc huyết áp' }`, missing location and time, createdAt yesterday 14:30, source elder, priority normal.
  - CB-002: request, clinic, "Đi khám bệnh", status `done`. It has every field, verifiedBy Chị Hà, assignee Anh Tuấn, a cpReport (yesterday 10:40, "Đã đưa bác đi khám và về nhà an toàn theo lịch hẹn." — the report states what the Care Partner did, not a health status), and completedAt yesterday 11:00.
- `seq`: `{ cb: 3, evt: 1, n: <past seeded ids> }`.
- **Notifications** (family): "14:30 – Yêu cầu lấy thuốc đã được ghi nhận. Chưa xác nhận có người thực hiện." (request).
- **Chat:** one AI message, "Bác cần CAREBOX hỗ trợ gì ạ? Bác có thể nói yêu cầu, hỏi lịch hoặc nhờ liên hệ người thân."

- [ ] **Step 1: Write the failing tests** in `src/state/core.test.ts`:
  - `seed has 5 reminders, 5 devices, CB-001 need_info and CB-002 done`
  - `nav with role only sets that role's default screen`: elder→`home`, family→`f-dashboard`, ops→`ops-board`
  - `clock/advance moves now by minutes`: `reduce(s, {type:'clock/advance', minutes:15}).now === s.now + 15*MIN`
  - `clock/nextReminder jumps to the earliest dueAt or snoozedUntil > now among unanswered reminders`. From the 07:00 seed, now becomes 07:30.
  - `nextCaseId increments and pads`: from seed, the request id is `'CB-003'` and the event id is `'EVT-001'`
  - `reset returns a fresh seed`
  - `loadState falls back to seed on null, invalid JSON, and version !== 1`
  - `loadState returns the parsed state when valid`
- [ ] **Step 2: Run.** `npm test` → FAIL (modules missing).
- [ ] **Step 3: Implement** `types.ts`, `labels.ts`, `helpers.ts`, `seed.ts`, the `reduce` cases above, and `store.tsx`. The store uses `useReducer(reduce, null, () => loadState(localStorage.getItem(KEY), new Date()))` and saves in `useEffect` with try/catch. `clock/advance` and `clock/nextReminder` call `sweepReminders` after Task 3; for now they only move the clock.
- [ ] **Step 4: Run.** `npm test` → PASS.
- [ ] **Step 5: Wire it up.** `main.tsx` uses `StoreProvider`. `App.tsx` reads `state.view` and dispatches `nav`, and `PhoneFrame` shows `fmtTime(state.now)`. Delete `smoke.test.ts`.
- [ ] **Step 6: Commit.** `feat: domain types, seed and persisted store`

---

### Task 3: Reminders and devices logic

**Files:**
- Create: `src/state/reminders.ts`, `src/state/devices.ts`
- Modify: `src/state/reducer.ts` (actions below; clock actions call `sweepReminders`)
- Test: `src/state/reminders.test.ts`, `src/state/devices.test.ts`

**Interfaces:**
- Consumes: Task 2 helpers (`addCase`, `nextCaseId`, `notify`, `updateCase`).
- Produces:

```ts
// reminders.ts
export const NO_CONFIRM_AFTER = 30   // demo minutes after due
export const SNOOZE = 10
export function reminderStatus(r: Reminder, now: number): ReminderStatus
export function respondReminder(s: State, id: string, response: 'received'|'snooze'|'cant_do'): State
export function sweepReminders(s: State): State   // escalates newly no_confirm reminders once
// devices.ts
export const THRESHOLDS = { bp: { sys: [90,140], dia: [60,90] }, hr: [50,100], glucose: [3.9,7.8], spo2: [94,100] }
export const PLAUSIBLE  = { bp: { sys: [60,250], dia: [30,150] }, hr: [25,220], glucose: [1,35], spo2: [50,100] }
export const STALE_AFTER = 360 // demo minutes
export const SIM_VALUES = { normal: { bp:[124,80], hr:74, glucose:5.6, spo2:97 },
  high: { bp:[165,100], hr:128, glucose:11.2, spo2:89 }, suspicious: { bp:[300,20], hr:0, glucose:0.2, spo2:105 } }
export function evaluate(kind: Exclude<DeviceKind,'fall'>, value: Reading['value']): 'normal'|'attention'|'suspicious'
export function deviceStatus(d: Device, now: number): DeviceStatus   // fall device: 'missing' if disconnected else 'normal'
export function pushReading(s: State, id: Exclude<DeviceKind,'fall'>, mode: 'normal'|'high'|'suspicious'): State
export function disconnect(s: State, id: DeviceKind): State
export function reconnect(s: State, id: DeviceKind): State
export function reportFall(s: State): State
// reducer Action additions
| { type: 'reminder/respond'; id: string; response: 'received'|'snooze'|'cant_do' }
| { type: 'device/push'; deviceId: Exclude<DeviceKind,'fall'>; mode: 'normal'|'high'|'suspicious' }
| { type: 'device/disconnect'; deviceId: DeviceKind } | { type: 'device/reconnect'; deviceId: DeviceKind }
| { type: 'device/fall' }
```

**Rules:**
- `reminderStatus` checks in this order:
  1. `response === 'received'` → `received`.
  2. `response === 'cant_do'` → `cant_do`.
  3. `snoozedUntil > now` → `snoozed`.
  4. `now < dueAt` → `upcoming`.
  5. `now >= dueAt + 30*MIN` with no response → `no_confirm`.
  6. Otherwise → `due`.
- **`cant_do`** creates an event "Không thực hiện được: <title>" (source elder; priority `priority` for medicine, `normal` otherwise; `reminderId` set) and notifies family and ops.
- **`sweepReminders`** handles each reminder that has become `no_confirm` and isn't `escalated`. It creates an event with priority `uncertain` and title "Chưa có xác nhận: <title>". The detail reads "Không có phản hồi sau nhắc. Không kết luận người cao tuổi đã thực hiện." It then sets `escalated` and notifies family and ops.
- **`pushReading`** appends `{ at: now, value }` and evaluates it:
  - `attention` → event, priority `priority`, title "Dữ liệu thiết bị vượt ngưỡng", detail exactly "Dữ liệu giả lập vượt ngưỡng đã cấu hình. Chưa có kết luận y tế và chưa xác nhận nguyên nhân.", plus a family and ops notification (category health).
  - `suspicious` → event, priority `uncertain`, title "Dữ liệu đáng nghi", detail "Dữ liệu có thể sai do đo hoặc truyền dẫn. Cần kiểm tra nguồn, đo lại nếu phù hợp."
  - `normal` → no event.
- **`disconnect`** sets `connected: false` and creates an `uncertain` event "Thiết bị mất kết nối: <name>" with detail "Không đủ dữ liệu. Không kết luận người dùng an toàn." Then it notifies.
- **`reportFall`** appends a `'fall'` reading and raises an emergency through `raiseEmergency` (Task 4). The case title is "Thiết bị báo té ngã".
- Every event created here has `source: 'device'` and `deviceId` set (except reminder events: source `elder`/`ai`), and `status: 'to_verify'`.

- [ ] **Step 1: Write the failing tests:**
  - `reminderStatus covers all six states`: one assertion per state, built from r1 at 07:30 with now 07:00 / 07:35 / 08:00 / snoozed / responded.
  - `snooze sets snoozedUntil = now + 10 min`
  - `cant_do on a medicine reminder creates a priority event with reminderId and notifies family and ops`
  - `sweep escalates a no-response reminder exactly once`: advance 60 min twice; there is exactly one event per reminder.
  - `sweep never marks a reminder received`
  - `evaluate`: `bp [165,100]` → attention, `[124,80]` → normal, `[300,20]` → suspicious; `spo2 89` → attention; `hr 0` → suspicious.
  - `deviceStatus is missing when disconnected, and when the last reading is older than 360 min`
  - `push high creates a to_verify event with the exact detail copy and no diagnosis words`: the detail equals the string above.
  - `push normal creates no event`
  - `disconnect creates an uncertain event and status missing`
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** both modules and the reducer cases. Make `clock/*` call `sweepReminders`. Stub `reportFall` until Task 4, keeping its test for Task 4.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: reminder and simulated device logic`

---

### Task 4: Case workflow (staff and family transitions, emergency)

**Files:**
- Create: `src/state/cases.ts`
- Modify: `src/state/reducer.ts`, `src/state/devices.ts` (`reportFall` uses `raiseEmergency`)
- Test: `src/state/cases.test.ts`

**Interfaces:**

```ts
export const ABANDONED_AFTER = 30 // demo minutes, "giả định thử nghiệm"
export const CP_SERVICES: ServiceType[] = ['medicine','groceries','clinic','daily_help']
export function effectivePriority(c: Case, now: number): { priority: Priority; reason: string }
export function nextOwner(c: Case, s: State): string
export function raiseEmergency(s: State, title: string, detail: string, source: Source): State
export function transition(s: State, a: CaseAction): State   // illegal → returns s unchanged (same reference)
export type CaseAction =
 | { type: 'request/cancel'; id: string }                       // elder, any non-final request → refused
 | { type: 'family/responded'; id: string }                     // contact_family only
 | { type: 'ops/verify'; id: string }                           // await_dispatch & !verifiedBy → verifiedBy = staff
 | { type: 'ops/assign'; id: string; partner: string }          // await_dispatch & verified & CP_SERVICES → in_progress
 | { type: 'ops/cpReport'; id: string; text: string }           // in_progress & assignee & !cpReport
 | { type: 'ops/confirmDone'; id: string }                      // see rules → done, completedAt
 | { type: 'ops/approveReminder'; id: string; time: string }    // add_reminder, verified → adds Reminder at today time, done
 | { type: 'ops/decline'; id: string; reason: string }          // non-final request → refused, closedReason
 | { type: 'ops/flag'; id: string } | { type: 'ops/unflag'; id: string }   // ↔ intervention / await_dispatch
 | { type: 'ops/takeEvent'; id: string }                        // to_verify → handling, handler = staff
 | { type: 'ops/resolveEvent'; id: string; note: string }       // handling & note.trim() → resolved
 | { type: 'ops/convertEvent'; id: string; service: ServiceType } // event → resolved + new request await_dispatch (fields {}, unclear ['Cần bổ sung chi tiết'])
 | { type: 'emergency/call115' } | { type: 'emergency/dismiss' }
```

**Rules:**
- **`ops/confirmDone` is legal only when:**
  - CP services: `in_progress` and `cpReport` exists.
  - `contact_family`: `await_dispatch`, verified and `familyRespondedAt`.
  - `add_reminder` always goes through `approveReminder`.
- **Final statuses:** `done` and `refused`, plus `resolved` for events.
- **Logging and notifications:** every legal transition appends a history entry (by `staff`, except cancel `elder` and family-responded). It also notifies family on assign, confirmDone, decline and resolveEvent.
- **`raiseEmergency`** does all of the following in a single reducer call:
  - Creates an event with priority `emergency` and status `handling` (handler = staff).
  - Sets its `history[0]` to "Hướng dẫn gọi 115; đã thông báo gia đình và đầu mối CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận."
  - Sets `state.emergency = { caseId, calling: false }`.
  - Notifies both `family` and `ops`.
- **Closing an emergency** via `resolveEvent` requires a note (the UI prompts "Ai đã tiếp nhận tình huống?").
- **`effectivePriority`** returns `{priority:'priority', reason:'Yêu cầu bị bỏ ngỏ quá 30 phút (giả định thử nghiệm)'}` for requests in `need_info`/`await_confirm`/`await_dispatch` that have no assignee and are older than 30 minutes. Otherwise it returns the stored priority and reason.
- **`nextOwner`** returns:
  - `need_info` → 'Người cao tuổi (bổ sung thông tin)'
  - `await_confirm` → 'Người cao tuổi (xác nhận)'
  - `await_dispatch` unverified → 'Nhân viên điều phối (xác minh)'
  - `await_dispatch` verified → 'Nhân viên điều phối (phân công)', or for contact_family → 'Gia đình (phản hồi)'
  - `in_progress` without report → 'Care Partner <assignee>'
  - `in_progress` with report → 'Nhân viên điều phối (xác nhận hoàn tất)'
  - `intervention` → 'Nhân viên điều phối'
  - `to_verify` → 'Nhân viên điều phối'
  - `handling` → handler
  - final statuses → '—'

- [ ] **Step 1: Write the failing tests:**
  - `happy path: verify → assign → cpReport → confirmDone ends done with completedAt and cpReport.at kept separately`
  - `cannot assign before verify`
  - `cannot confirmDone without cpReport`: status stays `in_progress`.
  - `illegal transition is a no-op`: `confirmDone` twice → second result `toBe` the first (same reference) and the notification count is unchanged. Same for `assign` twice.
  - `cancel from need_info → refused, by elder`
  - `cancel on done is a no-op`
  - `contact_family needs familyResponded before confirmDone`
  - `approveReminder adds a reminder at the given time and sets done`
  - `flag/unflag toggles intervention ↔ await_dispatch`
  - `resolveEvent requires a non-blank note`
  - `convertEvent resolves the event and creates CB-003 await_dispatch`
  - `raiseEmergency sets state.emergency, creates a handling emergency event and notifies family and ops in one call`
  - `device/fall raises an emergency`: moved from Task 3.
  - `effectivePriority marks seed CB-001 as priority with the giả định thử nghiệm reason`
  - `nextOwner for in_progress without report names the assignee`
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `cases.ts`. In the reducer, route every `CaseAction` to `transition`. `emergency/call115` sets `calling: true` and logs "Mô phỏng: đang gọi 115". `emergency/dismiss` sets `state.emergency = null` and leaves the event untouched.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: case workflow transitions and emergency`

---

### Task 5: Simulated AI assistant

**Files:**
- Create: `src/state/assistant.ts`
- Modify: `src/state/reducer.ts`
- Test: `src/state/assistant.test.ts`

**Interfaces:**

```ts
export type Intent = 'emergency'|'medical_decision'|'problem'|'reminder'|'contact'|'service'|'info'|'unknown'
export function normalize(text: string): string   // lowercase, NFD strip diacritics, đ→d, collapse spaces
export function classify(text: string): { intent: Intent; service?: ServiceType }
export const SERVICE_FIELDS: Record<ServiceType, { key: string; label: string; question: string }[]>
export function handleUtterance(s: State, text: string): State
export function startService(s: State, service: ServiceType): State
export function handoff(s: State): State          // "Gặp nhân viên"
// reducer additions
| { type: 'chat/say'; text: string } | { type: 'chat/startService'; service: ServiceType } | { type: 'chat/handoff' }
```

**Keywords.** They are matched on `normalize(text)` with word boundaries. Precedence runs top to bottom; the first match wins.

| intent | keywords (normalized) |
|---|---|
| emergency | dau nguc, kho tho, nga, te nga, bat tinh, ngat, dot quy, meo mieng, cap cuu, cuu voi |
| medical_decision | doi lieu, tang lieu, giam lieu, ke don, bo thuoc, uong them thuoc, doi thuoc |
| problem | het thuoc, met, chong mat, dau dau, sot, khong khoe, buon non |
| reminder | nhac, dat lich nhac |
| contact | goi con, goi cho, lien he, nhan con, con gai, con trai |
| service | medicine: mua thuoc, lay thuoc · groceries: di cho, mua do, mua rau, thuc pham · clinic: di kham, kham benh, tai kham, benh vien · daily_help: don dep, giat, ho tro sinh hoat, tham |
| info | lich, huyet ap, nhip tim, duong huyet, spo2, oxy, yeu cau, den dau |

`contact` maps to service `contact_family`; `reminder` maps to `add_reminder`.

**`SERVICE_FIELDS` keys:**
- medicine: thuoc, dia_diem, thoi_gian
- groceries: danh_sach, thoi_gian
- clinic: noi_kham, thoi_gian, di_lai
- daily_help: noi_dung, thoi_gian
- contact_family: nguoi, loi_nhan
- add_reminder: noi_dung, thoi_gian

Each field has one short question in the "Bác … cháu" tone.

**State machine for `handleUtterance(s, text)`.** Steps are checked in order; the first that applies decides.
1. **Blank text.** If `text.trim()` is empty, return `s` unchanged.
2. **Record.** Append the elder message.
3. **Emergency** (any stage). Call `raiseEmergency(s, 'Người dùng báo dấu hiệu khẩn cấp', text, 'elder')`. If a request was pending, it stays `need_info` or `await_confirm` in the list, and `pending` is cleared. The AI replies "Cháu đang hướng dẫn gọi 115 và đã báo con gái bác cùng nhân viên CAREBOX." Stop.
4. **Pending `collect`:**
   - If the text matches refuse words (`thoi`, `khong can`, `huy`), the request becomes `refused` (closedReason "Người cao tuổi từ chối"), the AI acknowledges without pressure, and `pending` is cleared.
   - If the text is `khong biet` or `chua biet`, push the field label to `unclear`.
   - Otherwise set `fields[field] = text.trim()` (stored verbatim, never inferred).
   - Then ask the next missing field. When none remain, set status `await_confirm`, set stage `readback`, and have the AI read back every field (unclear ones as "chưa rõ"), ending in "đúng không ạ?".
5. **Pending `readback`:**
   - Refuse words (`khong`, `thoi`, `huy`, `sai`) are checked first → `refused`.
   - Then confirm words (`dung`, `dong y`, `vang`, `ok`, `co`) → `await_dispatch`. Notify family ("đã ghi nhận, chưa có người thực hiện") and ops. The AI says it has forwarded the request to staff and that this is not yet done.
   - Anything else counts as a miss; the AI re-asks.
6. **No pending; classify the text:**
   - **medical_decision.** The AI refuses ("Cháu không thể thay đổi thuốc hay liều. Bác hỏi bác sĩ hoặc dược sĩ nhé; cháu đã báo nhân viên CAREBOX."). Create a `normal` event "Yêu cầu vượt phạm vi AI: thay đổi thuốc" (source elder). Reminders stay unchanged.
   - **problem.** Create a `priority` event (title = text, source elder, reason "Người cao tuổi báo vấn đề") and notify ops and family. The AI says a staff member will verify. It gives no diagnosis.
   - **service, reminder or contact.** Create a request (`need_info`, source elder, priority normal; `clinic` with `thoi_gian` containing "hom nay" → `priority`, reason "Cần hỗ trợ đi khám trong ngày") and start `collect` with its first question.
   - **info.**
     - Schedule questions get today's reminders with their `REMINDER_STATUS` labels.
     - Request questions get each open request with its status label and `nextOwner`.
     - Health questions get the latest reading, the time and "nguồn: thiết bị giả lập", followed by "Cháu không đánh giá được tình trạng sức khỏe; bác có thể hỏi nhân viên hoặc bác sĩ ạ."
   - **unknown.** Increment `misses` and push the text to `recentMisses`.
     - On 1 miss, re-ask briefly.
     - On 2 misses, call `handoff`.
     - Reset `misses` and `recentMisses` on any understood input.
7. **`handoff`.** Create an `uncertain` event "AI chưa hiểu yêu cầu" with `unclear = recentMisses` (or ['Người cao tuổi chọn gặp nhân viên']) and status `to_verify`, then notify ops. The AI says "Cháu chuyển bác sang nhân viên CAREBOX nhé." Clear `pending` and `misses`.
8. **`startService(service)`.** Equivalent to classifying a service intent for that service; used by the Services screen and chat chips.

- [ ] **Step 1: Write the failing tests:**
  - `normalize strips diacritics and đ`: `normalize('Đau NGỰC')` → `'dau nguc'`.
  - `classify precedence`: 'Bác hết thuốc, mua thuốc giúp bác' → problem; 'nhắc bác uống thuốc lúc 9 giờ' → reminder; 'tăng liều thuốc huyết áp' → medical_decision; 'lịch hôm nay' → info; 'ngày mai đi chợ' → service groceries; 'abc xyz' → unknown.
  - `ignores blank input`: `handleUtterance(s, '   ')` returns `s` (same reference).
  - `emergency without diacritics`: 'DAU NGUC QUA' → `state.emergency` is set.
  - `emergency interrupts collection`: start medicine, answer one field, then say 'tôi khó thở' → emergency is set, the medicine request stays `need_info`, and `pending` is null.
  - `medicine flow`: 'Ngày mai tôi cần lấy thuốc ở hiệu thuốc' → asks thuoc → … → readback → 'đúng rồi' → `await_dispatch`, never `done`.
  - `khong biet records unclear and continues`
  - `readback 'không đúng' refuses`: the refuse check runs before the confirm check.
  - `two misses hand off to an uncertain event with both utterances in unclear`
  - `medical_decision refuses, logs a normal event, and leaves reminders deep-equal`
  - `problem creates a priority event and no request`
  - `health info reply contains the source and time and no evaluation words`: the reply contains 'nguồn: thiết bị giả lập' and not 'bình thường' or 'tốt'.
  - `clinic today is priority`
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** `assistant.ts` and the reducer routing.
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: simulated AI assistant with intent rules`

---

### Task 6: Shared UI pieces and elder screens (design 1–6)

**Files:**
- Create: `src/ui/Badges.tsx`, `src/ui/EmergencyOverlay.tsx`, `src/ui/LineChart.tsx`, `src/elder/Home.tsx`, `src/elder/Schedule.tsx`, `src/elder/Health.tsx`, `src/elder/Services.tsx`, `src/elder/Requests.tsx`, `src/elder/Chat.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `useStore`, the labels, `reminderStatus`, `deviceStatus`, `THRESHOLDS`, `nextOwner`, `effectivePriority`, `SERVICE_FIELDS`.
- Produces:
  - `<StatusBadge c={Case}/>`, `<PriorityBadge c={Case} now={number}/>` (uses `effectivePriority`), `<SourceTag source={Source}/>`, `<ReminderBadge r={Reminder} now={number}/>`, `<DeviceBadge d={Device} now={number}/>`
  - `<LineChart points={{label: string; value: number}[]} band?={[number, number]}/>`, an inline SVG that shades the simulated threshold band
  - `<EmergencyOverlay/>`, which reads `state.emergency` itself

**Screen content** (design.jpg; copy rules from Global Constraints):
- **Elder tab bar:** Trang chủ, Lịch trình, Sức khỏe, Dịch vụ, Yêu cầu. Chat opens from the home mic button and the Services list.
- **Home:**
  - `fmtDate(now)` and "Chào bà Lan! 👋".
  - Mascot bubble: "Bà cần gì hôm nay ạ?"
  - Large mic button → `nav chat`.
  - 4 tiles: next medicine reminder with its time, next clinic reminder, "Yêu cầu hỗ trợ" → services, "Xem thêm" → schedule.
  - No weather and no health claims.
- **Schedule:**
  - A week strip computed from `now`.
  - The reminder list with `ReminderBadge`. While a reminder is `due`, `snoozed` or `no_confirm`, it shows 3 large buttons: Đã nhận / Nhắc lại / Không thực hiện được.
  - "Thêm lịch trình" dispatches `chat/startService add_reminder` and navigates to chat.
- **Health:**
  - Four device cards showing the latest value and unit, `DeviceBadge`, "Đo lúc HH:MM" and `SourceTag device`. When the device is missing, show "Lần cuối: HH:MM" instead of a value status.
  - A fall-detector card.
  - Chart tabs: Huyết áp (systolic) / Nhịp tim / Đường huyết. The chart shows the last 7 readings with the band.
  - Footnote: "Ngưỡng giả lập — không phải chỉ định y tế. Không kết luận sức khỏe tổng thể."
- **Services:**
  - A search input that filters the list.
  - Five rows (Mua thuốc, Đi chợ, Đi khám bệnh, Hỗ trợ sinh hoạt, Trò chuyện), each with a sub-line as in design.jpg. Each row dispatches `chat/startService` and navigates to chat; Trò chuyện just navigates to chat.
- **Requests:**
  - Tabs: Đang xử lý (non-final) / Đã xong (final) / Tất cả.
  - Each card shows the service icon and title, `StatusBadge`, fields, "Phụ trách: <nextOwner>", the history timeline (time + text), and the cpReport if present.
  - "Hủy yêu cầu" (with a native `confirm()`) on non-final requests.
- **Chat:**
  - The message list with the AI avatar 🤖.
  - Quick chips that depend on the stage:
    - no pending: Nhắc lịch, Mua thuốc, Đi chợ, Lịch hôm nay
    - collect: Không biết, Thôi
    - readback: Đúng rồi, Không
  - Text input and Send.
  - The mic button uses `window.SpeechRecognition || webkitSpeechRecognition` (`lang 'vi-VN'`) when available, otherwise focuses the input.
  - A persistent "Gặp nhân viên" button → `chat/handoff`.
  - Auto-scroll to the bottom.
- **`EmergencyOverlay`:**
  - Inside the elder frame when `state.emergency` is set: a full-screen red layer with "Gọi 115" (→ `emergency/call115`, then shows "Đang gọi 115 (mô phỏng)…"), "Gọi Chị Minh (con gái)", and the line "Thông báo tự động chưa có nghĩa là đã có người tiếp nhận."
  - "Đóng" dispatches `emergency/dismiss`.
  - In the family and ops roles, `App` shows a red top banner instead while `state.emergency` is set, plus a link to the case.

- [ ] **Step 1: Implement** the badges, chart, overlay and the six screens. In `App.tsx`, wire the elder screens and tab bar from `state.view`.
- [ ] **Step 2: Verify** with `npm test` (still green) and `npm run build` (exit 0).
- [ ] **Step 3: Verify in the browser** (`npm run dev`, then use chrome-devtools MCP or manual clicking):
  - Type "Ngày mai tôi cần lấy thuốc" → the chat asks for each field → "Đúng rồi" → the Requests tab shows "Chờ điều phối".
  - Type "đau ngực" → the red overlay appears.
  - On Schedule, respond to r1 after the clock moves (temporary dev control or scenario later).
  - Check that there are no console errors.
- [ ] **Step 4: Commit** `feat: elder screens, badges, chat and emergency overlay`

---

### Task 7: Family screens (design 7–10)

**Files:**
- Create: `src/family/Dashboard.tsx`, `src/family/Profile.tsx`, `src/family/Notifications.tsx`, `src/family/Report.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: Task 6 badges, `deviceStatus`, `reminderStatus`, `nextOwner`, the `family/responded` and `notif/readAll` actions.
- Produces: the reducer action `{ type: 'notif/readAll'; audience: 'family' | 'ops' }` (add it to `reducer.ts` with a test in `core.test.ts`: `readAll marks only that audience read`).

**Screen content:**
- **Family tab bar:** Tổng quan, Hồ sơ, Thông báo (unread count badge), Báo cáo.
- **Dashboard:**
  - Header "Mẹ - Bà Nguyễn Thị Lan" with "Cập nhật lúc HH:MM", where the time is the latest of the notification, reading and case times. No "Đang ở nhà" or any health claim.
  - Status box (Mockup 2): "Chưa có kết luận tổng thể về sức khỏe. Thông tin hiển thị dựa trên dữ liệu và báo cáo hiện có."
  - 4 tiles:
    - Thiết bị: "x/5 đang kết nối", with "y cần chú ý" if any.
    - Lịch trình: "n việc hôm nay".
    - Yêu cầu hỗ trợ: "n đang xử lý".
    - Báo cáo.
  - Open alerts: events not resolved, each with `PriorityBadge`, the next action and its owner.
  - Recent activity: the last 5 history entries across cases, each with time and `SourceTag`.
  - Contact-family requests in `await_dispatch` show a "Gia đình đã phản hồi" button.
- **Profile:**
  - Personal info and the family contact.
  - Connected devices, each with a `DeviceBadge` and the last reading time.
  - The simulation controls do not go here; they live in the scenario panel.
- **Notifications:**
  - Tabs Tất cả / Yêu cầu / Sức khỏe / Khác, filtered by category.
  - Items for the `family` audience, newest first, each showing its time and `SourceTag`.
  - Dispatch `notif/readAll family` on mount.
- **Report** ("Báo cáo hằng ngày", Mockup 5 and doc §4.5). Sections:
  1. Tóm tắt yêu cầu: count received today, count `done`, and open requests with `nextOwner`.
  2. Lịch hôm nay: each reminder with `ReminderBadge`.
  3. Cảnh báo cần chú ý: open events with the next action.
  4. Báo cáo dịch vụ: for each `done` request, the result ("Đã hoàn tất theo báo cáo của Care Partner"), the cpReport text, "Người xác nhận: Nhân viên điều phối <verifiedBy>", and "Thời điểm hoàn tất" (`cpReport.at`) and "Thời điểm xác nhận" (`completedAt`) as separate lines.
  5. Kết nối dữ liệu: each device with its status and last time.

  Every line carries a `SourceTag`. AI-composed summary lines are tagged `ai`.

- [ ] **Step 1: Write the failing test** for `notif/readAll` in `core.test.ts`. Run `npm test` → FAIL.
- [ ] **Step 2: Implement** the action, then run `npm test` → PASS.
- [ ] **Step 3: Implement** the four screens and wire them into `App`.
- [ ] **Step 4: Verify** with `npm run build` (exit 0). In the browser: switch to Gia đình, confirm the CB-001 notification and the CB-002 service report are visible with separate times, and that no screen says "khỏe mạnh" or "Ổn định".
- [ ] **Step 5: Commit** `feat: family dashboard, profile, notifications and report`

---

### Task 8: Staff ops board and case detail (doc Mockups 3–4)

**Files:**
- Create: `src/ops/Board.tsx`, `src/ops/CaseDetail.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: every `CaseAction`, `effectivePriority`, `nextOwner`, the badges and `state.partners`.

**Screen content.** The ops role renders a wide panel (max 960px), not the phone frame.
- **Board:**
  - Title "CAREBOX Operations · Bảng điều phối yêu cầu".
  - Counters:
    - Khẩn cấp: open emergency events.
    - Chờ xử lý: `need_info`, `await_confirm` or `await_dispatch`.
    - Cần xác minh: unverified `await_dispatch` plus `to_verify` events.
    - Đang thực hiện: `in_progress` plus `handling`.
  - A filter: Đang mở / Đã đóng / Tất cả.
  - The list is sorted by effective priority (emergency > priority > uncertain > normal), then by `createdAt` ascending.
  - Each row answers the five questions: id · title (what), `SourceTag` (where from), `PriorityBadge` with its reason, "Tiếp theo: <nextOwner>", and the status badge.
  - Clicking a row dispatches `nav ops-case caseId`.
- **CaseDetail** shows the 10 handoff fields from doc §5:
  1. id
  2. the elder and the source
  3. content (detail and fields)
  4. createdAt
  5. priority and reason
  6. verified info: fields plus `verifiedBy`
  7. unverified or missing: `unclear` plus empty fields
  8. actions taken: the history
  9. next owner
  10. status and result
- **Action buttons on CaseDetail.** Show only the transitions that are legal right now:
  - Xác minh
  - Phân công (`<select>` of partners)
  - Ghi báo cáo Care Partner (textarea)
  - Xác nhận hoàn tất
  - Duyệt lịch nhắc (`<input type="time">`)
  - Từ chối (reason)
  - Cần can thiệp / Bỏ cần can thiệp
  - Tiếp nhận sự kiện
  - Đóng sự kiện (note required; for an emergency the label reads "Ai đã tiếp nhận tình huống?")
  - Chuyển thành yêu cầu (`<select>` service)

  Compute legality by calling `transition` and checking whether the result `!== state`, so the button set can never drift from the rules. Device events also show the device's last 3 readings and the threshold note.
- **Banner on emergency events:** "Nếu có dấu hiệu khẩn cấp từ người dùng hoặc nguồn đáng tin cậy, phải kích hoạt quy trình khẩn cấp phù hợp, không chờ hoàn tất các bước kiểm tra thông thường."

- [ ] **Step 1: Implement** Board and CaseDetail, with a back button to the board.
- [ ] **Step 2: Verify** with `npm test` (green) and `npm run build` (exit 0).
- [ ] **Step 3: Verify in the browser.** Take a chat-created request through Xác minh → Phân công Anh Tuấn → báo cáo → Xác nhận hoàn tất. Then switch to Gia đình → Báo cáo and check that the service report appears. Buttons for illegal steps must not render.
- [ ] **Step 4: Commit** `feat: ops board and case detail with legal-only actions`

---

### Task 9: Demo scenarios panel, copy guard, README

**Files:**
- Create: `src/scenarios.ts`, `src/ui/ScenarioPanel.tsx`, `src/scenarios.test.ts`, `src/copy.test.ts`, `README.md`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**

```ts
// scenarios.ts
export interface Scenario { id: number; title: string; expected: string; criterion: string; actions: Action[] }
export const SCENARIOS: Scenario[]   // 8 entries, doc §8 table text verbatim for title/expected/criterion
export function runScenario(s: State, sc: Scenario): State   // actions.reduce(reduce, s)
```

**Scenario actions.** Each ends with a `nav` to the screen worth looking at.

| # | actions | ends on |
|---|---|---|
| 1 Mua đồ thiết yếu | chat/say 'Bác muốn đi chợ' → 'Rau, trứng, sữa' → 'Sáng mai' → 'Đúng rồi' | elder requests |
| 2 Giờ nhắc thuốc | clock/nextReminder | elder schedule |
| 3 Từ chối dịch vụ | chat/startService daily_help → 'Thôi, bác không cần nữa' | elder requests |
| 4 Thiết bị vượt ngưỡng | device/push bp high | ops-board (new EVT sorts to top) |
| 5 Mất kết nối | device/disconnect spo2 | family f-dashboard |
| 6 AI không hiểu | chat/say 'abc xyz' ×2 | ops-board |
| 7 Dấu hiệu cấp cứu | chat/say 'Tôi bị đau ngực quá' | elder home (overlay) |
| 8 Đòi đổi liều | chat/say 'Cho bác tăng liều thuốc huyết áp' | elder chat |

**ScenarioPanel UI.** Title "Kịch bản kiểm thử (doc §8)". Each scenario is a card with a "Chạy" button and its expected/criterion text. The panel also has:
- Device controls: per metric, Bình thường / Vượt ngưỡng / Đáng nghi; per device, Mất kết nối / Kết nối lại; plus "Báo té ngã".
- Clock: "+15 phút" and "Tới giờ nhắc tiếp theo".
- "Reset demo", behind a `confirm()`.

- [ ] **Step 1: Write the failing tests** in `src/scenarios.test.ts`. Each runs from `seed(fixedDate)` and asserts the doc's criterion:
  1. The new groceries request is `await_dispatch`; no request is `done` except seeded CB-002.
  2. r1's status is `due`; the reminders' titles and notes deep-equal the seed (no dose change); the case count is unchanged.
  3. The daily_help request is `refused`; there are no other open daily_help requests.
  4. The newest event is `to_verify`, priority `priority`, and its detail contains 'Chưa có kết luận y tế'.
  5. `deviceStatus(spo2)` is `missing`; there is an `uncertain` event; no family notification text contains 'an toàn' without 'Không kết luận'.
  6. An `uncertain` event has `unclear` of length 2; no request was created.
  7. `state.emergency` is set right after the single action; the event's status is `handling`; family and ops notifications both exist.
  8. The last AI message contains 'bác sĩ'; reminders deep-equal the seed; a `normal` event exists.
- [ ] **Step 2: Write the failing test** in `src/copy.test.ts`. Recursively read `src/**/*.{ts,tsx}` (excluding `*.test.ts`) with `fs.readdirSync(..., { recursive: true })` and assert that none contains the banned strings from Global Constraints.
- [ ] **Step 3: Run** `npm test` → FAIL (scenarios.ts missing).
- [ ] **Step 4: Implement** `scenarios.ts`, `ScenarioPanel.tsx` and the App layout column.
- [ ] **Step 5: Run** `npm test` → all PASS. Run `npm run build` → exit 0.
- [ ] **Step 6: Write `README.md`** (≤ 25 lines): what the demo is, `npm i && npm run dev`, `npm test`, and Vercel deploy (import the repo; framework preset Vite; build `npm run build`; output `dist`). Add the disclaimer that this is a simulation, not a medical system.
- [ ] **Step 7: Verify in the browser.** Run all 8 scenarios in order, then Reset, then reload. State must persist across a reload before Reset and be the seed after it. Check at 390px and 1280px widths, with no console errors.
- [ ] **Step 8: Commit** `feat: scenario panel, copy guard and README`
