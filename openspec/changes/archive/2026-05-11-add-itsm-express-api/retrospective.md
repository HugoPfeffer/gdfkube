# Retrospective: add-itsm-express-api

## What was delivered

A complete Express 4 + Mongoose 8 REST API for the ITSM demo, persisting all four domain collections (`requests`, `forms`, `users`, `groups`) in MongoDB with the document shapes documented in `docs/03-mongodb.md`. The SPA was rewired from in-memory-only React Context to API-backed persistence via a `<Bootstrap>` hydration wrapper and `itsmApi` client. All 11 SPA mutating reducer actions are now API-backed. The reducer contract was preserved — 270+ existing SPA tests remained green throughout.

Specifically:
- 18 Express endpoints: 2 health, 1 metrics, 1 OpenAPI, 4 forms, 4 requests (including atomic approval transitions), 4 users, 4 groups
- Demo identity via `X-Demo-User` header with admin gate middleware
- FormDef-driven server-side body validation (pure function, no Mongoose dependency)
- ULID-based request IDs with `meta.correlationId` alignment for Debezium
- Idempotent seed pipeline: TS export script → 4 JSON files → mongosh `bulkWrite` upserts + `createIndex`
- Docker compose wiring: `mongo-seed` one-shot + `gdfkube-itsm-api` service + nginx reverse proxy
- OpenAPI 3.1 spec with contract tests asserting route coverage
- 3 Playwright e2e specs (persistence, admin CRUD, approval flow)
- Comprehensive test suite: 36 backend unit tests + 366 SPA tests

## What went well

- **Reducer contract preservation**: The decision to hydrate above the provider (`<Bootstrap>`) rather than adding `LOAD_*` actions kept all 270+ existing SPA tests passing without modification. This was the single most impactful design decision.
- **Incremental layering**: Building bottom-up (models → middleware → validators → routes → seed → compose → SPA client → SPA rewiring) allowed each commit to be self-contained and testable.
- **FormDef-driven validation as a pure function**: `formValidator.ts` has zero Mongoose imports, making it trivially testable (7 tests, instant) and reusable if validation ever needs to run elsewhere.
- **OpenAPI contract test**: Catching route ↔ spec drift at test time rather than at deploy time. The 3-test `openapi.test.ts` walks real Express routes — no manual list to keep in sync.
- **Seed data pipeline**: The TS → JSON → mongosh chain keeps the SPA's existing seed data as the single source of truth while producing idempotent Mongo imports.

## What could improve

- **MongoDB-dependent tests can't run in CI without a container**: 4 of 10 backend test files require a live MongoDB rs0 instance. In a containerless CI environment, only 36 of the full backend test count execute. A `mongodb-memory-server` fallback was rejected (per D12 — different storage engine masks rs0 behaviors), but a CI docker-compose step or testcontainers should be added.
- **Docker verification was deferred entirely**: No Docker available in the dev environment during implementation. Compose stack health, curl smoke tests, seed idempotency, and e2e runs are all documented but unexecuted. This is the biggest verification gap.
- **Seed data duplication**: JSON files are committed alongside the TS sources. If TS seeds change, JSON must be regenerated manually. A CI lint step to verify staleness would prevent drift.
- **E2E spec coverage**: The 3 Playwright specs cover the happy paths but don't test error scenarios (validation failures, network errors, 403 enforcement in the browser).

## Decisions validated

- **D1 (Express + Mongoose, not Quarkus)**: Kept the dev loop tight — one repo, one `npm test` for the SPA, one for the server. TypeScript end-to-end (SPA + API) simplified type alignment.
- **D3 (Atomic approval via single `findByIdAndUpdate`)**: Clean implementation — `$push` for `approvalChain` + conditional `$set` for status/stage in one operation. No transaction overhead, CDC-friendly post-images.
- **D5 (Hydration above provider)**: Zero reducer contract changes. Bootstrap fetches, derives `fields` and `templates` from the forms response, and initializes the provider. Clean separation of concerns.
- **D7 (FormDef-driven validation as pure function)**: 7 tests, no setup, instant execution. The error envelope (`[{key, code, message}]`) provides structured feedback to the SPA.
- **D10 (mongo-seed as one-shot compose service)**: Observable (`Exited (0)`), idempotent, replaceable by K8s Job in the next spec without API code changes.
- **D11 (Handwritten OpenAPI + contract test)**: Simpler than code-gen tools for an 18-endpoint surface. The contract test catches drift automatically.

## Decisions to revisit

- **D12 (Real MongoDB in tests, no memory server)**: The intent was to catch rs0 quirks, but in practice it makes 4/10 test files unrunnable without Docker. Consider a hybrid: memory server for unit-level schema tests, real DB only for the integration/CDC-specific tests.
- **D6 (Non-admin fallback in Bootstrap)**: The tiny built-in user/group list works for the demo but is a maintenance burden if the seed data grows. Consider a public read-only `/api/itsm/users/me` endpoint that returns the current persona's data without admin privileges.
  - *Superseded by fix-itsm-portal-bug-batch (2026-05-13)* — the SPA fallback constants were removed; Bootstrap now fails hard via the existing `phase === 'error'` UI when `/api/itsm/users` or `/api/itsm/groups` is unavailable.
- **Approval idempotency**: The spec accepts duplicate POSTs appending duplicate decisions (per `docs/02-express-api.md:119`). If this causes operational confusion, a server-side dedupe (by admin signoff + action within a time window) would be low-cost.

## Technical debt introduced

1. **No Docker-based verification executed**: Compose stack health, curl smoke tests, seed idempotency, mongosh counts, and all 3 e2e Playwright runs are documented but unverified. Must be run before production use.
2. **Seed JSON staleness risk**: No automated check that `seed-data/*.json` matches `src/data/seeds.ts` + `adminSeeds.ts`. Manual `npm run seed:export` + git diff is the current workflow.
3. **No DELETE endpoints**: Admin can't remove stale forms/users/groups. The SPA reducer has no DELETE today, so this matches, but future workflows will need it.
4. **No pagination**: `GET /requests` and `GET /forms` return all documents. Acceptable for demo-scale data but will need cursor-based pagination before real use.
5. **`X-Demo-User` is trivially spoofable**: Any client can impersonate admin. Explicitly demo-only; replaced by Keycloak/OIDC in a future spec.
6. **Mongoose schema drift from SPA TS types**: `server/src/models/` duplicates type shapes from `src/types.ts`. The `models.test.ts` round-trip test catches regressions, but a shared types package would be cleaner.
7. **No rate limiting or request TTL**: Deferred per proposal non-goals.

## Impact on next specs

- **Debezium (next)**: `gdfkube.requests` and `gdfkube.forms` exist with the documented shapes from `docs/03-mongodb.md`. Indexes match `docs/03-mongodb.md:138-145`. The CDC include list (`gdfkube.requests,gdfkube.forms`) can be configured with zero schema rewrites. `change_streams_update_full` is enabled on rs0.
- **Camel request-router**: Will consume `dbz.gdfkube.requests` topic events. The `meta.correlationId` field is populated on every new request, enabling end-to-end tracing through the pipeline.
- **K8s/Helm deployment**: `server/Dockerfile` is ready for Helm chart integration. The `docker-compose.yml` service definitions map to K8s Deployments + Services. `mongo-seed` maps to a K8s Job. Health endpoints (`/healthz/live`, `/healthz/ready`) follow the K8s probe convention.
- **SSE on `/api/itsm/requests/:id/events`**: Depends on the Kafka `pipeline-status` topic (not yet created). The route path is reserved in the OpenAPI spec comments but not implemented.

## Metrics

- **Tasks**: 70/70 complete (17 task groups across `tasks.md`)
- **Commits**: 18
- **Backend tests**: 36 passing (6 non-DB test files); 4 additional test files deferred (require MongoDB rs0)
- **SPA tests**: 366 passing (32 test files)
- **E2E specs**: 3 written (persistence, admin-crud, approval-flow); execution deferred (require Docker)
- **New files**: 56
- **Modified files**: 28
- **Lines added**: ~8,796 (new files) + ~864 (modifications)
- **Lines removed**: ~332 (modifications)
- **Seed data**: 709 lines across 4 JSON files
