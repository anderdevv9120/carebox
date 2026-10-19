# CAREBOX Staff Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CAREBOX staff role with its own UI, route cases between staff and family as doc.pdf §3–§5 describe, and make the app pass the doc §8 test scenarios.

**Architecture:** All case logic stays in the pure reducer under `src/state`, which the server runs (`server/api.ts → reduce`). Every case gets an `owner` and every notification an audience (`to`). Staff actions are new `CaseAction`s gated by a new `staff` entry in `ROLE_ACTIONS`. Two new staff screens (board, case detail) reuse the existing shell, badges and family screens.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Vercel Functions, Upstash Redis, `@google/genai` (Gemma). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-19-carebox-staff-role-design.md` (read it first; this plan names *which* code carries each spec rule, the spec says *what* the rule is).

## Global Constraints

- No new dependency. Do not change the toolchain to work around the test runner.
- State `version` becomes `3`. A stored v2 state fails `isState` and is re-seeded.
- Staff account `nhan.vien`, password `carebox`, role `staff`, display name `Anh Nam`, title `Nhân viên điều phối`.
- Care Partner demo names (seeded): `Anh Tuấn`, `Chị Hoa`. No Care Partner login.
- Service requests (Care Partner path): `medicine`, `groceries`, `clinic`, `daily_help`. Family-type requests: `contact_family`, and `add_reminder` when not about medicine.
- New labels, verbatim:
  - `Chờ điều phối` (status `await_staff`)
  - `Nhân viên xác minh` (source `staff`)
  - `Gặp nhân viên` (elder chat button)
  - `Chờ nhân viên xác nhận` (badge: Care Partner reported, staff has not confirmed)
  - `CAREBOX Operations` (staff brand)
  - `CAREBOX nhờ hỗ trợ` (family section)
- 30-minute rules: `ABANDONED_AFTER = 30` (existing, counts from `createdAt`), `FAMILY_FALLBACK_AFTER = 30` (new, counts from `confirmedAt`).
- Vietnamese UI copy. Never add banned claims (`copy.test.ts` BANNED list stays).
- Verification per user rules: `npm run lint`, `npx tsc -b`, `npx vitest run`. No `vite build` unless asked.
- Commit steps run only if the user has authorised commits for this execution; otherwise leave changes staged and report.

## Review Focus

1. **Every GET runs the tick.** The stale-device and family-fallback sweeps must stay idempotent across polls. A second `tick` at the same `now` creates no new event or notification. Tests go in Task 4 and Task 3.
2. **Two people act on the same case.** For example, the family replies after staff resolved the case, or staff completes after the elder cancelled. The second action is a no-op, never a resurrection. Tests in Task 2 and Task 5.
3. **"Không" means two things.** It is a refusal on the first question, but a valid answer later (`di_lai`: "Không, bác tự đi được"). Test in Task 6.
4. **Old v2 state in Redis after deploy** must re-seed, not 500. Test in Task 7.
5. **Generic "uống thêm" / "ngã ba"** must not trigger dose or fall flows ("uống thêm nước", "ngã tư Sở"). Test in Task 6.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/state/types.ts` | State shape | Role, Owner, Audience, `await_staff`, `staff` source, new case fields, `State.staff`, `State.carePartners`, Screen ids, version 3 |
| `src/state/labels.ts` | Copy for enums | New labels |
| `src/state/helpers.ts` | Shared state helpers | `notify` gains `to`, `staffName`, `createEvent` sets `owner: 'staff'` |
| `src/state/seed.ts` | Demo data | Staff, Care Partners, v3 seed cases |
| `src/state/cases.ts` | Case lifecycle and routing | Staff actions, owner rules, fallback sweep, board/family views, `nextOwner` |
| `src/state/devices.ts` | Device data rules | Staff routing, `sweepDevices` (stale), missing-event dedupe |
| `src/state/reminders.ts` | Reminder rules | Events routed to staff |
| `src/state/clock.ts` | Tick | Run new sweeps |
| `src/state/assistant.ts` | Keyword AI | Handoff to staff, keywords, first-question refusal, confirm routing |
| `src/state/reducer.ts` | Action union | New actions, removed family actions |
| `server/auth.ts`, `server/api.ts`, `server/ai.ts` | Login, permissions, Gemma | Staff account, `ROLE_ACTIONS`, injected role fields, v3 check, Gemma statuses |
| `src/staff/Board.tsx` (new) | Mockup 3 board | Counters and case list |
| `src/staff/CaseDetail.tsx` (new) | Mockup 4 detail and actions | 10 handoff fields and staff actions |
| `src/App.tsx`, `src/Login.tsx` | Shell and login | Staff branch and tabs; third account card |
| `src/family/Requests.tsx`, `Dashboard.tsx`, `Report.tsx`, `Notifications.tsx` | Family UI | Asks section, read-only staff cases, report copy, per-audience notifications |
| `src/elder/Chat.tsx`, `src/ui/EmergencyOverlay.tsx`, `src/ui/Badges.tsx` | Elder UI and badges | Button label, overlay copy, new status class |
| `src/scenarios.test.ts`, `src/copy.test.ts` | Acceptance and copy | §8 suite; staff ban removed |
| `README.md` | Docs | Third account, v3 re-seed note |

---

### Task 0: Repair the test runner

The native binding file is missing: `node_modules/@rolldown/binding-win32-x64-msvc/` holds only `package.json` and `README.md`, and `rolldown-binding.win32-x64-msvc.node` is absent. Vitest then falls back to wasm and fails with `Cannot find module '@rolldown/binding-wasm32-wasi'`.

**Files:** none tracked (only `node_modules`)

- [ ] **Step 1: Reinstall the binding.** Run `npm install --no-save @rolldown/binding-win32-x64-msvc@1.2.14`. If the `.node` file is still missing afterwards, stop and tell the user: antivirus quarantine is the likely cause. Do not continue.
- [ ] **Step 2: Baseline.** Run `npx vitest run`. Expected: all existing suites pass. Record the pass count in `SESSION_STATE.md` under Verification Gates.
- [ ] **Step 3: Baseline lint and types.** Run `npm run lint` and `npx tsc -b`. Expected: clean.

---

### Task 1: State shape, labels, seed, notification audience

**Files:**
- Modify: `src/state/types.ts`, `src/state/labels.ts`, `src/state/helpers.ts`, `src/state/seed.ts`
- Modify (call sites only, behaviour unchanged): `src/state/cases.ts`, `assistant.ts`, `devices.ts`, `reminders.ts`
- Modify: `src/ui/Badges.tsx` (`STATUS_CLASS.await_staff = 'b-attn'`)
- Modify: `src/copy.test.ts`: delete the `STAFF` list and its test. Keep `BANNED`.
- Test: `src/state/core.test.ts`

**Interfaces (Produces):**
- `type Role = 'elder' | 'family' | 'staff'`
- `type Owner = 'staff' | 'family'`
- `type Audience = 'family' | 'staff'`
- `Source` adds `'staff'`
- `RequestStatus` adds `'await_staff'`
- `CaseBase` adds:
  - `owner: Owner`
  - `familyAsk?: { question: string; askedAt: number; reply?: string; repliedAt?: number }`
- `RequestCase` adds:
  - `confirmedAt?`, `verifiedBy?`, `verifiedAt?`, `verifyNote?`, `assignee?`, `partnerReport?`, `partnerReportAt?`
  - all `number` except `verifiedBy`, `verifyNote`, `assignee`, `partnerReport`, which are `string`
- `Notification` adds `to: Audience`
- `State`:
  - `version: 3`
  - adds `staff: { name: string; title: string }` and `carePartners: string[]`
- `Screen` adds `'s-board' | 's-case' | 's-notifications' | 's-report' | 's-profile'`
- `notify(s: State, to: Audience, text: string, category: NotifCategory, source: Source, caseId?: string): State`. `to` is the new **second** parameter. Every existing call passes `'family'` in this task.
- `staffName(s: State): string` returns `s.staff.name`.
- `createEvent` sets `owner: 'staff'`. `startRequest` sets `owner: 'staff'`.
- Labels:
  - `REQUEST_STATUS.await_staff = 'Chờ điều phối'`
  - `SOURCE.staff = 'Nhân viên xác minh'`
  - `PARTNER_PENDING = 'Chờ nhân viên xác nhận'`

- [ ] **Step 1: Update the seed test.** Rename `seed has … no staff` to `seed has staff, care partners and v3 shape`. Assertions:
  - `version === 3`
  - `staff` equals `{ name: 'Anh Nam', title: 'Nhân viên điều phối' }`
  - `carePartners` equals `['Anh Tuấn', 'Chị Hoa']`
  - every case has `owner`
  - every notification has `to`
  - CB-001 is `need_info` with owner `staff`
  - CB-002 is `done` with `assignee: 'Anh Tuấn'`, a `partnerReport`, `partnerReportAt < completedAt`, and `doneBy: 'Anh Nam'`
  - one open device event exists, staff-owned, `to_verify`
- [ ] **Step 2: Update the readAll test.** It now dispatches `{ type: 'notif/readAll', to: 'family' }` and asserts that only `to === 'family'` notifications flip. The action shape is final in Task 7; add `to: Audience` to the action union now.
- [ ] **Step 3: Run.** `npx vitest run src/state/core.test.ts`. Expected: FAIL (new fields missing).
- [ ] **Step 4: Implement** the type, label, helper and seed changes above.
  - Seed CB-002's history uses `by: 'staff'` for verify, assign and confirm, and the history line `Care Partner Anh Tuấn báo: Đã đưa bác đi khám và về nhà.`
  - Add one staff-owned seed event: `Dữ liệu thiết bị vượt ngưỡng` on `bp`, `priority`, created 10 minutes before reset. Its reading stays in the existing week data; the event is illustrative only.
  - Bump `seq` accordingly.
- [ ] **Step 5: Run the whole suite.** `npx vitest run`. Expected: `core.test.ts` passes. Other suites may fail only where they assert the old seed counts; fix those counts in the same files. Behaviour must not change yet.
- [ ] **Step 6: Lint and types.** `npm run lint && npx tsc -b`. Expected: clean.
- [ ] **Step 7: Commit** `feat(state): v3 shape with case owner, staff, care partners and notification audience`.

---

### Task 2: Staff request lifecycle

**Files:**
- Modify: `src/state/cases.ts`, `src/state/reducer.ts`
- Test: `src/state/cases.test.ts`. Replace the `request workflow` describe's family-done tests. Keep the cancel and decline tests.

**Interfaces:**
- Consumes: Task 1 types, `notify(s, to, …)`, `staffName`
- Produces:
  - `SERVICE_JOBS: ServiceType[]`, renamed from `DO_SERVICES`, same four values.
  - `isMedicineReminder(c: RequestCase): boolean`. True when `add_reminder` and `normalize(c.detail + ' ' + (c.fields.noi_dung ?? ''))` has a whole word from `['thuoc', 'vien', 'lieu']`. Import `normalize` from `assistant.ts`. If the import cycles, move `normalize` and `has` to `helpers.ts` and re-export them from `assistant.ts`.
  - `ownerAtConfirm(c: RequestCase): Owner`: `'family'` for `contact_family`, and for `add_reminder` when `!isMedicineReminder(c)`; else `'staff'`.
- New `CaseAction` members:
  - `{ type: 'staff/verify'; id: string; note: string }`
  - `{ type: 'staff/assign'; id: string; partner: string }`
  - `{ type: 'staff/partnerReport'; id: string; note: string }`
  - `{ type: 'staff/complete'; id: string }`
  - `{ type: 'staff/decline'; id: string; reason: string }`
  - `{ type: 'staff/approveReminder'; id: string; time: string }`
  - `{ type: 'staff/contacted'; id: string }`
- Removed: `family/accept`, `family/done`.

**Guards.** Any other combination returns `s` unchanged.

| Action | Allowed when | Effect |
|---|---|---|
| `staff/verify` | `await_staff`, no `verifiedBy` | Set `verifiedBy = staffName`, `verifiedAt`, `verifyNote` (trimmed; may be empty). Log `by: 'staff'` |
| `staff/assign` | `SERVICE_JOBS` service, `await_staff`, `verifiedBy` set, `partner` in `s.carePartners` | → `in_progress`, set `assignee`, `acceptedAt` |
| `staff/partnerReport` | `in_progress`, `assignee` set, no `partnerReport`, note non-blank | Set `partnerReport`, `partnerReportAt` |
| `staff/complete` | `in_progress`, `partnerReport` set | → `done`, `completedAt = now`, `doneBy = staffName`. Notify family `${title}: nhân viên CAREBOX đã xác nhận hoàn tất.` |
| `staff/decline` | reason non-blank; status in `need_info`, `await_confirm`, `await_staff`, `in_progress`; `owner === 'staff'` | → `refused`, `closedReason = reason`. Notify family |
| `staff/approveReminder` | `add_reminder`, `await_staff`, time matches the existing HH:MM regex | Same reminder creation as the family version (reuse it, don't copy), `kind = isMedicineReminder ? 'medicine' : 'activity'`, → `done` |
| `staff/contacted` | `contact_family`, `await_staff` | → `done` |
| `family/approveReminder`, `family/contacted`, `family/decline` | `ownerAtConfirm(c) === 'family'` and status in `await_family` or `await_staff` | Unchanged otherwise. Covers acting after the fallback |

- [ ] **Step 1: Write the failing tests** in `cases.test.ts`, describe `staff request workflow`. Fixture: `withRequest(service, status)` gains an `owner` param, default `'staff'`.
  - `full staff path` (medicine, `await_staff`): verify → assign `Anh Tuấn` → partnerReport `Đã mua thuốc` → complete. Expect `done`, `doneBy 'Anh Nam'`, `assignee 'Anh Tuấn'`, `partnerReportAt <= completedAt`, the last 4 history entries all `by: 'staff'`, and one family notification for the case.
  - `assign requires verify, a known partner and a service job`: assign before verify is a no-op; partner `'Ai đó'` is a no-op; `add_reminder` assign is a no-op.
  - `complete requires a partner report`: complete right after assign is a no-op.
  - `staff/decline needs reason; works from need_info`: blank → no-op; `'Ngoài khu vực phục vụ'` → `refused`.
  - `medicine reminder: staff approves with kind medicine`: `add_reminder`, `fields.noi_dung 'Uống thuốc huyết áp'`, `staff/approveReminder 09:00` → `done`; new reminder kind `medicine`, `daily: true`.
  - `family cannot approve a medicine reminder`: same case, `family/approveReminder` → unchanged.
  - `family can still act after fallback`: `contact_family`, status `await_staff`, owner `staff` → `family/contacted` → `done`.
  - `staff complete after elder cancel is a no-op`: cancel then complete → stays `refused`.
  - `ownerAtConfirm`: contact → family; add_reminder 'Nhắc uống nước' → family; add_reminder 'nhắc uống 2 viên' → staff; groceries → staff.
- [ ] **Step 2: Run.** `npx vitest run src/state/cases.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `cases.ts`: a `staffTransition(s, c, a)` next to `requestTransition`, and dispatch it in `transition`. Update the reducer `Action` union.
- [ ] **Step 4: Run** the same file. Expected: PASS. Delete old tests that assert `family/accept` or `family/done`.
- [ ] **Step 5: Lint, types, full suite.** Expected: clean. `review-fixes` and `scenarios` may still reference removed actions; fix those references here.
- [ ] **Step 6: Commit** `feat(cases): staff verify/assign/partner report/complete lifecycle`.

---

### Task 3: Routing at confirm, family fallback, elder cancel

**Files:**
- Modify: `src/state/assistant.ts` (`confirm`), `src/state/cases.ts` (`request/cancel`, new sweep, `nextOwner`), `src/state/clock.ts`
- Test: `src/state/cases.test.ts`, `src/state/clock.test.ts`

**Interfaces:**
- Consumes: `ownerAtConfirm`, `isMedicineReminder` (Task 2)
- Produces:
  - `FAMILY_FALLBACK_AFTER = 30`
  - `sweepFamilyFallback(s: State): State`
  - `nextOwner(c: Case, s: State): string`, with the strings below

**Behaviour:**
- **`confirm`** sets `confirmedAt = now`, `owner = ownerAtConfirm(c)`, and status `await_staff` (staff) or `await_family` (family).
  - Staff-owned: notify staff `${title}: chờ điều phối`, and family `${title}: đã chuyển nhân viên CAREBOX điều phối.`
  - Family-owned: notify family `${title}: chờ ${familyName} nhận việc` (existing).
  - Elder replies:
    - staff service: `Cháu đã gửi yêu cầu cho nhân viên CAREBOX điều phối. Yêu cầu chưa hoàn tất; bác xem tiến độ ở mục Yêu cầu ạ.`
    - medicine reminder: `Cháu đã gửi nhân viên CAREBOX kiểm tra lịch nhắc thuốc. Lịch chỉ được thêm sau khi được duyệt, yêu cầu chưa hoàn tất ạ.`
    - family-owned: existing copy.
- **`sweepFamilyFallback`**: for each request with `owner 'family'`, `status 'await_family'`, and `now - confirmedAt > 30 MIN`:
  - set `owner 'staff'` and `status 'await_staff'`
  - log `by: 'ai'`: `Gia đình chưa phản hồi sau 30 phút, chuyển nhân viên CAREBOX.`
  - notify staff
- **`request/cancel`**:
  - When `assignee` is set, add the history line `Đã báo hủy cho Care Partner ${assignee}.`
  - When the owner is staff, notify staff. The existing family notification stays.
- **`nextOwner`** strings:

| Case state | String |
|---|---|
| `need_info` | `Người cao tuổi (bổ sung thông tin)` (unchanged) |
| `await_confirm` | `Người cao tuổi (xác nhận)` (unchanged) |
| `await_family` | `${family} (nhận việc)` |
| `await_staff`, family-type (after fallback) | `Nhân viên CAREBOX hoặc ${family}` |
| `await_staff`, `add_reminder` or `contact_family` | `Nhân viên CAREBOX (duyệt / liên hệ)` |
| `await_staff`, unverified | `Nhân viên CAREBOX (xác minh)` |
| `await_staff`, verified | `Nhân viên CAREBOX (phân công)` |
| `in_progress`, no report | `${assignee} (đang thực hiện)` |
| `in_progress`, with report | `Nhân viên CAREBOX (xác nhận kết quả)` |
| event `to_verify` | `Nhân viên CAREBOX (xem và tiếp nhận)` |
| event `handling` | `handler` |
| final | `—` |

- **`tick`** order: `rollover → sweepReminders → sweepFamilyFallback → sweepDevices` (sweepDevices comes in Task 4; add the call there).

- [ ] **Step 1: Write the failing tests.**
  - `confirm routes groceries to staff and notifies both`: run the groceries chat → `await_staff`, owner `staff`, `confirmedAt` set, one `to:'staff'` and one `to:'family'` notification for the case.
  - `confirm keeps contact_family with family`: → `await_family`, owner `family`.
  - `fallback moves an untouched family request after 30 min, once`: family-owned `await_family` with `confirmedAt = now - 31 MIN`. `tick` → `await_staff`, owner `staff`, one staff notification. A second `tick` at the same now → no new notification.
  - `fallback ignores 29 min`.
  - `cancel after assign logs Care Partner cancellation and notifies staff`.
  - `nextOwner table`: one assertion per row above.
- [ ] **Step 2: Run.** `npx vitest run src/state/cases.test.ts src/state/clock.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the behaviour above.
- [ ] **Step 4: Run.** Expected: PASS. Update the old `nextOwner names the daughter` test to the new table.
- [ ] **Step 5: Lint, types, full suite.**
- [ ] **Step 6: Commit** `feat(cases): route confirmed requests by owner; family fallback to staff`.

---

### Task 4: Events go to staff; emergencies notify both; stale-device sweep

**Files:**
- Modify: `src/state/cases.ts` (`raiseEmergency`, `eventTransition`), `src/state/devices.ts`, `src/state/reminders.ts`, `src/state/clock.ts`, `src/state/reducer.ts`
- Test: `src/state/cases.test.ts`, `src/state/devices.test.ts`, `src/state/review-fixes.test.ts`

**Interfaces:**
- New `CaseAction` members:
  - `{ type: 'staff/takeEvent'; id: string }`
  - `{ type: 'staff/resolveEvent'; id: string; note: string }`
  - `{ type: 'case/ack'; id: string; by: Owner }`. `by` is injected by the server in Task 7, never sent by the client.
- Removed: `family/takeEvent`, `family/resolveEvent`.
- Produces:
  - `sweepDevices(s: State): State`
  - `hasOpenMissing(s: State, id: DeviceKind): boolean`: an open event with that `deviceId` whose title starts `Thiết bị mất kết nối` or `Thiếu dữ liệu`

**Behaviour:**
- **`staff/takeEvent`**: `to_verify` → `handling`, `handler = staffName`.
- **`staff/resolveEvent`**: `handling` plus a non-blank note → `resolved`. Clears `s.emergency` when it is that case (moved from the family version).
- **`case/ack`**: only for an `emergency`-priority event in `to_verify`. → `handling`, `handler = by === 'staff' ? staffName : familyName`, log `by`.
- **`raiseEmergency`**:
  - log text: `Hướng dẫn gọi 115; đã thông báo ${family} và nhân viên CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.`
  - notify **staff and family** (two notifications), each ending `Cần xác nhận đã tiếp nhận tình huống.`
- **Device events** (`pushReading` attention/suspicious, `disconnect`, `reportFall` via `raiseEmergency`), **reminder events** (`cant_do`, `no_confirm`), **handoff and problem events** (Task 6): notify staff with the action text, and notify family with the same fact plus `Đã chuyển nhân viên CAREBOX kiểm tra.`. Drop "Cần ${family} …" phrasing from family copy.
- **`disconnect`** creates its event only if `!hasOpenMissing`.
- **`sweepDevices`**: for each device with `connected && deviceStatus(d, now) === 'missing' && !hasOpenMissing`, create an uncertain staff event:
  - title `Thiếu dữ liệu: ${d.name}`
  - detail `Thiết bị chưa gửi dữ liệu mới. Không kết luận người dùng an toàn.`
  - `priorityReason 'Dữ liệu thiết bị bị gián đoạn'`
  - notify both audiences
  - Skip `fall` (it has no readings stream).

- [ ] **Step 1: Write the failing tests.**
  - `emergency notifies family and staff, unacknowledged`: `say('Tôi bị đau ngực quá')` → 2 notifications for the case (`to` family and staff), status `to_verify`, log names both.
  - `case/ack by family sets handler Chị Minh; by staff sets Anh Nam; only for emergencies`: ack on a priority event is a no-op.
  - `only staff resolves; resolve clears emergency`.
  - `push high → staff-owned to_verify, staff and family notified, family text has 'Đã chuyển nhân viên CAREBOX kiểm tra'`.
  - `stale reading creates one missing event across repeated ticks`: set the bp last reading to `now - (STALE_AFTER + 1) MIN`, `tick` twice → exactly one `Thiếu dữ liệu: Máy đo huyết áp` event.
  - `disconnect while a stale event is open creates no second missing event`.
  - `cant_do on a medicine reminder → staff-owned priority event`.
  - Update `review-fixes` emergency tests to `case/ack` and `staff/resolveEvent`.
- [ ] **Step 2: Run.** `npx vitest run src/state`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `sweepDevices` to `tick` after `sweepFamilyFallback`. Make `changed` also compare `notifications`, so sweeps persist.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Lint, types, full suite.**
- [ ] **Step 6: Commit** `feat(events): staff owns alerts; emergencies notify both; stale-device sweep`.

---

### Task 5: Staff asks family for help

**Files:**
- Modify: `src/state/cases.ts`, `src/state/reducer.ts`
- Test: `src/state/cases.test.ts`

**Interfaces:**
- `{ type: 'staff/askFamily'; id: string; question: string }`
- `{ type: 'family/reply'; id: string; text: string }`
- Produces `familyView(s: State): { asks: Case[]; mine: RequestCase[]; others: Case[] }`:
  - `asks`: open cases with `familyAsk` and no `reply`
  - `mine`: open family-actionable requests, i.e. `ownerAtConfirm === 'family'` and status `await_family` or `await_staff`
  - `others`: every other open case
  - Each list is sorted as the old `familyQueue` sorted. `familyView` replaces `familyQueue`.
- Produces `familyTodo(s: State): number` = `asks.length` + `mine.length` + unacknowledged emergencies. Used by the tab badge and the Dashboard.

**Behaviour:**
- **`staff/askFamily`**: case open, `owner 'staff'`, question non-blank, and no unanswered ask. Set `familyAsk`, log `by: 'staff'`, notify family `CAREBOX nhờ hỗ trợ (${id}): ${question}`.
- **`family/reply`**: case open, ask unanswered, text non-blank. Set `reply`, `repliedAt`, log `by: 'family'`, notify staff.

- [ ] **Step 1: Write the failing tests.**
  - `ask then reply round-trip`: ask on the CB-001 seed → family notification. Reply → staff notification, history `by: 'family'`.
  - `second ask blocked until replied; allowed after`.
  - `reply on a resolved case is a no-op`: Review Focus 2.
  - `familyView splits asks / mine / others`.
  - `familyTodo counts asks, mine and unacked emergencies`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Delete the old `familyQueue` tests and replace them with the `familyView` sort assertions.
- [ ] **Step 5: Lint, types, full suite.**
- [ ] **Step 6: Commit** `feat(cases): staff can ask the family for help`.

---

### Task 6: Assistant: handoff to staff, keywords, refusal

**Files:**
- Modify: `src/state/assistant.ts`, `src/state/reducer.ts` (`chat/handoff` elder line `Gặp nhân viên`)
- Test: `src/state/assistant.test.ts`, `src/state/review-fixes.test.ts`

**Behaviour:**
- **`handoff`** creates a staff-owned uncertain event:
  - title `AI chưa hiểu yêu cầu`
  - detail `Cần nhân viên CAREBOX gọi lại cho bác.`
  - `priorityReason`: `AI không hiểu sau khi hỏi lại` or `Người dùng chọn gặp nhân viên`
  - With no misses, `unclear` is `['Người cao tuổi chọn gặp nhân viên']`.
  - Notifies staff, and family `${id}: AI chưa hiểu yêu cầu của bác, đã chuyển nhân viên CAREBOX.`
  - Elder reply: `Cháu đã chuyển cho nhân viên CAREBOX và báo ${family}. Nhân viên sẽ liên hệ lại với bác ạ.`
- **`miss`** suffix: `Hoặc bác bấm “Gặp nhân viên”.`
- **Problem intent**: staff-owned priority event. Notify staff and family. Elder reply: `Cháu đã ghi nhận và báo nhân viên CAREBOX, ${family}. Nếu bác khó thở hay đau ngực, bác nói ngay để cháu hướng dẫn gọi 115 nhé.`
- **Medical decision**: staff-owned normal event, notify staff and family. Elder reply: `Cháu không thể thay đổi thuốc hay liều. Bác hỏi bác sĩ hoặc dược sĩ nhé; cháu đã báo nhân viên CAREBOX.`
- **Keywords**, added to `KW`:
  - `emergency`: `mat y thuc`, `yeu nua nguoi`, `noi ngong`, `noi kho`, `kho noi`
  - `medical_decision`: `ngung thuoc`, `dung thuoc`, `ke don`, plus the regex `/\buong them (\d+|mot|hai|ba) vien\b/` checked on the normalised text
  - `groceries`: `gao`, `do an`, `mua giup`
- **First-question refusal**: in `collect`, when `Object.keys(c.fields).length === 0 && c.unclear.length === 0` and the normalised text is `khong`, or starts with `khong ` followed only by `muon`, `phai`, `can`, `a`, `dau`, treat it as a refusal.

- [ ] **Step 1: Write the failing tests.**
  - `first-question "Không" refuses`: startService medicine, say `Không` → `refused`, no `thuoc` field.
  - `later "Không" is a field answer`: clinic flow, answer `noi_kham`, `thoi_gian`, then `Không, bác tự đi được` → `fields.di_lai === 'Không, bác tự đi được'`, status `await_confirm`.
  - `doc Mức 3 examples are emergencies`: each of `mất ý thức`, `yếu nửa người`, `nói ngọng`, `khó thở` → `classify(...).intent === 'emergency'`.
  - `dose paraphrases are medical decisions; generic ones are not`: `uống thêm 2 viên` and `ngừng thuốc huyết áp` → medical_decision. `uống thêm nước` and `ngã tư Sở` → not medical_decision and not emergency.
  - `Mua giúp bác ít gạo starts groceries`.
  - `handoff goes to staff and tells family`: owner staff, 2 notifications, elder reply contains `nhân viên CAREBOX`.
  - Replace `handoff copy names Chị Minh and never staff` with `handoff copy names staff and Chị Minh`.
- [ ] **Step 2: Run.** `npx vitest run src/state/assistant.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Lint, types, full suite.**
- [ ] **Step 6: Commit** `feat(assistant): hand off to staff; doc emergency/dose keywords; first-question refusal`.

---

### Task 7: Server: staff account, permissions, injected role, v3, Gemma statuses

**Files:**
- Modify: `server/auth.ts`, `server/api.ts`, `server/ai.ts`
- Test: `server/api.test.ts`, `server/ai.test.ts`

**Interfaces:**
- `ACCOUNTS['nhan.vien'] = { role: 'staff', name: 'Anh Nam' }`
- `ROLE_ACTIONS`:
  - `elder`: unchanged
  - `family`: `reset`, `notif/readAll`, `family/decline`, `family/approveReminder`, `family/contacted`, `family/reply`, `case/ack`
  - `staff`: `reset`, `notif/readAll`, `case/ack`, `staff/verify`, `staff/assign`, `staff/partnerReport`, `staff/complete`, `staff/decline`, `staff/approveReminder`, `staff/contacted`, `staff/takeEvent`, `staff/resolveEvent`, `staff/askFamily`
- `FIELDS` gets an entry for every new type:
  - `note`, `reason`, `question`, `text` → `'text'`
  - `partner`, `time` → `'text'`
  - `id` → `'id'`
  - `case/ack` and `notif/readAll` list no client fields.
- `parseAction(body, role)` injects:
  - `by: role` for `case/ack` (role is `'family' | 'staff'` there)
  - `to: role` for `notif/readAll`
- `isState` requires `version === 3`.
- `AIReply = { text: string; kind: 'answered' | 'unclear' | 'service' | 'emergency'; service?: ServiceType }`. This replaces `unclear: boolean`.
- `SYSTEM` prompt:
  - "Nhờ con giúp" becomes "Gặp nhân viên".
  - Add the two JSON shapes: `{"status":"service","service":"medicine|groceries|clinic|daily_help|contact_family|add_reminder","reply":"…"}` and `{"status":"emergency","reply":"…"}`.
  - Add rules: `service` only when the elder clearly asks CAREBOX to do one of those services; `emergency` for any sign of urgent danger.
- `generateReply` validates `service` against `Object.keys(SERVICE)`. An invalid value means `answered`.
- `apply()` in `api.ts`:
  - `service` → `startService`, but keep the elder turn already saved. Add an `alreadyRecorded` path: `startService(s, service, alreadyRecorded = true)` skips `sayElder`. Detail is the elder text.
  - `emergency` → `raiseEmergency` plus the existing AI 115 reply.
  - `unclear` / `answered`: unchanged.

- [ ] **Step 1: Write the failing tests** in `api.test.ts`. Add `staff = await tokenFor('nhan.vien')`.
  - `staff login returns role staff`.
  - `family cannot send staff/complete; staff cannot send chat/say or family/reply → 403, rev unchanged`.
  - `every action type belongs to a role; reset, notif/readAll and case/ack are the only shared ones`: replaces the old "only reset is shared" test.
  - `case/ack via API records who acked`: elder says `đau ngực`; staff posts `{type:'case/ack', id}` → handler `Anh Nam`. A client-sent `by:'family'` from the staff token is ignored.
  - `notif/readAll is per audience`: family readAll leaves staff notifications unread.
  - `stored version:2 state is replaced by a fresh v3 seed` (Review Focus 4). Update the existing version:1 test the same way.
  - `Gemma service status starts the request flow`: mock `{text:'…', kind:'service', service:'groceries'}` for `Mua cho bác ít gạo nếp` → a groceries request in `need_info`; the last AI message is the first field question; exactly one elder message with that text.
  - `Gemma emergency status raises the emergency`: `state.emergency` set, 2 notifications.
  - Update the existing Gemma tests from `unclear:true/false` to `kind`.
  - `ai.test.ts`: the parser maps each status; an unknown service maps to `answered`.
- [ ] **Step 2: Run.** `npx vitest run server`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Lint, types, full suite.**
- [ ] **Step 6: Commit** `feat(server): staff role permissions, injected role fields, v3 state, Gemma service/emergency`.

---

### Task 8: Staff UI

**Files:**
- Create: `src/staff/Board.tsx`, `src/staff/CaseDetail.tsx`
- Modify:
  - `src/App.tsx`: staff branch, tabs, brand `CAREBOX Operations`, emergency banner shown for family **and** staff
  - `src/Login.tsx`: third card `{ user: 'nhan.vien', icon: '🧑‍💼', name: 'Anh Nam', role: 'Nhân viên điều phối' }`
  - `src/state/store.tsx`: initial screen `s-board` for staff
  - `src/family/Notifications.tsx`: filter `n.to === audience`, where audience is `session.role`; dispatch `notif/readAll` with no `to`
  - `src/index.css`: only if a new class is needed; reuse `card`, `tiles`, `badge`, `timeline`, `fields`, `action-row`
- Test: none (UI). Verified by lint, types and a manual run.

**Interfaces:**
- Consumes:
  - `staffBoard(s: State): { counters: { verify: number; waiting: number; doing: number }; cases: Case[] }`. Add it to `cases.ts` in this task, with a unit test `staffBoard counters follow the spec definitions`. Counter definitions are in the spec, "Staff UI". Order: staff-owned first, then by `effectivePriority` rank, then oldest.
  - `nextOwner`, `effectivePriority`, `SourceTag`, `PriorityBadge`, `StatusBadge`, `SERVICE_FIELDS`.
- Navigation: a board card dispatches `{ type: 'nav', screen: 's-case', caseId }`. CaseDetail reads `view.caseId` and has a `‹ Bảng điều phối` back button.
- Staff tabs:
  - `s-board` Bảng điều phối 🗂️ (badge = `counters.verify`)
  - `s-notifications` Thông báo 🔔 (badge = unread staff notifications)
  - `s-report` Báo cáo 📄 (renders `Report`)
  - `s-profile` Hồ sơ & thiết bị 👵 (renders `Profile`)
  - `s-case` is reachable but has no tab.

**CaseDetail layout:**
- The 10 sections listed in the spec, "Chi tiết". Verified info shows `verifiedBy`, `verifiedAt` and `verifyNote` once present, else `Chưa xác minh`.
- `PARTNER_PENDING` badge when `partnerReport && status === 'in_progress'`.
- Action panel, showing only the actions whose Task 2/4/5 guards pass:
  - Xác minh (optional note)
  - Phân công (select from `state.carePartners`)
  - Ghi nhận báo cáo (required note)
  - Xác nhận hoàn tất
  - Duyệt lịch nhắc (time input)
  - Đã liên hệ
  - Từ chối (required reason)
  - Tôi xem việc này
  - Tôi đã tiếp nhận (emergency)
  - Đã xử lý (required note)
  - Nhờ gia đình hỗ trợ (question; shows the last ask and reply)
- To avoid copying guard logic, export a predicate per action from `cases.ts`: `can(s: State, a: CaseAction): boolean`, implemented as `transition(s, a) !== s`. Buttons disable on `!can`.
- Device events show the Mockup 4 next-steps list as static text.

- [ ] **Step 1: Write the `staffBoard` unit test.** Expected seed counters: `verify: 1` (the seed device event; CB-001 is `need_info`, so it is not counted), `waiting: 0`, `doing: 0`. Add an `await_staff` unverified request → `verify: 2`. Verify it → `verify: 1`, `waiting: 1`.
- [ ] **Step 2: Run it.** Expected: FAIL. Implement `staffBoard` and `can`. Run again. Expected: PASS.
- [ ] **Step 3: Build** Board, CaseDetail, App/Login/store/Notifications wiring.
- [ ] **Step 4: Lint and types.** Expected: clean.
- [ ] **Step 5: Manual check.** `npm run dev`. Log in as `nhan.vien` in one tab and `ba.lan` in another. Run the groceries chat → the board shows it under Cần xác minh → verify → assign Anh Tuấn → report → complete. The elder's Requests screen shows Hoàn tất with staff as confirmer. Check at 360 px width: no horizontal scroll.
- [ ] **Step 6: Commit** `feat(staff-ui): operations board and case detail`.

---

### Task 9: Family and elder UI updates

**Files:**
- Modify:
  - `src/family/Requests.tsx`: sections from `familyView`:
    - `CAREBOX nhờ hỗ trợ`: asks, with question, reply input and `Gửi trả lời`
    - `Việc của chị`: `mine`, with existing actions minus accept/done
    - `Đang được CAREBOX xử lý`: `others`, read-only with `Phụ trách: ${nextOwner}`; emergencies still show `Tôi đã tiếp nhận` (`case/ack`)
  - `src/App.tsx`: family tab badge = `familyTodo(state)`
  - `src/family/Dashboard.tsx`: "Cần chị xử lý" card uses `familyTodo`
  - `src/family/Report.tsx`, service section:
    - Staff-completed (`assignee` set): `Kết quả thực hiện: Đã hoàn tất theo báo cáo của Care Partner ${assignee}.`, `Người xác nhận: ${doneBy} (nhân viên điều phối)`, `Thời điểm hoàn tất: ${partnerReportAt}`, `Thời điểm xác nhận: ${completedAt}`
    - Otherwise: existing copy
    - Footer sentence names "xác minh của nhân viên"
  - `src/elder/Chat.tsx`: button label `Gặp nhân viên`
  - `src/elder/Requests.tsx`: `done` note line shows `partnerReport` when present
  - `src/ui/EmergencyOverlay.tsx`: note `Đã thông báo ${family} và nhân viên CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận.` The ack line is unchanged.
- Test: none (UI). Verified by lint, types and a manual run.

- [ ] **Step 1: Implement** the changes above.
- [ ] **Step 2: Lint and types.** Expected: clean.
- [ ] **Step 3: Manual check.** Use three tabs (elder, family, staff).
  - Elder says `abc xyz` twice → staff board shows `AI chưa hiểu yêu cầu`; family sees it read-only under `Đang được CAREBOX xử lý`.
  - Staff asks the family → the family badge increments → family replies → staff detail shows the reply.
  - Elder says `đau ngực` → red bar on family **and** staff. Family acks → bar wording changes on both; the elder overlay shows `Chị Minh đã nhận được…`. Only staff can close it.
- [ ] **Step 4: Commit** `feat(family-ui): CAREBOX asks, read-only staff cases, staff-confirmed report`.

---

### Task 10: Doc §8 acceptance suite and docs

**Files:**
- Modify: `src/scenarios.test.ts`. Rewrite it to the spec table "Doc §8 scenarios".
- Modify: `README.md`: third account, staff flow summary, "state version 3: stored v2 data is re-seeded once after deploy".
- Modify: `SESSION_STATE.md` gates.

- [ ] **Step 1: Write the suite.** One `describe('doc §8 scenarios')`, one `test` per row, with each paraphrase as its own `test.each` case:

| # | Asserts |
|---|---|
| 1 | Groceries and both paraphrases → request `await_staff`, owner `staff`, one staff and one family notification. No `done` besides the seeded CB-002 |
| 2 | Medicine reminder `due` and unchanged. `Nhắc bác uống thuốc huyết áp lúc 9h` through confirm → `add_reminder` owner `staff`, reminders unchanged |
| 3 | `Thôi`, `Không cần` and a first-question `Không` → `refused`, no field equals `Không`, no new request. Assigned-then-cancelled → staff notified, history mentions Care Partner |
| 4 | Push high → staff-owned `to_verify`, detail contains `Chưa có kết luận y tế`, both audiences notified |
| 5 | Disconnect, and stale → one uncertain staff event per device across two ticks. No notification says `an toàn` without `Không kết luận` |
| 6 | Keyword path (two misses) and `chat/handoff` → one uncertain staff event, `unclear` has the utterances, family notified, no request. (Gemma path covered in `api.test.ts`) |
| 7 | Each Mức 3 phrase → `state.emergency` set after one action, event `to_verify`, notifications to both audiences |
| 8 | Each dose paraphrase → AI reply contains `bác sĩ`, staff-owned event, reminders deep-equal. `uống thêm nước` → no medical event |

- [ ] **Step 2: Run.** `npx vitest run src/scenarios.test.ts`. Expected: PASS. If a row fails, fix the owning task's code, not the test.
- [ ] **Step 3: Full verification.** `npm run lint && npx tsc -b && npx vitest run`. Paste the raw output into `SESSION_STATE.md` Verification Gates and tick them.
- [ ] **Step 4: Update the README.**
- [ ] **Step 5: Commit** `test: doc §8 acceptance suite for staff routing; docs`.

---

## Self-review notes

- **Spec coverage.** Every spec section maps to a task:
  - roles: Tasks 1, 7, 8
  - routing table: Tasks 2, 3, 4, 6
  - request lifecycle: Task 2
  - events and emergencies: Task 4
  - asks: Task 5
  - notification audience: Tasks 1, 7, 8
  - sources: Task 1
  - elder changes: Tasks 6, 9
  - family changes: Task 9
  - staff UI: Task 8
  - §8 table: Task 10
  - classifier: Task 6
  - Gemma net: Task 7
  - v3: Tasks 1, 7
  - test runner: Task 0
- **Types.** `notify(s, to, …)`, `Owner`, `Audience`, `ownerAtConfirm`, `familyView`, `familyTodo`, `staffBoard`, `can`, `sweepFamilyFallback`, `sweepDevices` and `hasOpenMissing` are named identically everywhere.
- **Not built** (spec non-goals): Cần can thiệp, event→request conversion, KPIs, consent toggle, Care Partner login, multi-staff.
