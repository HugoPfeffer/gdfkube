## ADDED Requirements

### Requirement: Health and Metrics Endpoints

The service SHALL expose `GET /healthz/live`, `GET /healthz/ready`, and `GET /metrics` endpoints for orchestrator probes and Prometheus scraping.

#### Scenario: Liveness probe always succeeds once the process is running

- **GIVEN** the Express service has bound its listener
- **WHEN** any client issues `GET /healthz/live`
- **THEN** the service responds `200 OK` with body `{ "status": "live" }` regardless of MongoDB state

#### Scenario: Readiness probe reflects the MongoDB connection

- **GIVEN** Mongoose reports a live connection to `gdfkube`
- **WHEN** any client issues `GET /healthz/ready`
- **THEN** the service responds `200 OK` with body containing `{ "status": "ready", "mongo": "ok" }`
- **AND WHEN** the Mongoose connection is down
- **THEN** the service responds `503 Service Unavailable`

#### Scenario: Prometheus metrics endpoint exposes default + HTTP histograms

- **WHEN** any client issues `GET /metrics`
- **THEN** the response uses the `text/plain; version=0.0.4` content type
- **AND** the body contains the prom-client default metrics plus an HTTP request duration histogram

---

### Requirement: OpenAPI 3.1 Spec Endpoint

The service SHALL serve a hand-authored OpenAPI 3.1 document at `GET /api/itsm/openapi.yaml` covering every functional endpoint, and a contract test SHALL fail the build if any registered Express route is missing from the spec.

#### Scenario: Spec is reachable and parses

- **WHEN** any client issues `GET /api/itsm/openapi.yaml`
- **THEN** the response is `200 OK` with content type `application/yaml`
- **AND** the body parses as an OpenAPI 3.1 document referencing shared schemas for `Request`, `FormDef`, `User`, `Group`, `ApprovalDecision`, and `ErrorEnvelope`

#### Scenario: Contract test fails on undocumented route

- **GIVEN** a developer adds a new Express route without updating `openapi.yaml`
- **WHEN** the `__tests__/openapi.test.ts` suite runs
- **THEN** the test fails with a message naming the missing path/method

---

### Requirement: Demo Identity Middleware

The service SHALL extract a demo user from the `X-Demo-User` request header against a static user list (`server/src/data/demoUsers.ts`), and SHALL reject any request to `/api/itsm/*` whose header is missing or unknown. The static user list is the single source of truth for demo identity; the role enum is exactly `'operator' | 'admin'`. No other identity headers (Authorization, cookies, JWT) are honored — `X-Demo-User` is the only wire for identity.

The middleware SHALL additionally read an optional `X-Demo-Role` header. When the header value is exactly `'operator'` or `'admin'`, the middleware SHALL attach to `req.demoUser` a **cloned** `DemoUser` record (a shallow copy of the matched entry from `DEMO_USERS`) with `.role` overridden to the header value. The middleware SHALL NEVER mutate the entry in `DEMO_USERS`. When `X-Demo-Role` is absent, empty, or set to any value other than `'operator'` or `'admin'`, the middleware SHALL attach the matched `DemoUser` with its stored role unchanged (the request SHALL NOT be rejected solely because of an invalid `X-Demo-Role` value).

#### Scenario: Missing header on /api/itsm route

- **GIVEN** a request to any `/api/itsm/*` path
- **WHEN** the request omits the `X-Demo-User` header
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "X-Demo-User required" }`

#### Scenario: Unknown user

- **GIVEN** a request with `X-Demo-User: ghost.user`
- **WHEN** `ghost.user` is not in the static demo user list
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "unknown demo user" }`

#### Scenario: Known user populates req.demoUser

- **GIVEN** a request with `X-Demo-User: joao.silva` and no `X-Demo-Role` header
- **WHEN** the demo user list contains `joao.silva` with `{ id, name, email, role, group }` and `role` is `'operator'`
- **THEN** the middleware populates `req.demoUser` with a copy of the matched record (role `'operator'`) and forwards the request to the next handler
- **AND** the entry in `DEMO_USERS` for `joao.silva` is not mutated

#### Scenario: Role enum is exactly operator or admin

- **WHEN** the demo user list is loaded at startup
- **THEN** every entry's `role` is either `'operator'` or `'admin'`
- **AND** there is no entry with role `'approver'` or `'service'`

#### Scenario: Valid X-Demo-Role overrides the stored role for the current request

- **GIVEN** a request with `X-Demo-User: ana.pereira` (stored role `'operator'`) and `X-Demo-Role: admin`
- **WHEN** the middleware runs
- **THEN** `req.demoUser.role` SHALL be `'admin'`
- **AND** `req.demoUser` SHALL NOT be the same object reference as `DEMO_USERS['ana.pereira']`
- **AND** the entry in `DEMO_USERS` for `ana.pereira` SHALL remain `role: 'operator'`

#### Scenario: Invalid X-Demo-Role falls through to the stored role

- **GIVEN** a request with `X-Demo-User: ana.pereira` (stored role `'operator'`) and `X-Demo-Role: bogus`
- **WHEN** the middleware runs
- **THEN** `req.demoUser.role` SHALL be `'operator'`
- **AND** the request SHALL be forwarded to the next handler (not rejected)

#### Scenario: Override interacts correctly with the admin gate

- **GIVEN** a request to `GET /api/itsm/users` (admin-gated) with `X-Demo-User: ana.pereira` (stored role `'operator'`) and `X-Demo-Role: admin`
- **WHEN** the middleware chain runs
- **THEN** the admin gate SHALL allow the request (because `req.demoUser.role === 'admin'`)
- **AND** the service SHALL respond `200 OK`

#### Scenario: Override on operator perspective for an admin user is gated correctly

- **GIVEN** a request to `GET /api/itsm/users` with `X-Demo-User: maria.costa` (stored role `'admin'`) and `X-Demo-Role: operator`
- **WHEN** the middleware chain runs
- **THEN** `req.demoUser.role` SHALL be `'operator'`
- **AND** the admin gate SHALL respond `403 Forbidden`

---

### Requirement: Admin Gate Middleware

The service SHALL gate every admin write route (POST/PATCH on `/forms`, `/users`, `/groups`, `/settings`, plus `POST /requests/:id/approvals`) AND `GET /settings` behind a middleware that checks `req.demoUser.role === 'admin'`.

#### Scenario: Non-admin role on admin route

- **GIVEN** a request with `X-Demo-User: joao.silva` (role `operator`)
- **WHEN** the request targets any admin write route OR `GET /api/itsm/settings`
- **THEN** the service responds `403 Forbidden` with body `{ "error": "admin role required" }`

#### Scenario: Admin role passes the gate

- **GIVEN** a request with `X-Demo-User: maria.costa` (role `admin`)
- **WHEN** the request targets any admin write route OR `GET /api/itsm/settings`
- **THEN** the gate forwards the request to the route handler

---

### Requirement: FormDef-Driven Body Validator

The service SHALL provide a pure function `validateAgainstFormDef(form, body)` that walks `form.fields[]` and returns `{ ok: true, vars, meta }` or `{ ok: false, errors[] }` with stable per-field error codes.

#### Scenario: All required fields present, types match

- **GIVEN** a FormDef whose fields[] declares `clusterName` (text, required, regex), `nodeCount` (number, min 1, max 12)
- **WHEN** the body provides `{ clusterName: 'vacinacao', nodeCount: 3 }`
- **THEN** the function returns `{ ok: true, vars: <bucketed values>, meta: <bucketed values> }`

#### Scenario: Missing required field

- **WHEN** the body omits a `required: true` field
- **THEN** the function returns `{ ok: false, errors: [{ key, code: 'required' }] }`

#### Scenario: Regex / range / enum violations produce stable codes

- **WHEN** a value fails the field's `validation` regex
- **THEN** errors include `{ key, code: 'pattern' }`
- **AND WHEN** a numeric value violates `min`/`max`
- **THEN** errors include `{ key, code: 'range' }`
- **AND WHEN** a `select` value is outside `options`
- **THEN** errors include `{ key, code: 'enum' }`

#### Scenario: Unknown field key is ignored

- **WHEN** the body contains a key not present in `form.fields[]`
- **THEN** the function ignores the key (forward-compat) and does not include it in `vars` or `meta`

---

### Requirement: Forms Read Endpoints

The service SHALL expose `GET /api/itsm/forms` (active-only by default; `?include=disabled` is admin-only) and `GET /api/itsm/forms/:id`.

#### Scenario: List active forms

- **GIVEN** seeded forms with mixed `status` values
- **WHEN** any authenticated demo user issues `GET /api/itsm/forms`
- **THEN** the response is `200 OK` and contains only documents where `status === 'active'`

#### Scenario: include=disabled is admin-only

- **WHEN** an operator issues `GET /api/itsm/forms?include=disabled`
- **THEN** the service responds `403 Forbidden`
- **AND WHEN** an admin issues the same request
- **THEN** the response includes both `active` and `disabled` forms

#### Scenario: Get unknown form id

- **WHEN** any authenticated demo user issues `GET /api/itsm/forms/nope`
- **THEN** the service responds `404 Not Found`

---

### Requirement: Forms Admin Write Endpoints

The service SHALL expose `POST /api/itsm/forms` and `PATCH /api/itsm/forms/:id` for admin users only, with strict body whitelist `{ name, topic, status, fields, templates }`.

#### Scenario: Admin creates a new form

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** the client POSTs `{ _id: 'new-form', name: 'New', topic: 'gdfkube.requests.new', status: 'active', fields: [...] }`
- **THEN** the service responds `201 Created` and a subsequent `GET /api/itsm/forms/new-form` returns the persisted document

#### Scenario: Duplicate form id returns 409

- **WHEN** a POST repeats an existing `_id`
- **THEN** the service responds `409 Conflict`

#### Scenario: PATCH whitelist enforced

- **WHEN** an admin PATCHes a body containing a key outside `{ name, topic, status, fields, templates }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH replaces fields[] atomically

- **WHEN** an admin PATCHes `{ fields: [<reordered>] }`
- **THEN** the persisted document's `fields[]` matches the new array exactly with no partial reorders

#### Scenario: PATCH unknown id returns 404

- **WHEN** an admin PATCHes `/api/itsm/forms/nope`
- **THEN** the service responds `404 Not Found`

---

### Requirement: Requests Read Endpoints

The service SHALL expose `GET /api/itsm/requests` with filters `status`, `formId`, `requesterGroup` and `GET /api/itsm/requests/:id`.

#### Scenario: List sorted by submittedAt desc

- **WHEN** any authenticated demo user issues `GET /api/itsm/requests`
- **THEN** the response is a JSON array sorted by `submittedAt` descending

#### Scenario: Filter by status

- **WHEN** the query is `?status=approval`
- **THEN** the response contains only documents where `status === 'approval'`

#### Scenario: Filter by formId and requesterGroup

- **WHEN** the query is `?formId=cluster-request&requesterGroup=saude`
- **THEN** the response contains only documents matching both filters (the `requesterGroup` filter is applied to the `requesterGroupName` field)

#### Scenario: Get unknown id returns 404

- **WHEN** any authenticated demo user issues `GET /api/itsm/requests/nope`
- **THEN** the service responds `404 Not Found`

---

### Requirement: Request Submit Endpoint

The service SHALL expose `POST /api/itsm/requests` that accepts a thin body `{ formId, env, vars, justification?, policyChecks? }`, assigns a server-side ULID `_id`, validates against the FormDef, and responds `201 Created` with body `{ id }` and a `Location` header.

#### Scenario: Valid submit returns id only

- **GIVEN** a valid FormDef `cluster-request` with `status: 'active'`
- **AND** `X-Demo-User: joao.silva`
- **WHEN** the client POSTs `{ formId: 'cluster-request', env: 'production', vars: { clusterName: 'vacinacao', nodeCount: 3 }, justification: 'pilot', policyChecks: [{ id: 'baseline', label: 'Baseline', ok: true }] }`
- **THEN** the response status is `201`
- **AND** the body contains exactly `{ "id": "<ULID>" }` (no other keys)
- **AND** the `Location` header is `/api/itsm/requests/<ULID>`

#### Scenario: Persisted document matches the documented shape

- **WHEN** a client subsequently issues `GET /api/itsm/requests/<id>`
- **THEN** the document has `_id` matching `^[0-9A-HJKMNP-TV-Z]{26}$`
- **AND** `status === 'approval'` and `stage === 0`
- **AND** `requester` is populated from the demo user lookup (server overrides any client-supplied `requester`)
- **AND** `meta.correlationId === _id`
- **AND** `submittedAt` is an ISO-8601 string

#### Scenario: Missing formId

- **WHEN** the body omits `formId`
- **THEN** the service responds `400 Bad Request` with `{ "error": "formId required" }`

#### Scenario: Unknown formId or non-active form

- **WHEN** the body's `formId` is unknown or refers to a `status: 'disabled'` form
- **THEN** the service responds `400 Bad Request` with `{ "error": "unknown formId" }`

#### Scenario: Validation failure surfaces field errors

- **WHEN** `vars.clusterName` violates the FormDef's regex
- **THEN** the service responds `400 Bad Request` with body containing `details: [{ key: 'clusterName', code: 'pattern' }]`
- **AND** no document is written to MongoDB

#### Scenario: Invalid env enum

- **WHEN** the body sets `env: 'mars'`
- **THEN** the validator rejects the request with `400 Bad Request` and no Mongo write occurs

---

### Requirement: Request Approval Endpoint

The service SHALL expose `POST /api/itsm/requests/:id/approvals` for admin users only, accepting `{ action, comment? }` where action ∈ `{ approved, rejected, requested_changes }`, performing a single atomic `findByIdAndUpdate` that always pushes the decision and conditionally transitions status/stage.

#### Scenario: Approve transitions to provisioning atomically

- **GIVEN** an existing request with `status: 'approval'` and `stage: 0`
- **AND** `X-Demo-User: maria.costa` (role admin)
- **WHEN** the client POSTs `{ action: 'approved', comment: 'ok' }`
- **THEN** the response is `200 OK`
- **AND** the persisted document has `status === 'provisioning'`, `stage === 1`
- **AND** `approvalChain` length grew by 1 with `{ actor: 'maria.costa', action: 'approved', comment: 'ok', at: <ISO> }`

#### Scenario: Reject transitions to failed with reason

- **WHEN** an admin POSTs `{ action: 'rejected', comment: 'no' }`
- **THEN** the persisted document has `status === 'failed'`, `reason === 'no'`, and `approvalChain` length grew by 1

#### Scenario: requested_changes appends but does not transition

- **WHEN** an admin POSTs `{ action: 'requested_changes', comment: 'add justification' }`
- **THEN** the persisted document's `status` and `stage` are unchanged
- **AND** `approvalChain` length grew by 1 with the decision recorded

#### Scenario: Idempotency is the front-end's responsibility

- **WHEN** an admin POSTs the same approve body twice in succession
- **THEN** the API records both decisions and `approvalChain` has two entries (no server-side dedupe)

#### Scenario: Operator role is forbidden

- **GIVEN** `X-Demo-User: joao.silva` (role operator)
- **WHEN** the client POSTs to any approvals route
- **THEN** the service responds `403 Forbidden`

#### Scenario: Unknown id returns 404

- **WHEN** an admin POSTs to `/api/itsm/requests/nope/approvals`
- **THEN** the service responds `404 Not Found`

#### Scenario: Invalid action enum

- **WHEN** an admin POSTs `{ action: 'foo' }`
- **THEN** the service responds `400 Bad Request`

---

### Requirement: Same-Origin via nginx Reverse Proxy

The SPA SHALL consume the API through nginx at `/api/itsm/*` (same-origin), and the API SHALL NOT mount any CORS middleware.

#### Scenario: nginx proxies /api/itsm to the API service

- **GIVEN** the compose stack is up
- **WHEN** the browser issues `GET http://127.0.0.1:8080/api/itsm/forms` with `X-Demo-User: joao.silva`
- **THEN** the request is proxied to `http://gdfkube-itsm-api:3000/api/itsm/forms`
- **AND** nginx forwards `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Request-Id` headers
- **AND** the response is returned to the browser with no `Access-Control-*` headers (none needed)

#### Scenario: SPA-fallback location does not shadow the API path

- **WHEN** the SPA configuration is loaded by nginx
- **THEN** the `/api/itsm/` location block is matched before the `/` SPA-fallback location

---

### Requirement: Service SHALL initialize a Kafka consumer for pipeline stage events at startup

The Express service MUST add `kafkajs ^2.2.4` as a dependency and MUST initialize a kafkajs consumer at process startup, before binding the HTTP listener. The consumer MUST be configured as:

| Setting | Value |
|---|---|
| `brokers` | from `KAFKA_BOOTSTRAP_SERVERS` env (default `kafka1:19092,kafka2:19092,kafka3:19092` in Compose) |
| `groupId` | `itsm-sse-${HOSTNAME}` (per-replica fan-out) |
| `topic` | `gdfkube.pipeline.status` |
| `fromBeginning` | `false` (auto.offset.reset=latest) |

`${HOSTNAME}` MUST be read from `process.env.HOSTNAME` (the container hostname); this maps to the pod name in K8s and a container-id-hash in Compose. The service MUST NOT initialize any Kafka producer — Express remains a non-producer.

#### Scenario: Consumer is initialized before HTTP listener binds

- **GIVEN** the Express container starts
- **WHEN** the startup sequence runs
- **THEN** the kafkajs consumer SHALL connect to the Kafka cluster
- **AND** the consumer SHALL subscribe to `gdfkube.pipeline.status`
- **AND** the HTTP listener SHALL bind only after the consumer reports `connected`
- **AND** no Kafka producer SHALL be initialized

#### Scenario: Consumer group ID is per-replica

- **GIVEN** the Express container is running with `HOSTNAME=itsm-api-abc123`
- **WHEN** the consumer connects to Kafka
- **THEN** the consumer group ID SHALL be exactly `itsm-sse-itsm-api-abc123`

#### Scenario: Compose service has the new env and depends_on

- **GIVEN** the repo-root `docker-compose.yml`
- **WHEN** the `gdfkube-itsm-api` service definition is inspected
- **THEN** the service SHALL declare `KAFKA_BOOTSTRAP_SERVERS=kafka1:19092,kafka2:19092,kafka3:19092` in its env
- **AND** the service SHALL declare `depends_on` for `kafka1`/`kafka2`/`kafka3` with `condition: service_healthy`

---

### Requirement: Consumer SHALL fan out stage events to an in-memory subscription map

The service MUST maintain an in-memory `Map<requestId, Set<Response>>` of SSE subscribers. On each consumed message, the service MUST parse the value as JSON, extract the `requestId` from the parsed payload (or fall back to the message key), and write the event to every subscribed `Response` whose key matches the `requestId`. A message that fails JSON parse MUST be logged and dropped (no DLQ produce).

#### Scenario: Event fans out to all matching subscribers

- **GIVEN** two SSE clients are subscribed to the same `requestId`
- **WHEN** a stage event arrives on `gdfkube.pipeline.status` with that `requestId`
- **THEN** both clients SHALL receive the event as an SSE `data:` line within 1 second

#### Scenario: Unparseable message is dropped without crashing the consumer

- **GIVEN** the consumer is running
- **WHEN** a message with a non-JSON body lands on `gdfkube.pipeline.status`
- **THEN** the consumer SHALL log an error and continue processing subsequent messages
- **AND** the service SHALL NOT crash

---

### Requirement: Service SHALL expose GET /api/itsm/requests/:id/events as an SSE stream

A new route `GET /api/itsm/requests/:id/events` MUST be registered. The route MUST:

1. Return `404 Not Found` if no document with `_id == :id` exists in the `requests` collection.
2. Respond `200 OK` with these headers:
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache`
   - `Connection: keep-alive`
3. Emit a synthetic first event derived from the request document's current `stage` field. If `stage == 0`, the synthetic event MUST use `stageName == "form"`. The synthetic event MUST conform to the `StageEvent` schema (defined below) with `status == "ok"` and `at` set to the current UTC time.
4. Register the response in the subscription map under the request's `_id`.
5. Deregister the response from the map on client disconnect (`req.on('close')`).
6. Send a heartbeat comment `:\n\n` every 15 seconds to keep proxies alive.

#### Scenario: 404 for unknown request

- **GIVEN** no request document with `_id == "BAD"` exists
- **WHEN** a client issues `GET /api/itsm/requests/BAD/events`
- **THEN** the response SHALL be `404 Not Found`

#### Scenario: Synthetic first event on stage 0

- **GIVEN** a request `X` exists with `stage == 0` (default)
- **WHEN** a client issues `GET /api/itsm/requests/X/events`
- **THEN** the response SHALL be `200 OK` with `Content-Type: text/event-stream`
- **AND** the first SSE `data:` line SHALL parse as JSON with `stage == 0`, `stageName == "form"`, and `status == "ok"`

#### Scenario: Synthetic first event on stage 5

- **GIVEN** a request `Y` exists with `stage == 5` (git stage already passed)
- **WHEN** a client subscribes to its events stream
- **THEN** the first SSE event SHALL have `stage == 5` and `stageName == "git"`

#### Scenario: Live event after subscription

- **GIVEN** a client is subscribed to request `Z`
- **WHEN** Camel `status-emitter` produces an event for `Z` on `gdfkube.pipeline.status` with `stage == 4`
- **THEN** the client SHALL receive an SSE `data:` line whose JSON has `stage == 4` and `stageName == "camel"`

#### Scenario: Heartbeat keeps the connection open

- **GIVEN** a client is subscribed
- **AND** no events flow for at least 15 seconds
- **WHEN** the connection is inspected
- **THEN** the server SHALL have sent at least one `:\n\n` heartbeat comment
- **AND** the connection SHALL remain open

#### Scenario: Subscription is removed on disconnect

- **GIVEN** a client is subscribed
- **WHEN** the client closes the connection
- **THEN** the subscription map for that `requestId` SHALL no longer contain that Response
- **AND** subsequent events for that `requestId` SHALL NOT attempt writes to the disconnected response

---

### Requirement: StageEvent payload schema SHALL be defined and validated

The canonical `StageEvent` JSON schema for messages on `gdfkube.pipeline.status` (produced by Camel `status-emitter` and re-emitted by Express SSE) MUST be:

```json
{
  "requestId": "string (ULID matching Request._id)",
  "stage": "integer 0..6",
  "stageName": "one of: form, mongo, debezium, kafka, camel, git, argocd",
  "status": "one of: ok, fail",
  "at": "ISO-8601 UTC timestamp string",
  "detail": "optional human-readable string"
}
```

The mapping from `stage` (integer) to `stageName` (string) MUST be the fixed array `["form", "mongo", "debezium", "kafka", "camel", "git", "argocd"]`. The service MUST validate incoming Kafka messages against this schema; messages that fail validation MUST be logged and dropped. Express MUST re-emit valid messages as SSE `data:` lines without transforming the payload.

#### Scenario: Valid message is re-emitted verbatim

- **GIVEN** a message `{"requestId":"R","stage":3,"stageName":"kafka","status":"ok","at":"2026-05-11T12:00:00Z"}` arrives on `gdfkube.pipeline.status`
- **WHEN** a client is subscribed to request `R`
- **THEN** the client SHALL receive an SSE `data:` line whose JSON exactly matches the input payload

#### Scenario: Schema-invalid message is dropped

- **GIVEN** a message `{"requestId":"R","stage":42}` arrives on `gdfkube.pipeline.status`
- **WHEN** the consumer processes it
- **THEN** the message SHALL be logged as an error and dropped
- **AND** no SSE event SHALL be emitted to subscribers

---

### Requirement: OpenAPI spec SHALL document the SSE endpoint and StageEvent schema

The file `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml` MUST be updated to include:

1. A `GET /api/itsm/requests/{id}/events` operation under the existing `paths` section with a `200 OK` response of `text/event-stream` and a `404 Not Found` response.
2. A `StageEvent` schema under `components.schemas` matching the payload schema above.
3. A `$ref` to `StageEvent` in the SSE response description.

The existing contract test `__tests__/openapi.test.ts` MUST continue to pass.

#### Scenario: SSE route is in the OpenAPI spec

- **GIVEN** the change is applied
- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `paths['/api/itsm/requests/{id}/events'].get`
- **AND** the operation SHALL declare a `200` response with content type `text/event-stream`
- **AND** the operation SHALL declare a `404` response

#### Scenario: StageEvent schema is defined

- **GIVEN** the change is applied
- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `components.schemas.StageEvent`
- **AND** the schema SHALL declare required properties `requestId`, `stage`, `stageName`, `status`, `at`

#### Scenario: OpenAPI contract test passes

- **GIVEN** the change is applied
- **WHEN** `npm test --workspace gdfkube-src/gdfkube-itsm/server -- __tests__/openapi.test.ts` is run
- **THEN** the test SHALL pass with no missing-route or schema-mismatch failures

---

### Requirement: Request Submit Endpoint behavior SHALL remain unchanged

The existing `POST /api/itsm/requests` endpoint behavior MUST NOT change as part of this capability. Specifically:

- The endpoint MUST continue to persist the request to MongoDB `gdfkube.requests`.
- The endpoint MUST NOT produce any message to Kafka.

This requirement explicitly preserves the contract from the existing `itsm-express-api` spec. It is restated here to make the "Express remains a Kafka non-producer" decision testable in the context of this change.

#### Scenario: Submit does not produce to Kafka

- **GIVEN** the full stack is running with the new consumer initialized
- **WHEN** a client submits `POST /api/itsm/requests` with a valid payload
- **THEN** a new document SHALL exist in MongoDB `gdfkube.requests`
- **AND** no message keyed by the new request's `_id` SHALL appear on `gdfkube.pipeline.status` until Camel `status-emitter` produces one
- **AND** no message produced by the Express service SHALL appear on any Kafka topic

---

### Requirement: Settings GET endpoint SHALL return the global Gitea configuration

The service SHALL expose `GET /api/itsm/settings` gated by `demoUser` and `requireAdmin` middleware. The endpoint MUST return the singleton Gitea settings document with fields `endpoint`, `owner`, `token`, `updatedAt`, and `updatedBy`. The `token` field MUST be redacted to `"***"` in the response unless the query string includes `reveal=1`, in which case the token MUST be returned in cleartext. Non-admin requests MUST receive `403 Forbidden`.

#### Scenario: Admin GET returns redacted token

- **GIVEN** the `gitea_settings` collection contains a singleton document with `token: 'real-token-value'`
- **AND** the request is from an admin user
- **WHEN** the admin issues `GET /api/itsm/settings`
- **THEN** the response SHALL be `200 OK`
- **AND** the response body SHALL include `endpoint`, `owner`, `updatedAt`, `updatedBy`
- **AND** the `token` field SHALL be `"***"`

#### Scenario: Admin GET with reveal=1 returns cleartext token

- **GIVEN** the `gitea_settings` collection contains a singleton document with `token: 'real-token-value'`
- **AND** the request is from an admin user
- **WHEN** the admin issues `GET /api/itsm/settings?reveal=1`
- **THEN** the response SHALL be `200 OK`
- **AND** the `token` field SHALL be `'real-token-value'`

#### Scenario: Non-admin GET returns 403

- **GIVEN** the request is from a non-admin user
- **WHEN** the user issues `GET /api/itsm/settings`
- **THEN** the response SHALL be `403 Forbidden`

---

### Requirement: Settings PATCH endpoint SHALL upsert the global Gitea configuration

The service SHALL expose `PATCH /api/itsm/settings` gated by `demoUser` and `requireAdmin` middleware. The endpoint MUST validate the request body and upsert the singleton document (`_id: 'gitea'`). On success, `updatedAt` MUST be set to the current time and `updatedBy` MUST be set to the requester's demo user id. The response MUST return the updated document with the `token` field redacted. Non-admin requests MUST receive `403 Forbidden`.

#### Scenario: Admin PATCH with valid body upserts and stamps audit fields

- **GIVEN** the request is from admin user `maria.costa`
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "https://gitea.example.com", "owner": "myorg", "token": "new-pat" }`
- **THEN** the response SHALL be `200 OK`
- **AND** the singleton document SHALL have `endpoint: 'https://gitea.example.com'`, `owner: 'myorg'`, `token: 'new-pat'`
- **AND** `updatedAt` SHALL be set to approximately the current time
- **AND** `updatedBy` SHALL be `'maria.costa'`
- **AND** the response `token` field SHALL be `"***"`

#### Scenario: PATCH with invalid endpoint returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "not-a-url", "owner": "ok", "token": "ok" }`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: PATCH with invalid owner returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "https://ok.com", "owner": "bad owner!!", "token": "ok" }`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: PATCH with empty token returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `{ "endpoint": "https://ok.com", "owner": "ok", "token": "" }`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: Non-admin PATCH returns 403

- **GIVEN** the request is from a non-admin user
- **WHEN** the user issues `PATCH /api/itsm/settings`
- **THEN** the response SHALL be `403 Forbidden`

---

### Requirement: Settings router SHALL be mounted in the Express app

The Express app (`server/src/app.ts`) MUST mount the settings router at `/api/itsm/settings` using `app.use('/api/itsm/settings', settingsRouter)`, following the same registration pattern as the existing route files.

#### Scenario: Settings routes are reachable

- **GIVEN** the Express app has started
- **WHEN** a client issues a request to `/api/itsm/settings`
- **THEN** the request SHALL be routed to the settings router

---

### Requirement: Settings PATCH SHALL reject malformed bodies before destructuring

The `PATCH /api/itsm/settings` handler MUST guard against `null`, non-object, and array request bodies before attempting to destructure `endpoint`, `owner`, and `token`. If `req.body` is not a plain object, the handler MUST return `400 Bad Request` with body `{ "error": "invalid body" }` and MUST NOT mutate the singleton document. This requirement is in addition to the field-level validations already enforced by the Settings PATCH endpoint requirement.

#### Scenario: Null body returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with a JSON `null` body
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the response body SHALL be `{ "error": "invalid body" }`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: Array body returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `[]`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

#### Scenario: Non-object scalar body returns 400

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `PATCH /api/itsm/settings` with body `"a string"`
- **THEN** the response SHALL be `400 Bad Request`
- **AND** the singleton document SHALL NOT be mutated

---

### Requirement: Settings GET with reveal=1 SHALL emit Cache-Control no-store

When `GET /api/itsm/settings` receives the query parameter `reveal=1` (causing the response to include the plaintext token), the handler MUST set the response header `Cache-Control: no-store` before sending the JSON body. This prevents browsers, reverse proxies, and CDNs from caching the plaintext PAT.

#### Scenario: Reveal response carries no-store header

- **GIVEN** the request is from an admin user
- **AND** the `gitea_settings` singleton exists with a plaintext `token`
- **WHEN** the admin issues `GET /api/itsm/settings?reveal=1`
- **THEN** the response SHALL be `200 OK`
- **AND** the response `Cache-Control` header SHALL be `no-store`
- **AND** the response `token` field SHALL be the plaintext value

#### Scenario: Redacted GET does not require no-store

- **GIVEN** the request is from an admin user
- **WHEN** the admin issues `GET /api/itsm/settings` (no `reveal` parameter)
- **THEN** the response `token` field SHALL be `"***"`
- **AND** the response MAY omit the `Cache-Control: no-store` header

---

### Requirement: OpenAPI spec SHALL document the Settings endpoints

The file `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml` MUST document both Settings endpoints under the existing `paths` section, mirroring the conventions already used for `/api/itsm/users` and `/api/itsm/groups`:

1. `GET /api/itsm/settings` with an optional `reveal` query parameter (boolean, defaults to redacted) and responses for `200`, `403`, and `404`.
2. `PATCH /api/itsm/settings` with a request body schema declaring `endpoint` (string, matches `^https?://.+$`), `owner` (string, matches `^[a-zA-Z0-9_-]+$`), and `token` (string, non-empty), and responses for `200`, `400`, and `403`.

The existing OpenAPI contract test at `gdfkube-src/gdfkube-itsm/server/__tests__/openapi.test.ts` MUST pass after these additions.

#### Scenario: GET /api/itsm/settings is in the OpenAPI spec

- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `paths['/api/itsm/settings'].get`
- **AND** the operation SHALL declare a `reveal` query parameter
- **AND** the operation SHALL declare `200`, `403`, and `404` responses

#### Scenario: PATCH /api/itsm/settings is in the OpenAPI spec

- **WHEN** `openapi.yaml` is parsed
- **THEN** the document SHALL contain `paths['/api/itsm/settings'].patch`
- **AND** the operation SHALL declare a request body schema with `endpoint`, `owner`, and `token` properties
- **AND** the operation SHALL declare `200`, `400`, and `403` responses

#### Scenario: OpenAPI contract test passes

- **WHEN** `npm test --workspace gdfkube-src/gdfkube-itsm/server -- __tests__/openapi.test.ts` is run
- **THEN** the test SHALL pass with no missing-route or schema-mismatch failures for the Settings paths
