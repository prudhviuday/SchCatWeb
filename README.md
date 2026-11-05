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

## Development rules

- Implement one migration step at a time; do not start the next step until the current step is reviewed and accepted.
- Preserve the desktop SchCat application and its data.
- Port formulas and business rules to TypeScript only with parity tests; do not silently alter formulas, fallback semantics or data meanings.
- Do not put provider credentials in frontend code or committed configuration.
- Be transparent about tests actually executed versus checks the user must run locally.
