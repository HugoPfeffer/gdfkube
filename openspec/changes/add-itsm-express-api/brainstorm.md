## Design Summary

Build a thin Node 20 + Express 4 + Mongoose service at `gdfkube-src/gdfkube-itsm/server/`, reachable inside the compose network as `http://gdfkube-itsm-api:3000`. The API persists four ITSM domain collections in the `gdfkube` MongoDB rs0 — two CDC-watched (`requests`, `forms`) and two admin-only (`users`, `groups`) — with the document shapes already documented in `docs/03-mongodb.md`. The SPA gives up its in-memory React Context as the source of truth: a `<Bootstrap>` wrapper hydrates the four slices from the API once at boot, and every one of the SPA's 11 mutating reducer actions becomes API-backed via a typed `itsmApi` client. nginx reverse-proxies `/api/itsm/*` to the API for same-origin (no CORS). Demo identity flows via the `X-Demo-User` header per `docs/02-express-api.md:104`. Requests are created with a thin POST body; the server assigns ULID `_id`, validates the body against the FormDef's `fields[]`, and returns the canonical document (response shape is `{ id }` only; SPA fetches `GET /:id` for the full doc). Approvals append to `approvalChain` atomically (`$push` + conditional `$set`), so Debezium's `change_streams_update_full` captures consistent post-images with zero schema rewrites for the next pipeline stage.

## Alternatives Considered

### Option A: Express + Mongoose, four collections, X-Demo-User header (chosen)
- **Approach**: Thin Express service writing direct to Mongo through Mongoose. Same-origin via nginx. Demo identity in a header. Four collections seeded from the SPA's existing TS data; CDC watches only `requests` and `forms`.
- **Pros**: Verbatim with `docs/02-express-api.md:32-35` (Express + Mongoose) and `docs/03-mongodb.md:55-104` (document shapes). Debezium-ready on day one of the next spec — no Outbox needed. Identity surface is stable (Keycloak/OIDC slot-in later) without churning the API contract. Validates server-side from the FormDef itself, so the spec's source of truth is the form, not duplicated DTOs.
- **Cons**: Adds a new service to the compose stack and a new dev-loop step (seed exporter). Mongoose schema duplicates the SPA's TS types — drift risk if reduce-side types evolve without backend updates. `X-Demo-User` is trivially spoofable, but explicitly demo-only per docs.
- **Why not chosen**: this IS the chosen approach.

### Option B: Outbox + Kafka producer in Express
- **Approach**: Express writes to an outbox collection; a Kafka producer publishes events. CDC tails the outbox instead of `requests`/`forms` directly.
- **Pros**: Decouples write durability from CDC; producers can re-emit on failure.
- **Cons**: Directly contradicts `docs/04-debezium.md` ("Debezium tails the oplog directly"). Doubles the failure surface (write + produce). Adds a Kafka dependency to a stage the docs say is Kafka-free (`docs/02-express-api.md:128`).
- **Why not chosen**: violates the documented architecture; the docs explicitly assign Kafka emission to CDC.

### Option C: Reducer-only persistence (LocalStorage / IndexedDB)
- **Approach**: Keep state in the browser; persist to LocalStorage on every reducer dispatch.
- **Pros**: No backend; smallest possible change.
- **Cons**: Defeats the whole point of the pipeline — Debezium has nothing to tail. Multi-user/multi-persona workflows become incoherent. Future Camel/Kafka stages have no source.
- **Why not chosen**: blocks every downstream spec; would have to be undone immediately.

## Agreed Approach

Option A. The plan implements precisely what `docs/02-express-api.md` and `docs/03-mongodb.md` specify, leaving zero schema rewrites for the next (Debezium) spec. The thin Express + Mongoose layer is the smallest service that satisfies the documented contract and unblocks the rest of the pipeline.

## Key Decisions

- **Five capabilities** scoped under one change: `itsm-express-api` (the REST surface), `itsm-requests-collection`, `itsm-forms-collection` (both CDC-watched), `itsm-users-collection`, `itsm-groups-collection` (both admin-only). Splitting capabilities by collection lets future deltas (e.g. FormDef versioning) target a single spec.
- **Document shapes verbatim** from `docs/03-mongodb.md:55-104`. ULID `_id` for new requests; existing seed ids (e.g. `REQ0010247`) preserved verbatim during seeding so SPA tests/screenshots stay stable.
- **Approval atomicity** via single `findByIdAndUpdate` with `$push` to `approvalChain` + conditional `$set` on status/stage. `change_streams_update_full` post-images are always consistent.
- **Forms admin patches replace arrays atomically** (single `$set` of `fields` or `templates`). No partial reorders, no half-applied edits.
- **Mongoose owns schema validation** per `docs/03-mongodb.md:160`; no Mongo `$jsonSchema` validator. FormDef-driven body validator is a pure function for testability.
- **Hydration above the provider**, not in the reducer — keeps the SPA's 270+ existing unit tests green (no reducer contract change). Bootstrap fetches `forms`+`requests` for any persona, and `users`+`groups` only for admin (those endpoints 403 for non-admin per `docs/02-express-api.md:53-55`).
- **No CDC on `users`/`groups`** — they don't drive provisioning; including them would only add Kafka topic noise. Matches `docs/04-debezium.md:48` include-list verbatim.
- **No DELETE endpoints**. The SPA reducer never deletes; the audit chain treats requests as append-only. Add when a future spec requires it.
- **No SSE / no Kafka producer / no real auth / no K8s**. Each is a future spec. `X-Demo-User` is the stable identity surface real auth replaces without contract churn.

## Open Questions

- **FormDef versioning** (`docs/03-mongodb.md:172`) — today the doc mutates in place. A future spec will introduce a discriminator or versioned-doc pattern.
- **Real auth** (`docs/02-express-api.md:107`) — Keycloak/OIDC PRD is future work; this change ships only the demo header surface.
- **Pagination defaults** for `GET /api/itsm/requests` — out of scope; the SPA today assumes a small finite list.
- **Rate limiting** per requester / per form — out of scope until load patterns are known.
- **Failure surface** — should rejected vs DLQ-stuck requests differ in the API representation? Today both are `status:'failed'`; the DLQ-stuck distinction will arrive with the Kafka spec.
- **TTL on `requests` after `status:'ready'`** (`docs/03-mongodb.md:171`) — defer to a future ops spec.
