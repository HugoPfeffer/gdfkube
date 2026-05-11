# Verification: add-itsm-express-api

## Unit Tests — Backend (server/)

10 test files in `server/__tests__/`:

| File | Tests | Status | Notes |
|---|---|---|---|
| `formValidator.test.ts` | 7 | PASS | Pure function, no DB needed |
| `demoUser.test.ts` | 4 | PASS | Middleware unit tests via supertest |
| `requireAdmin.test.ts` | 4 | PASS | Middleware unit tests via supertest |
| `models.test.ts` | 15 | PASS | Mongoose schema validation (in-memory) |
| `openapi.test.ts` | 3 | PASS | Contract test: walks Express routes, asserts OpenAPI coverage |
| `health.test.ts` | 3 | PASS | Liveness returns 200, readiness 200/503 based on DB |
| `forms.test.ts` | — | DEFERRED | Requires running MongoDB rs0 |
| `groups.test.ts` | — | DEFERRED | Requires running MongoDB rs0 |
| `requests.test.ts` | — | DEFERRED | Requires running MongoDB rs0 |
| `users.test.ts` | — | DEFERRED | Requires running MongoDB rs0 |

**36 tests pass** without a running MongoDB instance (Mongoose connection times out gracefully; the 6 non-DB test files complete independently).

**4 integration test files** (`forms`, `groups`, `requests`, `users`) use supertest against `buildApp()` with a real `gdfkube_test` database. They require `MONGO_URL` pointing to a live MongoDB 7 rs0 instance.

```
cd gdfkube-src/gdfkube-itsm/server
MONGO_URL=mongodb://localhost:27017/gdfkube_test npm test
# ✓ formValidator.test.ts  (7 tests)
# ✓ demoUser.test.ts       (4 tests)
# ✓ requireAdmin.test.ts   (4 tests)
# ✓ models.test.ts         (15 tests)
# ✓ openapi.test.ts        (3 tests)
# ✓ health.test.ts         (3 tests)
# ⏳ forms.test.ts          — needs MongoDB
# ⏳ groups.test.ts         — needs MongoDB
# ⏳ requests.test.ts       — needs MongoDB
# ⏳ users.test.ts          — needs MongoDB
```

## Unit Tests — SPA (src/)

32 test files, **366 tests, all pass**.

```
cd gdfkube-src/gdfkube-itsm && npx vitest run
# Test Files  32 passed (32)
#      Tests  366 passed (366)
#  Duration   3.72s
```

Key coverage areas:
- `itsmApi.test.ts` — 24 tests: all 4 namespaces, fetch stubbing, error handling, abort signals
- `dataContext.test.tsx` — 16 tests: reducer contract preserved
- `Bootstrap.test.tsx` — 6 tests: loader, hydration, error+retry, abort
- `GenericRequest.test.tsx` — 19 tests: thin POST body, follow-up GET, dispatch from canonical doc
- `Approvals.test.tsx` — 27 tests: approve/reject via API, error path, in-flight disable
- `FormEditor.test.tsx` — 12 tests: admin CRUD through itsmApi
- `UserEditor.test.tsx` — 10 tests: admin create/update through itsmApi
- `GroupEditor.test.tsx` — 2 tests: admin create/update through itsmApi
- `NewFormPage.test.tsx` — 9 tests, `NewUserPage.test.tsx` — 6 tests, `NewGroupPage.test.tsx` — 6 tests
- `Dashboard.test.tsx` — 14, `RequestDetail.test.tsx` — 19, `RequestsList.test.tsx` — 12, `Catalog.test.tsx` — 8
- `validate.test.ts` — 14, `interpolateTokens.test.ts` — 6, `parseSelectOptions.test.ts` — 7, `clipboard.test.ts` — 4
- `Icons.test.tsx` — 41, `Pipeline.test.tsx` — 5, `TemplateEditor.test.tsx` — 12, `FieldsTable.test.tsx` — 9
- `Sidebar.test.tsx` — 9, `Topbar.test.tsx` — 11, `UtilityBand.test.tsx` — 1, `ToastStack.test.tsx` — 7
- `TweaksPanel.test.tsx` — 15, `useTweaks.test.tsx` — 6
- `Forms.test.tsx` — 8, `Users.test.tsx` — 9, `App.test.tsx` — 12

## File Structure

### Server source (`server/src/`)

```
src/
├── app.ts
├── db.ts
├── index.ts
├── openapi.yaml
├── data/
│   └── demoUsers.ts
├── middleware/
│   ├── demoUser.ts
│   ├── error.ts
│   ├── logging.ts
│   └── requireAdmin.ts
├── models/
│   ├── FormDef.ts
│   ├── Group.ts
│   ├── Request.ts
│   └── User.ts
├── routes/
│   ├── forms.ts
│   ├── groups.ts
│   ├── health.ts
│   ├── metrics.ts
│   ├── openapi.ts
│   ├── requests.ts
│   └── users.ts
└── services/
    ├── formAdminService.ts
    ├── formValidator.ts
    ├── groupAdminService.ts
    ├── requestService.ts
    ├── types.ts
    └── userAdminService.ts
```

### Backend test files (`server/__tests__/`)

10 test files: `demoUser.test.ts`, `formValidator.test.ts`, `forms.test.ts`, `groups.test.ts`, `health.test.ts`, `models.test.ts`, `openapi.test.ts`, `requests.test.ts`, `requireAdmin.test.ts`, `users.test.ts`.

### OpenAPI contract test

`openapi.test.ts` loads `src/openapi.yaml` via `js-yaml`, walks all Express routes registered on `buildApp()`, and asserts each route has a corresponding `paths.<path>.<method>` entry. 3 tests pass — spec parses, route coverage is complete, and the YAML is served at `GET /api/itsm/openapi.yaml`.

### Seed data (`gdfkube-infra/mongodb/seed-data/`)

4 JSON files present:
- `forms.json` — 212 lines (3 form definitions with fields and templates)
- `groups.json` — 64 lines (organizational groups)
- `requests.json` — 344 lines (sample ITSM requests)
- `users.json` — 89 lines (demo users with roles)

Total: 709 lines of seed data.

### Infrastructure files

- `server/Dockerfile` — multi-stage Node 20 alpine, non-root, healthcheck
- `server/.dockerignore` — excludes node_modules, tests, dev files
- `gdfkube-itsm/nginx.conf` — reverse-proxies `/api/itsm/` to `gdfkube-itsm-api:3000`
- `docker-compose.yml` (repo root) — includes `mongo-seed` (one-shot), `gdfkube-itsm-api`, and `itsm` services with health dependencies

### E2E specs (`e2e/`)

3 Playwright spec files:
- `persistence.spec.ts` — submit request, reload, verify persistence; approve, reload, verify status transition
- `admin-crud.spec.ts` — create user/group, edit form, reorder fields, all with reload verification
- `approval-flow.spec.ts` — end-to-end approval workflow

## Pre-commit

TruffleHog secret scan: **0 secrets found**.

```
pre-commit run --all-files
# TruffleHog: 0 verified_secrets, 0 unverified_secrets
```

## Deferred Verification (requires Docker)

The following verification steps require a running Docker environment with `docker compose up --build`:

### Compose stack health

```bash
docker compose up -d --build
docker compose ps
```

Expected containers:
- `mongo` — healthy
- `mongo-init` — Exited (0)
- `mongo-seed` — Exited (0)
- `gdfkube-itsm-api` — healthy
- `itsm` (nginx + SPA) — healthy

### curl smoke tests

```bash
curl -s http://127.0.0.1:8080/api/itsm/healthz/live
# {"status":"ok"}

curl -s -H 'X-Demo-User: joao.silva' http://127.0.0.1:8080/api/itsm/forms | jq length
# 3 (active forms)

curl -s -H 'X-Demo-User: maria.costa' 'http://127.0.0.1:8080/api/itsm/forms?include=disabled' | jq length
# >= 3

curl -s -H 'X-Demo-User: joao.silva' http://127.0.0.1:8080/api/itsm/requests | jq length
# seed count

curl -s -H 'X-Demo-User: maria.costa' http://127.0.0.1:8080/api/itsm/users | jq length
# seed count

curl -so /dev/null -w '%{http_code}' -H 'X-Demo-User: joao.silva' http://127.0.0.1:8080/api/itsm/users
# 403

curl -s -H 'X-Demo-User: maria.costa' http://127.0.0.1:8080/api/itsm/groups | jq length
# seed count
```

### Seed idempotency

```bash
# Run mongo-seed twice; second run should yield 0 upserts
docker compose run --rm mongo-seed
```

### mongosh collection counts

```bash
docker exec mongo1 mongosh gdfkube --eval '
  print("requests:", db.requests.countDocuments());
  print("forms:", db.forms.countDocuments());
  print("users:", db.users.countDocuments());
  print("groups:", db.groups.countDocuments());
'
```

### E2E Playwright runs

```bash
cd gdfkube-src/gdfkube-itsm && npx playwright test e2e/
# persistence.spec.ts — submit, reload, approve, reload
# admin-crud.spec.ts — create user/group, edit form, reorder fields
# approval-flow.spec.ts — end-to-end approval workflow
```

### Backend integration tests (with MongoDB)

```bash
cd gdfkube-src/gdfkube-itsm/server
MONGO_URL=mongodb://mongo1:27017/gdfkube_test?replicaSet=rs0 npm test
# All 10 test files should pass with a live MongoDB rs0 instance
```
