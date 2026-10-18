# CAREBOX Web App (two roles, shared backend) — Design

Supersedes the layout, role and staff parts of `2026-10-18-carebox-demo-design.md`. Everything in that spec not contradicted here still holds: the AI chat rules, emergency bypass, reminder responses, device states, honesty rules, Vietnamese copy and visual style.

Sources: `doc.pdf`, `design.jpg`, and the current app on `feat/carebox-demo`.

## Intent

The current demo is a presenter tool. It shows a fake phone frame in the middle of a desktop page, with a role switcher and a test-scenario panel beside it.

The user wants a demo that works like a real web app. Two people open one link on their own devices and log in:

- **Bà Lan**, the elderly person, on her phone.
- **Her daughter**, on a phone or laptop.

What one person does shows up on the other's screen a few seconds later. On a phone, the app should feel like an installed app. On a laptop, it should feel like a proper website.

It is still a demo. Data is illustrative, and there are no real devices, no real AI, no real 115 call, and no sign-up.

## Goals

### Two roles, simple login

- **Fixed demo accounts:**
  - `ba.lan`: Người cao tuổi (Bà Nguyễn Thị Lan)
  - `con.gai`: Gia đình (Chị Minh, con gái)
- **Login screen.** Pick an account card, type the password, then log in. Both accounts use the password `carebox`, and the login screen shows it.
- **Server-checked login.** The server checks the login and returns a session token. The client keeps the token in `localStorage`, so a reload stays logged in.
- **Đăng xuất** is always reachable from the app.
- **Per-role permissions (doc §7.3.4).** The server accepts only the actions allowed for the token's role:
  - Bà Lan cannot accept her own requests.
  - The daughter cannot speak in the chat as Bà Lan.

### No staff role: the relative handles requests

The CAREBOX staff role, the ops board, case detail, Care Partner assignment and the verification step are **removed**. The relative takes the staff's place. Bà Lan's requests go straight to her daughter.

**Request lifecycle:**

1. **Chờ bổ sung thông tin.** The chat collects missing fields, as it does today.
2. **Chờ xác nhận.** The AI reads the request back.
3. **Chờ gia đình nhận.** Bà Lan said "đúng rồi". The daughter is notified, and the request appears in her "Yêu cầu của mẹ" list.
4. **Đang xử lý.** The daughter pressed **Nhận việc**.
5. **Hoàn tất.** The daughter pressed **Đã xong** and may add a short note on what was done.
   - This is the only way to reach Hoàn tất.
   - It produces the service report the family sees, based on Mockup 5, with "người xác nhận" set to the relative.

**Side exits:**

- **Đã từ chối (by Bà Lan).** Bà Lan declines at the read-back, or cancels any unfinished request.
- **Đã từ chối (by the daughter).** The daughter presses **Từ chối** and must give a reason. Bà Lan sees the reason on her Requests screen.

**Other intents:**

- **Nhắc lịch.** This creates a request. When the daughter approves it with a time, the reminder is added to the schedule. The doc requires reminders to come from an approved source; the relative is now that source.
- **Liên hệ người thân.** This creates a request in the daughter's list. Pressing **Đã liên hệ** completes it.
- **Uncertain hand-off.** When the AI still doesn't understand after one re-ask, it offers **"Nhờ con giúp"** instead of "Gặp nhân viên". The hand-off becomes an alert for the daughter that lists the unclear parts.

### Alerts and emergencies

Events cover device alerts, reminder "Không thực hiện được", hand-offs and emergencies. They all appear for the daughter as alerts.

**Event lifecycle:**

1. **Cần xem.**
2. **Đang xử lý.** The daughter pressed **Tôi xem việc này**.
3. **Đã xử lý.** The daughter closed it with a required note.

**Emergencies** (emergency keywords in the chat, or a fall):

- Bà Lan immediately sees the full-screen "Gọi 115" prompt, with no confirmation step. This is unchanged.
- At the same moment, a red bar appears at the top of **every** screen in the daughter's app. It reads "chưa có người xác nhận tiếp nhận" until she presses **Tôi đã tiếp nhận**.
- Closing an emergency requires a note saying who took over, for example "Đã gọi 115, xe cấp cứu đã đến".
- The doc's rule stands: an automated notice is never shown as someone having taken the case.

### Simulated devices on Bà Lan's Health screen

The demo control panel is removed. Its device controls move into a clearly labelled **"Thiết bị giả lập"** section at the bottom of Bà Lan's Health screen. For each metric (huyết áp, nhịp tim, đường huyết, SpO₂) there are four buttons:

- Bình thường
- Vượt ngưỡng
- Đáng nghi
- Mất kết nối / Kết nối lại

There is also one **Báo té ngã** button.

The device rules from doc §4.4 are unchanged:
- Thresholds are labelled "ngưỡng giả lập".
- A lost connection shows the time of the last reading and never says the person is safe.

### Real time instead of a demo clock

- The manual demo clock (+15 phút, Tới giờ nhắc tiếp theo) and the 8-scenario panel are removed.
- The current time is the real time in Vietnam (`Asia/Ho_Chi_Minh`), never the browser's or server's own timezone.
- Reminders become due at their real time of day. An unanswered reminder becomes "Chưa có xác nhận" as before.

### Shared data with a tiny backend

- Both devices see the same data. One Vercel deploy serves both the static app and a few API endpoints in the same repo; there is no separate server project.
- **Storage.** The whole demo state is one JSON record in **Upstash Redis**, added through the Vercel Marketplace (free tier).
  - When the Upstash environment variables are missing, as in local `npm run dev`, the server keeps the state in memory.
  - Local dev needs no account. Two tabs, or a phone on the same Wi-Fi, still share state while the dev server runs.
- **The existing state rules run on the server.** The reducer and helpers in `src/state` are pure functions with tests. A client sends an *action*. The server loads the state, applies the action through the same reducer, saves the result, and returns the new state. The client never sends a whole state.
- **Polling.** Each logged-in client fetches the state every ~3 s and right after each of its own actions. There is no websocket or realtime service.
- **Reset demo.** A **Khôi phục dữ liệu demo** button, placed in each role's account/profile area behind a confirm dialog, re-seeds the shared state for everyone.

### Per-device UI state

These are kept per device (in the client, not in the shared record):

- the current screen and selected case
- login
- whether the elder has dismissed the emergency overlay

Bà Lan's chat history is shared state.

### Responsive layout (approved in the visual mockups)

- No phone frame anywhere. The app fills the viewport.
- **Phone (< ~900 px):**
  - a top bar with the brand, a "Dữ liệu minh họa" chip and the account
  - the content scrolls
  - a bottom tab bar
- **Laptop/tablet (≥ ~900 px):**
  - the same top bar
  - a left sidebar holding the same tabs
  - a wider content area where cards sit in a grid
- **Elder tabs:** Trang chủ, Lịch trình, Sức khỏe, Dịch vụ, Yêu cầu, plus Trợ lý (chat). On the phone, chat stays reachable from the mic button on Home, as it is today.
- **Family tabs:** Tổng quan, Yêu cầu của mẹ (new), Thông báo, Hồ sơ & thiết bị, Báo cáo.
- **Elder text size.** Bà Lan's screens keep large type and big tap targets at every width (doc Mockup 1).
- **Phone details.** Safe-area insets are respected, and nothing scrolls horizontally at 360 px.

## Non-goals

- Real auth: sign-up, password reset, multiple families, or user management.
- Real push/SMS notifications, real devices, a real LLM, or a real 115 call.
- Offline support or PWA install. Add the PWA manifest only if the user asks.
- Websockets or realtime infrastructure.
- Keeping the staff/ops role or the scenario panel in any form.

## Anti-goals (failure even if it "works")

- Any request reaching Hoàn tất without the relative pressing Đã xong.
- An emergency that waits on any confirmation, or the relative's red bar disappearing before someone presses Tôi đã tiếp nhận.
- Missing or disconnected device data shown as normal or safe.
- UI copy implying a diagnosis, a dose change, or "khỏe mạnh".
- One device's action silently lost, or overwritten by another device. The server applies actions to the stored state; clients never upload a whole state.
- A fake phone frame or a presenter panel left in the product UI.

## Constraints

- **Stack.** React 19, TypeScript and Vite, as today. API endpoints are Vercel Functions under `api/` and import the reducer from `src/state`. The only new dependency is the Upstash Redis client.
- **Deploy.** Import the repo on Vercel, add Upstash from the Marketplace, and deploy. The README documents these steps.
- **Navigation.** It stays app-state driven, with no URL routes, so no rewrites are needed. The current role and screen are client state.
- **Copy.** Vietnamese UI copy; "Dữ liệu minh họa" stays visible.
- **Tests.** The existing state tests keep passing after they are updated for the new lifecycle. Scenario tests from doc §8 stay as unit tests, even though the panel is gone.

## Decisions the user made

- There are two roles, elderly and relative, each with a simple login. The staff role is dropped.
- The relative interacts with the elderly person's app directly. There is no verification step.
- A small backend is used so separate devices stay in sync. Upstash plus Vercel was accepted.
- Fake device buttons go on Bà Lan's Health screen.
- The responsive layout is the one in the mockups: bottom tabs on a phone, a sidebar on a laptop, and a login with account cards.

## Designer's calls (from the conversation, check while reading)

- **Status labels.** The new labels are "Chờ gia đình nhận" (instead of "Chờ điều phối"), "Cần xem" and "Tôi xem việc này". Statuses "Cần can thiệp" and "Chờ nhân viên xác nhận" are dropped, since nobody is left to set them.
- **Care Partners are removed.** The relative is the person who does or arranges the service. The service report reads "Người xác nhận: Chị Minh (con gái)".
- **What the daughter's list shows.**
  - "Yêu cầu của mẹ" shows **every** open request, including those still in "Chờ bổ sung thông tin" or "Chờ xác nhận". Those two are read-only for her and carry the label "Mẹ đang bổ sung / xác nhận".
  - Her actions start at "Chờ gia đình nhận".
- **Abandoned requests.** The 30-minute rule from doc §5 Mức 2 stays. A request nobody has accepted, in any of the first three states, gets the label "Bỏ ngỏ" and moves to the top of her list. She can phone her mother; nothing is auto-cancelled.
- **Seed data and reset.**
  - Example cases, alerts and notifications are timed relative to the reset moment, so they read as recent at any time of day.
  - Reminders already past at reset time are seeded as **Đã nhận** (answered). This prevents a burst of "Chưa có xác nhận" alerts on a reset.
  - One extra medicine reminder is due ~3 minutes after the reset, so the reminder flow can be shown live. It is one-off.
- **Day rollover.**
  - The schedule is a daily list of times. On the first read or action of a new day (Vietnam time), each reminder moves to today and its response, snooze and escalation are cleared.
  - Reminders the daughter approves through "Nhắc lịch" are daily.
  - Cases, alerts, notifications, chat and device readings carry over untouched.
- **Emergency acknowledgement reaches Bà Lan.** When the daughter presses Tôi đã tiếp nhận, Bà Lan's 115 screen adds "Chị Minh đã nhận được và đang xử lý". The 115 button stays.
  - Bà Lan can still close the overlay herself, as today.
  - It also closes when the daughter closes the emergency.
- **Polling.** It pauses while the tab is hidden, to stay inside Upstash's free tier.

## Left to the builder

- **Session token.** Pick the format, for example an HMAC-signed `{user, role}` with a secret from an env var plus a dev default.
- **API shape.** For example `POST /api/login`, `GET /api/state`, `POST /api/action`.
- **Concurrent writes.** Choose how two simultaneous actions are handled. A Redis transaction or retry is nice-to-have. Last-write-wins on a single record is acceptable for a two-person demo, but if chosen, mark it with a `ponytail:` comment.
- **Local API.** Choose how `npm run dev` serves the API, for example a Vite dev-server middleware calling the same handlers, or `vercel dev`.
- **Removing the old pieces.** Delete the dead files: ops screens, `PhoneFrame`, `ScenarioPanel`, and the clock actions.
- **Layout.** Pick exact breakpoints and the sidebar width.
