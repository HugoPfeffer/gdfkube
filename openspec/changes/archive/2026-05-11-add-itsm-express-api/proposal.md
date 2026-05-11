## Why

The 7-stage gdfkube pipeline begins with a thin Express service writing to MongoDB (`docs/02-express-api.md`). The previous change `containerize-itsm-and-mongodb` shipped containers but explicitly left this leg out of scope — today the SPA's `Request` data lives only in React Context (`src/state/dataContext.tsx`), so a page reload erases everything and `seeds.ts:294` advertises `mongodb://gdfkube/requests` while no real Mongo write exists. The next spec (Debezium) tails `gdfkube.requests` and `gdfkube.forms`; both collections must exist with the documented shape before Debezium can ship. This change closes that gap so the SPA is fully API-backed end-to-end and the next pipeline stage starts with zero schema rewrites.

## What Changes

**Express persistence layer**
- From: SPA holds requests/forms/users/groups only in React Context; reload erases data.
- To: New Express 4 + Mongoose service at `gdfkube-src/gdfkube-itsm/server/` exposes 18 endpoints (2 health, 1 metrics, 1 OpenAPI, 4 forms, 4 requests, 4 users, 4 groups). All 11 SPA mutating reducer actions become API-backed.
- Reason: enables persistence, multi-persona workflows, and Debezium-ready document shapes.
- Impact: non-breaking for SPA UX; reducer contract unchanged (hydration moves above the provider).

**SPA hydration**
- From: `src/main.tsx` imports `REQUESTS`, `FORMS`, `FIELDS`, `USERS`, `GROUPS`, `DEFAULT_TEMPLATES` directly into initial state.
- To: New `<Bootstrap>` wrapper fetches the four collections from the API; non-admin personas receive a tiny built-in fallback for `users`/`groups` (those endpoints 403 for non-admin).
- Reason: real persistence and per-persona authorization.
- Impact: existing reducer-based unit tests remain green; new Bootstrap tests added.

**Compose + nginx wiring**
- From: `docker-compose.yml` runs SPA + MongoDB rs0 only.
- To: Adds `mongo-seed` (one-shot) and `gdfkube-itsm-api` services; `nginx.conf` reverse-proxies `/api/itsm/*` so the SPA stays same-origin. SPA `depends_on: gdfkube-itsm-api: { condition: service_healthy }`.
- Reason: dev-loop parity with the documented topology; no CORS churn.
- Impact: `docker compose up --build` is the new dev entry point.

**Seed plumbing**
- Adds: `gdfkube-itsm/scripts/export-seed-data.mjs` (TS → JSON) and `gdfkube-infra/mongodb/seed-collections.js` (idempotent `bulkWrite` + `createIndex`). Four committed JSON files in `gdfkube-infra/mongodb/seed-data/`.

**Demo identity**
- Adds: `X-Demo-User` request header (no body change), checked by `demoUser` middleware. `requireAdmin` middleware gates every admin write route (POST/PATCH on forms/users/groups, plus `POST /api/itsm/requests/:id/approvals`).

**Out of scope** (deferred): K8s/Helm/ArgoCD, SSE, Kafka producer, real auth (Keycloak/OIDC), Mongo `$jsonSchema` validator, DELETE endpoints, FormDef versioning, pagination, rate limiting, TTL.

## Capabilities

### New Capabilities

- `itsm-express-api`: Express 4 + Mongoose REST surface for the ITSM demo — health/metrics/OpenAPI, demo identity middleware, admin gate, form-driven body validator, and the 14 functional endpoints across forms/requests/users/groups.
- `itsm-requests-collection`: Mongo `gdfkube.requests` document shape, ULID `_id`, atomic approval-chain transitions, indexes, and CDC inclusion. Owned by Express writes; CDC-watched.
- `itsm-forms-collection`: Mongo `gdfkube.forms` document shape (FormDef + fields + templates), admin lifecycle (create/patch with whitelisted keys), indexes, and CDC inclusion.
- `itsm-users-collection`: Mongo `gdfkube.users` document shape (username `_id`, role enum) with admin-only CRUD. Not CDC-watched.
- `itsm-groups-collection`: Mongo `gdfkube.groups` document shape (org id `_id`, users/forms arrays) with admin-only CRUD. Not CDC-watched.

### Modified Capabilities

None. (No existing specs in `openspec/specs/` touch this surface — the prior `containerize-itsm-and-mongodb` change shipped infra only.)

## Impact

**Code (new):**
- `gdfkube-src/gdfkube-itsm/server/` — full Express service (package.json, tsconfig, Dockerfile, src/, __tests__/, openapi.yaml).
- `gdfkube-src/gdfkube-itsm/src/api/itsmApi.ts` — typed client (4 namespaces).
- `gdfkube-src/gdfkube-itsm/src/shell/Bootstrap.tsx` — hydration wrapper.
- `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` — TS-to-JSON exporter.
- `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` + `seed-data/{requests,forms,users,groups}.json`.
- `gdfkube-src/gdfkube-itsm/e2e/{persistence,admin-crud}.spec.ts`.

**Code (modified):**
- `gdfkube-src/gdfkube-itsm/src/main.tsx`, `forms/GenericRequest.tsx`, `pages/Approvals.tsx`, admin form/user/group pages, `nginx.conf`, `vite.config.ts`, `package.json`, `README.md`.
- `docker-compose.yml`.

**API surface (new — 18 endpoints):** `GET /healthz/{live,ready}`, `GET /metrics`, `GET /api/itsm/openapi.yaml`, `GET|POST /api/itsm/forms`, `GET|PATCH /api/itsm/forms/:id`, `GET|POST /api/itsm/requests`, `GET /api/itsm/requests/:id`, `POST /api/itsm/requests/:id/approvals`, `GET|POST /api/itsm/users`, `GET|PATCH /api/itsm/users/:id`, `GET|POST /api/itsm/groups`, `GET|PATCH /api/itsm/groups/:id`.

**Mongo collections:** `gdfkube.requests`, `gdfkube.forms`, `gdfkube.users`, `gdfkube.groups` (all created/seeded with documented indexes).

**Kafka topics:** none (Express never produces; CDC owns that channel — see `docs/02-express-api.md:128`).

**Downstream consumers:** Debezium spec (next) gains a Mongo source whose shape is already correct; Camel `request-router` consumes `dbz.gdfkube.requests` once Debezium ships.

**Pinned dependencies (Node service — all current as of 2026-05):**
- `express` ^4.21.0, `mongoose` ^8.8.0, `ulid` ^2.3.0, `pino` ^9.5.0, `pino-http` ^10.3.0, `prom-client` ^15.1.3.
- Dev: `typescript` ^5.6.0, `tsx` ^4.19.0, `vitest` ^2.1.0, `supertest` ^7.0.0, `@types/express` ^4.17.21, `@types/node` ^20.17.0, `@types/supertest` ^6.0.0, `js-yaml` ^4.1.0.
- Conflict check: no overlap with existing SPA deps (server is an isolated npm package). Mongoose 8.x targets MongoDB 7.x — matches the `mongo:7.0` image already in `docker-compose.yml`.

**Testing strategy:**
- *Unit (server, vitest)*: model schemas, formValidator (pure function), demoUser/requireAdmin middleware, services (request submit/decide, form/user/group admin), OpenAPI completeness assertion.
- *Integration (server, vitest + supertest against real `gdfkube_test` DB)*: every endpoint — happy path, auth, admin gate, validation errors, idempotency rules, atomic transitions.
- *Unit (SPA, vitest)*: `itsmApi` client (with `vi.stubGlobal('fetch')`), `<Bootstrap>` (loader/error/abort), refactored `GenericRequest`/`Approvals`/admin pages (mocked API).
- *E2E (Playwright)*: `persistence.spec.ts` (submit, reload, approve, reload), `admin-crud.spec.ts` (create user/group, edit form, reorder fields).
- *Contract*: OpenAPI 3.1 spec parses; every Express route appears in `paths`. Verified by `__tests__/openapi.test.ts`.
- *Manual smoke*: clean `docker compose up --build`; `curl` every endpoint; mongosh count + sample doc inspection.
