## ADDED Requirements

### Requirement: Users Document Shape

The `gdfkube.users` collection SHALL store one document per ITSM demo user with a string `_id` equal to the username (e.g. `joao.silva`) and the shape mirroring `gdfkube-src/gdfkube-itsm/src/types.ts:5-17`. The `role` field SHALL be one of exactly `{ operator, admin }` — the previous `approver` and `service` values are removed.

#### Scenario: Required fields enforced by Mongoose

- **WHEN** any code path attempts to save a User without `_id`, `name`, `email`, or `role`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: Role enum is operator or admin

- **WHEN** `role` is set outside `{ operator, admin }`
- **THEN** Mongoose rejects the save

#### Scenario: Optional fields are accepted

- **WHEN** a User is saved with `fullName`, `group`, `status`, `mfa`, or `last`
- **THEN** the save succeeds and those fields round-trip through Mongoose

#### Scenario: _id is the username

- **GIVEN** a seeded User with id `joao.silva`
- **WHEN** the document is fetched
- **THEN** `_id === 'joao.silva'` (no ObjectId, no separate username field)

---

### Requirement: Users Admin CRUD

The service SHALL expose `GET /api/itsm/users`, `GET /api/itsm/users/:id`, `POST /api/itsm/users`, and `PATCH /api/itsm/users/:id` — all admin-only — with PATCH body keys restricted to `{ name, fullName, email, role, group, status, username, active, mfa, last }`. The keys `username` and `active` were added to the server whitelist to support the UserEditor's account-disable affordance and username rename; this closes the drift between spec and server code. The POST body SHALL use the wire key `id` (not `_id`) to convey the username that becomes the Mongoose `_id: String` field; the server SHALL map `body.id` onto `_id` on create.

#### Scenario: List as admin returns array sorted by name

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** the client issues `GET /api/itsm/users`
- **THEN** the response is `200 OK` with a JSON array sorted ascending by `name`

#### Scenario: List as operator is forbidden

- **GIVEN** `X-Demo-User: joao.silva` (role operator)
- **WHEN** the client issues `GET /api/itsm/users`
- **THEN** the service responds `403 Forbidden`

#### Scenario: POST creates user

- **GIVEN** `X-Demo-User: maria.costa`
- **WHEN** the client POSTs `{ id: 'new.user', name: 'New User', email: 'n@x.gov', role: 'operator', group: 'saude' }`
- **THEN** the response is `201 Created` and the document is queryable via `GET /api/itsm/users/new.user`

#### Scenario: POST with bad role returns 400

- **WHEN** the body's `role` is outside the enum
- **THEN** the service responds `400 Bad Request`

#### Scenario: POST with duplicate id returns 409

- **WHEN** the body's `id` matches an existing user's `_id`
- **THEN** the service responds `409 Conflict`

#### Scenario: POST body with `_id` instead of `id` does not alias

- **WHEN** an admin POSTs `{ _id: 'ana.souza', name: 'Ana', email: 'a@x.gov', role: 'operator' }` (no `id`)
- **THEN** the persisted document's `_id` is NOT `'ana.souza'` (the wire key `_id` is silently ignored by the server, which reads `body.id`)

#### Scenario: PATCH accepts username

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** an admin PATCHes `/api/itsm/users/m.costa` with `{ username: "maria.costa" }`
- **THEN** the response is `200 OK` and the document's `username` reflects the new value

#### Scenario: PATCH accepts active

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** an admin PATCHes `/api/itsm/users/joao.silva` with `{ active: false }`
- **THEN** the response is `200 OK` and the document's `active` is `false`

#### Scenario: PATCH whitelist rejects unknown keys

- **WHEN** an admin PATCHes a body with any key outside `{ name, fullName, email, role, group, status, username, active, mfa, last }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH unknown id returns 404

- **WHEN** an admin PATCHes `/api/itsm/users/ghost`
- **THEN** the service responds `404 Not Found`

---

### Requirement: Users Indexes

The `gdfkube.users` collection SHALL have indexes `idx_user_group` (`{ group: 1 }`) and `idx_user_role` (`{ role: 1 }`), created idempotently by the seed script.

#### Scenario: Indexes exist after seed

- **GIVEN** the seed script has run
- **WHEN** the test issues `db.users.getIndexes()`
- **THEN** the result includes `idx_user_group` and `idx_user_role`

---

### Requirement: Users Not in CDC Include List

The `gdfkube.users` collection SHALL NOT appear in Debezium's `collection.include.list`. Admin user mutations are not part of the provisioning pipeline.

#### Scenario: docs/04-debezium.md is unchanged by this collection

- **WHEN** the next (Debezium) spec ships
- **THEN** its `collection.include.list` remains `gdfkube.requests,gdfkube.forms` (no `gdfkube.users`)
