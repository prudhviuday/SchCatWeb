# SchCatWeb

Web migration of the existing SchCat desktop stock-analysis application.

## Current stage

The repository contains the React web shell and a TypeScript API foundation. Business logic and provider integrations will be migrated in later, separately approved steps. The original desktop application remains in the separate `SchCat` repository and is not modified by this project.

See:
- [Step 2 migration mapping](docs/STEP-2-MIGRATION-MAPPING.md)
- [Project status and handover](docs/PROJECT-STATUS.md)

## Architecture

- `frontend/`: React + TypeScript + Vite user interface.
- `backend/`: TypeScript + Hono API running on Cloudflare Workers (Wrangler locally).
- API configuration, routing, CORS, request IDs, structured logging and error responses live in the backend.
- Existing SchCat calculations and provider workflows are the behaviour reference. They will be ported to TypeScript with numerical/behavioural parity checks; Python is not a runtime or deployment dependency.
- Existing Excel/JSON data and the CRIP4 Node chart service will be audited and integrated in their later migration steps. No database is introduced in this foundation stage.
- Provider credentials must remain in server-side Worker secrets and must never be exposed to browser code.

## Requirements

- Node.js 20 or newer (Node 22 LTS recommended).
- npm.
- Git.

## Run locally (Windows PowerShell)

### 1. Start the API Worker

From the repository root:

```powershell
cd backend
npm install
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

The local API runs at http://127.0.0.1:8787.

Health check: http://127.0.0.1:8787/api/health

### 2. Start the frontend

Open a second PowerShell window at the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` requests to the local TypeScript Worker on port 8787.

### 3. Type-check and test the API

Open another terminal:

```powershell
cd backend
npm run typecheck
npm test
```

### 4. Build the frontend

From `frontend/`:

```powershell
npm run build
```

### 5. Deployment

The Worker is configured for Cloudflare through `backend/wrangler.toml`. Production deployment is deliberately reserved for Step 20, after provider access, secrets, persistent-data requirements and end-to-end behaviour have been verified.

## Step 5 — Import existing SchCat data

The Worker reads datasets from Cloudflare R2. It does not read files from your Windows computer or rely on a persistent Worker filesystem.

### 1. Install the importer dependencies

From the repository root:

```powershell
cd backend
npm install
```

### 2. Convert the existing desktop workbooks and JSON files

Pass the local path to your existing SchCat desktop repository:

```powershell
npm run data:import -- "D:\Projects\SchCat"
```

Replace the example path with the actual folder containing the desktop repository's `data` directory.

The TypeScript importer reads:
- `data/marketsmithidsall4.xlsx` — MarketSmith IDs, market cap, industry, PB, ROCE and NikScore using the same positional columns as the desktop application.
- `data/ChartInkQs.xlsx` — `QUERIES`, `Watchlist` and `Portfolio` sheets.
- `data/Industrydata.xlsx` — industry autocomplete list and source rows.
- `data/IndustryAnalysis/*.json` — saved industry-analysis results.

It creates normalized JSON files in `backend/data-export/`. This generated folder is gitignored; your personal datasets are not committed to GitHub.

### 3. Test locally with the local R2 emulator

From `backend/`, upload the generated files to the configured local preview bucket:

```powershell
.\data-export\upload-to-r2.ps1
npm run dev
```

In another terminal, test:

- http://127.0.0.1:8787/api/data/manifest
- http://127.0.0.1:8787/api/data/market-ids
- http://127.0.0.1:8787/api/data/stock-metadata
- http://127.0.0.1:8787/api/data/queries
- http://127.0.0.1:8787/api/data/watchlists
- http://127.0.0.1:8787/api/data/portfolio
- http://127.0.0.1:8787/api/data/industries
- http://127.0.0.1:8787/api/data/industry-analysis

### 4. Prepare the production R2 bucket (deployment is still Step 20)

After logging in to Cloudflare Wrangler, create the buckets:

```powershell
npx wrangler login
npx wrangler r2 bucket create schcat-data
npx wrangler r2 bucket create schcat-data-dev
```

When production data upload is approved, run:

```powershell
.\data-export\upload-to-r2.ps1 -Remote
```

This uploads to the production `schcat-data` bucket. Do not run the remote upload until you are ready to put the imported personal data in your Cloudflare account.

### Data API contract

All data endpoints return `{ data, meta }`. `meta` identifies the R2 object key and upload time. Responses use a short cache policy and ETag when available. Endpoints are read-only in Step 5; workbook write-back and user-specific edits will be designed separately so concurrent edits cannot overwrite one another.

If a dataset has not been uploaded, the API returns a clear 404. If the R2 binding is absent, it returns 503. No local filesystem fallback is used in production.

## Development rules

- Implement one migration step at a time; do not start the next step until the current step is reviewed and accepted.
- Preserve the desktop SchCat application and its data.
- Port formulas and business rules to TypeScript only with parity tests; do not silently alter formulas, fallback semantics or data meanings.
- Do not put provider credentials in frontend code or committed configuration.
- Be transparent about tests actually executed versus checks the user must run locally.
