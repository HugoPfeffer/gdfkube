## 1. Backend skeleton (server package, health, metrics, structured logs, Mongoose connection)

- [ ] 1.1 Initialize npm package at `gdfkube-src/gdfkube-itsm/server/` with deps `express`, `mongoose`, `ulid`, `pino`, `pino-http`, `prom-client` and devDeps `typescript`, `tsx`, `vitest`, `supertest`, `@types/express`, `@types/node`, `@types/supertest`. Scripts: `dev`, `build`, `start`, `test`.
- [ ] 1.2 Add `tsconfig.json` and `vitest.config.ts`.
- [ ] 1.3 Implement `src/db.ts` wrapping `mongoose.connect` with `serverSelectionTimeoutMS: 30000`, `writeConcern: { w: 'majority' }`, and a `ping()` helper.
- [ ] 1.4 Write failing health tests in `__tests__/health.test.ts` (live + ready against `gdfkube_test`).
- [ ] 1.5 Implement `src/app.ts` (mounts pino-http, express.json, health/metrics routers, error middleware), `src/routes/health.ts`, `src/routes/metrics.ts`, `src/middleware/error.ts`, `src/middleware/logging.ts`. Run tests — expect PASS.
- [ ] 1.6 Implement `src/index.ts` (process entry: connect, build app, listen on `PORT`).

## 2. Mongoose models

- [ ] 2.1 Write failing `__tests__/models.test.ts` covering Request, FormDef, User, Group with the requirements from specs (enums, required fields, ranges, default values).
- [ ] 2.2 Implement `src/models/Request.ts` with `_id: String`, status enum, stage 0..6, requester subdoc, `vars`/`meta` as `Schema.Types.Mixed`, policyChecks, approvalChain default `[]`, `reason` default `null`. Disable `__v`, `timestamps: false`.
- [ ] 2.3 Implement `src/models/FormDef.ts` with `_id: String`, name, topic, status enum, `fields: [TypedFieldSchema]`, optional `templates: [TemplateFileSchema]`.
- [ ] 2.4 Implement `src/models/User.ts` (`_id: String` = username, role enum operator/admin/approver/service, optional fullName/group/status/mfa/last).
- [ ] 2.5 Implement `src/models/Group.ts` (`_id: String` = org id, name, optional fullName/repo/clusters, default-empty `users: [String]` and `forms: [String]`).

## 3. Demo identity middleware + admin gate

- [ ] 3.1 Populate `src/data/demoUsers.ts` with the SPA's seed users (`joao.silva`, `maria.costa`, ...) — at least one admin, full role coverage.
- [ ] 3.2 Write failing `__tests__/demoUser.test.ts` (missing header → 401, unknown user → 401, known user → req.demoUser populated).
- [ ] 3.3 Write failing `__tests__/requireAdmin.test.ts` (non-admin → 403, admin → next()).
- [ ] 3.4 Implement `src/middleware/demoUser.ts` and `src/middleware/requireAdmin.ts`. Mount `demoUser` on `/api/itsm/*`. Mount `requireAdmin` on every admin write route including `POST /api/itsm/requests/:id/approvals`.

## 4. FormDef-driven validator

- [ ] 4.1 Write failing `__tests__/formValidator.test.ts` covering happy path, missing required, regex, range, enum, unknown-key-ignored.
- [ ] 4.2 Implement `src/services/formValidator.ts` as a pure function (no Mongoose import); export error type from a sibling `types.ts`.

## 5. Forms read + admin write endpoints

- [ ] 5.1 Write failing `__tests__/forms.test.ts` for GET list (active-only default; `?include=disabled` admin-only), GET by id (404 on miss), admin POST (201, 409 on dup), admin PATCH (whitelist enforced, fields/templates array-replace, 404 on unknown id, 403 for operator).
- [ ] 5.2 Implement `src/services/formAdminService.ts` (`create`, `patch`).
- [ ] 5.3 Implement `src/routes/forms.ts` mounted at `/api/itsm/forms`. Wire to `src/app.ts`. Run tests — expect PASS.

## 6. Requests read endpoints

- [ ] 6.1 Write failing `__tests__/requests.test.ts` for GET list (sorted desc by submittedAt, filters: status, formId, requesterGroup), GET by id.
- [ ] 6.2 Implement `src/routes/requests.ts` (read routes only). Wire to `src/app.ts`. Run tests — expect PASS.

## 7. Request submit endpoint (POST /api/itsm/requests)

- [ ] 7.1 Extend `__tests__/requests.test.ts` with submit tests: `{id}`-only response shape, Location header, server-assigned ULID, FormDef validation errors with field codes, env enum rejection, `meta.correlationId === _id`.
- [ ] 7.2 Implement `src/services/requestService.ts` with `submit({demoUser, body})` per design.md (ULID + FormDef load + validate + Mongoose create).
- [ ] 7.3 Wire `POST /api/itsm/requests` to call `requestService.submit`; respond `201` with `{ id }` and `Location` header.

## 8. Approval endpoint (POST /api/itsm/requests/:id/approvals)

- [ ] 8.1 Extend `__tests__/requests.test.ts` with approval tests: approved transitions to provisioning/stage 1, rejected to failed with reason, requested_changes only appends, idempotency (no dedupe — 2 entries on duplicate POST), 403 for operator, 404 for unknown id, 400 for invalid action enum.
- [ ] 8.2 Extend `requestService.ts` with `decide({id, demoUser, body})` performing single `findByIdAndUpdate` with `$push` always + conditional `$set`.
- [ ] 8.3 Wire `POST /api/itsm/requests/:id/approvals` (gated by `requireAdmin`). Run tests — expect PASS.

## 9. Users CRUD endpoints (admin)

- [ ] 9.1 Write failing `__tests__/users.test.ts` (list/get/create/update; 403 for operator; 400 bad role; 409 dup; 404 unknown; PATCH whitelist).
- [ ] 9.2 Implement `src/services/userAdminService.ts`.
- [ ] 9.3 Implement `src/routes/users.ts` (all routes admin-gated). Wire to `src/app.ts`.

## 10. Groups CRUD endpoints (admin)

- [ ] 10.1 Write failing `__tests__/groups.test.ts` (list/get/create/update; 403/409/404/400 paths; PATCH replaces `users[]` and `forms[]` wholesale).
- [ ] 10.2 Implement `src/services/groupAdminService.ts`.
- [ ] 10.3 Implement `src/routes/groups.ts` (all routes admin-gated). Wire to `src/app.ts`.

## 11. OpenAPI spec + Dockerfile

- [ ] 11.1 Author `src/openapi.yaml` (OpenAPI 3.1) covering all routes (2 health + 1 metrics + 1 self-spec + 4 forms + 4 requests + 4 users + 4 groups). Include `X-Demo-User` apiKey scheme and admin security requirement.
- [ ] 11.2 Write `__tests__/openapi.test.ts` that loads the spec, parses with `js-yaml`, walks `buildApp()`'s registered Express routes, and asserts every route is present in `paths.<path>.<method>`.
- [ ] 11.3 Write multi-stage `Dockerfile` (Node 20 alpine, non-root, healthcheck) and `.dockerignore`.
- [ ] 11.4 Wire `GET /api/itsm/openapi.yaml` to serve the YAML file.
- [ ] 11.5 Build the image locally to verify (`docker build -t gdfkube-itsm-api:local gdfkube-src/gdfkube-itsm/server/`).

## 12. Seed exporter + mongosh seed script

- [ ] 12.1 Write `gdfkube-src/gdfkube-itsm/scripts/export-seed-data.mjs` using `tsx` to import `src/data/seeds.ts`, `src/data/adminSeeds.ts`, `src/data/defaultTemplates.ts`. Translate to four JSON files in `gdfkube-src/gdfkube-infra/mongodb/seed-data/{requests,forms,users,groups}.json`. For requests: `_id = r.id`, `meta.correlationId = r.requestId ?? r.id`. For forms: attach `fields[]` from `FIELDS[id]` and `templates[]` from `DEFAULT_TEMPLATES[id]`. For users/groups: `_id = entity.id`.
- [ ] 12.2 Add `seed:export` npm script to `gdfkube-src/gdfkube-itsm/package.json`. Run it; verify all four files exist with non-empty arrays.
- [ ] 12.3 Write `gdfkube-src/gdfkube-infra/mongodb/seed-collections.js` (mongosh, idempotent): `bulkWrite` upserts for all four collections + `createIndex` calls per `docs/03-mongodb.md:138-145` plus `users.{group:1}`, `users.{role:1}`, `groups.{name:1}`.
- [ ] 12.4 Manually verify idempotency by running the seed script twice via `docker run` and inspecting `upsertedCount` (expect > 0 then 0). Verify counts match seed sizes.
- [ ] 12.5 Update `gdfkube-src/gdfkube-infra/mongodb/README.md` with seed-script usage and CDC-watched vs admin-only distinction.

## 13. Compose wiring + nginx /api/itsm/ proxy

- [ ] 13.1 Edit `gdfkube-src/gdfkube-itsm/nginx.conf` to add the `location /api/itsm/` block *before* the SPA-fallback `location /`. Forward `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Request-Id`.
- [ ] 13.2 Edit `docker-compose.yml`: add `mongo-seed` (one-shot, `service_completed_successfully`) and `gdfkube-itsm-api` (build from `server/`, `MONGO_URL`, healthcheck). Tighten the existing `itsm` service `depends_on` to `gdfkube-itsm-api: { condition: service_healthy }`.
- [ ] 13.3 Bring up the full stack from clean: `docker compose down -v && docker compose up -d --build`. Confirm `mongo-init` and `mongo-seed` exited 0; `gdfkube-itsm-api` and `itsm` are healthy.
- [ ] 13.4 Verify the proxy end-to-end via `curl http://127.0.0.1:8080/api/itsm/forms`, `requests`, `users`, `groups` (operator vs admin), and the 403 path.

## 14. SPA api client + Bootstrap hydration

- [ ] 14.1 Write failing `src/api/__tests__/itsmApi.test.ts` with `vi.stubGlobal('fetch', ...)`: cover all four namespaces (`requests`, `forms`, `users`, `groups`); thin POST body for `requests.create`; PATCH path for updates; `X-Demo-User` from a configurable getter; `Content-Type: application/json` on writes; non-2xx throws `ApiError` with `status` and `details`; `AbortController` surfaces as `AbortError` and is not logged.
- [ ] 14.2 Implement `src/api/itsmApi.ts` with `setDemoUserResolver(fn)` and the four namespaces.
- [ ] 14.3 Write failing `src/shell/__tests__/Bootstrap.test.tsx` (loader, mounts `<GdfDataProvider>` with all slices populated, error+retry, abort on unmount).
- [ ] 14.4 Implement `src/shell/Bootstrap.tsx`: parallel `Promise.all` for `forms.list` + `requests.list`; conditionally fetch `users.list` + `groups.list` only when current persona is admin (else fall back to a tiny built-in list). Derive `templates` from `forms[].templates`; derive `fields` from `forms[].fields`.
- [ ] 14.5 Edit `src/main.tsx` to wrap `<App>` in `<Bootstrap>`. Drop direct imports of `REQUESTS`, `FORMS`, `FIELDS`, `USERS`, `GROUPS`, `DEFAULT_TEMPLATES` from initial-state assembly. Wire `setDemoUserResolver` to read the current persona from the SPA's user accessor.
- [ ] 14.6 Edit `vite.config.ts` to add `server.proxy['/api/itsm'] = 'http://127.0.0.1:8080'`.
- [ ] 14.7 Run the full SPA unit suite — every existing `GdfDataProvider`-based test must still pass (provider contract unchanged).

## 15. Wire SPA writes through API (requests + forms admin)

- [ ] 15.1 Update `src/forms/__tests__/GenericRequest.test.tsx` to mock `itsmApi.requests.create` (returns `{id}`) + `.get` (returns full Request). Assert thin body, follow-up GET, dispatch from canonical doc, error toast on reject, submit disabled while in-flight.
- [ ] 15.2 Modify `src/forms/GenericRequest.tsx:141-187`: `onSubmit` becomes async; thin body; await create then get; dispatch with canonical doc.
- [ ] 15.3 Update `src/pages/__tests__/Approvals.test.tsx` to mock `itsmApi.requests.decide` for both approve and reject; error path; buttons disabled while in-flight.
- [ ] 15.4 Modify `src/pages/Approvals.tsx:124-198`: `commitApproval`/`commitReject` async; await `decide`; dispatch from response.
- [ ] 15.5 For each admin form page (locate via `git ls-files | grep -iE 'admin.*form|FieldsTable|FormDesigner'`): replace `dispatch(ADD_FORM | UPDATE_FORM | REORDER_FIELDS | UPDATE_FIELD | UPDATE_TEMPLATES)` with `await itsmApi.forms.<create|update>(...)` then dispatch with response. Add `isSaving` state. Update tests to mock the API.
- [ ] 15.6 Run full SPA suite — all green.

## 16. Wire SPA writes through API (users + groups admin)

- [ ] 16.1 For each admin user page (locate via `git ls-files | grep -iE 'admin.*user|UserTable|AdminUsers'`): mock `itsmApi.users.{create,update}` in tests; modify pages to await before dispatch; add `isSaving`. Run tests.
- [ ] 16.2 For each admin group page (locate via `git ls-files | grep -iE 'admin.*group|GroupTable|AdminGroups'`): mock `itsmApi.groups.{create,update}` in tests; modify pages to await before dispatch; add `isSaving`. Run tests.
- [ ] 16.3 Run full SPA suite — all green.

## 17. E2E + verify + READMEs

- [ ] 17.1 Write `gdfkube-src/gdfkube-itsm/e2e/persistence.spec.ts` (Playwright): submit a `cluster-request`, capture id from URL, reload, assert it persists; switch persona to `maria.costa`, approve, reload, assert `status=provisioning` and approvalChain length 1.
- [ ] 17.2 Write `gdfkube-src/gdfkube-itsm/e2e/admin-crud.spec.ts`: as `maria.costa`, create user → reload → assert; create group → reload → assert; rename a form → reload → assert; reorder fields → reload → assert. Use unique names with timestamps.
- [ ] 17.3 Run `npm run e2e` against the live compose stack — expect PASS.
- [ ] 17.4 Update `gdfkube-src/gdfkube-itsm/README.md`: add Backend API, Local dev with compose, Seed data, and Admin endpoints sections. Remove the line saying persistence is out of scope.
- [ ] 17.5 Fill in `openspec/changes/add-itsm-express-api/verify.md` with the actual outputs from Tasks 12/13 and both Playwright runs.
- [ ] 17.6 Run `pre-commit run --all-files` — must be clean.
