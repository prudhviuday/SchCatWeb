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
- Hosting: Cloudflare Workers Static Assets, deployed using the root `wrangler.toml`.
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
- Deploy command: `npx wrangler deploy --config ./wrangler.toml`
- Watch paths: `frontend/**` and `wrangler.toml`

The single root `wrangler.toml` sets `name = "schcatweb"` and `assets.directory = "./frontend/dist"`, with SPA fallback. No R2 bucket is required. Cloudflare's current Wrangler documentation confirms that static asset deployment uses `assets.directory` and supports SPA fallback: https://developers.cloudflare.com/workers/wrangler/configuration/ .

## Revised migration plan

| Step | Scope | Status |
|---|---|---|
| 1 | Repository audit | Complete |
| 2 | Detailed migration mapping | Complete; static architecture amendment recorded |
| 3 | React + TypeScript + Vite frontend foundation | Scaffold exists; production build succeeded in Cloudflare build log |
| 4 | Temporary Hono/Worker backend foundation | Superseded; being removed in Step 6 |
| 5 | Exploratory R2 data integration/importer | Superseded; no production data import performed |
| 6 | Convert project to static-only Cloudflare deployment; remove backend/R2; update docs and CI | Complete — user confirmed the live Cloudflare site works; GitHub CI passes |
| 7 | Port core provider-independent fundamental calculation kernels to browser TypeScript with parity tests | Complete — six pure calculation functions and deterministic tests; PEG field mapping deferred until provider field semantics are verified |
| 8 | Audit and implement direct browser provider API access (MarketSmith, ChartInk, NSE); record CORS/auth limitations | In progress — browser diagnostic page and request-shape tests implemented; live-origin provider results pending |
| 9 | Port chart data workflows and existing CRIP4 Node chart behaviour to browser-compatible TypeScript | In progress — implementation and CI pass; live Yahoo CORS test pending |
| 10 | Port technical indicators with numerical parity tests | Complete — exact fast-technical-indicators 1.1.4 SMA/EMA/RSI kernels, CRIP4 wrappers, ULTM/ATP ports and CI parity tests |
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
- [x] Cloudflare build/deploy succeeds without any R2 bucket.
- [x] Live root URL serves the website with correct JavaScript/CSS MIME types (user confirmed working).

Implementation committed on `main`: `e477c62679c7de91acce65c0f1986192b7c456e2` (static conversion), followed by CI workflow correction `26c4e3531c8ca2134b74adc36c68152e2c3053ce`. The root Wrangler config is deliberately aligned with Cloudflare's existing deploy command, which runs from the repository root. The user confirmed the live site works; Step 6 is complete.

## Step 7 — Core fundamental calculation kernels

Completed on `main`. The legacy calculations were read directly from `prudhviuday/SchCat/util.py` and ported into `frontend/src/domain/analysis/fundamentalMetrics.ts`.

Ported functions:
- `normalizeSeries` — legacy min/max normalization to 0–100, preserving Python integer truncation and rejecting empty/constant inputs rather than inventing values.
- `calculateEarningsSalesScore` — exact first-three-quarter EPS/sales scoring weights and trend points used as the screener's `FScore`; strict threshold is greater than 70 and maximum score is 30.
- `clampQuarterlyGrowth` — truncation and clamp to -200..200.
- `calculateExpansionPercentage` — c25/c32 × 100 with truncation.
- `calculateInstitutionalCostBillions` — fund shares × current price / 1 billion with truncation.
- `calculateMarketCapWeightedRelativeStrength` — non-null mean imputation, zero/null replacement, optional market-cap weighting and reverse ordering.

Parity tests are in `frontend/tests/analysis/fundamentalMetrics.test.mjs`. They run using Node's built-in test runner through `npm run test:analysis`; no extra test framework or runtime package was added. The GitHub Actions run for commit `c112249d66c0c1ce3f2459b411730cd83294d765` passed, including calculation tests, TypeScript/Vite build and static deployment-config checks.

Not included in this pass: provider requests, UI wiring, chart indicators, delivery rolling windows and the PEG row assembly. The legacy PEG code has a type-inconsistent missing-field default (a string is later used as a divisor); do not silently change it. Verify actual MarketSmith field types and preserve the legacy error/fallback behaviour when addressing it during the provider/screener integration steps.

## Step 8 — Direct browser provider access audit (in progress)

Implemented on `main`:
- `frontend/src/data/providers/providerDiagnostics.ts` builds and probes the two MarketSmith endpoints used by the desktop app, ChartInk's CSRF + scan POST flow, NSE's historical delivery endpoint, and (added during Step 9) Yahoo Finance's chart JSON endpoint.
- `frontend/src/features/diagnostics/ProviderDiagnostics.tsx` provides an isolated diagnostic route at `/?diagnostics=providers`; the normal home page is unchanged.
- Requests run only after the user clicks the diagnostic button, directly from the browser. The page reports readable responses, HTTP/auth-policy errors, timeouts, and browser/network failures without displaying provider data or session material.
- MarketSmith's legacy hard-coded `ms-auth` query values are deliberately not copied into the public frontend bundle. Cross-origin credentials are requested through Fetch's normal `credentials: "include"` option only; the application does not read, write, or manually set cookies.
- JavaScript does not set a custom `User-Agent` or `Cookie` header. Browser restrictions and provider CORS rules determine whether the calls can work. A failed Fetch cannot reliably distinguish CORS from another network/privacy-policy failure; inspect DevTools Console.
- Provider request URL, parameter, and CSRF parser tests are in `frontend/tests/providers/providerDiagnostics.test.mjs`, run with `npm run test:providers`.

Verification:
- GitHub Actions passed on commit `a2f16a3ae211520b39d4b3d264b7d83a1b31d142`: calculation tests, provider request-shape tests, TypeScript/Vite production build and static output checks.
- The actual live-origin HTTP/CORS/authentication outcomes have not yet been collected. After Cloudflare deploys the latest `main` commit, open `https://schcatweb.prudhvi123143.workers.dev/?diagnostics=providers`, click **Run browser diagnostics**, and share the results plus any relevant Console errors.
- Do not add a proxy/backend by default. If a particular provider proves to require server-side access, document the specific reason and obtain user approval first.

## Step 9 — Chart data workflow and CRIP4 chart transforms (in progress)

Implemented in `frontend/src/data/providers/chartData.ts`:
- Direct browser Yahoo chart JSON request builder and parser for explicit 1W, 1D, 1H and 5m intervals.
- 15m grouping from three consecutive 5m candles and 4H aggregation at the legacy 09:15 and 13:15 IST session starts.
- Chronological OHLCV candles, weekly close×volume history, stock/gold timestamp merge + forward-fill, and fixed-₹50-notional synthetic stock-vs-gold series.
- No local Node chart server or session credentials are required.

The original `CRIP4/public/Tools/fixer.js` contains `else if (key = 1000)`, an assignment rather than a comparison. The browser port uses the explicit timeframe labels from `chartengine.py` rather than perpetuating the unintended daily-only branch. The hard-coded MarketSmith weekly-chart `ms-auth` value and gold network fetch have not been ported. Yahoo browser-origin CORS is still unverified.

Tests: `frontend/tests/providers/chartData.test.mjs`, run by `npm run test:charts`. GitHub Actions passed on commit `a88368fb8b65ed985a11eacd3d9659cc15463d01`: https://github.com/prudhviuday/SchCatWeb/actions/runs/42073743174. Step 9 remains open only for provider-origin validation / any resulting access decision; do not create a proxy without user approval.

## Step 10 — Technical indicators (complete)

Source verification:
- The desktop `CRIP4/package-lock.json` pins `fast-technical-indicators` at **1.1.4** (not merely a floating latest version).
- Its SMA, EMA and RSI implementations were checked against the upstream `v1.1.4` source. SchCatWeb ports those numeric algorithms without adding a runtime dependency.

Implemented in `frontend/src/domain/analysis/technicalIndicators.ts`:
- `calculateSma`: rolling simple average, first output at index `period - 1`.
- `calculateEma`: initial SMA seed, then `alpha = 2 / (period + 1)`.
- `calculateRsi`: Wilder-smoothed gains/losses, first output after `period` changes, and the package's exact two-decimal rounding and zero-average-loss rule.
- `smaInc`, `emaInc`, `rsiInc`: legacy wrapper semantics, including leading empty-string padding and RSI's fixed period of 21.
- `ultmInc` and `atpInc`: ported CRIP4 formulas and output attachment behaviour. The old code combines raw EMA arrays without timestamp alignment; that behaviour is intentionally retained and covered by tests rather than silently corrected.
- Replaced the legacy dynamic `eval` property assignment with a safe computed property.

Known legacy defects retained for review:
- ULTM's raw fast/slow EMA indexing means the values are not aligned to the candle period, and a long-period EMA can be shorter than the fast-period EMA; the resulting undefined/NaN tail is preserved because it is what the old implementation produces.
- ATP similarly attaches raw EMA-ratio arrays at row zero without leading alignment.
- The old `touch_inc` refers to an undefined `d1` and is not exported; it has not been ported as a working feature.
- Any future correction of these semantics should be a consciously reviewed formula change with comparison against the existing desktop output.

Tests: `frontend/tests/analysis/technicalIndicators.test.mjs`, command `npm run test:indicators`. GitHub Actions passed on commit `032e375a7ef30ebb6c1a670944260935b730df3c`: calculation tests, provider tests, chart tests, indicator tests, TypeScript/Vite production build and static-deployment checks. Run: https://github.com/prudhviuday/SchCatWeb/actions/runs/42075480413.

## Next step

Step 11: inspect and convert/import only non-sensitive reference workbooks and JSON datasets into static browser-readable assets. Keep personal watchlists, portfolio data and personal files out of public static assets. Live provider CORS checks from Steps 8–9 remain open and should be revisited before provider-dependent screens are completed.
