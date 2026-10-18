# CAREBOX Demo SPA — Design

Sources: `doc.pdf` (CAREBOX – Thiết kế lớp AI & Technology) and `design.jpg` (10-screen visual board), both in the project root.

## Intent

A clickable demo that the CAREBOX team opens in a browser. It shows that the service logic in `doc.pdf` works end to end: a request travels from the elderly person to the AI, then to CAREBOX staff, then to a Care Partner, and finally back to the family, without ever breaking the doc's rules.

The audience is the internal team, not customers. Success means a team member can play through the flows and see each rule hold. The user said it doesn't matter how this is achieved, so every technical choice is left to the builder.

## Goals

- **Three roles, one app.** A top role switcher toggles between Người cao tuổi (elderly), Gia đình (family) and Điều phối (CAREBOX staff). All three share the same state, so an action in one role shows up immediately in the others.
- **Elderly screens.** These follow design.jpg screens 1–6:
  - 1. Home: greeting, AI mascot, mic button, quick tiles.
  - 2. Today's schedule (Lịch trình), with reminders.
  - 3. Health readings (Sức khỏe): BP, heart rate, glucose and SpO₂, plus a trend chart.
  - 4. Service menu (Dịch vụ): Mua thuốc, Đi chợ, Đi khám, Hỗ trợ sinh hoạt, Trò chuyện.
  - 5. Request tracking (Yêu cầu), with tabs and a timeline.
  - 6. AI chat (Trợ lý CAREBOX).
- **Family screens.** These follow design.jpg screens 7–10:
  - 7. Family dashboard.
  - 8. Elderly profile and connected devices.
  - 9. Notifications, with tabs.
  - 10. Daily report.
- **Staff screens.** These are not in design.jpg; the user approved adding them. They are based on doc Mockups 3–5:
  - Ops board: counters plus a request list. Each item answers the doc's five questions: what happened, from where, what priority, who is responsible next, and how far along it is.
  - Event/alert detail.
  - Actions: verify, assign a Care Partner, record the Care Partner's result, then confirm completion. Confirming completion produces the Mockup 5 service report that the family sees.
- **The AI chat is simulated.** Keyword and intent rules map Vietnamese input to the doc's five intents: hỏi thông tin, nhắc lịch, yêu cầu dịch vụ, liên hệ người thân, báo vấn đề. The flow is:
  1. Ask for missing fields one short question at a time.
  2. Read back the request for confirmation.
  3. Create the request.
  4. If the input is still not understood after one re-ask, offer "Gặp nhân viên" and hand off to staff as an Uncertain item.

  Typing in the chat must work. The mic button may simulate voice using quick-reply chips or the browser's SpeechRecognition API when available; this is the builder's call.
- **Priority levels.** These follow doc §5:
  - Normal and Priority flow through verification.
  - Emergency keywords (e.g. đau ngực, khó thở, ngã, bất tỉnh, đột quỵ) skip all confirmation. They immediately show a full-screen "Gọi 115" prompt and notify family and staff at the same time. The prompt states that an automated notice is not someone taking the case.
  - Uncertain items go to staff with the unclear parts listed.
- **Status discipline.** This follows doc §7.2. Request states, which follow the doc's own Vietnamese labels:
  - Chờ bổ sung thông tin
  - Chờ xác nhận
  - Chờ điều phối
  - Đang xử lý (assigned)
  - Hoàn tất (only after staff confirms the Care Partner's report)
  - Cần can thiệp
  - Đã từ chối

  Only staff actions move a request past Chờ điều phối. The AI never marks anything done.
- **Reminders.** These follow doc §4.2. Each reminder supports three responses: Đã nhận / Nhắc lại / Không thực hiện được. "Không thực hiện được" creates a follow-up for staff. If there is no response, the reminder shows "Chưa có xác nhận", never "Đã hoàn thành".
- **Simulated devices.** These follow doc §4.4. A demo control lets the team push a normal reading, an over-threshold reading, a suspicious reading, or a disconnect for each device. The four device states (normal per configured threshold, cần chú ý, thiếu dữ liệu, đáng nghi) are shown verbatim from the doc.
  - Thresholds are shown as "ngưỡng giả lập" (simulated threshold).
  - A disconnect shows the time of the last reading, never "an toàn".
- **Family view honesty.** These rules follow doc §4.5 and Mockup 2:
  - Never say "khỏe mạnh" (healthy).
  - Every item is tagged with its source: thiết bị / người cao tuổi báo / nhân viên xác minh / AI tổng hợp.
  - The family view shows the last-updated time and the device connection status.
- **Demo scenarios panel.** A side panel (or drawer) with one button per doc §8 test scenario (1–8). Each button drives the app into that situation so the team can check the expected behavior. The panel also has a **Reset demo** button that restores the seed data.
- **Seed data.** It matches the design board:
  - Bà Nguyễn Thị Lan, 72, Cầu Giấy, Hà Nội.
  - Con gái as the family contact.
  - Today's schedule from screen 2.
  - A couple of in-flight requests, e.g. CB-001 lấy thuốc.
  - Care Partner "Anh Tuấn".
  - Every screen shows "Dữ liệu minh họa" (illustrative data).

## Non-goals

- No backend, no real AI or LLM, no real devices, no auth.
- No real notifications (push or SMS). There is no real 115 call; the "Gọi 115" button shows a simulated dialing state.
- No permissions model beyond what each role screen shows.

## Anti-goals (failure even if it "works")

- Any UI text that implies a diagnosis, a dose change or "safe/healthy" status.
- Any request reaching Hoàn tất without a staff confirmation step.
- An emergency that waits on any confirmation.
- Missing data shown as normal.

## Constraints

- Latest React, TypeScript and Vite. The result is a single-page app.
- It runs locally with `npm run dev`, and the user will deploy it to Vercel. `vite build` must produce a static `dist/` that works on Vercel with zero config. Navigation is driven by app state or the URL hash, so no server rewrites are needed.
- All data lives in `localStorage` and survives a reload. "Reset demo" clears it.
- UI copy is in Vietnamese. Large type and big tap targets on the elderly screens (doc Mockup 1 requirements).
- Visual style follows design.jpg: warm cream, yellow and orange palette, rounded cards, and a phone frame (~390px) centered on desktop, with the role switcher and scenario panel outside the frame.

## Workflow decisions (designer's calls, derived from the doc)

**One list, two kinds.** Every item lives in one list of cases:
- `request` items use IDs `CB-xxx`.
- `event` items (device alerts, emergencies, reminder follow-ups and Uncertain hand-offs) use IDs `EVT-xxx`.

The staff board shows both, sorted by priority (Emergency > Priority > Uncertain > Normal) and then by time.

**Request lifecycle:**
1. **Chờ bổ sung thông tin.** The chat stores the request as soon as the intent is known. If the elderly person stops mid-chat, the request stays in this status on the staff board (Mockup 3, CB-001).
2. **Chờ xác nhận.** All fields are filled; the AI reads the request back.
3. **Chờ điều phối.** The elderly person said "đúng rồi". Family is notified only; there is no family confirmation step in this demo.
4. **Staff verification.** Staff press "Xác minh", which records who verified it. The status stays Chờ điều phối.
5. **Đang xử lý.** Staff assign a Care Partner.
6. **Care Partner report.** The report is attached. The status stays Đang xử lý, with a "Chờ nhân viên xác nhận" badge.
7. **Hoàn tất.** Staff confirm. This creates the service report (Mockup 5).

There are two side exits:
- **Đã từ chối.** The elderly person says no at the read-back or cancels any request that isn't finished. Staff can also decline, with a reason. This status is final.
- **Cần can thiệp.** Staff flag a request with this. Staff can return it to Chờ điều phối.

**Event lifecycle:**
1. **Cần xác minh.** The event is created.
2. **Đang xử lý.** A staff member takes it.
3. **Đã xử lý.** Staff close it with a note. No Care Partner is needed.

Staff may also turn an event into a request; for example, a "hết thuốc" event becomes a Mua thuốc request. Emergency events start already escalated, showing the 115 hand-off steps. Closing one requires a note saying who took over the case.

**Intents other than service requests:**
- **Nhắc lịch.** This creates a request asking staff to verify the new schedule item. The item is not added to the schedule until staff approve it (doc §4.2: reminders come from an approved source).
- **Liên hệ người thân.** This creates a request and sends a notification to the family. Staff can mark it done when the family responds; in the demo, a "Gia đình đã phản hồi" button on the family screen does this.
- **Hỏi thông tin.** The AI answers schedule and request-status questions from the app's data. For health questions, it shows the latest reading with its source and time, gives no interpretation, and suggests asking staff or a doctor.
- **Kê đơn or đổi liều** (scenario 8). The AI refuses, points the person to a doctor or pharmacist, and logs a Normal event for staff.

**Devices:** BP, heart rate, glucose, SpO₂, plus a **fall detector**. A fall detector reporting a fall creates an Emergency.

**Reminders:**
- "Đã nhận" means only that the reminder was received. The screen shows "Đã nhận nhắc", never "Đã hoàn thành".
- "Nhắc lại" snoozes the reminder by 10 demo minutes.
- If nobody responds by 30 demo minutes after the due time, the reminder shows "Chưa có xác nhận".

The design.jpg labels "Đã hoàn thành", "Ổn định" and "Không có dấu hiệu bất thường" are replaced with the doc's wording.

**Clock.** There is a demo clock: today's real date, starting at 07:00 when the demo is seeded. The scenario panel has a "+15 phút" control and a "Tới giờ nhắc tiếp theo" (jump to the next reminder) control. The clock does not tick on its own, so every team member sees the same state. The doc's 30-minute window, after which an open request becomes Priority, is labeled "giả định thử nghiệm" (trial assumption).

## Left to the builder

Routing approach, state shape, styling method, icons and chart approach, file layout, keyword lists, the exact wording of AI replies (they must follow the doc's tone, e.g. "Bác … cháu …"), and test strategy. At minimum, there must be one runnable check covering the intent and priority classifier and the status transitions.
