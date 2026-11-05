# SchCat to SchCatWeb — Step 2 Migration Mapping

**Status:** Planning document only  
**Source repository:** `prudhviuday/SchCat`  
**Target repository:** `prudhviuday/SchCatWeb`  
**Scope:** Personal-first, existing data architecture, all major desktop features, dark financial-terminal UI.

This document maps inspected source modules and functions to the proposed web backend, API and frontend. It is a migration contract, not permission to change formulas. Existing behaviour must be captured and compared before refactoring.

## 1. Architecture boundary

| Existing responsibility | Target location | Rule |
|---|---|---|
| Python calculations and data transformations | `backend/app/analysis/` | Reuse Python logic; keep formulas unchanged initially |
| MarketSmith / NSE / ChartInk access | `backend/app/data_sources/` | Server-side only; credentials/configuration must not reach browser |
| Excel and JSON reads/writes | `backend/app/storage/` | Preserve existing files and sheet formats initially; centralise access |
| Orchestration and business workflows | `backend/app/services/` | Coordinate analysis, data and storage |
| HTTP endpoints | `backend/app/api/` | Return typed JSON and explicit source/freshness/error metadata |
| PyQt screens and widgets | `frontend/src/pages/` and `components/` | Replace UI only; do not reimplement core calculations in TypeScript |
| Existing Node chart server | `chart-service/` (retained from CRIP4) | Preserve until parity and provider dependencies are verified |

## 2. Module-by-module mapping

| Existing source | Existing responsibility / key functions | Target backend | Target web screen |
|---|---|---|---|
| `Guimain2.py` | App shell; `start_fetch`, `_on_fetch_finished`, `download_filtered_list`, `filter_table`, `apply_filters`, row selection, sorting, query/watchlist toggles, advanced filters, Node process controls | API orchestration; stock/query/watchlist services; export endpoint; health check | Terminal shell, Dashboard, Stocks, Charts, Industry, Research, Market Pulse, Portfolio |
| `helper.py` | Concurrent universe fetch; table filtering; query intersection; watchlist filtering; row/industry drill-down; sorting; keyboard watchlist action; advanced-filter dialog support | `stock_universe_service`, `screener_service`, `query_service`, `watchlist_service` | Screener filters/table, saved queries, watchlists, stock actions |
| `util.py` | `normalize`; MarketSmith metrics; stock summary; market-ID loading; Excel-backed industry/ROCE/NikScore/market-cap lookups; query/watchlist/portfolio reads and watchlist writes | `market_data_service`, `fundamentals_service`, `symbol_service`, `excel_storage_service` | Screener, Stock Workspace, Research, Industry, Watchlists, Portfolio |
| `chartink.py` | `chartinkold`, `chartink`, `chartinkHistory`, `chartinkDashboard`, `run_multiple_queries` | `chartink_client`, `query_service`, `market_pulse_service` | Screener query filters, Research, Market Pulse |
| `chartengine.py` | `fetch_chart_data`; `fetch_closexvol_for_stock`; calls local Node endpoint | `chart_service_client`, chart-data and close-volume services | Charts, Stock Workspace, Industry |
| `CRIP4/app.js` | Express routes for OHLCV, AI/ULTM, weekly ULTM, gold and intro data | Retained Node chart service; called by backend | Charts and Stock Workspace |
| `CRIP4/indicators.js` | SMA, EMA, RSI, RSI increment, ULTM and ATP calculations | Retain in Node initially or port only after numeric parity tests | Chart overlays and technical panels |
| `CRIP4/public/Tools/fixer.js` | Price-source URLs, OHLCV conversion, 5m-to-15m conversion, 1h aggregation, stock/gold series, weekly MarketSmith candles | Existing Node chart data-source/transform layer | Charts |
| `Tabs/AnalysisTab.py` | Industry selection, stock list loading, per-stock background chart preparation and plots | Industry stock lookup and chart preparation services | Industry Analysis and Stock Workspace |
| `Tabs/ChartTab.py` | Multi-chart fetch and plot for a selected stock | Chart orchestration | Charts |
| `chartwidget.py` | PyQtGraph rendering of prepared chart data | No direct backend equivalent; retain data preparation only | Reusable web chart components |
| `Tabs/chartpanel.py` | Per-stock chart worker; timeframe preparation; industry navigation | Chart preparation service | Stock Workspace / Charts |
| `Tabs/rightpanel.py` | Per-stock ROCE, delivery, revenue and EPS data fetch and graphs | Fundamentals/technical detail service | Stock Workspace |
| `Tabs/IndustryAnalysisTab.py` | Per-industry aggregation of institutional cost/ownership, close-volume sales proxy, delivery values and RS; JSON save/load; industry filter | `industry_analysis_service`, industry result storage | Industry Analysis |
| `Tabs/ResearchTab.py` | Reads performance and query files; runs historical ChartInk queries; calculates matches and match percentage; progress/results chart | `research_service` and query history service | Research |
| `Tabs/MarketPulseTab.py` | Calls ChartInk dashboard, maps 13 fields, colour rules, optional 60-second refresh | `market_pulse_service` | Market Pulse |
| `Tabs/portfolioTab.py` | Reads holdings; filters stock data; builds synthetic portfolio OHLC series for 1W/1D/1H/5m; industry navigation | `portfolio_service` and portfolio chart service | Portfolio |

## 3. Existing data and file mapping

| Existing file / location | Current use identified | Web migration treatment |
|---|---|---|
| `data/marketsmithidsall4.xlsx` | MarketSmith stock ID mapping; industry, PB, ROCE and NikScore lookups are read from this workbook | Keep as initial source; create one backend reader/cache; verify exact headers and row positions |
| `data/ChartInkQs.xlsx` — `QUERIES` sheet | Saved query names and query definitions | Keep workbook; expose read API and query execution service |
| `data/ChartInkQs.xlsx` — `Watchlist` sheet | Watchlist names and stock membership; writes replace this sheet | Keep workbook; centralise writes, lock file during updates and back up before mutation |
| `data/ChartInkQs.xlsx` — `Portfolio` sheet | Portfolio rows, expected as stock, quantity and buy price | Keep workbook; validate column names/order before use |
| `Data/Industrydata.xlsx` | Industry list used by AnalysisTab | Preserve path compatibility while consolidating configurable data paths |
| `data/IndustryAnalysis/*.json` | Saved industry analysis outputs | Preserve read/load compatibility; define and validate a stable JSON schema |
| Generated Excel/CSV files | Filtered stock exports and research input/output files | Provide browser downloads and explicit import flows; do not store transient exports as source data |
| `CRIP4/public/Tools/marketsmithids.json` | Node weekly chart helper attempts to read a symbol-to-ID map | Replace absolute machine-specific path with configured, repository-independent data path or backend-provided mapping |

**Important:** Workbook contents, sheet headers, formulas and exact column positions must be verified from the actual files before implementing data readers. This source-code inspection does not establish every workbook schema.

## 4. Screener data contract

### 4.1 Existing stock row fields

The main stock table currently declares these columns:

`Stock`, `Industry`, `GroupRank`, `RS`, `EPS`, `MasterScore`, `AccDis`, `PE`, `PEG`, `FScore`, `ROCE`, `NikScore`.

The stock-fetch function additionally returns:

`ROE`, `EPSGrowth`, `Stability`, `PB`, `CashFlow`.

The screener's advanced numeric filters currently include:

`GroupRank`, `RS`, `EPS`, `MasterScore`, `AccDis`, `FScore`, `PE`, `PEG`, `ROCE`, `NikScore`.

### 4.2 Existing screener behaviours to preserve

- Concurrent stock-universe fetch from the MarketSmith ID workbook.
- Search by stock symbol.
- Multi-select saved ChartInk queries; selected query results are intersected (AND logic).
- Watchlist filtering; current implementation effectively applies the first selected watchlist.
- Numeric minimum/maximum filters.
- Sorting by clicking a column header.
- Double-clicking the Industry cell filters the stock list to that industry; repeating can restore the prior list.
- Selecting/double-clicking a stock opens related stock details/charts.
- Keyboard shortcuts for adding a stock to a watchlist.
- Export current filtered result to Excel or CSV.
- Visible/total stock count and fetch progress/status.

**Proposed API contracts:**

| Method and path | Purpose |
|---|---|
| `GET /api/stocks` | Stock universe with paging, search, sort and filter parameters |
| `POST /api/screener/run` | Execute combined numeric, saved-query and watchlist filters |
| `GET /api/queries` | Read saved query definitions |
| `POST /api/queries/run` | Execute one or more ChartInk queries |
| `GET /api/watchlists` | Read watchlists |
| `PUT /api/watchlists/{name}` | Update stock membership |
| `GET /api/stocks/export` or `POST /api/stocks/export` | Download filtered results as CSV/XLSX |

These are proposed web endpoints, not existing endpoints.

## 5. Stock Workspace and fundamental/technical data mapping

| Existing function | Data/meaning | Destination |
|---|---|---|
| `fetch_stock_data_from_MS` | Main stock row: industry, group rank, RS grade, EPS rank, MasterScore, Acc/Dis, ROE, PE, PEG, FScore, EPS growth, stability, PB, ROCE, NikScore and cash flow | Stock summary API and screener |
| `fetch_ROCE_from_MS` | Annual ROCE series from MarketSmith finance details | Financials / capital efficiency chart |
| `getExpansionFromMs` | Quarterly expansion series calculated from c25/c32 | Research / expansion evidence |
| `getInstitutionOwnershipFromMs` | Quarterly total shares held by funds, optionally normalised | Research / institutional ownership |
| `getInstitutionCostFromMs` | Fund shares multiplied by current price and scaled to billions | Institutional activity chart |
| `fetch_Revenue_from_MS` | Annual revenue series, optionally normalised | Financials |
| `fetch_EPS_from_MS` | Annual EPS series, normalised | Financials |
| `fetch_EPS_acc_from_MS` | Quarterly EPS percentage growth, bounded to -200..200 | Earnings acceleration |
| `fetch_Sales_acc_from_MS` | Quarterly sales percentage growth, bounded to -200..200 | Sales acceleration |
| `fetch_Sales_acc_from_full_MS` | Quarterly actual sales values | Financials |
| `getepssalesrating` | Existing weighted score based on first three EPS/sales growth observations and their sequence | FScore; preserve exact formula |
| `fetch_RS_graph_from_MS` | Relative-strength time series; optional market-cap weighting | Technical / relative strength |
| `fetch_DeliveryPerc_from_NSE` | NSE delivery/traded values and delivery percentage; 5-row rolling averages on values | Delivery analysis |
| `fetch_closexvol_for_stock` | Weekly close × volume scaled to billions; recent 30 observations | Industry sales/volume proxy |
| `get_stock_data_from_xl` | Industry, ROCE, NikScore and related workbook lookups | Stock metadata |
| `get_market_cap_of` | Market-cap lookup from workbook | Industry RS normalisation |

**Proposed endpoints:**

- `GET /api/stocks/{symbol}`
- `GET /api/stocks/{symbol}/financials`
- `GET /api/stocks/{symbol}/fundamentals`
- `GET /api/stocks/{symbol}/technical`
- `GET /api/stocks/{symbol}/institutional`
- `GET /api/stocks/{symbol}/delivery`

The Stock Workspace should combine these responses into Overview, Chart, Financials, Technical, Industry and Notes sections.

## 6. Chart and indicator mapping

### 6.1 Existing chartengine timeframe mapping

| Python timeframe | Current Node URL key |
|---|---|
| `1W` | `700` |
| `1D` | `100` |
| `1H` | `60` |
| `5m` | `5` |

The Python chart client calls `http://127.0.0.1:3000/{symbol}/{key}` and expects OHLCV plus any returned `ema50`, `ema200`, `rsi`, `ultm` fields.

### 6.2 Existing Node routes

- `/:symbol/:interval` — basic stock candles.
- `/:symbol/:interval/:sd/:bigsd/ai` — AI/stock-gold series.
- `/:symbol/:interval/:sd/:bigsd/ultm` — ULTM series.
- `/:symbol/:sd/:bigsd/weekultm` — weekly ULTM.
- `/:symbol/:interval/:sd/:bigsd/weekultm` — weekly route variant.
- `/gold` and `/gold2` — gold data.
- `/intro` — serves the legacy chart UI.

### 6.3 Existing indicator functions

- `sma_async`, `ema_async`, `rsi_async`
- `sma_inc`, `ema_inc`, `rsi_inc`
- `ultm_inc`, `ultm_incbkp`, `ATP_inc`

The currently exported indicator functions are `sma_inc`, `ema_inc`, `rsi_inc`, `ATP_inc` and `ultm_inc`.

### 6.4 Chart API proposal

- `GET /api/charts/{symbol}?timeframe=1D`
- `GET /api/charts/{symbol}/indicators?timeframe=1D`
- `GET /api/charts/gold`
- `GET /api/charts/{symbol}/relative-strength`
- `GET /api/charts/{symbol}/industry`

Frontend chart components: candlestick/volume chart, indicator overlays, timeframe selector, symbol search, stock information panel and industry navigation.

**Parity requirement:** compare candle timestamps, OHLCV, missing-value handling, aggregation and every indicator against the current desktop/Node output. Do not assume the current timeframe mapping is correct without a live sample test.

## 7. Industry Analysis mapping

Existing worker flow:

1. Take the stock dataframe and enumerate unique industries.
2. Find each industry's stocks and their MarketSmith IDs.
3. Fetch per-stock institutional cost, close-volume series, NSE delivery series and MarketSmith RS series.
4. Aggregate institutional and close-volume series using left-padding with the first value and summation.
5. Aggregate delivery and traded values using zero-padding and summation.
6. Calculate industry delivery percentage as aggregate delivery value × 100 / aggregate traded value.
7. Aggregate RS series, then divide by total industry market capitalisation (initial accumulator is 1).
8. Save results as JSON under `data/IndustryAnalysis/`.
9. Display four plots per industry: institutional series, delivery percentage, close-volume sales proxy and industry RS.
10. Allow case-insensitive partial industry filtering and loading previously saved result files.

**Proposed endpoints:**

- `GET /api/industries`
- `GET /api/industries/{industry}/stocks`
- `POST /api/industries/analyze`
- `GET /api/industries/results`
- `GET /api/industries/results/{result_id}`

Frontend: ranked industry list, filter/search, industry detail, four historical series, constituent stock list and saved-analysis selector.

**Important naming distinction:** the current industry chart's sales series is derived from weekly close × volume, not the annual revenue function. The institutional chart uses the `getInstitutionCostFromMs` result while the displayed title says institutional ownership. Preserve the current calculation for parity, but label and document the data accurately after verification.

## 8. Research mapping

Current input files:
- Performance file: CSV or Excel, must contain `symbol` or `Stock`.
- Queries file: CSV or Excel, expected to contain `QueryName` or `Name`, and `QueryCode` or `Query`.

Current calculation:
- Convert performance symbols to uppercase and form a set.
- For each query, obtain historical ChartInk matches through `util.getHistoryfromQuery`.
- Intersect query matches with performance symbols.
- Record query name, match count, total performance-set size and match percentage.
- Display results table and chart with progress.

**Proposed endpoints:**
- `POST /api/research/run` — accepts selected performance and query datasets or references to imported files.
- `GET /api/research/runs` — list prior runs if persisted.
- `GET /api/research/runs/{run_id}` — retrieve results.

**Potential existing calculation inconsistency to verify, not silently fix:** the displayed `Total` is currently the number of performance symbols, but `Match %` divides by the number of historical query matches. The denominator and intended interpretation need confirmation before locking the output contract.

## 9. Market Pulse mapping

The current ChartInk dashboard produces 13 columns:

1. Date
2. 4% bull
3. 4% bear
4. 5-day ratio
5. 10-day ratio
6. Q25 bull
7. Q25 bear
8. M25 bull
9. M25 bear
10. M50 bull
11. M50 bear
12. 34/13 bull
13. 34/13 bear

The dashboard query uses ChartInk's widget endpoint and returns the history in reverse chronological order. The UI applies configurable colour rules and supports optional automatic refresh (default interval 60 seconds).

**Proposed endpoint:** `GET /api/market-pulse` with optional date range; frontend displays history table, coloured metric cells and refresh control.

## 10. Portfolio mapping

Current holdings are read through `util.getPortfolio()`, expected as rows containing stock, quantity and buy price. The portfolio chart worker:

- Normalises stock chart data to datetime/open/high/low/close/volume.
- Supports 1W, 1D, 1H and 5m.
- Calculates each holding's OHLC contribution as quantity × (price − buy price).
- Aligns all stock time indexes, forward-fills each series and sums the contributions.
- Returns a synthetic portfolio P&L candlestick series.
- Provides stock filtering and navigation to the holding's industry analysis.

**Proposed endpoints:**
- `GET /api/portfolio`
- `GET /api/portfolio/holdings`
- `GET /api/portfolio/chart?timeframe=1D`
- `GET /api/portfolio/holdings/{symbol}`
- `POST /api/portfolio/import` and export endpoint as needed.

**Important:** the current chart represents aggregate unrealised P&L contribution relative to each holding's buy price, not total portfolio market value. The web UI must retain that meaning unless a separately approved portfolio-value chart is added.

## 11. Proposed common API conventions

All API responses should use consistent schemas and errors. Example:

```json
{
  "data": [],
  "source": "existing_provider_or_file",
  "last_updated": "ISO-8601 timestamp",
  "status": "success",
  "warnings": []
}
```

- Validate symbols, timeframe, dates, filters and imported files.
- Use pagination for large stock tables.
- Keep external provider calls on the backend.
- Set timeouts and bounded concurrency.
- Report partial failures per symbol instead of failing the entire universe fetch.
- Mark cached/stale data honestly.
- Do not silently replace failed provider values with apparently valid financial values.
- Centralise Excel writes and take backups before updating a workbook.
- Keep all data paths and service URLs configurable.

## 12. Issues and questions to resolve during implementation

These are identified source risks; this step does not change them.

1. **MarketSmith auth-like values:** hard-coded `ms-auth` query values appear in several MarketSmith URLs. Confirm whether they are valid session credentials/tokens; rotate/revoke if exposed and use authorised backend configuration only. Confirm provider terms and permitted use before hosting.
2. **Machine-specific Node path:** `fixer.js` attempts to read `C:\\MAIN\\Programming\\Node\\CRIP3\\public\\Tools\\marketsmithids.json`. This cannot be relied on in a clean deployment.
3. **Chart URL mismatch risk:** Python sends timeframe keys `700`, `100`, `60`, `5`, while Node's source contains special handling for other values such as `240`, `15`, `1000` and `5m`. Verify actual outputs and define a canonical timeframe mapping.
4. **Potential indicator defect:** `touch_inc` references `d1` without defining it in that function.
5. **Dynamic evaluation:** indicator code uses `eval` to construct object properties. Replace with safe computed-property syntax only after parity tests.
6. **Potential URL mapping defect:** `stockUrlmaker` contains `else if(key = 1000)`, which assigns rather than compares. Test the intended branches before modifying.
7. **Normalisation edge case:** `normalize` divides by max-minus-min and may fail or produce invalid results for empty or constant series.
8. **Fallback values:** stock-fetch exception handling returns synthetic defaults (for example ROCE=1, PB=1000 and PEG=5). The web version should distinguish missing/error data from genuine values; whether to preserve the visible legacy fallback requires an explicit compatibility decision.
9. **Research percentage denominator:** confirm whether percentage is intended to be matched performance stocks / historical query matches or another denominator.
10. **Industry labels and measures:** institutional-cost series is displayed as institutional ownership; close × volume is displayed as revenue/sales. Verify desired labels and meaning.
11. **Excel schema:** verify actual workbook sheet names, headers, data types and formulas before creating production readers.
12. **Chart source reliability:** determine which chart provider is actually used for each timeframe and whether the weekly MarketSmith path is still functional.

## 13. Step-by-step implementation dependencies

| Later migration step | Depends on this mapping |
|---|---|
| Step 3 — Web project foundation | Target repository structure and service boundaries |
| Step 4 — Backend foundation | API conventions, configuration and error handling |
| Step 5 — Existing data integration | Excel/JSON file and sheet mapping |
| Step 6 — Core Python logic | Functions and calculation parity inventory |
| Step 7 — Stock data integrations | MarketSmith, NSE and ChartInk source mapping |
| Step 8 — Chart service | Node routes, Python URL mapping and symbol IDs |
| Step 9 — Indicators | Indicator exports and parity requirements |
| Step 10 — Screener API | Screener fields, filters, query and watchlist logic |
| Steps 11–13 — UI, screener and charts | Screen and component mapping |
| Steps 14–16 — Industry, Research and Market Pulse | Existing workflows and output schemas |
| Steps 17–18 — Portfolio and watchlists | Excel persistence and synthetic portfolio semantics |
| Steps 19–20 — Integration and release | All parity, reliability and access checks |

## 14. Step 2 acceptance checklist

- [x] Main desktop modules and major functions mapped.
- [x] Existing stock table fields and advanced filters recorded.
- [x] MarketSmith, NSE and ChartInk functions identified.
- [x] Node chart routes and indicator exports mapped.
- [x] Excel/JSON data files and their known purposes mapped.
- [x] Industry, Research, Market Pulse and Portfolio workflows mapped.
- [x] Proposed API and frontend destinations documented.
- [x] Known defects, semantic ambiguities and verification items recorded.
- [ ] Actual workbook schemas verified from the workbook contents.
- [ ] Live provider responses and chart timeframe parity verified (these require implementation/test steps).

**No calculation, data file or application code has been modified as part of this mapping.**
