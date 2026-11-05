# SchCatWeb — Project Status and Chat Handover

This file is the durable source of truth for continuing the SchCat desktop-to-web migration across ChatGPT conversations.

## How to resume

The user can start a new ChatGPT conversation and say **"Continue SchCatWeb — Step N"** (or simply "Step N"). First read this file and `docs/STEP-2-MIGRATION-MAPPING.md`, then continue only the explicitly requested step. Do not ask the user to restate decisions already recorded here.

## User's workflow requirements

- Work sequentially, one step at a time.
- The user explicitly starts each step (for example, "do Step 4").
- Implement and test only the current step; provide exact user-side test instructions and wait for acceptance before moving on.
- Do not silently skip steps or begin the next step.
- Do not create branches without the user's explicit permission. Use the existing `main` branch unless the user directs otherwise.
- Preserve the existing SchCat desktop app and its repository. Do not delete or overwrite its code or data.
- Preserve all existing formulas and business logic semantically when porting them to TypeScript; numerical parity must be checked.
- Be transparent about tests actually executed versus checks the user must run locally.

## Project objective and binding architecture decisions

- Source desktop repository: https://github.com/prudhviuday/SchCat
- Target web repository: https://github.com/prudhviuday/SchCatWeb
- Initial audience: personal use.
- Frontend: React + TypeScript + Vite.
- **Backend: TypeScript + Hono on Cloudflare Workers. The SchCatWeb project must be Python-free. Do not add FastAPI, Python runtime dependencies, Python scripts or Python deployment requirements.**
- Existing Python source in the separate SchCat desktop repository is a behaviour/formula reference only. Port the required logic to TypeScript in later steps and validate output parity; do not run Python in SchCatWeb.
- Existing Node chart service in `SchCat/CRIP4` must be audited and integrated/reworked for the Cloudflare-compatible architecture in its dedicated later step.
- Existing Excel/JSON data remains the initial source where feasible; no database is required for the foundation.
- UI direction: dark financial terminal, desktop-first and responsive.
- Provider credentials must remain server-side and must not be exposed to the browser.
- Runtime and libraries must be compatible with Cloudflare Workers or another explicitly approved TypeScript/Node hosting target.

## Deployment and API integration requirements (confirmed by user)

- The final deliverable must be reachable through a live Cloudflare URL, not only a local development server. Production deployment belongs to Step 20; do not claim the site is live before a successful deployment and smoke test.
- Preserve and integrate the existing Node chart service in `SchCat/CRIP4`; audit its routes, provider dependencies, filesystem assumptions and runtime compatibility before changing or replacing it.
- Preserve the existing MarketSmith, ChartInk and NSE data-fetching behaviour where applicable by porting/integrating it in TypeScript. Do not silently substitute providers or formulas.
- Reuse existing Excel/JSON data initially where compatible with the target runtime. Verify whether file-based persistence is viable on Cloudflare; do not assume a Worker has a persistent local filesystem.
- Keep provider credentials and auth tokens in Worker secrets or another server-side secret store, never frontend/browser code.
- Step 20 must verify the complete deployed flow: frontend, API, real stock data, charts, provider secrets, CORS, data persistence and error handling.

## Migration plan and progress

| Step | Scope | Status |
|---|---|---|
| 1 | Repository audit | Complete |
| 2 | Detailed migration mapping | Complete; architecture superseded by TypeScript decision below |
| 3 | Web project foundation | Scaffold committed; local run/build verification not confirmed |
| 4 | TypeScript backend foundation | Implemented in repository; local typecheck/tests pending user |
| 5 | Existing data integration | TypeScript importer + R2 API committed; local import/upload/API verification pending |
| 6 | Core analysis logic port to TypeScript | Not started |
| 7 | Stock data integration | Not started |
| 8 | Chart service integration | Not started |
| 9 | Technical indicators | Not started |
| 10 | Screener API | Not started |
| 11 | Terminal UI foundation | Not started |
| 12 | Stock Screener | Not started |
| 13 | Charts and Stock Workspace | Not started |
| 14 | Industry Analysis | Not started |
| 15 | Research Module | Not started |
| 16 | Market Pulse | Not started |
| 17 | Portfolio | Not started |
| 18 | Watchlists and Query Management | Not started |
| 19 | Integration and full testing | Not started |
| 20 | Production deployment and final release | Not started |

## Step 1 — Repository audit

Read-only audit of both repositories completed. SchCatWeb initially contained only `test.txt`. SchCat desktop contains the PyQt application, analysis modules, a Node chart service in `CRIP4`, and Excel/JSON data. Major feature inventory and risks are recorded in the Step 2 mapping document.

Key source areas include:
- `Guimain2.py`, `helper.py`, `util.py`, `Listupdater.py`
- `Tabs/AnalysisTab.py`, `ChartTab.py`, `IndustryAnalysisTab.py`, `MarketPulseTab.py`, `ResearchTab.py`, `portfolioTab.py`
- `chartengine.py`, `chartink.py`, `chartwidget.py`
- `CRIP4/app.js`, `CRIP4/indicators.js`, `CRIP4/public/Tools/fixer.js`
- Existing Excel and JSON data files.

## Step 2 — Detailed migration mapping

- Status: complete.
- Document: [docs/STEP-2-MIGRATION-MAPPING.md](STEP-2-MIGRATION-MAPPING.md)
- Commit: `253ef4647e2db359403ab94479b9be48c68d6435`
- The mapping records module/function responsibilities, feature behaviours, proposed API boundaries, data semantics, known defects/risks and later-step dependencies.
- **Architecture amendment (2026-11-05):** the original mapping's Python backend destinations are historical only. SchCatWeb is now TypeScript-only. Port the documented formulas, data transformations and provider workflows into TypeScript while preserving their observable behaviour and testing parity against the desktop application. The original Python application remains untouched.

## Step 3 — Web project foundation

- Scope: create the React + TypeScript + Vite project shell and starter UI.
- The original Step 3 scaffold also introduced a temporary FastAPI health-check scaffold. That scaffold was removed/replaced in Step 4; it is not part of the target architecture.
- No SchCat business logic or provider integration is included yet.
- Local frontend run/build verification has not been confirmed by the user.

## Step 4 — TypeScript backend foundation

- Scope: Cloudflare Worker API foundation using TypeScript and Hono.
- Implemented: route organization, runtime configuration validation, CORS allow-list, request IDs, structured request/error logging, consistent 404/error JSON, health endpoint, Wrangler local-development configuration, frontend proxy and automated API tests.
- Production deployment is not part of this step.
- Status: code committed; local typecheck and automated tests still require user execution.


## Step 5 — Existing data integration

- Scope: move the existing Excel/JSON datasets into a web-compatible, persistent data source without relying on a Worker local filesystem.
- Source data audited in `prudhviuday/SchCat`:
  - `data/marketsmithidsall4.xlsx`: legacy positional fields are symbol (0), MarketSmith ID (1), market cap (2), industry (4), PB (5), ROCE (6), NikScore (7).
  - `data/ChartInkQs.xlsx`: `QUERIES`, `Watchlist`, and `Portfolio` sheets. The legacy query mapping uses column index 1 as key and index 2 as value.
  - `data/Industrydata.xlsx`: `Industry` column used for industry autocomplete.
  - `data/IndustryAnalysis/*.json`: saved industry-analysis output files.
- Implemented in SchCatWeb:
  - TypeScript/Node import script: `backend/scripts/import-data.ts`; reads the source workbooks and saved JSON, validates required sheets/fields, and exports normalized JSON.
  - Generated files are written to `backend/data-export/`, which is gitignored so personal workbooks and generated datasets are not committed.
  - Cloudflare R2 binding `DATA_BUCKET` configured as `schcat-data` with local preview bucket `schcat-data-dev`.
  - Read-only endpoints: `/api/data/manifest`, `market-ids`, `stock-metadata`, `queries`, `watchlists`, `portfolio`, `industries`, and `industry-analysis` plus individual saved analysis files.
  - Data API includes explicit missing-bucket/missing-file errors, JSON validation, ETag passthrough and short cache headers.
  - Vitest coverage added for successful reads, missing R2 binding, missing datasets and unsafe analysis filenames.
  - README documents local import, local R2 testing and the later production upload procedure.
- Important boundaries:
  - No formulas or analysis calculations were ported in Step 5.
  - No provider API calls or credentials are included.
  - Step 5 endpoints are read-only. Safe write-back for watchlists/portfolio will be designed separately.
  - Production R2 upload and deployment remain part of the final release process; do not claim the site is live.
- Verification still required on the user's computer:
  1. Run `npm install` and `npm run typecheck` in `backend/`.
  2. Run `npm test`.
  3. Run `npm run data:import -- "C:\\path\\to\\SchCat"`.
  4. Run `.\data-export\upload-to-r2.ps1` for the local R2 emulator.
  5. Start Wrangler and verify all documented `/api/data/*` endpoints return the expected JSON.
- CI verification (5 November 2026): GitHub Actions passed backend TypeScript type-checking (including the importer), all 9 Vitest tests, dependency audit (0 vulnerabilities), and frontend production build. Run: https://github.com/prudhviuday/SchCatWeb/actions/runs/42056479215
- Status: implementation committed and CI-verified; actual workbook import and local R2 runtime verification have not yet been performed in the user's environment.

## Step 4 verification

From the repository root, open two PowerShell terminals.

Terminal 1:
```powershell
cd backend
npm install
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

Terminal 2:
```powershell
cd backend
npm run typecheck
npm test
```

Then open http://127.0.0.1:8787/api/health and verify the JSON response. Also run the frontend in a third terminal using the README instructions and verify its `/api` proxy reaches port 8787.

Do not mark Step 4 fully verified until the user reports these checks pass.
