## Context

`docs/00-architecture-overview.md` describes a 7-stage pipeline whose first leg is a thin Express service writing to MongoDB. The stage is documented in detail across `docs/02-express-api.md` (REST contract + identity model), `docs/03-mongodb.md` (collection shapes + indexes), and `docs/04-debezium.md` (CDC include list). The previous change `containerize-itsm-and-mongodb` shipped the MongoDB rs0 + SPA containers but explicitly left the Express service for this change.

**Current state (as of 2026-05-08):**
- `gdfkube-src/gdfkube-itsm/src/state/dataContext.tsx` holds all ITSM state in a React Context (`requests`, `forms`, `fields`, `users`, `groups`, `templates`); 11 reducer actions mutate it.
- `gdfkube-src/gdfkube-itsm/src/data/seeds.ts` and `adminSeeds.ts` are the existing source of truth for seed data.
- MongoDB rs0 is up via `docker-compose.yml`, `gdfkube-infra/mongodb/init-rs.js` initializes it, but no application writes to it yet.
- The SPA's `dataContext.tsx:36-52` is the canonical list of mutating actions the API must cover.
- `docs/02-express-api.md:43-58` lists the REST endpoints; `docs/03-mongodb.md:55-104` lists the document shapes; `docs/04-debezium.md:46-50` names the CDC include list (`gdfkube.requests,gdfkube.forms`).

**Constraints:**
- Solo developer, devcontainer-based dev loop. No K8s in this change (separate spec).
- Tech stack pinned by docs: Node 20 + Express 4 + Mongoose 8 + ulid + pino + prom-client. Mongoose 8 requires MongoDB 6+; the compose stack already runs `mongo:7.0`.
- `pre-commit` runs trufflehog; no secrets in seed data.
- 270+ existing SPA unit tests rely on the reducer contract — we will not change `DataAction` or `dataReducer`.
- The next pipeline spec is Debezium; document shapes in this change must match `docs/03-mongodb.md` verbatim so Debezium needs zero rewrites.

**Stakeholders:**
- Hugo Pfeffer (solo developer, author).
- Future Debezium / Camel / Kafka specs that consume the document shapes this change establishes.

## Goals / Non-Goals

**Goals:**
- Persist all four ITSM domain collections (`requests`, `forms`, `users`, `groups`) in `gdfkube` with the documented shapes.
- Expose every endpoint the SPA's 11 mutating reducer actions need; no SPA action is left in-memory.
- Server-side validate request bodies against the FormDef (no client-trust).
- Make approvals atomic — single `findByIdAndUpdate` so `change_streams_update_full` post-images are consistent.
- Keep the SPA reducer contract unchanged; hydration moves *above* the provider, not into the reducer.
- Same-origin via nginx; no CORS in this change.
- Demo identity via `X-Demo-User` per `docs/02-express-api.md:104`; admin gate on every admin write.
- OpenAPI 3.1 spec covers all routes and is contract-tested against the live router.
- Idempotent seed script populates all four collections + creates indexes.
- Two Playwright e2e specs (`persistence.spec.ts`, `admin-crud.spec.ts`) prove end-to-end persistence.

**Non-Goals:**
- K8s/Helm/ArgoCD wiring — separate deployment spec.
- SSE on `/api/itsm/requests/:id/events` — depends on the Kafka pipeline-status topic that doesn't exist yet.
- Kafka producer in Express — `docs/02-express-api.md:128` reserves emission for CDC.
- Real auth (Keycloak/OIDC) — future PRD.
- Mongo `$jsonSchema` validator — Mongoose owns validation per `docs/03-mongodb.md:160`.
- DELETE endpoints — the SPA reducer never deletes; treat requests as append-only.
- FormDef versioning, pagination, rate limiting, TTL — each is a future spec.

## Decisions

**D1. Express + Mongoose, not Quarkus.**
- *Rationale*: `docs/02-express-api.md:32-35` names the stack explicitly. The SPA already lives in this directory tree; an isolated `server/` npm package keeps the dev loop tight (one repo, one `docker compose up`).
- *Alternative considered*: Quarkus. Rejected — the rest of the stack is Quarkus, but the docs explicitly carve out Node for the Express stage to keep the SPA-adjacent surface minimal and JS-native.

**D2. ULID for new request `_id`, preserve seed ids.**
- *Rationale*: `docs/03-mongodb.md:60` mandates ULID for new requests; existing seed ids (e.g. `REQ0010247`) are kept verbatim during seeding so SPA tests/screenshots/e2e selectors stay stable.
- *Alternative considered*: regenerate every seed id as ULID. Rejected — would break existing tests with no benefit, and the doc only requires ULID for *new* requests.

**D3. Atomic approval transitions via single `findByIdAndUpdate`.**
- *Rationale*: Debezium's `change_streams_update_full` (`docs/04-debezium.md:50`) emits the full post-image. A single update with `$push:{approvalChain:decision}` plus conditional `$set:{status,stage}` (approved) or `$set:{status,reason}` (rejected) guarantees the captured event is never half-written. `requested_changes` only `$push`es — it's recorded but doesn't move the request forward, per `docs/02-express-api.md:90-91`.
- *Alternative considered*: two-write transaction. Rejected — `change_streams_update_full` already emits a single consistent post-image per update; transactions add latency without benefit.

**D4. Forms admin patches replace arrays atomically.**
- *Rationale*: A single `$set` of `fields` or `templates` is atomic in MongoDB; no partial reorders, no half-applied edits. Matches the SPA's `REORDER_FIELDS` / `UPDATE_FIELD` / `UPDATE_TEMPLATES` semantics — they all dispatch the new full array.
- *Alternative considered*: per-field PATCH (`PATCH /forms/:id/fields/:fieldId`). Rejected — adds 5+ endpoints for no reducer-level benefit; the SPA only ever sends the full array.

**D5. Hydration above the provider, not in the reducer.**
- *Rationale*: Adding `LOAD_REQUESTS` to the reducer would change the `DataAction` union and ripple through 270+ existing tests. Wrapping `<App>` in `<Bootstrap>` gives us a single point to fetch the four collections and initialize the provider, leaving the reducer contract untouched.
- *Alternative considered*: `LOAD_*` actions per slice. Rejected — bigger blast radius, no functional gain.

**D6. `users`/`groups` admin-only, with non-admin fallback in Bootstrap.**
- *Rationale*: `docs/02-express-api.md:53-55` makes admin endpoints admin-only (return 403 for non-admin). For non-admin personas, the role switcher and group lookups still need data; we ship a tiny built-in fallback list in `Bootstrap` (just enough to render the UI) rather than relaxing the API.
- *Alternative considered*: open `GET /users` and `GET /groups` to all roles. Rejected — contradicts the doc and leaks admin data unnecessarily.

**D7. FormDef-driven validation as a pure function.**
- *Rationale*: `validateAgainstFormDef(form, body)` has no Mongoose import, is unit-testable in isolation, and lets routes return a stable JSON error envelope with field-level codes (`required`, `pattern`, `range`, `enum`).
- *Alternative considered*: Joi/Zod schema per form. Rejected — duplicates the FormDef as the source of truth; would drift from `forms[].fields[]`.

**D8. `X-Demo-User` header (no body), demo-user list at boot.**
- *Rationale*: Stable identity surface that real auth (Keycloak/OIDC) can replace by swapping the middleware. List is statically populated from `seeds.ts` + `adminSeeds.ts` so the role switcher just works for every persona.
- *Alternative considered*: JWT with a static demo signing key. Rejected — over-engineered for demo identity; the docs explicitly name the header approach (`docs/02-express-api.md:104`).

**D9. No CDC on `users`/`groups`.**
- *Rationale*: They don't drive provisioning; including them would only add Kafka topic noise. Matches `docs/04-debezium.md:48` include-list verbatim.
- *Alternative considered*: include all four collections. Rejected — violates the doc, adds CDC overhead with no consumer.

**D10. `mongo-seed` as a one-shot compose service.**
- *Rationale*: Idempotent `bulkWrite` upserts + `createIndex` on every boot. `depends_on: { condition: service_completed_successfully }` chains the API after seeding completes. Pattern matches the existing `mongo-init` service.
- *Alternative considered*: seed inside the API on startup. Rejected — couples seeding to API lifecycle; a one-shot compose service is observable (`Exited (0)`) and can be replaced wholesale by the K8s spec.

**D11. OpenAPI 3.1 spec contract-tested against `buildApp()`.**
- *Rationale*: Drift between docs and code is a recurring risk. A test that walks every Express route and asserts a corresponding `paths.<path>.<method>` entry catches drift at CI time.
- *Alternative considered*: generate the spec from code (`tsoa`, `swagger-jsdoc`). Rejected — adds a build dep and tooling lock-in; hand-written YAML + a contract test is simpler and more readable for an 18-endpoint surface.

**D12. Vitest + supertest + real `gdfkube_test` DB; no testcontainers/memory-server.**
- *Rationale*: The devcontainer already has rs0 running locally. Using a real DB catches replica-set quirks and CDC-relevant behaviors a memory server would mask. `gdfkube_test` is dropped per suite.
- *Alternative considered*: `mongodb-memory-server`. Rejected — different storage engine, no rs0, masks the very behaviors Debezium will rely on.

## Risks / Trade-offs

- **Mongoose schema drift from SPA TS types** → models duplicate `src/types.ts:60-81` (`Request`) and `:142-175` (FormDef). *Mitigation*: a `__tests__/models.test.ts` round-trips a representative seed doc through Mongoose to catch shape regressions; review checklist on the SPA types calls out "update server model".
- **`X-Demo-User` is trivially spoofable** → anyone can be admin by sending the header. *Mitigation*: explicitly demo-only per `docs/02-express-api.md:107`; documented in README; replaced by real auth in a future spec without contract churn.
- **Seed data duplication** → JSON files committed alongside the TS source. *Mitigation*: `npm run seed:export` regenerates the JSON; pre-commit lint can be added later to fail if the JSON is stale relative to the TS sources.
- **No DELETE endpoints** → admin can't remove a stale form/user/group. *Mitigation*: out-of-scope per the proposal; add when a future workflow needs it. The SPA reducer has no DELETE today.
- **Approval idempotency is the front-end's responsibility** → per `docs/02-express-api.md:119`, a duplicate POST appends a duplicate decision. *Mitigation*: SPA disables the approve/reject buttons during the in-flight call (Task 16). The doc explicitly accepts this behavior.
- **Mongoose ServerSelectionTimeout on cold start** → if the API container starts before `mongo-seed` completes, the first connection retries hard. *Mitigation*: `depends_on: mongo-seed: { condition: service_completed_successfully }` plus `serverSelectionTimeoutMS: 30_000`; healthcheck only goes green once Mongoose reports a live connection.
- **Bootstrap blocks render until all four fetches resolve** → slow cold start visible to users. *Mitigation*: parallel `Promise.all`, retry button on error, skeleton loader. For non-admin personas, only two fetches block render (forms + requests).
- **OpenAPI spec drift** → handwritten YAML can lag behind routes. *Mitigation*: `__tests__/openapi.test.ts` walks Express routes and asserts coverage; CI fails on drift.

## Migration Plan

This is a greenfield change — no existing data to migrate.

**Forward path (single environment, devcontainer):**
1. Land Tasks 1-12 (server skeleton, models, middleware, validators, routes, OpenAPI, Dockerfile). Server-only changes; SPA still uses in-memory state. CI green.
2. Land Task 13 (seed exporter + mongosh script). JSON files committed; idempotency verified manually.
3. Land Task 14 (compose + nginx wiring). `docker compose up --build` brings up the API healthy, seeded.
4. Land Tasks 15-17 (SPA api client + Bootstrap + write rewiring). Reducer contract preserved; existing tests stay green; new tests cover the API path.
5. Land Task 18 (e2e + verify + README).

**Rollback:**
- Server-only steps (1-3): drop `docker-compose.yml` services, delete `server/` and `seed-data/`. SPA continues to work in-memory.
- SPA-side rewiring (4-5): revert `Bootstrap.tsx` and the per-page diffs. The reducer contract is unchanged so reverting the call sites is mechanical.
- Mongo data: no migration to undo; `gdfkube` collections can be dropped since no other consumer exists yet (Debezium ships next, *after* this change).

**MongoDB schema concern:** `_id` is a string ULID for new requests. Indexes (`docs/03-mongodb.md:138-145`) are created idempotently in the seed script — re-running is cheap and no-op. No `$jsonSchema` validator in this change, so future schema additions don't need to update a server-side validator.

**Kafka concern:** none. No producer in this change; CDC consumer-group rebalancing is the next spec's concern.

**Helm concern:** none. Deployment manifests are a separate spec.

## Open Questions

- **FormDef versioning** (`docs/03-mongodb.md:172`) — defer to a future spec; today the doc mutates in place and historical schemas are lost.
- **Real auth** (`docs/02-express-api.md:107`) — future Keycloak/OIDC PRD will replace the `X-Demo-User` middleware.
- **Pagination defaults** for `GET /api/itsm/requests` (`docs/02-express-api.md:133`) — defer; the SPA today assumes a small finite list.
- **Failure surface** — `docs/02-express-api.md:134` flags whether rejected vs DLQ-stuck requests should differ in the API representation. Today both are `status:'failed'`; the DLQ-stuck distinction will arrive with the Kafka spec.
- **TTL on `requests` after `status:'ready'`** (`docs/03-mongodb.md:171`) — defer to a future ops spec.
- **Rate limiting** per requester / per form (`docs/02-express-api.md:132`) — defer until load patterns are known.
