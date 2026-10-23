# CAREBOX

Responsive three-role web app of the CAREBOX care flow (`doc.pdf`, `design.jpg`): Bà Lan (elderly person) ↔ CAREBOX assistant ↔ her daughter, Chị Minh, and the CAREBOX coordinator, Anh Nam. Each role logs in on its own device; all see the same live data.

> Demo only. No real devices or medical judgement. All data is illustrative ("Dữ liệu minh họa"); the **↺** button in the top bar restores the demo data for all accounts. The AI chat can use Google AI Studio when configured below.

## Accounts

| User | Role | Password |
|---|---|---|
| `ba.lan` | Bà Nguyễn Thị Lan — người cao tuổi | `carebox` |
| `con.gai` | Chị Minh (con gái) — gia đình | `carebox` |
| `nhan.vien` | Anh Nam — nhân viên điều phối (staff) | `carebox` |

Staff flow: the elder's service requests (medicine, groceries, clinic, daily help, medicine reminders), device alerts, unclear requests and emergencies go to Anh Nam's **Bảng điều phối**. He verifies each request. For medicine, groceries, clinic and daily help he also assigns a seeded Care Partner (Anh Tuấn, Chị Hoa), records the Care Partner's report and confirms completion; none is Hoàn tất without both. Medicine reminders have no Care Partner: staff-entered medication waits for family confirmation. Staff close alerts; the family can only acknowledge an emergency ("Tôi đã tiếp nhận"). The family sees these cases read-only and answers staff questions; it keeps its own contact and non-medicine reminder requests, and staff take a family-owned request over if it waits 30 minutes. Dose or medicine changes are refused by the AI and sent to staff.

State version 3: stored v2 data is re-seeded once after deploy.

## Schedules and health entry

- **Gia đình / Nhân viên → Lịch trình:** add and edit medication, meals, appointments and activities. Medication collects name/strength, dose, instructions, daily times, and inclusive start/end dates; appointments collect their location. Each dose time can be edited separately. Family saves confirm medication immediately; staff saves and edits wait for family confirmation, including the older reminder-request flow. Unconfirmed medication does not appear in the elder's active schedule or raise overdue alerts.
- **Hủy lần…:** cancel only the selected time on the selected date. Other dates and dose times remain. All other roles receive notifications when a schedule is added, edited, confirmed or canceled; elders open them from the top-bar bell.
- **Bà Lan → Uống thuốc / Lịch khám:** show every confirmed, uncanceled occurrence today, including acknowledged reminders. Clinic appointments offer **Hỗ trợ gọi xe**, a simulated booking screen that never calls a real transport service.
- **Bà Lan → Sức khỏe → Nhập chỉ số sức khỏe:** enter blood pressure, pulse, glucose or SpO₂. Readings use the existing demo thresholds, charts and alerts to family/staff, and are labeled as elder-entered. Manual entry does not reconnect a disconnected device. Existing simulator, disconnect and fall buttons remain.

Existing v3 state remains compatible. The reset button loads the updated sample medication and clinic data; it also clears existing demo data and chat, so use it only when that is intended.

## Run locally

```bash
npm i
npm run dev            # http://localhost:5173
npm run dev -- --host  # also reachable from phones on the same Wi-Fi
npm test               # state rules, API handler, scenarios
npm run build          # type-check + static site in dist/
```

`npm run dev` serves `/api/*` from the Vite dev server and persists shared demo data in the ignored `.carebox-state.json` file (including chat history). It survives reloads and local dev server restarts. The ↺ reset button clears the conversation and restores the demo. Log in as `ba.lan`, `con.gai` and `nhan.vien` in separate browsers (or incognito windows); changes reach the other side within ~3 s.

## Real AI (Google Gemini API)

Create `.env.local` from `.env.example` and set `GEMINI_API_KEY` to a key from [Google AI Studio](https://aistudio.google.com/apikey). Restart `npm run dev`. On Vercel, set the same variable under **Project → Settings → Environment Variables** and redeploy. Do **not** use `VITE_GEMINI_API_KEY` or put the key in browser code.

Free-form chat uses Google's `@google/genai` SDK with `gemma-4-26b-a4b-it` and `thinkingLevel: MINIMAL` (non-reasoning). One response handles conversation and also routes the message (`answered`, `unclear`, `service` or `emergency`); after one re-ask for an unclear request, or when Bà Lan presses **Gặp nhân viên**, CAREBOX creates an uncertain alert owned by staff and tells Chị Minh that staff took it. Normal conversation does not count as a misunderstanding. See [AI escalation](docs/ai-escalation.md) for details and limitations. Existing request workflows, confirmations, medical warnings, emergency escalation, and device readings still use the tested server rules. Without a key, chat uses the original offline demo responses. The server retries transient HTTP 500/503 errors twice; provider delays and quotas may affect availability. The system instruction, last 12 chat messages, and current message are sent to Google. **Do not send real patient information** in this demo. Microphone input still uses the browser's speech recognition.

The simulated devices (Bình thường / Vượt ngưỡng / Đáng nghi / Mất kết nối, Báo té ngã) are at the bottom of Bà Lan's **Sức khỏe** screen. Time is real Vietnam time (UTC+7).

## Deploy to Vercel

1. Import the repo in Vercel with the **Vite** framework preset (build `npm run build`, output `dist`).
2. **Storage → Marketplace → Upstash Redis** (free tier) and connect it to the project. It sets the `UPSTASH_REDIS_REST_*` (or `KV_REST_API_*`) env vars the server reads. **Required:** Vercel cannot keep chat history reliably without persistent storage.
3. Optional: set `SESSION_SECRET` to any long random string. Changing it later logs everyone out.
4. Deploy. Without the Redis env vars, server startup fails rather than intermittently discarding chat history.

## Where things live

- `src/state/` — the shared rules: statuses, priorities, emergency bypass, simulated AI, reminders, daily rollover. Pure functions, unit-tested; the server runs them.
- `server/` — the API: `api.ts` (one `handle(req)`: login, auth, per-role permissions, validation, tick, rev), `auth.ts` (accounts, HMAC tokens), `storage.ts` (Upstash Redis on Vercel, local file for development, memory for tests).
- `api/` — one-line Vercel entry points (`login`, `state`, `action`) that re-export `server/api.ts`.
- `src/api.ts`, `src/state/store.tsx` — client fetch wrappers and the session-aware store (3 s polling, paused while the tab is hidden).
- `src/elder`, `src/family`, `src/staff` — screens per role; `src/App.tsx` + `src/index.css` — the responsive shell (bottom tabs under 900 px, sidebar above).
- `docs/superpowers/` — design specs and implementation plans.
