# CAREBOX — Staff role and doc §8 compliance — Design

Reverses the "No staff role" section of `2026-10-18-carebox-webapp-design.md` (lines 34–57, 139, 160, 168–169). Everything else in that spec still holds: login, shared backend, polling, real Vietnam time, responsive layout, simulated devices, honesty rules and Vietnamese copy.

Sources: `doc.pdf` (§2–§8, Mockups 1–5), the current app on `main`, and this conversation (2026-10-19).

## Intent

`doc.pdf` names four actors: the elderly person, the family, a CAREBOX coordinator (Nhân viên điều phối) and a Care Partner. The current app has only the first two, and the daughter does everything the coordinator should do. Because of that, several doc rules cannot hold:

- When the AI does not understand, the case should go to CAREBOX staff (§4.1 step 8, §4.3, §8 scenario 6). Today it goes to the daughter.
- Alerts that need checking (device data, "hết thuốc", dose-change requests) should be verified by staff (§5 Mức 2, Mức 4, the routing matrix). Today they go to the daughter.
- A request should be completed by a Care Partner and confirmed by staff (Mockup 5). Today the daughter presses "Đã xong".

The user wants a staff role with its own UI, and wants the app's behaviour to match the eight test scenarios in doc §8. Those scenarios are the acceptance test for this work.

## Decisions the user made

1. **Unclear requests**: staff owns them; the family is notified.
2. **Care Partner**: not a real role in the web app. It exists only as a demo name that staff assigns, and staff records the Care Partner's report.
3. **Request types**: some stay with the family; the rest go to staff. The approved split is in "Routing" below.
4. **Family role**: the family gets updates, and helps when staff asks.
5. **Playback approved** (2026-10-19): a staff login `nhan.vien`; an ops board based on Mockup 3 and a case detail based on Mockup 4; emergencies notify family and staff at once, either can acknowledge, and staff closes the case.

## Goals

### Third role: CAREBOX staff

- **Account.** `nhan.vien` / password `carebox`, role `staff`. The display name is a seeded staff name (designer's call: "Anh Nam", Nhân viên điều phối). It gets a third card on the login screen.
- **Separate UI.** The brand reads "CAREBOX Operations". The staff UI uses the same shell, responsive layout, top bar, reset button and logout as the family app. Tabs:
  - **Bảng điều phối** (board)
  - **Thông báo** (staff notifications)
  - **Báo cáo** (reuse the family report screen)
  - **Hồ sơ & thiết bị** (reuse the profile screen)
- **Server permissions.** `ROLE_ACTIONS` gets a `staff` entry. Staff actions are rejected for other roles (403), and family/elder actions are rejected for staff.

### Routing: who owns a case

Every case gets an owner, `'staff' | 'family'`.

| Case | Owner | Family | Staff |
|---|---|---|---|
| Request: Mua thuốc, Đi chợ, Đi khám, Hỗ trợ sinh hoạt | staff | notified on confirm and on completion | verifies, assigns a Care Partner, confirms the result |
| Request: Liên hệ người thân | family | acts on it (Đã liên hệ / Từ chối) | sees it, read-only |
| Request: Thêm lịch nhắc, content **not** about medicine | family | approves it with a time, or declines | sees it, read-only |
| Request: Thêm lịch nhắc, content about medicine | staff | notified | approves it only after checking the prescription source (doc §4.2) |
| AI did not understand (2 misses, or "Gặp nhân viên") | staff | notified ("đã chuyển nhân viên CAREBOX") | calls the elder back, closes with a note |
| Elder reports a problem ("hết thuốc", "mệt", …) | staff | notified | verifies, may ask family |
| Device over threshold, suspicious data, lost connection, stale data | staff | notified (only if the elder shares device data; today the seed says she does) | checks the source |
| Reminder "Không thực hiện được" / "Chưa có xác nhận" | staff | notified | follows up |
| Dose / prescription request (scenario 8) | staff | notified | points to a doctor or pharmacist, closes with a note |
| Emergency | staff | notified at the same moment; can acknowledge | acknowledges, coordinates, closes |

"About medicine" for a reminder means the request's `detail` (the elder's first sentence) or its `noi_dung` field contains a medicine word after normalisation (`thuoc`, `vien`, `lieu`, …).

**When the owner is set (designer's call).** Every request starts staff-owned at creation. At the read-back confirmation, Liên hệ người thân and non-medicine Thêm lịch nhắc requests become family-owned. A half-finished request (`need_info` / `await_confirm`, e.g. after `chat/clear`, or seed CB-001) therefore sits on the staff board. Staff can ask the family for help or decline it with a reason; nothing else.

**Family fallback (doc §10, TV7).** A family-owned request that the family has not acted on within 30 minutes of confirmation moves to staff. The clock runs from a new `confirmedAt` field, set at read-back. History reads "Gia đình chưa phản hồi sau 30 phút, chuyển nhân viên CAREBOX", and staff is notified. The move runs in the server tick, alongside `sweepReminders`. After the move, the family can still act on the request; whoever acts first closes it (designer's call). The existing "Bỏ ngỏ" priority bump (`isAbandoned`, counted from `createdAt`) is unchanged and applies to every owner.

### Request lifecycle

Labels follow doc §4.1 where the doc names them.

**Staff-owned:**

1. **Chờ bổ sung thông tin** (`need_info`): the chat collects fields, unchanged.
2. **Chờ xác nhận** (`await_confirm`): the AI reads the request back, unchanged.
3. **Chờ điều phối** (`await_staff`, new): the elder said "đúng rồi".
   - Staff presses **Xác minh**, with an optional note. This records `verifiedBy`, `verifiedAt` and the note. The status stays Chờ điều phối. (Doc §2 principle 2: recording, confirming, assigning, doing and finishing are distinct.)
4. **Đang xử lý** (`in_progress`): staff picked a Care Partner from the seeded demo list and pressed **Phân công**.
   - This requires the request to be verified first.
   - It records `assignee`.
5. **Care Partner báo cáo**: staff types the Care Partner's report and presses **Ghi nhận báo cáo**.
   - This records `partnerReport` and `partnerReportAt`.
   - The status stays Đang xử lý, with a badge "Chờ nhân viên xác nhận".
6. **Hoàn tất** (`done`): staff presses **Xác nhận hoàn tất**.
   - This is allowed only after a Care Partner report exists.
   - It records `doneBy` (staff name) and `completedAt`. The completion time (`partnerReportAt`) and the confirmation time (`completedAt`) are stored separately, as Mockup 5 requires.

**Side exits:**

- **Đã từ chối by the elder**: unchanged.
  - If a Care Partner was assigned, the history adds "Đã báo hủy cho Care Partner" and staff is notified.
  - Nothing is re-booked (scenario 3).
- **Đã từ chối by staff**: requires a reason, which the elder sees. Allowed from Chờ điều phối or Đang xử lý.

**Family-owned:** the current family actions (`approveReminder`, `contacted`, `decline`) and statuses stay. `await_family` stays the status after confirmation.

**Staff-owned requests with no Care Partner job (designer's call).** A medicine Thêm lịch nhắc request, and a Liên hệ người thân or reminder request that reached staff through the fallback, skip the Care Partner steps:
- Staff gets `staff/approveReminder` (time required, same rules as the family's) and `staff/contacted`.
- Either one moves the request straight to Hoàn tất, with `doneBy` = staff name.
- A medicine reminder approved by staff keeps kind `medicine`.

The Care Partner rule in the anti-goals applies only to service requests: Mua thuốc, Đi chợ, Đi khám, Hỗ trợ sinh hoạt.

**Field collection (designer's call).** The AI does not extract field values from the first sentence; it asks every field question, as today and as the doc's §4.1 example does. Tests answer each question.

**Removed:** `family/accept` and `family/done`. The family no longer does service requests.

### Events (alerts) lifecycle

All events are staff-owned.

1. **Cần xem** (`to_verify`).
2. **Đang xử lý** (`handling`): staff pressed **Tôi xem việc này**. This records `handler`.
3. **Đã xử lý** (`resolved`): staff closed it with a required note.

**Emergencies:**

- The red bar appears on **every** screen of both the family app and the staff app. It reads "chưa có người xác nhận tiếp nhận" until **either** the family or staff presses **Tôi đã tiếp nhận**.
- That action is `case/ack`, allowed for both roles and only for emergency events. It moves the case to `handling`, with the handler set to whoever pressed it.
- Only staff can close an emergency, and closing needs a note. This clears `state.emergency`, as today.
- The elder's overlay reads "Đã thông báo Chị Minh và nhân viên CAREBOX. Thông báo tự động chưa có nghĩa là đã có người tiếp nhận." After an acknowledgement it shows "<handler> đã nhận được và đang xử lý".
- Everything else about emergencies is unchanged: no confirmation step, and the 115 button stays.

### Asking the family for help

On any open staff-owned case, staff can press **Nhờ gia đình hỗ trợ**, type a question and send it.

- Each case holds one ask at a time: `familyAsk = { question, askedAt, reply?, repliedAt? }`.
- The family is notified, and the case appears in a **"CAREBOX nhờ hỗ trợ"** section at the top of the family's "Yêu cầu của mẹ" screen, with a reply box.
- The family's reply (`family/reply`) is stored, logged in the history with source `family`, and staff is notified.
- Staff can send a new ask after a reply.

### Notifications per audience

A notification gets `to: 'family' | 'staff'`. Each role sees and marks as read only its own notifications. `notif/readAll` becomes role-scoped: the server passes the caller's role into the action. A routed case writes one notification per audience, using the wording each audience needs (e.g. the family's says "đã chuyển nhân viên CAREBOX"). The elder has no notification list, as today.

### Sources

Add `staff` to `Source`, labelled **"Nhân viên xác minh"** (doc §4.5, §7.3.6). Staff actions log with `by: 'staff'`. Reports and timelines show it the way they show the other sources.

### Elder-side changes

- The chat button **"Nhờ con giúp"** becomes **"Gặp nhân viên"** (Mockup 1). It creates the staff-owned "AI chưa hiểu" event at once.
- Hand-off reply: "Cháu đã chuyển cho nhân viên CAREBOX và báo Chị Minh. Nhân viên sẽ liên hệ lại với bác ạ." That promise is true now, because a staff queue owns the case.
- The miss re-ask text says "Hoặc bác bấm “Gặp nhân viên”."
- `nextOwner` covers the new statuses and owners:
  - "Nhân viên CAREBOX (điều phối)"
  - "<Care Partner> (đang thực hiện)"
  - "Nhân viên CAREBOX (xác nhận kết quả)"
  - and so on.
- The Gemma system prompt (`server/ai.ts`) mentions "Gặp nhân viên" instead of "Nhờ con giúp".

### Family-side changes

- **Yêu cầu của mẹ** shows three things:
  - The "CAREBOX nhờ hỗ trợ" asks, with reply boxes.
  - Family-owned requests, with their actions.
  - Everything else, read-only, with "Phụ trách: <next owner>". This covers staff-owned requests and all open alerts.
- The tab badge counts family-owned requests waiting on the family, open unanswered asks, and unacknowledged emergencies.
- The Dashboard's "Cần chị xử lý" card uses the same count.
- **Report, service section:** for staff-completed requests it reads "Kết quả thực hiện: Đã hoàn tất theo báo cáo của Care Partner <name>" and "Người xác nhận: <staff name> (nhân viên điều phối)", and shows both times. Family-completed requests (contact, reminder) keep "theo xác nhận của gia đình".

### Staff UI

**Bảng điều phối (Mockup 3)**

- **Three counters**, computed over staff-owned open cases:
  - **Cần xác minh**: `to_verify` events plus unverified `await_staff` requests.
  - **Chờ xử lý**: verified `await_staff` requests plus `in_progress` requests that have a Care Partner report but no confirmation yet.
  - **Đang thực hiện**: `in_progress` requests without a report, plus `handling` events.
- **The list** shows every open case: staff-owned first, then family-owned as read-only (so staff can see the family fallback coming).
  - Order: by effective priority (Khẩn cấp > Cần chú ý > Chưa chắc chắn > Thông thường), then oldest first.
  - Each card answers the five questions from doc Mockup 3: what happened (title and detail), where it came from (`SourceTag`), priority and its reason, who acts next (`nextOwner`), and how far it has got (status badge and the latest history line).
  - Tapping a card opens its detail (`view.caseId`).

**Chi tiết (Mockup 4 and doc §5 "Thông tin tối thiểu")** shows:

1. the case ID
2. the person concerned and the source
3. the content (title, detail, fields)
4. the time it happened or was recorded
5. the priority and its reason
6. **verified information**: the fields, plus verifier and note, once verified, else "Chưa xác minh"
7. **unverified / missing information**: `unclear`, and fields still "chưa rõ"
8. actions taken (history)
9. who is responsible next
10. status and result

It also has the action buttons valid for the current status, and the family ask and reply. For device events it repeats the Mockup 4 next steps as static guidance text.

### Doc §8 scenarios: required behaviour

Each row is an acceptance test in `src/scenarios.test.ts`. The first input is the doc's example; the extra inputs are paraphrases that must behave the same.

| # | Input (plus paraphrases) | Must happen | Must not happen |
|---|---|---|---|
| 1 | "Bác muốn đi chợ" → list → time → "Đúng rồi". Paraphrase: "Mua giúp bác ít gạo", "Mua đồ ăn sáng mai" | Missing fields asked, read back, request in **Chờ điều phối**, owner staff, staff and family notified | Any status past Chờ điều phối without a staff action. AI says or sets "done" |
| 2 | Medicine reminder reaches its time. Plus "Nhắc bác uống thuốc huyết áp lúc 9h" | Reminder `due` with the confirmed content. The chat request becomes a staff-owned `add_reminder` | Reminder list, title, note or dose changed by the AI. A medicine reminder approved by the family |
| 3 | Elder refuses: "Thôi", "Không cần", and a plain **"Không"** answering the first question ("…đúng không ạ?") | Request `refused`, reason recorded. If a Care Partner was assigned, staff notified and cancellation logged | A field stored with the value "Không". Any new request or re-booking |
| 4 | Device "Vượt ngưỡng" | Staff-owned `to_verify` event with "Chưa có kết luận y tế". Staff and family notified | Diagnosis wording. A family-owned event |
| 5 | Device "Mất kết nối", **and** no reading for longer than `STALE_AFTER` | Uncertain staff-owned event in both cases. Device shown as Thiếu dữ liệu with the last reading time | "an toàn" without "Không kết luận". A second missing-data event for a device that already has an open one |
| 6 | Two unclear utterances (keyword path and Gemma path), or "Gặp nhân viên" | One uncertain staff-owned event holding both utterances. Staff notified. Family notified that staff took it | Request created from a guess. The case owned by the family |
| 7 | "Tôi bị đau ngực quá", **and** the doc's Mức 3 examples: "mất ý thức", "khó thở", "méo miệng", "yếu nửa người", "nói ngọng", "ngã chảy máu" | `state.emergency` set on the first action. Event `emergency`, notifications to family **and** staff | Any confirmation step first. Routing through Gemma. The red bar cleared before `case/ack` |
| 8 | "Cho bác tăng liều thuốc huyết áp". Paraphrase: "uống thêm 2 viên", "ngừng thuốc huyết áp", "kê đơn cho bác" | AI refuses and points to a doctor or pharmacist. Staff-owned event. Reminders unchanged | Any dose or reminder change. "uống thêm nước" classified as a dose request |

**Missing-data dedupe (designer's call).** The dedupe covers only missing-data events (disconnect or stale): create one only if that device has no open missing-data event. Over-threshold and suspicious readings still create one event per reading, as today. A fresh reading or a reconnect does not close any event; staff closes it with a note.

**Classifier changes needed for this table:**

- **Emergency keywords** add the doc's Mức 3 examples: `mat y thuc`, `yeu nua nguoi`, `noi ngong`, `noi kho`, `kho noi`, plus any others the builder finds in doc §5.
- **Medical-decision patterns** add `ngung thuoc`, `dung thuoc` and `uong them N vien`, matched with a digit-or-word count pattern, not bare `uong them`.
- **Groceries keywords** add common items (`gao`, `do an`, `mua giup`, …).
- **First-question refusal:** a bare "không" (normalised text is exactly `khong`, or starts `khong` and has no content beyond `khong` / `khong muon` / `khong phai`) is a refusal only while the request is still on its first field question. Later, "không" stays a valid field answer, e.g. "không cần người đưa đi" for `di_lai`.

**Gemma second net (designer's call):**

- The structured reply gains two statuses: `{"status":"service","service":"<ServiceType>","reply":...}` and `{"status":"emergency","reply":...}`.
  - `service` starts the same request flow that a keyword match would.
  - `emergency` calls `raiseEmergency`.
- Keyword rules still run first, so safety never depends on the model.
- Without `GEMINI_API_KEY`, behaviour is keyword-only, as today.
- Model output is validated: an unknown service value means a normal answer.

## Non-goals

- A Care Partner login, screen or account. The Care Partner is only a seeded name (designer's call: "Anh Tuấn", "Chị Hoa").
- Multiple staff accounts, shift handover, or assigning cases to a specific staff member. One staff account owns the staff queue.
- The "Cần can thiệp" status, turning an event into a request, and KPI dashboards (doc §11). Add them if asked.
- An elder consent toggle for data sharing (doc §7.3). The Profile text stays as is.
- Response-time SLAs beyond the existing 30-minute "Bỏ ngỏ" assumption.
- Real calls, SMS or push, as before.

## Anti-goals (failure even if it "works")

- Any staff-owned **service** request (Mua thuốc, Đi chợ, Đi khám, Hỗ trợ sinh hoạt) reaching Hoàn tất without a recorded Care Partner report **and** a staff confirmation.
- An unclear request, a device alert or a dose request that only the family can see or act on.
- An emergency that waits on anything, or an emergency where only one of family/staff was notified.
- A plain "Không" refusal stored as an answer.
- A missing or stale device shown as normal, or creating an alert flood (one per poll).
- The family able to call staff-only actions, or staff able to speak in the elder's chat (server 403).
- The AI or a notification claiming a case is handled when nobody has acknowledged it.

## Constraints

- **Stack.** Unchanged: React 19, TypeScript, Vite, Vercel Functions, Upstash. No new dependency.
- **Logic location.** All case logic stays in pure functions under `src/state` and runs on the server through `reduce`.
- **State version.** The State shape changes, so bump `version` to 3. A stored v2 state fails `isState` and is re-seeded. This is acceptable for the demo; the README notes it.
- **Tests.**
  - `src/scenarios.test.ts` becomes the §8 acceptance suite above.
  - The existing tests are updated for the new lifecycle.
  - Server permission tests cover the staff role.
  - Verification per the user's rules: lint (`npm run lint`), typecheck (`tsc -b --noEmit` or equivalent), and tests.
- **Test runner.** Vitest currently fails to start locally: `Cannot find module '@rolldown/binding-wasm32-wasi'`. Fixing the install (reinstall optional deps) is the first step of the plan. Do not change the toolchain to work around it.
- **Copy.** Vietnamese, with doc wording where the doc names a state.

## Left to the builder

- Exact field names (e.g. `owner`, `assignee`, `partnerReport`), as long as the behaviour above holds.
- Staff screen layout details and the staff `Screen` ids (e.g. `s-board`, `s-case`, `s-notifications`).
- The exact keyword lists beyond those named here.
- Seed data. It should include at least:
  - one staff-owned request in Chờ điều phối
  - one completed request with a Care Partner report (for the Mockup 5 report)
  - one open device alert, so the board is not empty after a reset
- How `notif/readAll` learns the caller's role. For example, the server injects `role` into the parsed action.
