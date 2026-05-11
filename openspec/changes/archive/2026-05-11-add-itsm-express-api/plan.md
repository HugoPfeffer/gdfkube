# Wire ITSM Requests to MongoDB — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. The original micro-step plan with code snippets, exact file paths, and per-task commit messages is at `.claude/plans/i-need-to-plan-lovely-newell.md` — this file mirrors that plan in the OpenSpec format.

**Goal:** Implement the documented "Express API" stage of the gdfkube pipeline (`docs/02-express-api.md`), persisting all ITSM domain entities (requests, forms, users, groups) in `gdfkube` MongoDB rs0 with the documented document shapes (`docs/03-mongodb.md`), exposing every admin CRUD endpoint the SPA reducer needs, so the next spec (Debezium) can tail the oplog with zero schema rewrites and so the SPA is fully API-backed end-to-end.

**Architecture:** New Node 20 + Express 4 + Mongoose service at `gdfkube-src/gdfkube-itsm/server/`, reachable inside compose net as `http://gdfkube-itsm-api:3000`. Four collections seeded from the SPA's existing TS data: `requests` and `forms` (CDC-watched per `docs/04-debezium.md:48`) plus `users` and `groups` (admin-managed, not CDC-watched). Requests are created through a thin POST body; the server assigns ULID `_id`, validates the body against the FormDef's `fields[]`, and returns `{ id }`. Admin endpoints are gated by `req.demoUser.role === 'admin'`. SPA's nginx reverse-proxies `/api/itsm/*` (same-origin, no CORS). React reducer stays sync; hydration happens in a `<Bootstrap>` wrapper. All 11 SPA reducer mutating actions become API-backed. Demo identity flows via the `X-Demo-User` header.

**Tech Stack:** Node 20 + Express 4 + Mongoose 8 + `ulid` + `pino`/`pino-http` + `prom-client` (server). React 18 + Vite + Vitest + Playwright (frontend, unchanged). MongoDB 7 rs0 (already running). No Kafka/SSE in this change.

---

## Task 1: Backend skeleton — health, metrics, structured logs, Mongoose connection

References: spec `itsm-express-api` → "Health and Metrics Endpoints"; design.md decisions D1, D12; source plan Task 2.

- [ ] **Step 1:** Initialize npm package at `gdfkube-src/gdfkube-itsm/server/` with deps `express`, `mongoose`, `ulid`, `pino`, `pino-http`, `prom-client` and devDeps `typescript`, `tsx`, `vitest`, `supertest`, `@types/express`, `@types/node`, `@types/supertest`. Scripts: `dev` (`tsx watch src/index.ts`), `build` (`tsc`), `start` (`node dist/index.js`), `test` (`vitest run`).
- [ ] **Step 2:** Add `tsconfig.json` and `vitest.config.ts`.
- [ ] **Step 3:** Implement `src/db.ts` (`mongoose.connect` with `serverSelectionTimeoutMS: 30_000`, `writeConcern: { w: 'majority' }`, exported `ping()`).
- [ ] **Step 4:** Write failing `__tests__/health.test.ts` against `gdfkube_test`.
- [ ] **Step 5:** Implement `src/app.ts`, `src/routes/health.ts`, `src/routes/metrics.ts`, `src/middleware/{error,logging}.ts`. Run tests — expect PASS.
- [ ] **Step 6:** Implement `src/index.ts` (process entry: connect, build app, listen on `PORT`).
- [ ] **Commit:** `add itsm-api skeleton with health, metrics, structured logs`

## Task 2: Mongoose models — Request, FormDef, User, Group

References: specs `itsm-requests-collection`, `itsm-forms-collection`, `itsm-users-collection`, `itsm-groups-collection` → all "Document Shape" requirements; source plan Task 3.

- [ ] **Step 1:** Write failing `__tests__/models.test.ts` covering required fields, enum rejection (status, stage 0..6, env, role), default values (`reason: null`, empty arrays), and round-trip of optional fields.
- [ ] **Step 2:** Implement `src/models/Request.ts` with `_id: String`, `Schema.Types.Mixed` for vars/meta, strict subschemas, no `__v`, `timestamps: false`.
- [ ] **Step 3:** Implement `src/models/FormDef.ts` (typed `fields[]`, optional `templates[]`).
- [ ] **Step 4:** Implement `src/models/User.ts` (`_id` = username, role enum).
- [ ] **Step 5:** Implement `src/models/Group.ts` (`_id` = org id; `users: [String]`, `forms: [String]` default `[]`).
- [ ] **Commit:** `add Mongoose models for requests, forms, users, groups`

## Task 3: Demo identity middleware + admin gate

References: spec `itsm-express-api` → "Demo Identity Middleware", "Admin Gate Middleware"; design.md decision D8; source plan Task 4.

- [ ] **Step 1:** Populate `src/data/demoUsers.ts` from the SPA seeds (`joao.silva`, `maria.costa`, ...) with at least one admin and full role coverage.
- [ ] **Step 2:** Write failing `__tests__/demoUser.test.ts` and `__tests__/requireAdmin.test.ts`.
- [ ] **Step 3:** Implement `src/middleware/demoUser.ts` and `src/middleware/requireAdmin.ts`.
- [ ] **Step 4:** Mount `demoUser` on `/api/itsm/*`. Document where `requireAdmin` will mount (Tasks 5–10).
- [ ] **Commit:** `add X-Demo-User middleware and admin gate`

## Task 4: FormDef-driven body validator

References: spec `itsm-express-api` → "FormDef-Driven Body Validator"; design.md decision D7; source plan Task 5.

- [ ] **Step 1:** Write failing `__tests__/formValidator.test.ts` covering happy path, missing required, regex, range, enum, unknown-key-ignored.
- [ ] **Step 2:** Implement `src/services/formValidator.ts` as a pure function; export error type from sibling `types.ts`.
- [ ] **Commit:** `add FormDef-driven validator service`

## Task 5: Forms read + admin write endpoints

References: spec `itsm-express-api` → "Forms Read Endpoints", "Forms Admin Write Endpoints"; spec `itsm-forms-collection` → "Forms Admin Lifecycle"; source plan Task 6.

- [ ] **Step 1:** Write failing `__tests__/forms.test.ts`: GET list (active-only default; `?include=disabled` admin-only), GET by id, POST (201/409/admin-only), PATCH (whitelist `{name, topic, status, fields, templates}`, atomic array replace, 404 unknown id, 403 operator).
- [ ] **Step 2:** Implement `src/services/formAdminService.ts` (`create` mapping dup-key → 409; `patch` with whitelist).
- [ ] **Step 3:** Implement `src/routes/forms.ts`. Wire to `src/app.ts`. Run tests — expect PASS.
- [ ] **Commit:** `add forms read + admin POST/PATCH endpoints`

## Task 6: Requests read endpoints

References: spec `itsm-express-api` → "Requests Read Endpoints"; source plan Task 7.

- [ ] **Step 1:** Write failing `__tests__/requests.test.ts`: GET list sorted by `submittedAt` desc, filters `status`/`formId`/`requesterGroup`, GET by id (404 on miss).
- [ ] **Step 2:** Implement `src/routes/requests.ts` (read routes only). Run tests — expect PASS.
- [ ] **Commit:** `add GET /api/itsm/requests and /:id`

## Task 7: Request submit endpoint (POST /api/itsm/requests)

References: spec `itsm-express-api` → "Request Submit Endpoint"; spec `itsm-requests-collection` → "Requests Document Shape"; design.md decision D2; source plan Task 8.

- [ ] **Step 1:** Extend `__tests__/requests.test.ts`: 201 with `{ id }` body and `Location` header; persisted doc has ULID `_id`, `status: 'approval'`, `stage: 0`, server-overridden `requester`, `meta.correlationId === _id`, `submittedAt` ISO; missing `formId` → 400; unknown formId → 400; FormDef regex violation → 400 with `details: [{key, code:'pattern'}]`; bad env enum → 400.
- [ ] **Step 2:** Implement `src/services/requestService.ts:submit({demoUser, body})` per design.md: ULID + FormDef load + validate + Mongoose create. Server overrides any client-supplied `requester`.
- [ ] **Step 3:** Wire `POST /api/itsm/requests`. Respond `201` with `{ id: created._id }` and `Location: /api/itsm/requests/${created._id}`.
- [ ] **Commit:** `add POST /api/itsm/requests with ULID + FormDef validation`

## Task 8: Approval endpoint (POST /api/itsm/requests/:id/approvals)

References: spec `itsm-express-api` → "Request Approval Endpoint"; spec `itsm-requests-collection` → "Approval Chain Atomicity"; design.md decision D3; source plan Task 9.

- [ ] **Step 1:** Extend `__tests__/requests.test.ts`: approved → `status:'provisioning'`, `stage:1`, `approvalChain` +1; rejected → `status:'failed'`, `reason`, +1; requested_changes → status/stage unchanged, +1; idempotency: duplicate POST appends 2 entries (no dedupe); 403 operator; 404 unknown; 400 bad action enum.
- [ ] **Step 2:** Extend `requestService.ts` with `decide({id, demoUser, body})`: single `findByIdAndUpdate` with `$push:{approvalChain:decision}` always + conditional `$set:{status,stage}` for approved or `$set:{status,reason}` for rejected. `requested_changes` only `$push`es.
- [ ] **Step 3:** Wire `POST /api/itsm/requests/:id/approvals` (gated by `requireAdmin`). Run tests — expect PASS.
- [ ] **Commit:** `add POST /api/itsm/requests/:id/approvals with atomic transition`

## Task 9: Users CRUD endpoints (admin)

References: spec `itsm-users-collection` → "Users Admin CRUD"; source plan Task 10.

- [ ] **Step 1:** Write failing `__tests__/users.test.ts`: list/get/create/update; 403 operator; 400 bad role; 409 dup; 404 unknown; PATCH whitelist `{name, fullName, email, role, group, status, mfa, last}`.
- [ ] **Step 2:** Implement `src/services/userAdminService.ts`.
- [ ] **Step 3:** Implement `src/routes/users.ts` (all routes admin-gated).
- [ ] **Commit:** `add admin users CRUD endpoints`

## Task 10: Groups CRUD endpoints (admin)

References: spec `itsm-groups-collection` → "Groups Admin CRUD"; source plan Task 11.

- [ ] **Step 1:** Write failing `__tests__/groups.test.ts`: same matrix as users; PATCH replaces `users[]` and `forms[]` wholesale.
- [ ] **Step 2:** Implement `src/services/groupAdminService.ts`.
- [ ] **Step 3:** Implement `src/routes/groups.ts` (all routes admin-gated).
- [ ] **Commit:** `add admin groups CRUD endpoints`

## Task 11: OpenAPI spec + Dockerfile

References: spec `itsm-express-api` → "OpenAPI 3.1 Spec Endpoint"; design.md decision D11; source plan Task 12.

- [ ] **Step 1:** Author `src/openapi.yaml` (OpenAPI 3.1) covering all 18 routes; reference shared schemas; declare `X-Demo-User` apiKey scheme; mark admin routes with the `admin` security requirement.
- [ ] **Step 2:** Write `__tests__/openapi.test.ts` that loads the spec via `js-yaml`, parses, walks `buildApp()` registered routes, and asserts every route appears in `paths.<path>.<method>`.
- [ ] **Step 3:** Write multi-stage `Dockerfile` (Node 20 alpine, non-root, healthcheck) and `.dockerignore`.
- [ ] **Step 4:** Wire `GET /api/itsm/openapi.yaml` to serve the YAML.
- [ ] **Step 5:** Build the image: `docker build -t gdfkube-itsm-api:local gdfkube-src/gdfkube-itsm/server/`.
- [ ] **Commit:** `add OpenAPI 3.1 spec and Dockerfile for itsm-api`

## Task 12: Seed exporter + mongosh seed script (4 collections)

References: spec `itsm-requests-collection` → "Requests Indexes"; spec `itsm-forms-collection` → "Forms Indexes"; spec `itsm-users-collection` → "Users Indexes"; spec `itsm-groups-collection` → "Groups Indexes"; design.md decision D10; source plan Task 13.

- [ ] **Step 1:** Write `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` (uses `tsx` to import `src/data/seeds.ts`, `adminSeeds.ts`, `defaultTemplates.ts`; produces `requests.json`, `forms.json`, `users.json`, `groups.json` in `gdfkube-infra/mongodb/seed-data/`). For each request: `_id = r.id`, `meta.correlationId = r.requestId ?? r.id`. For each form: `fields = FIELDS[id] ?? []`, `templates = DEFAULT_TEMPLATES[id] ?? []`. For users/groups: `_id = entity.id`.
- [ ] **Step 2:** Add `seed:export` script to `gdfkube-itsm/package.json`. Run; verify all four files non-empty.
- [ ] **Step 3:** Write `gdfkube-infra/mongodb/seed-collections.js` (mongosh, idempotent): `bulkWrite` upserts for all four; `createIndex` for `idx_formId_status`, `idx_org_env`, `idx_status`, `idx_createdAt`, `idx_correlationId`, `idx_form_status`, `idx_user_group`, `idx_user_role`, `idx_group_name`.
- [ ] **Step 4:** Manually verify idempotency (`docker run mongo:7.0 mongosh ... --file seed-collections.js` twice — first run upserts, second yields 0). Verify counts via `countDocuments()` match seed sizes.
- [ ] **Step 5:** Update `gdfkube-infra/mongodb/README.md`.
- [ ] **Commit:** `add idempotent seed script for all four ITSM collections`

## Task 13: Compose wiring + nginx /api/itsm/ proxy

References: spec `itsm-express-api` → "Same-Origin via nginx Reverse Proxy"; design.md decision D10; source plan Task 14.

- [ ] **Step 1:** Edit `gdfkube-src/gdfkube-itsm/nginx.conf`: add `location /api/itsm/ { proxy_pass http://gdfkube-itsm-api:3000/api/itsm/; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Request-Id $request_id; }` *before* the SPA-fallback `location /`.
- [ ] **Step 2:** Edit `docker-compose.yml`: add `mongo-seed` (one-shot, depends_on `mongo-init: service_completed_successfully`, mounts the seed script + data) and `gdfkube-itsm-api` (build from `server/`, env `MONGO_URL=mongodb://mongo1:27017/gdfkube?replicaSet=rs0`, depends_on `mongo-seed: service_completed_successfully`, healthcheck on `/healthz/live`). Tighten existing `itsm` to `depends_on: { gdfkube-itsm-api: { condition: service_healthy } }`.
- [ ] **Step 3:** `docker compose down -v && docker compose up -d --build && docker compose ps`. Confirm `mongo-init` and `mongo-seed` are `Exited (0)`; `gdfkube-itsm-api` and `itsm` are healthy.
- [ ] **Step 4:** Verify proxy: `curl http://127.0.0.1:8080/api/itsm/forms` and `requests` (operator), `users` and `groups` (admin), 403 for `users` as operator.
- [ ] **Commit:** `wire mongo-seed + itsm-api into compose; nginx /api/itsm proxy`

## Task 14: SPA api client + Bootstrap hydration

References: design.md decisions D5, D6; source plan Task 15.

- [ ] **Step 1:** Write failing `src/api/__tests__/itsmApi.test.ts` (vi.stubGlobal fetch). All four namespaces, thin POST body, X-Demo-User from configurable getter, JSON Content-Type, ApiError on non-2xx, AbortError surfaces and is not logged.
- [ ] **Step 2:** Implement `src/api/itsmApi.ts` with `setDemoUserResolver(fn)`.
- [ ] **Step 3:** Write failing `src/shell/__tests__/Bootstrap.test.tsx` (loader, mounts provider with all slices populated, error+retry, abort on unmount).
- [ ] **Step 4:** Implement `src/shell/Bootstrap.tsx`: `Promise.all` for `forms.list` + `requests.list`; conditional `users.list` + `groups.list` only when persona is admin (else built-in fallback). Derive `templates` from `forms[].templates`; derive `fields` map from `forms[].fields`.
- [ ] **Step 5:** Edit `src/main.tsx` to wrap `<App>` in `<Bootstrap>`. Drop direct seed imports from initial-state assembly. Wire `setDemoUserResolver` to the SPA's user accessor.
- [ ] **Step 6:** Edit `vite.config.ts`: `server.proxy['/api/itsm'] = 'http://127.0.0.1:8080'`.
- [ ] **Step 7:** Run full SPA suite — every existing test passes (provider contract unchanged).
- [ ] **Commit:** `add itsmApi client + Bootstrap hydration for all four collections`

## Task 15: Wire SPA writes through API (requests + forms admin)

References: source plan Task 16.

- [ ] **Step 1:** Update `src/forms/__tests__/GenericRequest.test.tsx`: mock `itsmApi.requests.create` (returns `{id}`) and `.get` (returns full doc). Assert thin body, follow-up GET, dispatch with canonical doc, error toast on reject, submit disabled while in-flight.
- [ ] **Step 2:** Modify `src/forms/GenericRequest.tsx:141-187`: `onSubmit` async; thin body; await create then get; dispatch from response.
- [ ] **Step 3:** Update `src/pages/__tests__/Approvals.test.tsx`: mock `itsmApi.requests.decide` for approve and reject; error path; buttons disabled while in-flight.
- [ ] **Step 4:** Modify `src/pages/Approvals.tsx:124-198`: `commitApproval`/`commitReject` async; await `decide`; dispatch from response.
- [ ] **Step 5:** For each admin form page (locate via `git ls-files | grep -iE 'admin.*form|FieldsTable|FormDesigner'`): replace dispatch with `await itsmApi.forms.<create|update>(...)` then dispatch with response. `REORDER_FIELDS` and `UPDATE_FIELD` use `itsmApi.forms.update(formId, { fields: nextFields })`. `UPDATE_TEMPLATES` uses `{ templates }`. Add `isSaving`. Update tests to mock `itsmApi.forms`.
- [ ] **Step 6:** Run full SPA suite — all green.
- [ ] **Commit:** `wire SPA writes through itsmApi (requests + forms admin)`

## Task 16: Wire SPA writes through API (users + groups admin)

References: source plan Task 17.

- [ ] **Step 1:** For each admin user page (locate via `git ls-files | grep -iE 'admin.*user|UserTable|AdminUsers'`): mock `itsmApi.users.{create,update}` in tests; assert call shape; assert dispatch only on resolve; assert error toast on reject; assert save buttons disabled while in-flight. Modify pages to await before dispatch.
- [ ] **Step 2:** For each admin group page (locate via `git ls-files | grep -iE 'admin.*group|GroupTable|AdminGroups'`): same pattern with `itsmApi.groups.{create,update}`.
- [ ] **Step 3:** Run full SPA suite — all green.
- [ ] **Commit:** `wire SPA admin writes through itsmApi (users + groups)`

## Task 17: Persistence e2e + verify + README

References: source plan Task 18.

- [ ] **Step 1:** Write `gdfkube-src/gdfkube-itsm/e2e/persistence.spec.ts` (Playwright): submit a `cluster-request`, capture id from URL, reload, assert it persists; switch persona to `maria.costa`, approve, reload, assert `status=provisioning` and approvalChain length 1.
- [ ] **Step 2:** Write `gdfkube-src/gdfkube-itsm/e2e/admin-crud.spec.ts`: as `maria.costa`, create user → reload → assert; create group → reload → assert; rename a form → reload → assert; reorder fields → reload → assert. Use timestamped names.
- [ ] **Step 3:** Run `npm run e2e` against the live compose stack — expect PASS.
- [ ] **Step 4:** Update `gdfkube-src/gdfkube-itsm/README.md`: Backend API, Local dev with compose, Seed data, Admin endpoints sections; remove the line saying persistence is out of scope.
- [ ] **Step 5:** Fill in `verify.md` with actual outputs from Tasks 12/13 (mongosh counts, curl results, `docker compose ps`) and both Playwright runs.
- [ ] **Step 6:** Run `pre-commit run --all-files` — must be clean (trufflehog, lints).
- [ ] **Commit:** `verify add-itsm-express-api end-to-end (requests + admin CRUD)`

---

## Verification (end-to-end smoke test)

From a clean state:

```bash
docker compose down -v
docker compose up -d --build
docker compose ps                                                                # all healthy / one-shots Exited(0)
curl -fsSL http://127.0.0.1:8080/api/itsm/openapi.yaml | head -c 200             # spec is reachable
curl -fsSL http://127.0.0.1:8080/api/itsm/forms      -H 'X-Demo-User: joao.silva'  | jq 'length'
curl -fsSL http://127.0.0.1:8080/api/itsm/requests   -H 'X-Demo-User: joao.silva'  | jq 'length'  # = seed size
curl -fsSL http://127.0.0.1:8080/api/itsm/users      -H 'X-Demo-User: maria.costa' | jq 'length'
curl -fsSL http://127.0.0.1:8080/api/itsm/groups     -H 'X-Demo-User: maria.costa' | jq 'length'
curl -i      http://127.0.0.1:8080/api/itsm/users    -H 'X-Demo-User: joao.silva'  | head -1     # 403 Forbidden
```

Submit a request via the browser as `joao.silva`, then check Mongo:

```bash
docker run --rm --network gdfkube-net mongo:7.0 mongosh --host mongo1:27017 \
  --eval 'JSON.stringify(db.getSiblingDB("gdfkube").requests.find({}).sort({submittedAt:-1}).limit(1).toArray()[0])'
```

Expected: `_id` is a 26-char ULID, `requester.id == "joao.silva"`, `meta.correlationId == _id`, `status == "approval"`.

Switch to `maria.costa` and approve via Approvals. Then:

```bash
docker run --rm --network gdfkube-net mongo:7.0 mongosh --host mongo1:27017 \
  --eval 'JSON.stringify(db.getSiblingDB("gdfkube").requests.find({status:"provisioning"}).sort({submittedAt:-1}).limit(1).toArray()[0])'
```

Expected: same id; `status:"provisioning"`, `stage:1`, `approvalChain[0]` has the decision.

Run all suites:

```bash
cd gdfkube-src/gdfkube-itsm && npm test                                                       # frontend vitest
cd gdfkube-src/gdfkube-itsm/server && MONGO_URL=mongodb://127.0.0.1:27017/gdfkube_test?replicaSet=rs0 npm test
cd gdfkube-src/gdfkube-itsm && npm run e2e
pre-commit run --all-files
```

All green = done. Archive the change with `openspec archive add-itsm-express-api`.
