## ADDED Requirements

### Requirement: Groups Document Shape

The `gdfkube.groups` collection SHALL store one document per organization (group) with a string `_id` equal to the org id (e.g. `saude`) and the shape mirroring `gdfkube-src/gdfkube-itsm/src/types.ts:127-135`.

#### Scenario: Required fields enforced by Mongoose

- **WHEN** any code path attempts to save a Group without `_id` or `name`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: users[] and forms[] default to empty arrays

- **WHEN** a Group is saved without `users` or `forms`
- **THEN** the persisted document has `users: []` and `forms: []`

#### Scenario: Optional fields are accepted

- **WHEN** a Group is saved with `fullName`, `repo`, or `clusters`
- **THEN** the save succeeds and those fields round-trip through Mongoose

#### Scenario: _id is the org id

- **GIVEN** a seeded Group with id `saude`
- **WHEN** the document is fetched
- **THEN** `_id === 'saude'` (no ObjectId, no separate slug field)

---

### Requirement: Groups Admin CRUD

The service SHALL expose `GET /api/itsm/groups`, `GET /api/itsm/groups/:id`, `POST /api/itsm/groups`, and `PATCH /api/itsm/groups/:id` — all admin-only — with PATCH body keys restricted to `{ name, fullName, repo }`. The previously-accepted keys `users`, `forms`, and `clusters` SHALL be rejected: those fields remain stored on the Mongoose document but are no longer writable via the admin PATCH path, which closes the drift with the SPA GroupEditor (which only sends `{ name, fullName, repo }`). The POST body SHALL use the wire key `id` (not `_id`) to convey the slug that becomes the Mongoose `_id: String` field; the server SHALL map `body.id` onto `_id` on create.

#### Scenario: List as admin returns array sorted by name

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** the client issues `GET /api/itsm/groups`
- **THEN** the response is `200 OK` with a JSON array sorted ascending by `name`

#### Scenario: List as operator is forbidden

- **GIVEN** `X-Demo-User: joao.silva` (role operator)
- **WHEN** the client issues `GET /api/itsm/groups`
- **THEN** the service responds `403 Forbidden`

#### Scenario: POST creates group

- **WHEN** an admin POSTs `{ id: 'novo-org', name: 'Novo Org', users: [], forms: [] }`
- **THEN** the response is `201 Created` and the document is queryable via `GET /api/itsm/groups/novo-org`

#### Scenario: POST with duplicate id returns 409

- **WHEN** the body's `id` matches an existing group's `_id`
- **THEN** the service responds `409 Conflict`

#### Scenario: POST body with `_id` instead of `id` does not alias

- **WHEN** an admin POSTs `{ _id: 'novo-org', name: 'Novo Org', users: [], forms: [] }` (no `id`)
- **THEN** the persisted document's `_id` is NOT `'novo-org'` (the wire key `_id` is silently ignored by the server, which reads `body.id`)

#### Scenario: PATCH accepts the trimmed whitelist

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** an admin PATCHes `/api/itsm/groups/saude` with `{ name: "Saúde", fullName: "Secretaria da Saúde", repo: "gdfkube-saude" }`
- **THEN** the response is `200 OK` and the document reflects the new values

#### Scenario: PATCH rejects users

- **WHEN** an admin PATCHes `/api/itsm/groups/saude` with `{ users: [] }` (or any non-empty list)
- **THEN** the service responds `400 Bad Request` with body `{ "error": "Invalid field: users" }`
- **AND** the persisted document is unchanged

#### Scenario: PATCH rejects forms

- **WHEN** an admin PATCHes `/api/itsm/groups/saude` with `{ forms: [...] }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH rejects clusters

- **WHEN** an admin PATCHes `/api/itsm/groups/saude` with `{ clusters: [...] }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH whitelist rejects unknown keys

- **WHEN** an admin PATCHes a body with any key outside `{ name, fullName, repo }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH unknown id returns 404

- **WHEN** an admin PATCHes `/api/itsm/groups/ghost`
- **THEN** the service responds `404 Not Found`

---

### Requirement: Groups Indexes

The `gdfkube.groups` collection SHALL have an index `idx_group_name` (`{ name: 1 }`), created idempotently by the seed script.

#### Scenario: Index exists after seed

- **GIVEN** the seed script has run
- **WHEN** the test issues `db.groups.getIndexes()`
- **THEN** the result includes `idx_group_name`
