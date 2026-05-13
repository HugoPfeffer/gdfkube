# gdfkube ITSM Portal

A demo IT service portal for the gdfkube platform — operators submit cluster/namespace/scale requests, admins approve them, and the system simulates a CDC pipeline (Form → MongoDB → Debezium → Kafka → Camel → Git → ArgoCD) reaching HyperShift.

This module was scaffolded from the Claude Design handoff bundle `UM8oI594JuuCpxaNBVoITA` and implements OpenSpec change [`build-itsm-portal`](../../openspec/changes/build-itsm-portal/).

## Tech stack

- React 18.3.1 + TypeScript 5
- Vite 5 + @vitejs/plugin-react 4
- Vitest 1 + Testing Library 14 + jsdom 24
- ESLint 9, Prettier 3
- No router library, no state-management library — by design

## Getting started

From the repo root:

```bash
cd gdfkube-src/gdfkube-itsm
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Type-check without emitting (`tsc --noEmit`) |
| `npm run test` | Run all Vitest tests once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint over `src/**` |
| `npm run e2e` | Run Playwright e2e tests |
| `npm run e2e:install` | Install Playwright browsers |
| `npm run seed:export` | Export TS seed data to JSON for mongosh |

## Backend API

The Express service lives in `server/` and provides 18 REST endpoints under `/api/itsm/`:

- **Health & metrics**: `GET /healthz`, `GET /readyz`, `GET /metrics`
- **Forms** (4): `GET /forms`, `GET /forms/:id`, `POST /forms` (admin), `PATCH /forms/:id` (admin)
- **Requests** (3): `GET /requests`, `GET /requests/:id`, `POST /requests`
- **Approvals** (1): `POST /requests/:id/approvals` (admin)
- **Users** (4): `GET /users`, `GET /users/:id`, `POST /users` (admin), `PATCH /users/:id` (admin)
- **Groups** (4): `GET /groups`, `GET /groups/:id`, `POST /groups` (admin), `PATCH /groups/:id` (admin)
- **OpenAPI**: `GET /openapi.yaml`

Identity is conveyed via the `X-Demo-User` header — the SPA sets it to the active persona's username on every request. The server resolves this to a demo user record with a role; admin-only endpoints return `403` for non-admin users.

## Local development with Compose

```bash
docker compose up -d --build
```

This starts MongoDB, seeds it with demo data, starts the API server, and serves the SPA behind nginx. Health endpoints:

- SPA: http://localhost:8080
- API health: http://localhost:8080/api/itsm/healthz
- API readiness: http://localhost:8080/api/itsm/readyz

The `mongo-seed` container runs once to upsert seed data; `mongo-init` creates indexes. Both exit after completion.

## Seed data

Seed data flows from TypeScript source to MongoDB:

1. **Source of truth**: `src/data/seeds.ts`, `src/data/adminSeeds.ts`, `src/data/defaultTemplates.ts`
2. **Export**: `npm run seed:export` runs `scripts/export-seed-data.mjs` which produces four JSON files in `gdfkube-infra/mongodb/seed-data/`
3. **Load**: `gdfkube-infra/mongodb/seed-collections.js` (mongosh) performs idempotent `bulkWrite` upserts for `requests`, `forms`, `users`, and `groups` collections

To regenerate seed JSON after editing the TypeScript sources:

```bash
npm run seed:export
```

## Admin endpoints

The following endpoints require the `X-Demo-User` header to resolve to an admin role user. Non-admin users receive `403 Forbidden`:

- `POST /api/itsm/forms`, `PATCH /api/itsm/forms/:id`
- `POST /api/itsm/users`, `PATCH /api/itsm/users/:id`
- `POST /api/itsm/groups`, `PATCH /api/itsm/groups/:id`
- `POST /api/itsm/requests/:id/approvals`
- `GET /api/itsm/forms?include=disabled` (disabled forms are only visible to admins)

## Demo affordances

The portal is a self-contained demo with NO backend wiring:

### Role switcher

The Topbar avatar opens a menu to switch between Operator (`João Silva @ saude`) and Platform Admin (`Maria Costa @ setic`). Operator role hides the Operations and Administration nav sections; switching to operator while on an admin route redirects to Home.

### Tweaks panel

Floating "Tweaks" button opens a drawer that mutates demo state. Persisted via `localStorage["gdfkube.tweaks"]` and applied immediately:

| Key | Type | Default | Effect |
|---|---|---|---|
| `theme` | `"light" \| "dark"` | `"light"` | Sets `data-theme` on `<html>` |
| `density` | `"compact" \| "comfortable"` | `"compact"` | Layout density class |
| `sidebarCollapsed` | boolean | `false` | Hides sidebar labels |
| `pipelineSpeed` | number (0.5–4) | `1` | Scales pipeline animation duration via `--anim-duration` |
| `showDemoBanner` | boolean | `true` | Toggles the demo banner |

The Tweaks drawer also exposes Quick actions: toggle role; jump to the Service Catalog (new request flow).

### Persistence

All data (requests, forms, users, groups) is persisted through the Express API backed by MongoDB. The SPA hydrates on load from the API via `Bootstrap`, and all write operations (submit, approve, admin CRUD) go through the API. Refreshing the page reloads the latest data from the database.

## Project layout

```
src/
  api/          # itsmApi client, setDemoUser
  data/         # seed exports: GDF_DATA, GDF_ADMIN_DATA, DEFAULT_TEMPLATES
  state/        # data context + reducer
  router.ts     # in-app reducer router
  App.tsx       # composition root
  shell/        # UtilityBand, Sidebar, Topbar, ToastStack, Bootstrap
  pages/        # Dashboard, Catalog, RequestsList, RequestDetail, Approvals, admin/*
  forms/        # GenericRequest, RadioCards, PrefixedInput, PayloadPreview, helpers
  admin/        # FormEditor, FieldsTable, TemplateEditor, NewFormPage, NewUserPage, NewGroupPage
  components/   # StatusPill, Pipeline
  icons/        # Icons set
  tweaks/       # useTweaks hook + TweaksPanel
  utils/        # clipboard helper
  types.ts      # shared types
server/         # Express API (Mongoose, pino, prom-client)
e2e/            # Playwright end-to-end tests
scripts/        # export-seed-data.mjs
```

## Architecture notes

- **Single dynamic form runner**: every form (cluster-request, namespace-request, scale-request, plus any new form created in the admin UI) renders through `src/forms/GenericRequest.tsx`. There is no per-form bespoke component. Field schemas drive everything.
- **Schema as contract**: `Field` type in `src/types.ts` defines `{ key, label, type, bucket, required, help, prefix, placeholder, validation, min, max, options, displayAs }`. Admin edits to fields propagate to the consumer page via the data context reducer in lockstep.
- **Approval gate**: every submission lands in `status: "approval"`. Only the Approvals page can advance to `provisioning` (and only an admin can reach Approvals).
- **Clipboard fallback**: `src/utils/clipboard.ts` tries `navigator.clipboard.writeText` and falls back to a hidden textarea + `document.execCommand('copy')` for sandboxed iframe environments (e.g. Vercel previews).
- **Routing**: a tiny in-app reducer router in `src/router.ts`. No URL synchronization, no deep links — by design (D3 in design.md).

## Testing

```bash
npm run test         # run once
npm run test:watch   # watch mode
```

Coverage targets ≥80% on `src/**` excluding `src/data/**`. The test suite covers 366 SPA tests plus 36 backend unit tests (runs without MongoDB). E2e tests require a running compose stack — see `e2e/` directory.

## CI

GitHub Actions runs `typecheck`, `test`, and `build` on changes under `gdfkube-src/gdfkube-itsm/**` (workflow at `.github/workflows/gdfkube-itsm-ci.yml`). The workflow follows the project's path-scoped GitHub Actions security rules: `permissions: {}` at workflow level, SHA-pinned actions, `persist-credentials: false` on checkout.

## Provenance

This module reproduces the Claude Design handoff bundle [`UM8oI594JuuCpxaNBVoITA`](https://api.anthropic.com/v1/design/h/UM8oI594JuuCpxaNBVoITA), implementing every screen and behavior captured across the bundle's six iterative chat sessions. See `openspec/changes/build-itsm-portal/brainstorm.md` for the design rationale and pruning decisions.
