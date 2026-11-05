# SchCatWeb — Project Status and Chat Handover

This is the durable source of truth for continuing the SchCat migration. In a new chat, the user can say **"Continue SchCatWeb — Step N"** or simply **"Step N"**. Read this file and `docs/STEP-2-MIGRATION-MAPPING.md` before continuing.

## User requirements

- Work sequentially, one step at a time. The user explicitly starts each step.
- Do not start later steps without approval.
- Work directly on `main`; do not create branches without explicit permission.
- Preserve the original `prudhviuday/SchCat` desktop repository and its files.
- Preserve formulas, calculations, provider choices, request parameters and data meanings. Port to TypeScript and test parity.
- The target is a simple static website, similar in deployment simplicity to Honeycomb's frontend.
- The user wants a live Cloudflare URL. Do not claim a deployment is live until a successful deploy and smoke test are confirmed.

## Binding architecture decision (updated 2026-11-05)

**SchCatWeb is static-first and has no runtime backend or database.**

- UI: React + TypeScript + Vite in `frontend/`.
- Hosting: Cloudflare Workers Static Assets, deployed from the root `wrangler.toml`.
- The Wrangler config has no `main`, no Worker script, no API routes and no bindings. It serves only `frontend/dist`.
- All analysis logic runs in browser TypeScript.
- Provider APIs are called directly from browser TypeScript only where the provider permits browser access (CORS) and does not require protected credentials.
- Static JSON assets may hold non-sensitive reference datasets. Personal settings/watchlists/portfolio can use localStorage or IndexedDB; this is device/browser-local, not cloud sync.
- Node/npm are development/build tools only. No Node server runs after deployment. SchCatWeb must not require Python.
- No database, R2, Hono, FastAPI, server-side API or proxy is to be introduced by default.
- If a specific provider is proven to require server-side access due to CORS/auth/security, document that exact exception and obtain user approval before introducing any proxy. Never expose private API keys, cookies or session tokens in browser code.
- The previous Hono/R2 implementation was exploratory and is superseded. It must not be treated as a required feature.

## Deployment configuration

Existing Cloudflare Worker name and URL:
- Worker: `schcatweb`
- URL: `https://schcatweb.prudhvi123143.workers.dev/`

Cloudflare Workers Builds settings:
- Root directory: blank/repository root.
- Build command: `cd frontend && npm install && npm run build`
- Deploy command: `npx wrangler deploy`
- Watch paths: `frontend/**`, `wrangler.toml`

Root `wrangler.toml` sets `name = "schcatweb"` and `assets.directory = "./frontend/dist"`, with SPA fallback. There is no R2 bucket requirement. Cloudflare's Wrangler docs confirm that `main` is optional for assets-only Workers and static assets can be deployed without a Worker script: https://developers.cloudflare.com/workers/wrangler/configuration/ .

## Revised migration plan

| Step | Scope | Status |
|---|---|---|
| 1 | Repository audit | Complete |
| 2 | Detailed migration mapping | Complete; static architecture amendment recorded |
| 3 | React + TypeScript + Vite frontend foundation | Scaffold exists; production build succeeded in Cloudflare build log |
| 4 | Temporary Hono/Worker backend foundation | Superseded; being removed in Step 6 |
| 5 | Exploratory R2 data integration/importer | Superseded; no production data import performed |
| 6 | Convert project to static-only Cloudflare deployment; remove backend/R2; update docs and CI | Code complete; Cloudflare deployment pending |
| 7 | Port core SchCat analysis calculations to browser TypeScript with parity tests | Not started |
| 8 | Audit and implement direct browser provider API access (MarketSmith, ChartInk, NSE); record CORS/auth limitations | Not started |
| 9 | Port chart data workflows and existing CRIP4 Node chart behaviour to browser-compatible TypeScript | Not started |
| 10 | Port technical indicators with numerical parity tests | Not started |
| 11 | Convert/import non-sensitive reference workbooks and JSON to static browser-readable data | Not started |
| 12 | Stock screener: universe, filters, queries and sorting | Not started |
| 13 | Charts and Stock Workspace | Not started |
| 14 | Industry Analysis | Not started |
| 15 | Research module | Not started |
| 16 | Market Pulse | Not started |
| 17 | Portfolio using browser-local storage/import/export | Not started |
| 18 | Watchlists and query management using browser-local storage/import/export | Not started |
| 19 | Integration, parity, browser compatibility and end-to-end testing | Not started |
| 20 | Cloudflare production deployment and final release verification | Not started |

Steps 7–11 are ordered to establish calculations, provider access, chart behaviour and static data before completing the feature screens. The original desktop app remains the behavioural reference throughout.

## Historical progress

### Step 1 — Repository audit
Completed. The source repository contains the PyQt desktop app, analysis modules, a Node chart service under `CRIP4`, and Excel/JSON data. Key files include `Guimain2.py`, `helper.py`, `util.py`, `chartink.py`, `chartengine.py`, `CRIP4/app.js`, `CRIP4/indicators.js`, and the `Tabs/` modules.

### Step 2 — Detailed migration mapping
Completed. See `docs/STEP-2-MIGRATION-MAPPING.md`. The mapping records modules, calculations, provider workflows, file schemas, UI behaviours and known issues. Python code is a behaviour reference only; it is not part of the web runtime.

### Step 3 — Frontend foundation
React + TypeScript + Vite shell created. It has a dark financial-terminal visual direction. The initial Cloudflare build log confirmed the Vite production build generated `frontend/dist/index.html` and JS/CSS assets.

### Step 4 — Temporary backend foundation (superseded)
A TypeScript + Hono Worker API was created, including health/data routes, CORS, request IDs, logging and tests. This is no longer the target architecture and is removed in Step 6.

### Step 5 — Exploratory data integration (superseded)
A TypeScript ExcelJS importer and R2 read-only data API were created. CI passed TypeScript checks, tests, dependency audit and frontend build. However, no production data was imported or uploaded. The deployment log showed that the `schcat-data` R2 bucket did not exist. The user then clarified that no R2/backend/database is wanted. This entire R2 approach is superseded; do not create the bucket.

## Step 6 — Static architecture conversion

Goal: make SchCatWeb deploy only the Vite frontend as static assets.

Acceptance criteria:
- [x] Remove the backend/Hono/R2 implementation.
- [x] Remove the frontend's local `/api` proxy.
- [x] Add root Wrangler static-assets config with Worker name `schcatweb`, no `main` and no bindings.
- [x] Simplify CI to install/build/test only the static frontend.
- [x] Update README and migration docs to match static-first architecture.
- [ ] Cloudflare build/deploy succeeds without any R2 bucket.
- [ ] Live root URL serves the website with correct JavaScript/CSS MIME types.

Implementation committed on `main`: `e477c62679c7de91acce65c0f1986192b7c456e2` (static conversion), followed by CI workflow correction `26c4e3531c8ca2134b74adc36c68152e2c3053ce`. The user must still confirm Cloudflare deployment and browser smoke test. The successful Vite build in the earlier log was before this static-only deployment configuration; a new CI run/deploy must verify the current commit.

## Next step (after Step 6 acceptance)

Step 7: identify the first core analysis calculations and port them to TypeScript. Begin by reading the exact legacy source functions and their dependencies; add deterministic fixtures and parity tests before integrating them into the UI. Do not guess formulas or replace provider sources.
