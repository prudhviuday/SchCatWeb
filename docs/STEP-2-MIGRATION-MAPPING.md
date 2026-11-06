# SchCat to SchCatWeb — Migration Mapping

**Source:** `prudhviuday/SchCat`  
**Target:** `prudhviuday/SchCatWeb`  
**Status:** Feature/behaviour mapping. Updated 5 November 2026 for static-first architecture.

## 1. Binding target architecture

SchCatWeb is a **static React + TypeScript + Vite website** hosted using Cloudflare Workers Static Assets. It has no runtime backend, database, R2, Hono, FastAPI, server process or Python dependency.

| Responsibility | Target |
|---|---|
| UI and routing | React + TypeScript in `frontend/src` |
| Analysis calculations | Browser TypeScript modules |
| Provider requests | Direct browser `fetch` clients where CORS/auth rules permit |
| Non-sensitive reference data | Static JSON assets generated during development/build |
| Personal preferences, watchlists and portfolio | localStorage/IndexedDB with import/export |
| Charts and indicators | Browser TypeScript and browser chart library |
| Deployment | Root `wrangler.toml` publishing `frontend/dist` as static assets |
| Node/npm | Build and optional development-time conversion only; never a runtime server |

### Provider API boundary

Node can call some APIs that browsers cannot. A provider may reject browser requests through CORS, require cookies/session credentials, or prohibit exposing a key. Therefore:
1. Reproduce the existing provider URL, parameters, headers and parsing in browser TypeScript.
2. Test from the actual website origin.
3. Record which requests succeed, fail due to CORS, or require protected credentials.
4. Never place private credentials, cookies or session tokens in frontend bundles.
5. Do not add a proxy/backend unless a specific provider is proven to require it and the user approves that exception.

The prior Hono/R2 implementation and backend endpoint proposals are historical exploratory work, not target architecture.

## 1A. Step 8 browser provider diagnostics

The browser diagnostics implementation is in:
- `src/data/providers/providerDiagnostics.ts`: MarketSmith, ChartInk and NSE URL builders, CSRF extraction, timeout handling and browser fetch probes; the Step 9 Yahoo chart-origin probe was added here.
- `src/features/diagnostics/ProviderDiagnostics.tsx`: opt-in diagnostic page available at `/?diagnostics=providers`.
- `tests/providers/providerDiagnostics.test.mjs`: deterministic request-shape and CSRF parser tests.

Provider probes run only after a user action. They use `fetch` from the SchCatWeb origin with `credentials: "include"`; no cookies are read or manually set. The browser/website must satisfy the provider's CORS policy. When credentials are included cross-origin, the provider must explicitly permit the requesting origin and credentials; browser third-party-cookie rules still apply. See the [MDN Fetch credentials guidance](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#including_credentials) and [MDN CORS guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

Do not port the hard-coded legacy MarketSmith `ms-auth` query values into the website bundle. They are session-like values from the old desktop implementation and are not treated as public API keys. Browser code cannot manually set the `Cookie` header; it also does not attempt to override the browser's `User-Agent`. A Fetch rejection is reported as a possible CORS/network/privacy-policy failure; the browser's DevTools Console is required to distinguish the cause.

**Live result status:** implementation and CI request-shape tests pass. Actual CORS/authentication results still need to be collected by opening `https://schcatweb.prudhvi123143.workers.dev/?diagnostics=providers` after deployment and clicking **Run browser diagnostics**. Do not infer provider access from server-side HTTP requests or from URL-builder unit tests.

## 2. Module-by-module feature mapping

| Existing source | Existing responsibility | Browser TypeScript destination | Web screen |
|---|---|---|---|
| `Guimain2.py` | App shell, fetch orchestration, filters, table, query/watchlist toggles, advanced filters, export | App shell, stock-universe orchestration, filters and local export | Terminal, Screener, Workspace |
| `helper.py` | Concurrent universe fetch, filtering, query intersection, watchlist filtering, industry drill-down, sorting | `src/features/screener` and `src/lib` | Stock Screener |
| `util.py` | Symbol normalisation, MarketSmith metrics, stock summary, workbook lookups, query/watchlist/portfolio reads/writes | `src/features/stocks`, `src/data`, `src/storage` | Screener, Workspace, Portfolio |
| `chartink.py` | ChartInk query, history, dashboard and multi-query execution | `src/data/providers/chartink` | Screener, Research, Market Pulse |
| `chartengine.py` | Chart-data and close×volume requests to local Node service | `src/features/charts` and browser chart-data adapters | Charts, Workspace |
| `CRIP4/app.js` | Express routes for OHLCV, AI/ULTM, weekly ULTM, gold and intro data | Port compatible request/data logic to browser TypeScript | Charts |
| `CRIP4/indicators.js` | SMA, EMA, RSI, ULTM and ATP | `src/domain/analysis/technicalIndicators.ts` (pure calculations); UI adapters will live under `src/features` | Charts and technical panels |
| `CRIP4/public/Tools/fixer.js` | Price-source URLs, OHLCV conversion, timeframe aggregation and MarketSmith weekly candles | Browser-compatible provider adapters and transforms | Charts |
| `Tabs/AnalysisTab.py` | Industry selection, stock lookup and charts | `src/features/industry` | Industry Analysis |
| `Tabs/ChartTab.py`, `Tabs/chartpanel.py` | Multi-chart fetch, timeframe preparation and industry navigation | `src/features/charts` | Charts, Workspace |
| `chartwidget.py` | PyQtGraph rendering | Replace with browser chart component; preserve prepared series | Charts |
| `Tabs/rightpanel.py` | ROCE, delivery, revenue and EPS detail | `src/features/stocks` | Stock Workspace |
| `Tabs/IndustryAnalysisTab.py` | Institutional, close-volume, delivery and RS aggregation; JSON save/load | `src/features/industry` and browser storage/export | Industry Analysis |
| `Tabs/ResearchTab.py` | Historical query performance and match calculations | `src/features/research` | Research |
| `Tabs/MarketPulseTab.py` | ChartInk dashboard, 13 metrics, colour rules and refresh | `src/features/market-pulse` | Market Pulse |
| `Tabs/portfolioTab.py` | Holdings and synthetic P&L chart | `src/features/portfolio` + browser storage | Portfolio |

## 3. Existing data files

| Source file | Known use | Static-site treatment |
|---|---|---|
| `data/marketsmithidsall4.xlsx` | Symbol, instrument ID, market cap, sector, industry, P/B, ROCE and NikScore | Converted to `public/data/marketUniverse.json` (2,256 rows); static snapshot with unknown as-of date. MarketCap/PB/ROCE/NikScore must not be presented as live values |
| `data/Industrydata.xlsx` | Industry autocomplete/reference labels | Converted to `public/data/industries.json` (107 unique values) |
| `CRIP4/public/Tools/marketsmithids.json` | Legacy chart-provider symbol-to-MarketSmith-ID lookup | Copied to `public/data/marketSmithIds.json` (1,256 keys); distinct from the larger screener universe |
| `data/ChartInkQs.xlsx` / QUERIES | Saved query names/definitions | Not imported yet; inspect/select the query sheet separately in a later feature step |
| `data/ChartInkQs.xlsx` / Watchlist | Watchlist names and stock membership | Excluded from public assets; later import/export through browser-local storage |
| `data/ChartInkQs.xlsx` / Portfolio | Stock, quantity and buy price | Excluded from public assets; later import/export through browser-local storage |
| `data/IndustryAnalysis/*.json` | Dated saved analysis results | Excluded from public assets; historical snapshots are not a current reference dataset |
| `data/marketsmithidsall.txt` | Alternate symbol/ID list | Not imported; 2,242 entries differ from the chart map and include a conflicting UJJIVAN ID |
| `data/Industrydata-2.xlsx` | Alternate industry classification | Not imported; 178-label taxonomy differs from the current Industrydata workbook |
| `data/Book1.xlsx` | Unidentified workbook | Excluded until its purpose and content are mapped |

Static assets are public. Never publish personal holdings, watchlist membership, notes, provider credentials or session tokens as static JSON. Browser storage is per browser/device and does not synchronise automatically.

### Step 11 converted reference-data contract

Generated assets and typed clients:
- `frontend/public/data/marketUniverse.json`: 2,256 rows with `symbol`, `instrumentId`, `marketCap`, `sector`, `industry`, `pb`, `roce`, `nikScore`.
- `frontend/public/data/industries.json`: 107 unique industry labels. The source list exactly covers the non-empty `industry` values in the stock-universe workbook; the workbook also contains 25 distinct sectors.
- `frontend/public/data/marketSmithIds.json`: 1,256 legacy CRIP4 symbol-to-ID pairs used for chart requests. Do not merge it into the 2,256-row stock universe: the datasets have alias differences and one conflict in the alternate text list.
- `frontend/public/data/manifest.json`: source paths, blob SHAs, counts and freshness limitations.
- `frontend/public/data/conversion-report.json`: row counts, schema checks and source data quality warnings.

Typed clients: `src/data/reference/marketUniverse.ts`, `src/data/reference/industries.ts`, and `src/data/reference/marketSmithIds.ts`. They fetch static files from the same origin and validate the JSON schema.

The workbook has no recorded as-of date. Treat MarketCap, P/B, ROCE and NikScore as an undated historical snapshot, not live metrics. The source also contains two shared instrument-ID pairs: `M&M`/`M&MFIN` (3022514) and `IL&FSENGG`/`IL&FSTRANS` (3098076). All 2,256 rows are retained and the duplicate IDs are exposed as warnings in the manifest/conversion report. No invalid instrument IDs or numeric metric cells were found. The market universe has unique stock symbols.

The converter is `tools/convert-source-reference-data.mjs`; its development-time workflow checks out the desktop source repository, converts the two approved reference workbooks to JSON, and commits the generated static files. The XLSX reader is not included in the deployed frontend runtime. Automated reference tests validate counts, examples, data consistency and the known duplicate-ID cases. CI also checks that Vite copies the JSON assets to `frontend/dist/data/`.

## 4. Screener contract and behaviour

Existing stock columns:
`Stock`, `Industry`, `GroupRank`, `RS`, `EPS`, `MasterScore`, `AccDis`, `PE`, `PEG`, `FScore`, `ROCE`, `NikScore`.

Additional returned values:
`ROE`, `EPSGrowth`, `Stability`, `PB`, `CashFlow`.

Advanced filters:
`GroupRank`, `RS`, `EPS`, `MasterScore`, `AccDis`, `FScore`, `PE`, `PEG`, `ROCE`, `NikScore`.

Behaviours to preserve:
- Concurrent stock-universe retrieval where provider limits permit.
- Symbol search, numeric min/max filters and sortable columns.
- Multiple saved ChartInk queries intersect using AND logic.
- Watchlist filtering (legacy implementation effectively applies the first selected watchlist).
- Double-click industry filtering and stock detail navigation.
- Keyboard shortcut for adding a stock to a watchlist.
- CSV/Excel export and visible/total count/progress.

Implement these as browser-side feature modules. Do not create HTTP endpoints for internal app functions.

## 5. Stock/fundamental data functions to preserve

| Legacy function | Meaning |
|---|---|
| `fetch_stock_data_from_MS` | Main stock row: industry, group rank, RS grade, EPS rank, MasterScore, Acc/Dis, ROE, PE, PEG, FScore, EPS growth, stability, PB, ROCE, NikScore and cash flow |
| `fetch_ROCE_from_MS` | Annual ROCE series |
| `getExpansionFromMs` | Quarterly expansion series from c25/c32 |
| `getInstitutionOwnershipFromMs` | Quarterly fund-held shares |
| `getInstitutionCostFromMs` | Fund shares × current price, scaled to billions |
| `fetch_Revenue_from_MS` | Annual revenue series |
| `fetch_EPS_from_MS` | Annual EPS series |
| `fetch_EPS_acc_from_MS` | Quarterly EPS growth, bounded to -200..200 |
| `fetch_Sales_acc_from_MS` | Quarterly sales growth, bounded to -200..200 |
| `fetch_Sales_acc_from_full_MS` | Quarterly sales values |
| `getepssalesrating` | Weighted score from first three EPS/sales growth observations |
| `fetch_RS_graph_from_MS` | Relative-strength time series, optionally market-cap weighted |
| `fetch_DeliveryPerc_from_NSE` | NSE delivery/traded values and delivery percentage; five-row rolling averages |
| `fetch_closexvol_for_stock` | Weekly close × volume, scaled to billions, recent 30 observations |
| `get_stock_data_from_xl` | Industry, ROCE, NikScore and workbook lookups |
| `get_market_cap_of` | Market-cap lookup |

Do not alter formulas or fallback semantics without explicit compatibility tests and review.

### Provider-independent formula kernels ported in Step 7

The pure TypeScript implementations are in `frontend/src/domain/analysis/fundamentalMetrics.ts`:

| TypeScript function | Legacy source | Compatibility details |
|---|---|---|
| `normalizeSeries` | `util.normalize` | Min/max to 0–100; Python `int` truncation; empty/constant input remains an error |
| `calculateEarningsSalesScore` | `util.getepssalesrating` | First three quarterly rows only; strict >70 thresholds; 5/3/2 weights; 3+2 trend points; max 30 |
| `clampQuarterlyGrowth` | `fetch_EPS_acc_from_MS`, `fetch_Sales_acc_from_MS` | Truncate, then clamp to -200..200; null/missing becomes zero |
| `calculateExpansionPercentage` | `getExpansionFromMs` | Truncate (c25 / c32 × 100) |
| `calculateInstitutionalCostBillions` | `getInstitutionCostFromMs` | Truncate (fund shares × current price / 1 billion); null shares become zero |
| `calculateMarketCapWeightedRelativeStrength` | `fetch_RS_graph_from_MS` | Mean of non-null values truncated to integer; null and zero are replaced by that mean; optional market-cap weighting; reverse the result |

Tests: `frontend/tests/analysis/fundamentalMetrics.test.mjs`, run by `npm run test:analysis` using Node's built-in test runner. No test framework dependency is added to the deployed application. PEG row assembly is deliberately deferred because the legacy missing-value default is a string that is subsequently divided into a number; verify response types and fallback semantics before porting it.


## 6. Chart and indicator mapping

Legacy timeframe mapping:
| Timeframe | Node URL key |
|---|---|
| 1W | 700 |
| 1D | 100 |
| 1H | 60 |
| 5m | 5 |

Legacy Python client calls `http://127.0.0.1:3000/{symbol}/{key}` and expects OHLCV and optional ema50/ema200/rsi/ultm. This localhost contract must be replaced with direct browser-compatible data acquisition and transforms; it cannot be used from the deployed website.

Existing Node routes:
- `/:symbol/:interval`
- `/:symbol/:interval/:sd/:bigsd/ai`
- `/:symbol/:interval/:sd/:bigsd/ultm`
- `/:symbol/:sd/:bigsd/weekultm`
- `/:symbol/:interval/:sd/:bigsd/weekultm`
- `/gold`, `/gold2`, `/intro`

Existing indicator exports include `sma_inc`, `ema_inc`, `rsi_inc`, `ATP_inc`, `ultm_inc`. Verify candle timestamps, OHLCV, missing-value handling, aggregation and every indicator against desktop/Node outputs.

### Step 9 browser chart-data port

Implemented in `frontend/src/data/providers/chartData.ts`:
- Direct Yahoo chart JSON URL builder with explicit intervals and ranges for 1W, 1D, 1H and 5m. 15m is formed from consecutive groups of three 5m candles; 4H preserves the original 09:15 and 13:15 IST session aggregation.
- Response parsing into ascending Unix-second OHLCV candle records; zero-volume and malformed candles are omitted.
- Weekly close×volume history, the CRIP4 stock/gold timestamp join + forward fill, and the fixed-₹50-notional synthetic stock-vs-gold OHLC series.
- No local Node server or credentials are used. Fetch uses `credentials: "omit"`.

The previous Node `stockUrlmaker` contains `else if (key = 1000)` (assignment instead of comparison), which sends most requested intervals through the daily branch. The browser port uses the explicit timeframe labels rather than reproducing that unintended daily-only output. The hard-coded MarketSmith weekly-chart auth parameter has not been ported. Gold network retrieval is also pending a browser-origin test. Indicators are Step 10; chart UI is Step 13.

Run `npm run test:charts` for deterministic URL, parsing, aggregation and synthetic-series tests. The existing `/?diagnostics=providers` route now includes Yahoo Finance; direct browser CORS access is not considered proven until that result is checked from the live Cloudflare origin.

### Step 10 technical-indicator port

The original `CRIP4/package-lock.json` pins `fast-technical-indicators` at version `1.1.4`. SchCatWeb's implementation in `frontend/src/domain/analysis/technicalIndicators.ts` was checked against that version's SMA, EMA and RSI source.

| TypeScript export | CRIP4 source | Preserved behaviour |
|---|---|---|
| `calculateSma` | `sma_async` / `sma_inc` | Rolling arithmetic mean; first output at index period−1 |
| `calculateEma` | `ema_async` / `ema_inc` | Initial SMA seed followed by alpha = 2/(period+1); output starts at period−1 |
| `calculateRsi` | `rsi_async` / `rsi_inc` | Wilder-smoothed gain/loss; first result after period changes; exact package rounding to two decimals and zero-average-loss branch |
| `smaInc` | `sma_inc` | Leading empty-string padding and caller-selected property name |
| `emaInc` | `ema_inc` | Leading empty-string padding and legacy `stcokgold` selector |
| `rsiInc` | `rsi_inc` | Fixed period 21 and leading empty-string padding |
| `ultmInc` | `ultm_inc` | Legacy 123/(shortEMA/longEMA−100) formula and first-value replacement |
| `atpInc` | `ATP_inc` | Stock and gold EMA ratios attached at raw index zero, without padding |

Legacy compatibility warnings:
- `ultm_inc` and `ATP_inc` combine raw EMA arrays whose starting positions differ, rather than aligning each value to its candle index. They can therefore generate misaligned series and undefined/NaN tails. That exact behaviour is tested and retained pending review; do not silently replace it with a corrected formula.
- The old unexported `touch_inc` references undefined `d1`; it is not ported as a functioning feature.
- The old `eval` property assignment has been replaced with TypeScript computed-property assignment.

Tests: `frontend/tests/analysis/technicalIndicators.test.mjs`, command `npm run test:indicators`. They cover numeric SMA/EMA/RSI outputs, alignment/padding, the fixed RSI period, and the preserved ULTM/ATP quirks.


### Step 12 — Browser stock screener

Implemented under:
- `frontend/src/features/screener/screener.ts`: pure search/category/numeric filtering, selected symbol-set query intersection and stable sorting.
- `frontend/src/features/screener/StockScreener.tsx`: screen and state, loading the typed reference universe and industry data from same-origin static JSON.
- `frontend/tests/screener/screener.test.mjs`: Node built-in tests, run with `npm run test:screener`.

Feature behaviour:
- 2,256 reference rows loaded from `marketUniverse.json`, with search over symbol, sector and industry.
- Exact sector/industry filters and inclusive min/max for Market Cap, P/B, ROCE and NikScore.
- Sortable columns; null values always remain last, including descending numeric sorts.
- Page size 50, filtered CSV export, symbol selection showing the reference instrument ID, and double-click Industry filtering.
- Selected named symbol lists intersect using AND semantics. These are user-entered current-session lists only; refresh clears them. This is not yet saved ChartInk query execution.

Freshness/provider boundaries:
- Market Cap, P/B, ROCE and NikScore are explicitly labelled as undated workbook snapshots in UI and CSV.
- The live MarketSmith values in the old desktop screener (GroupRank, RS, EPS, MasterScore, AccDis, PE, PEG, FScore) are not available from the static workbook. They are not replaced with zeros, synthetic values or the desktop's exception defaults. Connect them only after Step 8 provider access/authentication is validated and the required response fields are verified.
- ChartInk query codes have not been imported and actual ChartInk scans are not run. Keep the personal Watchlist and Portfolio sheets excluded from public assets. Watchlists and persistent query management remain later work.

Run `npm run test:screener`; the CI verification workflow also runs the suite before the production build.

## 7. Industry Analysis

Legacy workflow:
1. Enumerate unique industries and their stocks/MarketSmith IDs.
2. Fetch institutional cost, close-volume, NSE delivery and MarketSmith RS series.
3. Left-pad institutional and close-volume series with their first value, then sum.
4. Zero-pad delivery/traded series, then sum.
5. Delivery percentage = aggregate delivery value × 100 / aggregate traded value.
6. Aggregate RS, then divide by industry market capitalisation (legacy accumulator starts at 1).
7. Save/load JSON results.
8. Display institutional, delivery %, close-volume and industry RS charts.

The close×volume series is not annual revenue. Institutional-cost series is not necessarily the same as institutional ownership. Preserve calculations while accurately labelling after verification.

## 8. Research

Inputs: performance CSV/Excel with `symbol` or `Stock`; query file with `QueryName`/`Name` and `QueryCode`/`Query`.

Legacy flow: uppercase performance symbols; obtain historical ChartInk matches per query; intersect; report query name, match count, performance-set size and match percentage. Verify the existing percentage denominator before porting; legacy display total and percentage denominator may not represent the same population.

## 9. Market Pulse

ChartInk dashboard maps 13 columns: Date, 4% bull/bear, 5-day ratio, 10-day ratio, Q25 bull/bear, M25 bull/bear, M50 bull/bear, 34/13 bull/bear. Preserve reverse-chronological ordering, colour rules and optional 60-second refresh. Test direct browser API access and CORS.

## 10. Portfolio

Holdings contain stock, quantity and buy price. Legacy chart calculates each holding's OHLC contribution as quantity × (price − buy price), aligns timestamps, forward-fills and sums. This is aggregate unrealised P&L contribution, not portfolio market value. Store personal holdings locally and support import/export.

## 11. Known issues to verify

1. MarketSmith `ms-auth` query values may be session credentials; do not copy into public frontend code.
2. `fixer.js` references a Windows absolute path for `marketsmithids.json`.
3. Legacy timeframe keys and Node special cases may not align; the assignment in `stockUrlmaker` caused daily output for most labels. Step 9 uses explicit Yahoo intervals and documents this compatibility correction.
4. `touch_inc` references `d1` without defining it.
5. Legacy indicator wrappers used `eval`; Step 10 replaced this with safe computed-property assignment.
6. `stockUrlmaker` contains a possible assignment/comparison defect.
7. `normalize` may fail for empty or constant series.
8. Legacy fetch exceptions may return synthetic defaults (ROCE=1, PB=1000, PEG=5); distinguish missing/error data from genuine values.
9. Research match-percentage denominator requires confirmation.
10. Industry chart labels may not accurately describe their source measures.
11. Verify workbook sheet names, headers, types and formulas from actual files.
12. Browser CORS/authentication may prevent direct access to some APIs; test before deciding any exception.

## 12. Migration sequence

See `docs/PROJECT-STATUS.md` for the binding 20-step plan. Steps 7–11 cover core calculations, provider diagnostics, browser chart-data transformations, technical-indicator parity and static reference-data conversion. Step 12 (browser stock screener) is implemented; see the Step 12 section above. Live browser CORS checks for the required external providers remain open. The previous backend endpoint proposals are superseded; app-internal workflows should be TypeScript functions, not HTTP routes.
