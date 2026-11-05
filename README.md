# SchCatWeb

A static React + TypeScript web migration of the existing SchCat desktop stock-analysis application.

## Architecture decision

SchCatWeb is a **static website**. It has no runtime backend, database, Cloudflare Worker script, R2 bucket, Python service or server process.

- `frontend/`: React + TypeScript + Vite. All UI, calculations and browser-compatible data workflows run here.
- `wrangler.toml`: deploys only the Vite build output to Cloudflare Workers Static Assets.
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

## Cloudflare Workers Builds

Configure the existing Cloudflare Worker `schcatweb` as follows:

- Root directory: repository root (blank).
- Build command:

```bash
cd frontend && npm install && npm run build
```

- Deploy command:

```bash
npx wrangler deploy
```

- Build watch paths: `frontend/**`, `wrangler.toml`.

The root `wrangler.toml` publishes `frontend/dist` as static assets. It intentionally has no `main` entry point, Worker script, API route, R2 binding or database. Keep the Worker name as `schcatweb` to match the existing Cloudflare deployment.

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
