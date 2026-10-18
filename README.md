# CAREBOX

Responsive two-role web app of the CAREBOX care flow (`doc.pdf`, `design.jpg`): Bà Lan (elderly person) ↔ simulated AI assistant ↔ her daughter, Chị Minh. Each role logs in on its own device; both see the same live data.

> Simulation only. No real AI, no real devices, no medical judgement. All data is illustrative ("Dữ liệu minh họa"); the **↺** button in the top bar restores the demo data for both accounts.

## Accounts

| User | Role | Password |
|---|---|---|
| `ba.lan` | Bà Nguyễn Thị Lan — người cao tuổi | `carebox` |
| `con.gai` | Chị Minh (con gái) — gia đình | `carebox` |

## Run locally

```bash
npm i
npm run dev            # http://localhost:5173
npm run dev -- --host  # also reachable from phones on the same Wi-Fi
npm test               # state rules, API handler, scenarios
npm run build          # type-check + static site in dist/
```

`npm run dev` serves `/api/*` from the Vite dev server and keeps the shared state **in memory**: every tab and LAN device sees the same data until the dev server restarts. Log in as `ba.lan` in one browser and `con.gai` in another (or an incognito window); changes reach the other side within ~3 s.

The simulated devices (Bình thường / Vượt ngưỡng / Đáng nghi / Mất kết nối, Báo té ngã) are at the bottom of Bà Lan's **Sức khỏe** screen. Time is real Vietnam time (UTC+7).

## Deploy to Vercel

1. Import the repo in Vercel with the **Vite** framework preset (build `npm run build`, output `dist`).
2. **Storage → Marketplace → Upstash Redis** (free tier) and connect it to the project. It sets the `UPSTASH_REDIS_REST_*` (or `KV_REST_API_*`) env vars the server reads.
3. Optional: set `SESSION_SECRET` to any long random string. Changing it later logs everyone out.
4. Deploy. Without the Redis env vars the API falls back to in-memory state, which does not survive between serverless invocations.

## Where things live

- `src/state/` — the shared rules: statuses, priorities, emergency bypass, simulated AI, reminders, daily rollover. Pure functions, unit-tested; the server runs them.
- `server/` — the API: `api.ts` (one `handle(req)`: login, auth, per-role permissions, validation, tick, rev), `auth.ts` (accounts, HMAC tokens), `storage.ts` (Upstash Redis or in-memory).
- `api/` — one-line Vercel entry points (`login`, `state`, `action`) that re-export `server/api.ts`.
- `src/api.ts`, `src/state/store.tsx` — client fetch wrappers and the session-aware store (3 s polling, paused while the tab is hidden).
- `src/elder`, `src/family` — screens per role; `src/App.tsx` + `src/index.css` — the responsive shell (bottom tabs under 900 px, sidebar above).
- `docs/superpowers/` — design specs and implementation plans.
