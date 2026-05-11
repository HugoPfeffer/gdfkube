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

The service SHALL extract a demo user from the `X-Demo-User` request header against a static user list, and SHALL reject any request to `/api/itsm/*` whose header is missing or unknown.

#### Scenario: Missing header on /api/itsm route

- **GIVEN** a request to any `/api/itsm/*` path
- **WHEN** the request omits the `X-Demo-User` header
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "X-Demo-User required" }`

#### Scenario: Unknown user

- **GIVEN** a request with `X-Demo-User: ghost.user`
- **WHEN** `ghost.user` is not in the static demo user list
- **THEN** the service responds `401 Unauthorized` with body `{ "error": "unknown demo user" }`

#### Scenario: Known user populates req.demoUser

- **GIVEN** a request with `X-Demo-User: joao.silva`
- **WHEN** the demo user list contains `joao.silva` with `{ id, name, email, role, group }`
- **THEN** the middleware populates `req.demoUser` with the matched record and forwards the request to the next handler

---

### Requirement: Admin Gate Middleware

The service SHALL gate every admin write route (POST/PATCH on `/forms`, `/users`, `/groups`, plus `POST /requests/:id/approvals`) behind a middleware that checks `req.demoUser.role === 'admin'`.

#### Scenario: Non-admin role on admin route

- **GIVEN** a request with `X-Demo-User: joao.silva` (role `operator`)
- **WHEN** the request targets any admin write route
- **THEN** the service responds `403 Forbidden` with body `{ "error": "admin role required" }`

#### Scenario: Admin role passes the gate

- **GIVEN** a request with `X-Demo-User: maria.costa` (role `admin`)
- **WHEN** the request targets any admin write route
- **THEN** the gate forwards the request to the route handler

#### Scenario: approver role is not authorized for approvals

- **GIVEN** a request with `X-Demo-User: <approver-role-user>`
- **WHEN** the request is `POST /api/itsm/requests/:id/approvals`
- **THEN** the service responds `403 Forbidden` per the docs scoping approval to admin only

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
