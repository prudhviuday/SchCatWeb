# SchCatWeb

A static React + TypeScript web migration of the existing SchCat desktop stock-analysis application.

## Architecture decision

SchCatWeb is a **static website**. It has no runtime backend, database, Cloudflare Worker script, R2 bucket, Python service or server process.

- `frontend/`: React + TypeScript + Vite. All UI, calculations and browser-compatible data workflows run here.
- Root `wrangler.toml`: deploys only `frontend/dist` to Cloudflare Workers Static Assets.
- Browser APIs: provider requests are made directly from TypeScript when the provider permits browser access (including CORS) and does not require a protected secret.
- Local data: static JSON assets and browser storage (localStorage/IndexedDB) are used where appropriate.
- Build tools: Node.js/npm are used only to install dependencies, build the website and run optional development-time data conversion scripts. Node is not needed to serve the deployed website.

The old Hono API, R2 integration and backend importer were an exploratory implementation and have been superseded by this static-first decision. Do not recreate them by default.

## Provider API rule

For every existing provider integration, first reproduce the original URL, query parameters, headers and response parsing in browser TypeScript and test it from the deployed origin.

A browser may block an API that worked in Node because of CORS, browser security rules, authentication or provider restrictions. Do not assume direct browser access will work. Do not put private API keys, session cookies or credentials in frontend code. If a particular provider genuinely requires a protected server-side request, document that exact exception and ask before introducing any proxy or backend.

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

The chart data client is `src/data/providers/chartData.ts`. It calls Yahoo Finance directly from the browser with credentials omitted. The old local Node service at `127.0.0.1:3000` is not used by the static site. Live Yahoo CORS availability must still be checked in the browser.

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

## Provider diagnostics (Steps 8–9)

After the latest frontend commit is deployed, open `https://schcatweb.prudhvi123143.workers.dev/?diagnostics=providers` and select **Run browser diagnostics**. This executes requests in the actual website origin for both MarketSmith hosts, ChartInk's CSRF + scan flow, NSE historical delivery data, and a small Yahoo Finance chart sample. Use the MarketSmith ID/symbol fields for a known valid pair. The normal home page is unchanged.

The page never embeds the legacy `ms-auth` query values or reads/stores cookies. Credentialed cross-origin requests are subject to provider CORS headers and browser third-party-cookie policy. A browser `fetch` failure is reported as a possible CORS/network/privacy-policy block; inspect DevTools Console for the specific browser message.

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

- Build watch paths: `frontend/**` and `wrangler.toml`.

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
