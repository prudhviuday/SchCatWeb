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

### Step 13 — Charts and Stock Workspace (complete)

Implemented under:
- `frontend/src/features/charts/StockWorkspace.tsx`: symbol workspace, independent fetch state and retry controls, responsive four-chart layout, candles, volume, OHLC details, view-range controls and reference-fundamentals panel.
- `frontend/src/features/charts/chartPresentation.ts`: chronological ordering, IST date/time labels, full-series EMA20/EMA50 calculations aligned to source candles, RSI-21 summary and visible-window slicing.
- `frontend/tests/charts/chartPresentation.test.mjs`: pure presentation tests run by `npm run test:workspace`.

Legacy mapping:
- `Tabs/chartpanel.py`: four independent requests for Weekly (1W), Daily (1D), Hourly (1H) and 5-minute (5m), ported using the existing `fetchChartData` adapter and Yahoo Finance request mapping.
- `chartwidget.py`: candlestick wick/body rendering, up/down candle colours, volume pane, last-N-candle view and sparse date labels are reproduced in browser SVG. EMA20/EMA50 overlays and visible-candle range controls are added to the browser workspace.
- Screener symbol selection now opens the stock workspace; the separate navigation entry supports direct symbol entry.
- Legacy `RightPanel` labels are represented only where a reference field exists. The workspace shows Industry, Sector, Market Cap, P/B, ROCE, NikScore and MarketSmith ID from the static universe, with a visible undated-snapshot warning.

Not yet ported / intentionally withheld:
- The legacy `RightPanelWorker` requires MarketSmith finance/symbol details for ROCE, institution ownership, quarterly sales and EPS. The live browser-origin diagnostics/authentication results are still pending; no fake series or legacy catch defaults are displayed.
- Yahoo Finance access from the live Cloudflare origin also remains unverified. Each chart timeframe reports its own network/CORS/HTTP/no-data error and can be retried. Passing parser tests does not prove provider CORS.
- The legacy local Node service at `127.0.0.1:3000`, hard-coded MarketSmith `ms-auth` values and any proxy are not used.

Run `npm run test:workspace`. Full CI including all parity suites, this chart workspace suite, production TypeScript/Vite build and static output checks passed on commit `a195a3b8690b4cb93873371e6e72cf4eb551eb26`: https://github.com/prudhviuday/SchCatWeb/actions/runs/42151901859. Cloudflare publication of this commit remains unverified.

### Step 14 — Industry Analysis (complete; live aggregation deferred)

Implemented under:
- `frontend/src/features/industry/industryAnalysis.ts`: pure aggregation kernels, static industry membership grouping, industry filtering, legacy result parser and serializer.
- `frontend/src/features/industry/IndustryAnalysis.tsx`: browser UI for industry selection, constituent lookup, local JSON import/export and the four legacy chart panels.
- `frontend/tests/industry/industryAnalysis.test.mjs`: Node tests run by `npm run test:industry`.

Reference explorer:
- Group the static market universe by non-null Industry, sort labels, and exclude names beginning with `BSE`, exactly matching `IndustryWorker.run`.
- Show each industry's constituent symbols and reference instrument IDs.
- Market Cap sum and missing count are based on the undated workbook values; no current market-cap claim is made.
- A symbol click opens Charts & Stock Workspace.

Formula port:
- `padAndSumSeries`: for institutional value, close×volume and per-stock market-cap-weighted RS arrays, prefix the shorter arrays using the first value of each array, then sum element-wise.
- `zeroPadAndSumSeries`: for delivery and traded values, prefix shorter arrays with zeros, then sum.
- `deliveryPercent[i] = round2(totalDeliveryValue[i] * 100 / totalTradedValue[i])`.
- `marketCapDenominator = 1 + sum(stock market cap)`; null/missing source market caps retain the legacy +1 fallback.
- `industryRS[i] = round2(sum(padded weighted stock RS)[i] / marketCapDenominator)`.
- As in the desktop worker, the incoming per-stock RS array is assumed already weighted by the stock's market cap by `fetch_RS_graph_from_MS(stock_info, True)`.

Saved-result compatibility:
- Import and export the desktop five-array JSON format: `[industry, institutional, closeVolume, deliveryPercent, industryRS]`.
- Validate every series as a finite numeric array and reject malformed/duplicate industry entries.
- The desktop result arrays contain no timestamps. Browser charts therefore use observation indexes, not fabricated dates.
- These results are loaded locally with `File.text()` and exported as a browser download; no upload endpoint or storage backend is used.

Important semantic corrections:
- Institutional series is built by desktop `getInstitutionCostFromMs(stock_info, False)`: fund shares × current stock price / 1 billion. It is an institutional value measure, not a percentage of ownership.
- “Sales” data is taken from `fetch_closexvol_for_stock`, which is weekly close × volume / 1 billion. It is a turnover proxy, not revenue.
- UI labels were corrected to reflect those formulas.

Live provider boundary:
- Running a new live analysis is not enabled yet. It needs MarketSmith institution data and RS, Yahoo Finance weekly OHLCV, and NSE historical delivery/traded data. Browser CORS/authentication results from Step 8–9 remain unverified.
- Keep legacy `ms-auth` values out of public JS and do not create a server proxy without explicit user approval.

Run `npm run test:industry`. Full GitHub Actions verification, including prior parity tests, nine industry tests, production TypeScript/Vite build and static output checks passed on commit `af6d7402024c9a997fd3cb011c3d5cd1e49a75ed`: https://github.com/prudhviuday/SchCatWeb/actions/runs/42153154031. Cloudflare deployment of this latest commit is not independently confirmed.

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

### Step 15 — Research (complete; live scans deferred)

Implemented under:
- `frontend/src/features/research/research.ts`: CSV parsing, symbol/query import, historical set validation, parity calculation and result CSV serializer.
- `frontend/src/features/research/Research.tsx`: browser-local imports, downloadable historical-match template, result table, visual comparison chart and CSV export.
- `frontend/tests/research/research.test.mjs`: tests run by `npm run test:research`.

Legacy logic from `Tabs/ResearchTab.py` and `util.getHistoryfromQuery`:
1. Accept a performance sheet with `symbol` or `Stock` column.
2. Trim and uppercase performance symbols, then deduplicate them into a set.
3. Read each query's name from QueryName, falling back to Name or “Unnamed”.
4. Read query text from QueryCode, falling back to Query.
5. `chartinkHistory` returns the unique union of symbols from all returned historical dates for that query.
6. Matches = intersection size of the performance-symbol set and that query's historical-symbol set.
7. Displayed Total = number of performance symbols.
8. Match % = round((matches / historical query symbol count) × 100, 2).

Important denominator detail: desktop's displayed Total is the performance-set size, but Match % is divided by the historical query-set size. These are different denominators; the web table exposes both values to make the formula clear. Python half-to-even rounding is reproduced, including exact halfway values.

Supported browser inputs:
- Performance CSV: `symbol` or `Stock` header.
- Query CSV: `QueryName,QueryCode` or `Name,Query`. Per-row blank primary columns fall back to their aliases.
- Historical match JSON: object mapping query names to arrays of historical unique symbols, or an array of `{queryName, symbols}` objects. A blank template is downloadable after query import.
- Results are downloadable as CSV with query name, matches, performance total, query universe count, percentage and status.
- CSV and JSON are processed with browser File APIs only; nothing is uploaded. Excel must be saved as CSV. The private `Watchlist` and `Portfolio` sheets in the source query workbook are not used.

Live provider limit:
- The desktop calls ChartInk's CSRF/bootstrap + `backtest/process` flow and unions stock codes across all returned dates. Browser-origin CORS/session access is still unverified. The Research UI therefore evaluates imported historical match sets only; it does not run live scans, and does not substitute current scan results.
- Continue to exclude private query workbook sheets and never embed provider session values.

Run `npm run test:research`. Full CI passed on final implementation commit `295a55a9de170615e1c04ed8c7679ba484dd5c34`: https://github.com/prudhviuday/SchCatWeb/actions/runs/42155185358. All prior parity suites, the Research suite, production TypeScript/Vite build and static deployment checks passed. Cloudflare publication of the latest main commit is not independently confirmed.

## 8. Research

Inputs: performance CSV/Excel with `symbol` or `Stock`; query file with `QueryName`/`Name` and `QueryCode`/`Query`.

Legacy flow: uppercase performance symbols; obtain historical ChartInk matches per query; intersect; report query name, match count, performance-set size and match percentage. Verify the existing percentage denominator before porting; legacy display total and percentage denominator may not represent the same population.

## 9. Market Pulse

ChartInk dashboard maps 13 columns: Date, 4% bull/bear, 5-day ratio, 10-day ratio, Q25 bull/bear, M25 bull/bear, M50 bull/bear, 34/13 bull/bear. Preserve reverse-chronological ordering, colour rules and optional 60-second refresh. Test direct browser API access and CORS.

## 10. Portfolio

Implemented in `src/features/portfolio/portfolio.ts` and `Portfolio.tsx`.

Holdings use symbol, quantity and buy price. The source is `Tabs/portfolioTab.py` plus `util.getPortfolio()`. The exact legacy synthetic candle formula is retained for each OHLC field: quantity × (price − buy price). Per-stock candle timestamps are unioned and sorted; each stock's OHLC contribution and volume are independently forward-filled, leading gaps are zero-filled, then series are summed. The default chart history cap is 800 points. Four charts are provided: weekly, daily, hourly and 5-minute.

The web module adds local add/edit/remove, invested capital, latest daily close, current value, unrealised P&L and return-on-cost metrics. It only displays live values after an explicit user refresh. The synthetic chart is aggregate unrealised P&L contribution, not market value or time-weighted return.

Personal holdings are stored in versioned browser localStorage and never placed in static assets or uploaded. CSV/JSON import/export is browser-only; imports can merge by symbol or explicitly replace the current list. Legacy three-column JSON rows are accepted. Seven tests cover validation, calculations, import/export, merge and desktop candle aggregation parity.

Provider boundary: latest prices and OHLC history reuse the existing direct-browser Yahoo adapter. No backend/proxy, database or secret credentials. Actual Yahoo CORS/provider access from the deployed website origin remains unverified; errors are surfaced and unavailable symbols are excluded rather than replaced with sample prices.

### Step 18 — Watchlists and saved queries

Desktop source:
- helper.py: multi-query toggle, watchlist toggle, refresh, AND intersection/filtering, keyboard shortcut and watchlist insertion.
- util.py: getAllQueries() reads the QUERIES sheet's second and third columns as query name and query clause; getAllWatchlists() reads each Watchlist sheet column as a separate list; addStToWatchlists() appends a symbol to the selected column.

Browser port:
- A versioned localStorage library stores named watchlists and named query definitions. Each saved query retains its ChartInk clause and an optional resolved symbol set.
- Multiple selected symbol sets intersect with AND semantics. Watchlist filtering is independent from the target watchlist used to save a row.
- Add/remove symbols, create/delete watchlists, create/delete saved queries, JSON backup/restore, watchlist CSV and query CSV export are browser-local.
- CSV import accepts both the desktop's wide-column watchlist sheet and normalized Watchlist,Symbol rows. Query CSV accepts QueryName,QueryCode or Name,Query headers.
- Imported ChartInk clauses are preserved but not executed. Live scan access remains gated on the provider-origin diagnostics; no server proxy, session cookie or secret was introduced.


### Step 19 — Integration and production smoke tests

- The Overview dashboard now links all six migrated modules. All are also available from the sidebar.
- The integration test starts the built Vite preview and verifies root and deep-link SPA fallback, the compiled bundle's module/diagnostics content, all public reference datasets against manifest counts, and the static-only Wrangler asset configuration.
- CI runs this suite after the production build. This verifies the production artifact and static hosting contract without making external provider calls.
- This does not prove Cloudflare has deployed the current commit, nor does it prove Yahoo, MarketSmith, ChartInk or NSE browser-origin access. Those checks are part of Step 20 and must be performed on the actual production origin.

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

See `docs/PROJECT-STATUS.md` for the binding 20-step plan. Steps 7–11 cover core calculations, provider diagnostics, browser chart-data transformations, technical-indicator parity and static reference-data conversion. Steps 12 (Stock Screener), 13 (Charts & Stock Workspace), 14 (Industry Analysis) and 15 (Research) are implemented; see their sections above. Live browser CORS checks for the required external providers remain open. The previous backend endpoint proposals are superseded; app-internal workflows should be TypeScript functions, not HTTP routes.


### Step 36 — main screener interaction parity

The web screener applies all visible numeric min/max inputs. The original advanced-filter fields are GroupRank, RS, EPS, MasterScore, AccDis, FScore, PE, PEG, ROCE and NikScore. In the current web model, Acc/Dis is usually a letter rating; when a range is set, numeric values are coerced as in legacy `pandas.to_numeric(errors="coerce")`, while non-numeric grades are excluded. Market Cap and P/B remain additional web filters for static reference values.

Industry double-click toggles a drill-down and restores the previous industry selection on the next double-click. All other filters remain in effect. Clicking a result row selects it; double-clicking a non-Industry cell opens its stock workspace. Keyboard actions are supported when the result table is focused: Right Arrow adds the selected stock to the chosen target (or active) watchlist, and number keys 1–9 add it to the watchlist in the displayed order. The tests cover these interactions' deterministic state transitions and shortcut routing.


### Step 37 — chart overlay and indicator parity

The original standard CRIP4 route applies SMA 50, EMA 50, EMA 200 and RSI 21 to each candle series, plus ULTM 12/120. The browser Stock Workspace now plots SMA 50, EMA 50 and EMA 200; calculates them over the full available candle series; aligns each value to its original candle index; and only then selects the visible last 100/200/500 bars. The latest daily RSI 21 and moving-average values are shown in the summary. Insufficient history remains null/unavailable. ULTM remains a tested legacy kernel but is not presented as a trustworthy overlay because the original algorithm combines unaligned EMA arrays and produces invalid tail values.


### Step 38 — provider/API verification

Verified the live clients against the Worker route inventory. The MarketSmith relative-strength worker function existed but was not registered; `GET /api/marketsmith/relative-strength` is now exposed and used for both Workspace and Industry Analysis. The health endpoint publishes a versioned list of required routes. Diagnostics checks Worker health, MarketSmith finance/symbol/RS, ChartInk scan, NSE delivery and Yahoo OHLCV. Results validate expected JSON shapes and display Worker and upstream HTTP statuses separately. CI mocks upstream services and does not establish live third-party availability.


### Step 39 — Integration, API failure boundaries and browser compatibility

The Worker now returns a stable JSON 502 for unexpected exceptions on `/api/*`, rejects unsupported methods consistently, and exposes health version 3. ChartInk scan and historical requests are abortable from the browser with a 45-second client timeout; each Worker upstream request remains capped at 12 seconds. Provider Diagnostics handles unexpected orchestration errors in an accessible alert. Mobile diagnostics status/error text wraps rather than forcing horizontal overflow. This hardening does not retry non-idempotent ChartInk POSTs automatically and does not manufacture empty/zero provider data. CI passed for code commit `804006b8fad06ab49f4b6f2084854fba2209328c` (GitHub Actions run `42329248667`), including the production build, integration smoke tests and Worker bundle validation.
