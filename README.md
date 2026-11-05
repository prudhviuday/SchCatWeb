# SchCatWeb

Web migration of the existing SchCat desktop stock-analysis application.

## Current stage

The repository currently contains the project foundation only. Business logic and data-provider integrations will be migrated in later, separately approved steps. The original desktop application remains in the separate `SchCat` repository.

See:
- [Step 2 migration mapping](docs/STEP-2-MIGRATION-MAPPING.md)
- [Project status and handover](docs/PROJECT-STATUS.md)

## Architecture

- `frontend/`: React + TypeScript + Vite user interface.
- `backend/`: FastAPI application and future server-side integrations.
- Python analysis logic and provider credentials belong on the backend, never in browser code.
- Existing Excel/JSON data is the initial data source; no database is introduced in this foundation step.

## Requirements

- Node.js 20 or newer (Node 22 LTS recommended).
- Python 3.11 or newer.
- Git.

## Run locally (Windows PowerShell)

### 1. Backend

From the repository root:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend health check: http://127.0.0.1:8000/api/health  
API documentation: http://127.0.0.1:8000/docs

### 2. Frontend

Open a second PowerShell window at the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173). The frontend's `/api` requests are proxied to the local FastAPI server on port 8000.

### 3. Production build check

From `frontend/`:

```powershell
npm run build
```

## Development rules

- Implement one migration step at a time; do not start the next step until the current step is reviewed and accepted.
- Preserve the desktop SchCat application and existing calculations.
- Do not move provider credentials into frontend code.
- Do not silently alter formulas, fallback semantics, or data meanings.
- Keep migration decisions and progress in `docs/PROJECT-STATUS.md`.
