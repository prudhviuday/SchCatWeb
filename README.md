# SchCatWeb

A static React + TypeScript web migration of the existing SchCat desktop stock-analysis application.

## Architecture

SchCatWeb uses a **React frontend plus a same-origin Cloudflare Worker API**.

- `frontend/`: React + TypeScript + Vite. UI, calculations, chart shaping and analysis run here.
- `worker/index.js`: server-side API gateway for Yahoo Finance, MarketSmith, ChartInk and NSE. The browser calls only same-origin `/api/*` routes; the Worker contacts the external providers. This mirrors the original desktop architecture, where Node's `got` and Python's `requests` performed provider requests outside the browser.
- Root `wrangler.toml`: deploys the Worker script and `frontend/dist` as one Cloudflare Worker. The Worker handles `/api/*`; the static asset binding serves the website and SPA routes.
- Local data: non-sensitive reference JSON remains static. Personal holdings, watchlists and settings remain browser-local unless a later sync feature is explicitly approved.
- Node.js/npm are used for development and builds. The deployed API runs on the Cloudflare Workers runtime; no always-on Node server or Python process is required.

This restores the useful part of the old desktop architecture: a server-side process makes provider requests and returns JSON to the UI. It does **not** reproduce a VPN. No VPN or proxy configuration was found in the old Node request code. If a provider blocks Cloudflare's outbound network, we may need a separate Node host with an approved network route.

## Provider API and security

The browser calls same-origin `/api/*` endpoints. The Worker exposes fixed, validated provider routes; it is not an arbitrary URL proxy.

- Yahoo Finance chart requests: `GET /api/yahoo/chart` (short edge cache; timeframe and symbol allowlists).
- MarketSmith finance and symbol details: `GET /api/marketsmith/finance` and `GET /api/marketsmith/symbol`.
- ChartInk scans: `POST /api/chartink/scan`. The Worker obtains the CSRF page and session cookie, then performs the scan POST server-side.
- NSE historical delivery: `GET /api/nse/delivery`.
- Health: `GET /api/health`.

The Worker validates symbols, instrument IDs, intervals, ranges and dates; applies upstream timeouts; returns provider HTTP status; and caches eligible successful read-only GET responses briefly. MarketSmith responses are not cached because they use session credentials. ChartInk scans are not cached. Provider access is still subject to each provider's authentication, anti-bot and network policies. Browser CORS is no longer part of the external-provider request path; the browser talks only to SchCatWeb.

**MarketSmith secrets:** the original desktop requests supplied an `ms-auth` query value. The Worker accepts `MARKETSMITH_FINANCE_AUTH` for `financeDetails` and `MARKETSMITH_SYMBOL_AUTH` for `symboldetails`; a shared `MARKETSMITH_AUTH` is also accepted as a fallback. Use current values from an authenticated MarketSmith session, not the old hard-coded values from the legacy source. Configure them from the repository root with `npx wrangler secret put MARKETSMITH_FINANCE_AUTH` and `npx wrangler secret put MARKETSMITH_SYMBOL_AUTH`. Never paste them into chat, the frontend, or committed source. The diagnostics page shows a clear 503 when the required secret is missing.

For production, configure a Cloudflare rate-limiting/WAF rule for `/api/*` before exposing the service to significant public traffic. Do not treat this provider gateway as a general-purpose proxy.

## Requirements

- Node.js 22 LTS recommended for development/build.
- npm.
- Git.

## Run locally (Windows PowerShell)

From the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally http://127.0.0.1:5173).

Build and verify:

```powershell
npm run build
```

The production website is generated in `frontend/dist/`.

## Calculation tests

Run the provider-independent calculation parity tests with Node's built-in test runner (no additional test framework dependency):

```powershell
npm run test:analysis
```

The test command compiles the pure TypeScript calculation module to the ignored `.test-dist/` directory and runs deterministic expected-value tests against the legacy SchCat formulas. The GitHub Actions workflow runs these tests before the production build.

## Chart data tests (Step 9)

Run deterministic tests for Yahoo chart-response parsing, timeframe URL mapping, 15-minute/4-hour aggregation, weekly close×volume history and stock/gold transformations:

```powershell
npm run test:charts
```

The chart data client is `src/data/providers/chartData.ts`. It calls the same-origin `/api/yahoo/chart` Worker route; the Worker fetches Yahoo server-side and caches successful responses briefly. The old local Node service at `127.0.0.1:3000` is not used by the deployed site. Run the provider diagnostics after deployment to confirm Cloudflare-to-Yahoo connectivity.

## Technical indicator tests (Step 10)

Run the browser TypeScript parity tests for SMA, EMA, RSI, ULTM and ATP:

```powershell
npm run test:indicators
```

The implementation is in `src/domain/analysis/technicalIndicators.ts`. It follows the exact `fast-technical-indicators@1.1.4` dependency pinned in the original desktop app's CRIP4 lockfile, including the RSI rounding rule, wrapper padding, and legacy ULTM/ATP indexing. The known ULTM/ATP alignment defects are documented and covered by tests rather than silently changed.

## Static reference data (Step 11)

The website now publishes these non-sensitive reference datasets under `frontend/public/data/`:

- `marketUniverse.json`: 2,256 stock reference rows (symbol, MarketSmith ID, market cap, sector, industry, P/B, ROCE and NikScore).
- `industries.json`: 107 unique industry labels.
- `marketSmithIds.json`: 1,256 symbol-to-ID pairs used by the legacy CRIP4 chart provider.
- `manifest.json`: provenance, record counts, source blob SHAs and limitations.
- `conversion-report.json`: conversion checks and data-quality warnings.

Use the typed loaders in `src/data/reference/`. Tests run with:

```powershell
npm run test:reference
```

**Important freshness warning:** the source stock-universe workbook has no recorded as-of date. MarketCap, P/B, ROCE and NikScore in `marketUniverse.json` are an undated static snapshot. Do not show them as live values or use them for current ranking until fresh provider data replaces them. The source has two duplicate instrument-ID pairs; both rows are retained and documented in the manifest/report.

The smaller 1,256-entry chart lookup is intentionally separate from the 2,256-row stock universe. Do not merge their symbols/aliases or assume every screener row has a chart-provider mapping.

The source `ChartInkQs.xlsx` Watchlist and Portfolio sheets, dated industry-analysis outputs, alternate reference lists and unidentified workbooks were not published. Personal holdings and watchlists must remain in browser-local storage/import/export.

The development-time converter is `tools/convert-source-reference-data.mjs`. Its GitHub Actions workflow reads the approved workbooks from the source `SchCat` repository and commits generated JSON; the XLSX reader is not part of the deployed application.

## Stock Screener (Step 12)

The Stock Screener is available from the left navigation and uses the same-origin static loaders in `src/data/reference/`. It currently loads the 2,256-row universe, with symbol/industry/sector search, sector and industry selection, numeric min/max filters, sortable columns, 50-row pagination and CSV export. Double-click an Industry value to filter that industry.

The reference workbook has no as-of date. Market Cap, P/B, ROCE and NikScore are explicitly marked as undated snapshot values in the UI and CSV. Provider-only fields (RS, EPS rank, MasterScore, Acc/Dis, PE and PEG) are not fabricated or filled with desktop fallback values; they remain unavailable until Worker-backed MarketSmith access has been validated.

The desktop multi-query AND intersection is ported as session-only symbol-set queries. Users can add named comma/space-separated stock lists and intersect selected lists. This is not yet saved ChartInk scan execution: the saved query workbook sheet has not been imported, Worker-backed provider connectivity remains subject to live verification, and these temporary lists reset on refresh. Persistent query/watchlist management remains a later step.

Run the screener logic tests:

```powershell
npm run test:screener
```

The tests cover search/category filters, numeric ranges, AND query intersection, missing query keys, case normalization, stable text sorting and numeric sorting with null values last. GitHub Actions runs these tests as part of the normal verification workflow.

## Charts & Stock Workspace (Step 13)

The **Charts & Workspace** navigation opens a browser-only stock workspace. Selecting a symbol in the Stock Screener opens the same workspace with that stock preselected; a symbol can also be entered directly.

The screen requests the desktop app's four chart periods independently:
- Weekly: Yahoo Finance `1wk` candles, five-year range.
- Daily: `1d`, two-year range.
- Hourly: `1h`, six-month range.
- Five-minute: `5m`, one-month range.

Charts render candlesticks and volume, with EMA 20/50 overlays calculated on the full returned series and aligned to their candle positions. The daily panel shows last close, change against the previous daily candle, and RSI(21). Visible chart history can be set to 100, 200 or 500 candles. Time labels use Asia/Kolkata.

The selected-stock reference panel displays only the existing workbook fields (Market Cap, P/B, ROCE and NikScore) with the same explicit undated-snapshot warning as the screener. Provider-only fundamentals and the legacy ROCE, institutional ownership, quarterly sales and EPS charts have not been fabricated; they remain pending validated Worker-backed MarketSmith/NSE connectivity. Yahoo chart requests now use the same-origin Worker endpoint; confirm live upstream reachability with server-side diagnostics after deployment. Individual chart cards show their own provider error and retry control when access fails.

Run chart view tests with:

```powershell
npm run test:workspace
```

Tests cover chronological ordering, indicator alignment after viewport slicing, RSI-21 calculation, insufficient indicator history, invalid viewport limits and IST time labels. GitHub Actions runs this suite alongside all previous parity tests and the production build.

## Industry Analysis (Step 14)

The **Industry Analysis** screen is available from the left navigation. It groups the static stock universe by industry (excluding labels beginning with `BSE`, matching the desktop worker), shows each industry's stock count and undated source Market Cap sum, and opens individual stocks in the Charts & Workspace.

The screen can import a saved JSON file from the desktop application's `data/IndustryAnalysis` folder and render the four legacy series: institutional value, delivery percentage, close×volume, and market-cap-weighted industry RS. The old five-array structure is preserved on export. The import is done locally in the browser; the file is not uploaded to the website.

**Live industry analysis is intentionally disabled** until MarketSmith and NSE connectivity is verified through the Worker. The desktop worker requires MarketSmith institutional value and RS data, Yahoo weekly OHLCV for close×volume, and NSE delivery/traded values. The latest observed provider results (before the server-side request restoration) were MarketSmith 403 and NSE 520; rerun `/?diagnostics=providers` after the new Worker deployment. Do not treat request-shape tests as evidence of live provider connectivity.

The exact desktop aggregation kernels are in `src/features/industry/industryAnalysis.ts`:
- Institutional value, close×volume and weighted RS use first-value left padding, then sum.
- NSE delivery and traded values use zero left padding, then delivery percentage is calculated as aggregate delivery value × 100 / aggregate traded value.
- The industry RS denominator preserves the desktop's initial +1 and missing-market-cap +1 fallback.

The old chart titles were misleading: institutional value is shares held by funds × current stock price / 1bn, not ownership percentage; the “revenue” series is close × volume / 1bn, not revenue. The web screen labels the measures accurately. Saved legacy arrays do not contain dates, so imported charts use observation indexes and must not be read as calendar-aligned series.

Run industry aggregation and saved-file compatibility tests:

```powershell
npm run test:industry
```

GitHub Actions runs these tests with all other parity suites and the static production build.

## Research (Step 15)

The **Research** screen compares a performance-file stock universe with the historical symbol universe returned by each ChartInk query. It supports three browser-local imports:

1. Performance CSV with a `symbol` or `Stock` column.
2. Query-definition CSV with `QueryName,QueryCode` or `Name,Query` columns.
3. Historical match JSON mapping each query name to the unique stock symbols returned across its backtest dates. The screen can download a blank JSON template from the imported query definitions.

The browser calculates:
- Matches = size of the intersection between the unique performance symbols and the unique historical symbols for that query.
- Displayed Total = number of unique performance symbols, preserving the desktop's table value.
- Match % = Matches / number of unique historical query symbols × 100, rounded to two decimals using Python-compatible half-to-even rounding.

The desktop deliberately uses different denominators for the displayed Total and Match %. Both are displayed separately in SchCatWeb so the percentage calculation is transparent. Results can be exported as CSV. Files are read in the browser and are not uploaded. Excel workbooks should be saved as CSV for import; the personal Watchlist and Portfolio sheets in the original workbook are not required.

**Live ChartInk historical scans are not yet connected to the Research UI.** The Worker API now supports the `backtest/process` flow, but this screen still evaluates imported historical match sets only. Cloudflare-to-ChartInk connectivity and the actual response shape must be validated before wiring the live history workflow.

Run Research tests:

```powershell
npm run test:research
```

Tests cover CSV quoting/BOM/CRLF parsing, supported column aliases and per-row fallback, symbol normalisation, historical JSON validation, exact match/intersection counts, denominator semantics, Python rounding and result export. GitHub Actions runs these with the existing parity suites and production build.

## Provider diagnostics (Steps 8–9)

After the latest commit is deployed, open `https://schcatweb.prudhvi123143.workers.dev/?diagnostics=providers` and select **Run server-side diagnostics**. This calls the same-origin Worker routes for Yahoo Finance, both MarketSmith endpoints, NSE historical delivery and ChartInk's CSRF + scan flow. The browser does not call any external provider directly. Use the MarketSmith ID/symbol fields for a known valid pair. The normal home page is unchanged.

The diagnostic tests the deployed Worker-to-provider path and reports the upstream HTTP result. The browser should only need same-origin access to `/api/*`; CORS from Yahoo/MarketSmith/ChartInk/NSE should not affect the external request. The ChartInk Worker flow performs its own CSRF/session bootstrap. NSE now bootstraps its homepage and forwards the session cookie to the history endpoint. MarketSmith requires current authorization: configure `MARKETSMITH_FINANCE_AUTH` and `MARKETSMITH_SYMBOL_AUTH` as Cloudflare secrets (or shared `MARKETSMITH_AUTH`). If a provider still returns 403/520, that is an upstream restriction/network result, not a browser CORS error.


## Production integration smoke tests (Step 19)

After building the static site, run:

```powershell
npm run test:integration
```

This starts Vite's production preview locally and verifies SPA fallback for deep links, the compiled bundle's six workspace modules and provider diagnostics, public reference-data availability/counts against the manifest, Worker API routes, and the Cloudflare Worker/static-asset configuration. CI runs this suite after `npm run build`.

These tests do not contact external market-data providers and do not prove that the latest commit has been deployed to Cloudflare. Live Cloudflare-to-provider connectivity, authentication and production-origin verification remain part of the final release step.

## Cloudflare Workers Builds

Configure the existing Cloudflare Worker `schcatweb` as follows:

- Root directory: repository root (blank).
- Build command:

```bash
cd frontend && npm install && npm run build
```

- Deploy command:

```bash
npx wrangler deploy --config ./wrangler.toml
```

- Build watch paths: `frontend/**`, `worker/**` and `wrangler.toml`.

The root Wrangler config publishes `./frontend/dist` as static assets. It intentionally has no `main` entry point, Worker script, API route, R2 binding or database. Keep the Worker name as `schcatweb` to match the existing Cloudflare deployment.

Cloudflare executes the build and deploy commands in separate shell sessions. The deploy command therefore runs from the repository root and reads the root `wrangler.toml`; it does not depend on the build command's working directory.

## Data and privacy

- Never commit personal workbook data, provider credentials, session cookies or tokens.
- Public static JSON files are readable by anyone who can access the website. Only place non-sensitive reference data there.
- Use browser storage for personal settings and locally maintained watchlists/portfolio data. Browser storage is local to that browser/device and is not cloud-synchronised.
- Excel-to-JSON conversion, if needed, is a development-time task. It must not introduce a runtime backend.

## Migration rules

- Implement one numbered step at a time; wait for the user's acceptance before moving to the next.
- Work on `main`; do not create branches without explicit permission.
- Preserve the original SchCat desktop repository and its data.
- Port formulas and business rules to TypeScript with parity tests against the desktop behaviour.
- Preserve existing provider choices and request semantics; do not silently substitute APIs or formulas.
- Report browser CORS/authentication limitations honestly and do not expose secrets.
