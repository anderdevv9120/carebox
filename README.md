# CAREBOX Demo

Clickable demo of the CAREBOX care flow (`doc.pdf`, `design.jpg`): elderly person ↔ simulated AI ↔ family ↔ CAREBOX staff ↔ Care Partner.
Switch roles at the top right; run the 8 test scenarios from doc §8 in the side panel.

> Simulation only. No backend, no real AI, no real devices, no medical judgement. All data is illustrative and lives in your browser's localStorage (`↺ Reset demo` restores it).

## Run

```bash
npm i
npm run dev     # http://localhost:5173
npm test        # state logic + doc §8 scenarios
npm run build   # static site in dist/
```

## Deploy to Vercel

Import the repo in Vercel → Framework preset **Vite** → build `npm run build` → output `dist`. No rewrites needed (navigation is in-app state, not URLs).

## Where things live

- `src/state/` — all rules (statuses, priorities, emergency bypass, simulated AI). Pure functions, unit-tested.
- `src/elder`, `src/family`, `src/ops` — screens per role. `src/scenarios.ts` — doc §8 scenarios.
- `docs/superpowers/` — design spec and implementation plan.
