# StockSync Frontend

React, TypeScript, and Vite operations UI for the StockSync inventory demo. This is a separate Git repository from the API.

## Run locally

Start the API from the sibling `stocksync-backend` repository first. Then run:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5401`. Vite proxies `/api/v1` and `/socket.io` to `http://127.0.0.1:5402`; the browser does not need a private API key.

## Demo accounts

All accounts use synthetic data and the local demo password `stock-demo-only`:

- `manager@stocksync.test`: all locations and inventory management actions
- `associate@stocksync.test`: home-location stock operations
- `auditor@stocksync.test`: read-only access

These seeded credentials are for local portfolio demonstration only.

## API data mode

[`src/config/mock-mode.ts`](src/config/mock-mode.ts) defaults `isMock` to `true`.
Set `VITE_IS_MOCK=true|false` at Vite startup/build time to override it.

- **Mock (`true`)** uses `VITE_MOCK_API_BASE_URL`, or the existing local API proxy
  during development. Production mock deployments must configure a dedicated
  test API base URL.
- **Live (`false`)** requires `VITE_REAL_API_BASE_URL`; it never falls back to
  the mock URL. API base URLs include `/api/v1`, for example
  `https://inventory.example.com/api/v1`.
- The role list and all inventory data come from the selected API. The API
  authenticates seeded accounts and owns session, role, stock, and ledger
  authorization. Email labels in the content model are not credentials.
- Both modes select an API base URL at build time. Role options and inventory
  data remain API-backed and are never generated in the browser.

Vite endpoint variables are public build-time settings, never secrets. Rebuild
after changing a deployed mode or endpoint. The current backend is a local
synthetic prototype; it has no production identity provider or real inventory
database. See the [data-mode and architecture guide](../DATA_MODE_AND_ARCHITECTURE.md).

## E2E mode verification

```sh
npm run test:e2e
VITE_IS_MOCK=false npm run test:e2e
```

Each mode runs two Playwright workflows: API-backed role discovery/login and an
inventory manager receipt through the selected API. The E2E runner uses
isolated frontend/API ports 5403/5404 and in-memory PGlite. It makes the
unselected endpoint unreachable, so both modes verify API selection and
server-backed behavior without touching the local persistent data directory.
E2E does not use or overwrite the ignored `dist/` build output. Because the API
is a sibling Git repository, frontend-only CI reports the browser suite as
skipped; run both mode commands above in the local multi-root workspace.

## Checks

```sh
npm test
npm run build
npm run lint
npm run format:check
npm run test:cov
```

The API contract is maintained in the sibling backend at [`../stocksync-backend/docs/openapi.yaml`](../stocksync-backend/docs/openapi.yaml). Coverage enforces 90% aggregate minimums for statements, branches, functions, and lines; `mock-mode.ts`, role option mapping, login, and inventory operation mapping also have 95% per-file gates. The latest run passed 91 tests and measured 95.54% statements, 91.36% branches, 91.80% functions, and 96.59% lines. `src/main.tsx` remains excluded as bootstrap-only wiring and is exercised through the browser workflows. The frontend has no analytics or external identity provider. Local fonts and assets are bundled with the app.
