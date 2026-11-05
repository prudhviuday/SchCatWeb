# SchCatWeb — Project Status and Chat Handover

This file is the durable source of truth for continuing the SchCat desktop-to-web migration across ChatGPT conversations.

## How to resume

The user can start a new ChatGPT conversation and say **"Continue SchCatWeb — Step N"** (or simply "Step N"). First read this file and `docs/STEP-2-MIGRATION-MAPPING.md`, then continue only the explicitly requested step. Do not ask the user to restate decisions already recorded here.

## User's workflow requirements

- Work sequentially, one step at a time.
- The user explicitly starts each step (for example, "do Step 3").
- Implement and test only the current step; provide exact user-side test instructions and wait for acceptance before moving on.
- Do not silently skip steps or begin the next step.
- Do not create branches without the user's explicit permission. Use the existing `main` branch unless the user directs otherwise.
- Preserve the existing SchCat desktop app and its repository. Do not delete or overwrite existing data/code without approval.
- Preserve existing Python formulas and business logic; do not rewrite calculations in JavaScript or change their semantics without approval.
- Be transparent about tests actually executed versus checks the user must run locally.

## Project objective and decisions

- Source desktop repository: https://github.com/prudhviuday/SchCat
- Target web repository: https://github.com/prudhviuday/SchCatWeb
- Initial audience: personal use.
- Initial data architecture: reuse existing Excel/JSON/local data and existing providers; no database is required for the first foundation.
- Frontend: React + TypeScript + Vite.
- Backend: Python + FastAPI; retain/reuse Python analysis logic server-side.
- Existing Node chart service may be retained/integrated in its dedicated later step.
- UI direction: dark financial terminal, desktop-first and responsive.
- Provider credentials must remain server-side and must not be exposed to the browser.
- Broad scope: migrate the major desktop features over the planned steps.

## Deployment and API integration requirements (confirmed by user)

- The intended final deliverable must be reachable through a live Cloudflare URL, not only a local development server. Cloudflare deployment belongs to Step 20; do not claim the site is live before a successful deployment and smoke test.
- Preserve and integrate the existing Node/Express chart service in `SchCat/CRIP4`; it is responsible for existing chart-related routes/data transformations and must be audited before changing or replacing it.
- Preserve the existing Python data-fetching and analysis pathways for MarketSmith, ChartInk and NSE where applicable. FastAPI should provide the central web-facing application API and orchestrate backend services; it must not duplicate or silently replace existing provider logic.
- Reuse the existing Excel/JSON data initially. Do not expose provider credentials or auth tokens to frontend/browser code.
- The exact deployment topology (Cloudflare frontend plus an appropriate backend/Node hosting arrangement) must be selected after checking runtime compatibility, provider network access, secrets, CORS, and persistent file requirements. Do not assume FastAPI or the Node process can run unchanged inside a basic static Pages deployment.
- The user's requirement is functional parity: the deployed webpage must fetch real data through the existing services, not merely display a static UI.

## Migration plan and progress

| Step | Scope | Status |
|---|---|---|
| 1 | Repository audit | Complete |
| 2 | Detailed migration mapping | Complete |
| 3 | Web project foundation | Scaffold committed; local run/build verification pending user |
| 4 | Backend foundation | Not started |
| 5 | Existing data integration | Not started |
| 6 | Core Python logic migration | Not started |
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

Read-only audit of both repositories completed. SchCatWeb originally contained only `test.txt`. SchCat desktop contains the PyQt5 application, Python analysis modules, a Node chart service in `CRIP4`, and Excel/JSON data. Major feature inventory and risks are recorded in the Step 2 mapping document.

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
- No application code was changed in Step 2.

The mapping records module/function responsibilities, feature behaviours, proposed API boundaries, data semantics, known defects/risks, and later-step dependencies. Pay particular attention to the documented timeframe mapping, fallback values, Research percentage denominator, Industry metric labels, and synthetic portfolio P&L chart semantics. Do not silently change these.

## Step 3 — Web project foundation

- Scope: create frontend/backend project skeleton, dependency/configuration files, environment example, ignore rules, health endpoint, starter UI, and local setup instructions.
- No SchCat business logic or provider integration is included at this stage.
- No database or deployment setup is included.
- Repository scaffold is committed on `main`; local runtime/build verification remains for the user to perform.

## Next action

Finish Step 3 verification by following the root README's Windows PowerShell instructions:
1. Start FastAPI and verify `http://127.0.0.1:8000/api/health` returns an `ok` status.
2. Start Vite and verify the starter screen loads at the printed local URL.
3. Run `npm run build` in `frontend/` and confirm it succeeds.

Only after the user confirms these checks should Step 3 be marked fully verified and Step 4 begin.
