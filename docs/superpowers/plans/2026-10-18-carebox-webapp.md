# CAREBOX Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-browser CAREBOX demo into a responsive two-role web app (Bà Lan + her daughter). Each role logs in on its own device, and both share live state through a tiny Vercel backend.

**Architecture:**
- The pure reducer in `src/state` stays the single source of rules.
- It runs **on the server** inside one `handle(req: Request)` web handler (`server/api.ts`).
  - On Vercel, three thin `api/*.ts` functions expose it.
  - In `npm run dev`, a Vite dev middleware exposes it.
- State is one JSON record, kept in Upstash Redis when its env vars exist and in memory otherwise.
- Clients only ever POST actions and poll `GET /api/state` (~3 s). Per-device UI state (screen, dismissed overlay, session) stays in the client.
- The layout is a CSS-only responsive shell: bottom tabs under 900 px, a left sidebar at 900 px and up.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Vercel Functions (Web `Request`/`Response` signature), `@upstash/redis`.

**Spec:** `docs/superpowers/specs/2026-10-18-carebox-webapp-design.md`. The older `docs/superpowers/specs/2026-10-18-carebox-demo-design.md` still holds wherever the new spec does not contradict it.

## Global Constraints

- **Accounts and login:**
  - Exactly two accounts: `ba.lan` (role `elder`, "Bà Nguyễn Thị Lan") and `con.gai` (role `family`, "Chị Minh", relation "Con gái").
  - The password for both is `carebox`, and the login screen shows it.
- **Dependencies:** the only new runtime dependency is `@upstash/redis`. No router, no UI kit, no realtime service.
- **Time:** all clock math and formatting use Vietnam time, a fixed UTC+7 (`Asia/Ho_Chi_Minh` has no DST). Never use the browser's or the server's local timezone.
- **Copy:**
  - UI copy is Vietnamese.
  - "Dữ liệu minh họa" stays visible in the top bar.
  - Never write "khỏe mạnh", "Ổn định", "Đã hoàn thành" or "Không có dấu hiệu bất thường". `src/copy.test.ts` enforces this.
- **No staff anywhere:** no "Care Partner", "nhân viên điều phối", "Gặp nhân viên" or "Chờ điều phối" in non-test source.
- **Status labels (exact):**
  - Requests: `need_info` "Chờ bổ sung thông tin", `await_confirm` "Chờ xác nhận", `await_family` "Chờ gia đình nhận", `in_progress` "Đang xử lý", `done` "Hoàn tất", `refused` "Đã từ chối".
  - Events: `to_verify` "Cần xem", `handling` "Đang xử lý", `resolved` "Đã xử lý".
  - Sources: `device` "Thiết bị (giả lập)", `elder` "Người cao tuổi báo", `family` "Gia đình xác nhận", `ai` "AI tổng hợp".
- **Hoàn tất** is reachable only through a family action. Clients never send whole states.
- **Elder screens:** keep large type and tap targets at least 48 px at every width.
- **Layout:** no horizontal scroll at 360 px. Breakpoint at `900px`.
- **Polling:** every 3000 ms, paused while `document.hidden`.
- **Abandoned requests:** the 30-minute rule (`ABANDONED_AFTER = 30`) is kept.
- **Commits:** end each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Two devices act within the same polling window.** Both actions must survive, because each POST loads the latest stored state before reducing. Test: interleaved elder and family handler calls in Task 3.
2. **A poll response that left before an action returns arrives after it.** The UI must not jump back. Test: `pickNewer` uses `rev` (Task 4).
3. **Expired, tampered, or garbage token** (e.g. after `SESSION_SECRET` changes). The API returns 401, and the client drops the session and shows Login instead of a blank screen. Test in Task 3.
4. **Malformed action body.** Cases: missing `id`, non-string `text`, unknown `type`, 5 kB chat text. The API returns 400 and the stored state is unchanged; it never throws a 500. Test in Task 3.
5. **Redis still holds the old `version: 1` shape after the deploy.** The server re-seeds instead of crashing. Test in Task 3.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/state/types.ts` | State model, with staff and ops removed and `rev`, `day` and `daily` added |
| `src/state/labels.ts` | Vietnamese labels (new statuses and sources) |
| `src/state/helpers.ts` | Vietnam-time helpers; `notify` without audience |
| `src/state/cases.ts` | Family-driven request and event lifecycle |
| `src/state/assistant.ts`, `reminders.ts`, `devices.ts` | Copy changed from staff to daughter; new `notify` signature |
| `src/state/clock.ts` (new) | `rollover`, `tick` |
| `src/state/seed.ts` | `seed(now: number)`, timed relative to the reset moment |
| `src/state/reducer.ts` | Server actions only (no nav, no clock) |
| `server/auth.ts` (new) | Accounts, password check, HMAC token sign and verify |
| `server/storage.ts` (new) | `loadState`/`saveState`: Redis or in-memory |
| `server/api.ts` (new) | `handle(req)`: routing, auth, permissions, validation, tick, rev |
| `api/login.ts`, `api/state.ts`, `api/action.ts` (new) | Vercel entry points, one line each |
| `vite.config.ts` | Dev middleware that serves `/api/*` through `server/api.ts` |
| `src/api.ts` (new) | Client fetch wrappers, `Session` type |
| `src/state/store.tsx` | Session-aware provider: polling, `rev` guard, local nav and overlay-dismiss |
| `src/Login.tsx` (new) | Account cards and password |
| `src/App.tsx`, `src/ui/TabBar.tsx`, `src/index.css` | Responsive shell (top bar + nav that becomes a sidebar) |
| `src/family/Requests.tsx` (new) | "Yêu cầu của mẹ": family actions on requests and events |
| `src/elder/Health.tsx` | "Thiết bị giả lập" section |
| Delete | `src/ops/*`, `src/ui/PhoneFrame.tsx`, `src/ui/ScenarioPanel.tsx`, `src/scenarios.ts` |

---

### Task 1: State model without staff — the family drives the lifecycle

**Files:**
- Modify: `src/state/types.ts`, `labels.ts`, `helpers.ts`, `cases.ts`, `assistant.ts`, `reminders.ts`, `devices.ts`, `reducer.ts`, `seed.ts`
- Test: `src/state/cases.test.ts`, `review-fixes.test.ts`, `assistant.test.ts`, `reminders.test.ts`, `devices.test.ts`, `core.test.ts`, `src/scenarios.test.ts`, `src/copy.test.ts`
- Delete: `src/scenarios.ts`. Move its action lists inline into `src/scenarios.test.ts`.

Note: `npm run build` stays red until Task 4. Only `npm test` gates Tasks 1–3.

**Interfaces:**
- Produces, in `types.ts`:
  - `Role = 'elder' | 'family'`
  - `Source = 'device' | 'elder' | 'family' | 'ai'`
  - `RequestStatus = 'need_info' | 'await_confirm' | 'await_family' | 'in_progress' | 'done' | 'refused'`
  - `RequestCase`: drop `verifiedBy`, `assignee`, `cpReport` and `familyRespondedAt`. Add `acceptedAt?: number`, `doneNote?: string` and `doneBy?: string`.
  - `Notification`: drop `audience`.
  - `State`: drop `view`, `staff` and `partners`; set `version: 2`.
  - `Screen` keeps its elder ids, adds family ids `'f-dashboard' | 'f-requests' | 'f-notifications' | 'f-profile' | 'f-report'`, and drops the ops ids.
- Produces, in `helpers.ts`: `notify(s, text, category, source, caseId?)`, with no audience parameter.
- Produces, in `cases.ts`, the `CaseAction` union:
  - `request/cancel {id}`
  - `family/accept {id}`
  - `family/done {id, note}`
  - `family/decline {id, reason}`
  - `family/approveReminder {id, time}`
  - `family/contacted {id}`
  - `family/takeEvent {id}`
  - `family/resolveEvent {id, note}`
  - `emergency/call115`
- Also in `cases.ts`: `effectivePriority(c, now)` and `nextOwner(c, s)` keep their signatures.
- Produces, in `reducer.ts`: `Action` = `reset`, `reminder/respond`, `device/push|disconnect|reconnect|fall`, `chat/say|startService|handoff|clear`, `notif/readAll` (no payload), plus `CaseAction`.
  - Removed: `nav`, `clock/*`, `emergency/dismiss`, every `ops/*`, and `family/responded`.

- [ ] **Step 1: Rewrite the lifecycle tests first** in `cases.test.ts` and `review-fixes.test.ts`. Replace `ops/*` paths with family paths, and drop `clock/advance` by setting `now` directly. The tests must assert:

```ts
test('full family path: await_family → accept → done with note', () => {
  const s = run(withRequest('medicine'), { type: 'family/accept', id: 'CB-010' }, { type: 'family/done', id: 'CB-010', note: 'Đã mua thuốc' })
  expect(req(s, 'CB-010')).toMatchObject({ status: 'done', doneNote: 'Đã mua thuốc', doneBy: 'Chị Minh' })
  expect(req(s, 'CB-010').history.at(-1)!.by).toBe('family')
})
test('family cannot act on need_info / await_confirm', () => { /* accept, decline, done → state unchanged (toBe same ref) */ })
test('done only from in_progress; decline needs non-blank reason', ...)
test('approveReminder adds a daily reminder at HH:MM and completes add_reminder', () => {
  // reminder { id: 'r-CB-010', daily: true }, dueAt = today 18:30 VN; rejects 'abc'
})
test('contacted completes contact_family from await_family without accept', ...)
test('takeEvent sets handler = family name; resolveEvent needs note and clears s.emergency for that case', ...)
test('abandoned: unaccepted request older than 30 min in need_info/await_confirm/await_family → priority "Bỏ ngỏ…"', ...)
test('nextOwner names the daughter: await_family → "Chị Minh (nhận việc)", to_verify → "Chị Minh (xem và tiếp nhận)"', ...)
```

- [ ] **Step 2: Update the remaining tests to the new names.**
  - `notify` has no audience, and `n.audience` filters are gone.
  - The suspicious-reading notification now reaches the family; before, it was ops-only.
  - The chat handoff copy contains "Chị Minh" and never "nhân viên".
  - `scenarios.test.ts` inlines its action lists and expects `await_family` where it used to expect `await_dispatch`.
  - In `copy.test.ts`, add a second test: non-test files under `src/` and `server/` contain none of `['Care Partner', 'nhân viên điều phối', 'Gặp nhân viên', 'Chờ điều phối']`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL. Typical errors: unknown action types, `await_family` missing, banned staff copy found.

- [ ] **Step 4: Implement the model changes** in the files listed above.
  - **Who acts:** use `s.family[0].name` wherever a family member acts (`doneBy`, `handler`) and in `nextOwner` copy. History entries use `by: 'family'`.
  - **Elder confirmation:** `confirm()` in `assistant.ts` moves a request to `await_family`. It notifies "`${title}`: chờ Chị Minh nhận việc", and the AI says the request has been sent to Chị Minh and is not done yet.
  - **Handoff:** creates a `to_verify` event and replies "Cháu đã báo Chị Minh gọi lại cho bác ạ." The miss re-ask ends with `Hoặc bác bấm “Nhờ con giúp”.`
  - **Emergency:** the emergency message and the notify text mention the daughter, not staff. The rule "thông báo tự động chưa có nghĩa là đã có người tiếp nhận" stays.
  - **`family/approveReminder`:** reuses the old `at()` helper, which Task 2 replaces with the Vietnam-time `atVN`. It adds `{ daily: true }`.
  - **Removed code:** `CP_SERVICES` gates `family/done` (`medicine`, `groceries`, `clinic`, `daily_help`); `convertEvent`, flag/unflag and partners are deleted.
  - **`reset`:** temporarily keeps `seed(new Date(s.now))`. Task 2 changes it.
  - **`Reminder`:** gets `daily?: boolean`. Seeded reminders are `daily: true`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add -A src/state src/scenarios.test.ts src/copy.test.ts && git rm src/scenarios.ts
git commit -m "feat(state): family replaces staff in request and event lifecycle"
```

---

### Task 2: Real Vietnam time — helpers, seed relative to reset, daily rollover

**Files:**
- Modify: `src/state/helpers.ts`, `src/state/seed.ts`, `src/state/reducer.ts`, `src/state/types.ts`, `src/state/cases.ts` (approveReminder)
- Create: `src/state/clock.ts`
- Test: `src/state/clock.test.ts` (new), `src/state/core.test.ts`

**Interfaces:**
- Consumes: Task 1 `State`, `Reminder.daily`, and `sweepReminders(s)` from `reminders.ts`.
- Produces, in `helpers.ts`:
  - `VN_OFFSET = 7 * 60 * MIN`
  - `vnDay(ms): string`, which returns `'YYYY-MM-DD'`
  - `atVN(ms, hhmm: string, dayOffset = 0): number`
  - `fmtTime(ms)` and `fmtDate(ms)`, which now format in Vietnam time
  - `fmtDayMonth(ms): string`, which returns `'18/10'`
- Produces, in `types.ts`: `State` gains `day: string` (the Vietnam date the schedule belongs to) and `rev: number`. `rev` starts at `0`, and Task 3 increments it on every save.
- Produces, in `seed.ts`: `seed(now: number): State`.
- Produces, in `clock.ts`:
  - `rollover(s: State, now: number): State`
  - `tick(s: State, now: number): { state: State; changed: boolean }`

- [ ] **Step 1: Write the failing tests** in `clock.test.ts`:

```ts
const NOW = Date.UTC(2026, 9, 18, 8, 0)            // 15:00 in Vietnam
test('fmtTime/vnDay use UTC+7 regardless of host TZ', () => {
  expect(fmtTime(Date.UTC(2026, 9, 18, 1, 30))).toBe('08:30')
  expect(vnDay(Date.UTC(2026, 9, 18, 18, 0))).toBe('2026-10-19')
})
test('seed at 15:00: past reminders are received, no burst of alerts', () => {
  const s = seed(NOW)
  expect(s.reminders.filter((r) => r.dueAt < NOW).every((r) => r.response === 'received')).toBe(true)
  expect(tick(s, NOW).state.cases.filter((c) => c.kind === 'event')).toHaveLength(0)
})
test('seed adds one one-off reminder ~3 min after reset', () => {
  const extra = seed(NOW).reminders.filter((r) => !r.daily)
  expect(extra).toHaveLength(1); expect(extra[0].dueAt - NOW).toBe(3 * MIN)
})
test('seed cases read as recent: CB-001 created 20 min ago, CB-002 done yesterday by Chị Minh', ...)
test('rollover next day: daily reminders move to the new date with responses/snooze/escalation cleared; one-offs dropped; cases/notifications/chat untouched', ...)
test('tick: same day and nothing due → changed false; reminder past 30 min → changed true and one uncertain event', ...)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/state/clock.test.ts`
Expected: FAIL (`./clock` does not exist; `vnDay` is not exported).

- [ ] **Step 3: Implement**
  - **Vietnam time:** shift by `VN_OFFSET` and read `getUTC*` fields. Add the comment `// ponytail: fixed UTC+7, Vietnam has no DST`.
  - **Replace local-time use:** substitute every local-time `new Date(...).getX()` in `seed.ts` and `cases.ts` with `atVN`/`vnDay`.
  - **Seed timing:**
    - The 7-day device history ends 1 hour before `now`.
    - CB-001 is `need_info`, created `now − 20 min`.
    - CB-002 is `done`, created `now − 2 days` and completed `now − 1 day`, with `doneBy` "Chị Minh" and `doneNote` "Đã đưa mẹ đi khám và về nhà.".
    - Notification times follow the case times.
  - **`tick`:** sets `now`, then applies `rollover` and then `sweepReminders`. `changed` means `day` changed, the `reminders` reference changed, or the `cases` reference changed.
  - **Reducer:** `reset` now calls `seed(s.now)`.
  - **Test helpers:** change every `s0 = () => seed(new Date(2026, 9, 18, 12, 0))` in the test files to `seed(Date.UTC(2026, 9, 18, 5, 0))` (12:00 Vietnam time). Assertions that relied on seeded unanswered past reminders now use `seed` at 07:00 Vietnam time.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 5: Commit**

```bash
git add src/state && git commit -m "feat(state): real Vietnam time, reset-relative seed, daily rollover"
```

---

### Task 3: Backend — auth, storage, one handler, Vercel and Vite wiring

**Files:**
- Create: `server/auth.ts`, `server/storage.ts`, `server/api.ts`, `api/login.ts`, `api/state.ts`, `api/action.ts`
- Modify: `vite.config.ts`, `tsconfig.app.json` (`include: ["src", "server", "api"]`), `package.json` (`npm i @upstash/redis`)
- Test: `server/api.test.ts`

**Interfaces:**
- Consumes: `reduce`, `Action`, `seed`, `tick`, `State` from `src/state`.
- Produces, in `server/auth.ts`:
  - `ACCOUNTS: Record<'ba.lan' | 'con.gai', { role: Role; name: string }>`
  - `PASSWORD = 'carebox'`
  - `signToken(user: string): string`
  - `verifyToken(token: string | null): { user: string; role: Role; name: string } | null`
  - It uses an HMAC-SHA256 over `user` from `node:crypto`, with key `process.env.SESSION_SECRET ?? 'carebox-dev-secret'`. Add a `ponytail:` comment that the dev default is demo-only.
- Produces, in `server/storage.ts`:
  - `loadState(): Promise<unknown>`
  - `saveState(s: State): Promise<void>`
  - `resetMemory(): void` (tests only)
  - Redis is used when `UPSTASH_REDIS_REST_URL ?? KV_REST_API_URL` and the matching token are set. The key is `carebox:state`. Otherwise the state lives in a module-level variable.
- Produces, in `server/api.ts`: `handle(req: Request): Promise<Response>`.
  - **`POST /api/login`** with body `{user, password}`:
    - Success returns `200 {token, user, role, name}`.
    - Failure returns `401 {error: 'Sai tài khoản hoặc mật khẩu'}`.
  - **`GET /api/state`**, Bearer token required, returns `200 State`.
  - **`POST /api/action`** with body `Action`, Bearer token required, returns `200 State`.
  - **Errors:** `401` for a missing or invalid token, `403` for an action the role may not send, `400` for a malformed action.
  - **On each GET and POST:** run `const raw = await loadState()`. If `raw` is not a version-2 state, re-seed with `seed(Date.now())`. Then call `tick` and, for a POST, `reduce`. Save with `rev + 1` only if `changed`, if the reduce returned a new object, or if the state was re-seeded.
  - Add `// ponytail: last-write-wins across the load→save gap; Redis WATCH if more than two devices`.
- Produces: `ROLE_ACTIONS: Record<Role, Action['type'][]>`, exported from `server/api.ts`.
  - **elder:** `reset`, `reminder/respond`, all `device/*`, all `chat/*`, `request/cancel`, `emergency/call115`.
  - **family:** `reset`, `notif/readAll`, all `family/*`.
- Produces, in `api/*.ts`: one line each re-exporting `handle` (`export { handle as POST } from '../server/api'`, or `GET` for `api/state.ts`).

- [ ] **Step 1: Write the failing tests** in `server/api.test.ts`. Call `handle(new Request('http://x/api/...', …))` directly. Run `resetMemory()` in `beforeEach`.

```ts
test('login: right password → token for role; wrong → 401', ...)
test('state without/with tampered token → 401', ...)            // Review Focus 3
test('elder cannot send family/accept; family cannot send chat/say → 403, state unchanged', ...)
test('malformed actions → 400 and rev unchanged', async () => {  // Review Focus 4
  for (const body of [{}, { type: 'nope' }, { type: 'family/accept' }, { type: 'chat/say', text: 42 }, { type: 'chat/say', text: 'a'.repeat(5000) }])
    expect((await post('/api/action', famOrElderToken(body), body)).status).toBe(400)
})
test('interleaved elder chat confirm and family accept both persist', ...) // Review Focus 1
test('stored version:1 state is replaced by a fresh seed, not a 500', ...)  // Review Focus 5
test('GET with nothing due does not bump rev; a POST bumps rev by 1', ...)
```

Validation rules:
- `type` must be a string in `ROLE_ACTIONS[role]`.
- `id` must be a non-empty string wherever the action type has one.
- `text`, `note`, `reason` and `time` must be strings of at most 500 characters.
- `deviceId` and `mode` must come from the known literal lists.

Keep these rules as a small table-driven validator in `server/api.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/api.test.ts`
Expected: FAIL (`../server/api` does not exist).

- [ ] **Step 3: Implement** `server/auth.ts`, `server/storage.ts`, `server/api.ts` and the three `api/*.ts` files.

- [ ] **Step 4: Wire the dev middleware** in `vite.config.ts`.
  - Add a plugin whose `configureServer` mounts `server.middlewares.use('/api', …)`.
  - It loads `handle` with `server.ssrLoadModule('/server/api.ts')`.
  - It builds a `Request` from the Node request (method, headers, buffered body, full URL with the `/api` prefix restored) and streams the `Response` back (status, headers, body).
  - Keep the plugin inline; it has no other use.

- [ ] **Step 5: Run tests and a dev smoke check**

Run: `npm test`. Expected: all test files pass.

Then run: `npm run dev`, and in a second shell:

```bash
curl -s -X POST localhost:5173/api/login -H 'content-type: application/json' -d '{"user":"con.gai","password":"carebox"}'
```

Expected: JSON containing `"role":"family"` and a `token`.

- [ ] **Step 6: Commit**

```bash
git add server api vite.config.ts tsconfig.app.json package.json package-lock.json
git commit -m "feat(server): login, shared state API, Upstash or in-memory storage"
```

---

### Task 4: Client — session store, login, responsive shell; delete the demo chrome

**Files:**
- Create: `src/api.ts`, `src/Login.tsx`, `src/store.test.ts`
- Modify: `src/state/store.tsx`, `src/App.tsx`, `src/ui/TabBar.tsx`, `src/ui/EmergencyOverlay.tsx`, `src/index.css`, `src/main.tsx`, and every screen that referenced removed fields. Find them with `grep -rn "audience\|cpReport\|assignee\|verifiedBy\|await_dispatch\|intervention\|familyRespondedAt\|state.staff\|new Date(" src --include=*.tsx`. Known hits:
  - `Health.tsx:42`
  - `Schedule.tsx:28-39`, which switches to `vnDay`/`atVN`/`fmtDayMonth`
  - `Report.tsx:10-12, 60-63`
  - `Notifications.tsx:20-23`
  - `Dashboard.tsx:30`
  - `Requests.tsx:35`
  - `Badges.tsx:8-17`
  - `Chat.tsx:55`, where the button becomes "Nhờ con giúp"
- Delete: `src/ops/`, `src/ui/PhoneFrame.tsx`, `src/ui/ScenarioPanel.tsx`, plus the `.phone*`, `.ops-*`, `.counter*`, `.case-*`, `.panel`, `.scenario` and `.sim-*` CSS. Keep `.sim-row` for Task 5.

**Interfaces:**
- Consumes: the Task 3 API contract and the Task 1 `Action`, `Screen` and `Role`.
- Produces, in `src/api.ts`:
  - `type Session = { token: string; user: string; role: Role; name: string }`
  - `login(user, password): Promise<Session>` throws `Error(message)` on 401.
  - `getState(token): Promise<State>`
  - `postAction(token, action): Promise<State>`
  - On 401, the last two throw `AuthError`.
  - `pickNewer(cur: State | null, next: State): State` returns `next` unless `cur.rev > next.rev`.
- Produces, in `src/state/store.tsx`:
  - `StoreProvider({ session, onLogout, children })`
  - `useStore()` returns `{ state, dispatch, view, session, logout }`.
  - `view` is `{ screen: Screen; caseId?: string; dismissedEmergency?: string }`.
  - `dispatch(a: Action | { type: 'nav'; screen: Screen; caseId?: string } | { type: 'emergency/dismiss' })`. It handles `nav` and `emergency/dismiss` locally; everything else is POSTed, and the response goes through `pickNewer`. Existing `dispatch({ type: 'nav', screen })` calls in screens keep working unchanged.
  - **Polling:** 3000 ms through `setInterval`, skipped while `document.hidden`. It refetches on `visibilitychange` back to visible.
  - **Auth errors:** an `AuthError` from any call clears the session.
  - Until the first state arrives, show a centred "Đang tải…".
- Produces, in `src/main.tsx`/`App.tsx`:
  - The session is read from `localStorage['carebox-session']` inside try/catch.
  - With no session, the app renders `<Login onLogin={…}/>`.
  - With a session, it renders `<StoreProvider session={…}><App/></StoreProvider>`.
  - `logout` removes the key.

- [ ] **Step 1: Write the failing test** in `src/store.test.ts`:

```ts
test('pickNewer keeps the higher rev (stale poll never overwrites an action result)', () => {
  const a = { ...seed(NOW), rev: 5 }, b = { ...seed(NOW), rev: 4 }
  expect(pickNewer(a, b)).toBe(a); expect(pickNewer(b, a)).toBe(a); expect(pickNewer(null, b)).toBe(b)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/store.test.ts`
Expected: FAIL (`pickNewer` is not exported).

- [ ] **Step 3: Implement `src/api.ts`, the store, `Login.tsx` and the shell.**
  - **Login:** two account cards (👵 Bà Nguyễn Thị Lan · Người cao tuổi · ba.lan; 👩 Chị Minh (con gái) · Gia đình · con.gai) and a password field. It shows the hint "Bản demo · mật khẩu: carebox", and the server's error message under the button.
  - **Top bar:**
    - left: 🧡 CAREBOX (CAREBOX Family for the family role)
    - right: the "Dữ liệu minh họa" chip, the account name, a "↺" reset button, and "Đăng xuất"
    - reset asks `confirm('Khôi phục dữ liệu demo cho cả hai tài khoản?')`, then sends `{type:'reset'}`
  - **Nav:** a single `<TabBar>` element, styled by CSS:
    - **Under 900 px:** fixed at the bottom with `padding-bottom: env(safe-area-inset-bottom)`.
    - **At 900 px and up:** a 220 px left sidebar showing icon and label in a row.
  - **Elder tabs:** home, schedule, health, services, requests, chat (Trợ lý). The chat item gets the class `wide-only`, hidden under 900 px.
  - **Family tabs:** `f-dashboard` Tổng quan, `f-requests` Yêu cầu của mẹ (badge: open requests in `await_family` plus `to_verify` events), `f-notifications` Thông báo (badge: unread), `f-profile` Hồ sơ & thiết bị, `f-report` Báo cáo.
  - **Content width:** `max-width: 1100px`, scrolling.
  - **Elder `.tiles`:** `repeat(4, 1fr)` at 900 px and up.
  - **Family cards:** a `.grid-wide` utility gives `repeat(auto-fit, minmax(280px, 1fr))`.
  - **Chat:** `.chat` takes the viewport height minus the bars, replacing `.phone-body:has(.chat)`.
  - **`EmergencyOverlay`:** `position: fixed; inset: 0`. It shows when `state.emergency` is set and `view.dismissedEmergency !== state.emergency.caseId`. Its close button dispatches the local `emergency/dismiss`.
  - Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` to `index.html`.
  - **Family screens:** Task 4 only fixes compile errors. Any `dispatch` of a removed family action stays out until Task 5.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: all tests pass, and `tsc -b && vite build` exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A src index.html && git commit -m "feat(client): login, shared-state store with polling, responsive shell; remove phone frame, ops and scenario panel"
```

---

### Task 5: Role features — family "Yêu cầu của mẹ", emergency bar and acknowledgement, simulated devices, report

**Files:**
- Create: `src/family/Requests.tsx`
- Modify: `src/App.tsx` (family emergency bar), `src/ui/EmergencyOverlay.tsx`, `src/family/Dashboard.tsx`, `src/family/Report.tsx`, `src/elder/Requests.tsx`, `src/elder/Health.tsx`, `src/index.css`

**Interfaces:**
- Consumes: the Task 1 `CaseAction` family actions, `effectivePriority` and `nextOwner`, and the Task 4 `useStore()`.
- Produces: `Requests()` for screen `f-requests`.

- [ ] **Step 1: Build `src/family/Requests.tsx`.**
  - **Alerts section (open events):**
    - Sort by priority (emergency > priority > uncertain > normal), then by time.
    - Each card shows the title, `PriorityBadge`, `SourceTag`, detail, the `unclear` list, and `StatusBadge`.
    - `to_verify` gets a **Tôi xem việc này** button (for emergencies, **Tôi đã tiếp nhận**).
    - `handling` gets a note input plus **Đã xử lý**, disabled while the note is blank. For an emergency, the placeholder reads "Ai đã tiếp nhận? VD: Đã gọi 115, xe cấp cứu đã đến".
  - **Requests section (open requests):**
    - "Bỏ ngỏ" requests go first, then by time.
    - `need_info` and `await_confirm` are read-only, labelled "Mẹ đang bổ sung / xác nhận".
    - `await_family` gets **Nhận việc** and **Từ chối**. Từ chối opens an inline reason input and stays disabled until the reason is non-blank.
    - For `add_reminder`, `await_family` instead shows `<input type="time">` plus **Duyệt lịch nhắc**.
    - For `contact_family`, `await_family` instead shows **Đã liên hệ**.
    - `in_progress` gets an optional note input plus **Đã xong**.
  - **Layout:** both sections use `.grid-wide`.

- [ ] **Step 2: Add the family emergency bar** to `App.tsx`.
  - It shows for the family role while an emergency event is not final, at the top of the content on every family screen.
  - The text is "🚨 Khẩn cấp {id}: {title} — chưa có người xác nhận tiếp nhận." while the event is `to_verify`, and "— {handler} đã tiếp nhận, chưa đóng." while it is `handling`.
  - Its button navigates to `f-requests`.
- [ ] **Step 3: Update `EmergencyOverlay`.**
  - When the case is `handling`, it adds the line "{handler} đã nhận được và đang xử lý." while keeping the 115 button.
  - Remove the "nhân viên CAREBOX" wording.
- [ ] **Step 4: Add the "Thiết bị giả lập" section to `Health.tsx`.**
  - It is a card under the chart, labelled "Thiết bị giả lập — chỉ dùng cho bản demo".
  - Each metric row has Bình thường / Vượt ngưỡng / Đáng nghi buttons, plus Mất kết nối or Kết nối lại depending on `connected`.
  - It ends with one **Báo té ngã** button.
  - The dispatched actions are the same as the deleted `ScenarioPanel`.
  - Buttons are at least 44 px tall.
- [ ] **Step 5: Update `Report.tsx`, the elder `Requests.tsx` and `Dashboard.tsx`.**
  - **`Report.tsx`:** the service report reads "Kết quả thực hiện: Đã hoàn tất theo xác nhận của gia đình.", then `doneNote`, then "Người xác nhận: {doneBy} ({relation})", then "Thời điểm hoàn tất: …".
  - **Elder `Requests.tsx`:** shows `closedReason` for refused requests and `doneNote` for done ones.
  - **`Dashboard.tsx`:** the "Cần chị xử lý" card counts `await_family` requests plus `to_verify` events and links to `f-requests`. The old `awaitingFamily` block is removed.
- [ ] **Step 6: Verify**

Run: `npm test && npm run build`
Expected: all tests pass and the build exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A src && git commit -m "feat: family request handling, emergency acknowledgement, simulated devices on Health"
```

---

### Task 6: Two-device end-to-end check, responsive check, README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the end-to-end flow** with `npm run dev`, using two browser contexts (normal plus incognito, or the chrome-devtools MCP with two pages). Check each step and fix any failure in the owning task's files:
  1. Elder logs in at a 390×844 viewport; family logs in at 1280×800.
  2. Elder chat "Bác muốn đi chợ" → "Rau, trứng" → "Sáng mai" → "Đúng rồi". Within 3 s, the family "Yêu cầu của mẹ" shows it in "Chờ gia đình nhận".
  3. Family presses Nhận việc, then Đã xong with the note "Đã mua đủ". The elder's Requests screen shows Hoàn tất and the note. The family Báo cáo screen shows "Người xác nhận: Chị Minh (Con gái)".
  4. Elder Health → Vượt ngưỡng (huyết áp). The family gets an alert and a notification.
  5. Elder chat "tôi bị đau ngực". The elder gets the 115 overlay with no confirmation step, and the family gets a red bar reading "chưa có người xác nhận tiếp nhận". The family presses Tôi đã tiếp nhận, and the elder's overlay shows "Chị Minh đã nhận được và đang xử lý." The family closes it with a note; the overlay closes and the bar disappears.
  6. ↺ Reset from either account restores the seed on both devices.
  7. At 360 px width, no screen scrolls horizontally (`document.documentElement.scrollWidth <= 360`). At 1280 px, the sidebar is visible and the bottom bar is hidden.
- [ ] **Step 2: Rewrite the README's Run, Deploy and "Where things live" sections.**
  - **Accounts:** `ba.lan` and `con.gai`, password `carebox`.
  - **Local:** `npm run dev` shares state in memory across tabs and LAN devices until the dev server restarts.
  - **Vercel:** import the repo with the Vite preset → Storage/Marketplace → Upstash Redis, connected to the project → optionally set `SESSION_SECRET` → Deploy.
  - **Layout:** `server/` holds the API, `api/` holds the Vercel entry points, and `src/state` holds the shared rules.
- [ ] **Step 3: Run the final checks**

Run: `npm test && npm run build && npm run lint`
Expected: all three exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md && git commit -m "docs: two-role web app run and deploy guide"
```
