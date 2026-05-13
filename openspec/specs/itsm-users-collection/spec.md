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

The service SHALL expose `GET /api/itsm/users`, `GET /api/itsm/users/:id`, `POST /api/itsm/users`, and `PATCH /api/itsm/users/:id` — all admin-only — with PATCH body keys restricted to `{ name, fullName, email, role, group, status, mfa, last }`.

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
- **WHEN** the client POSTs `{ _id: 'new.user', name: 'New User', email: 'n@x.gov', role: 'operator', group: 'saude' }`
- **THEN** the response is `201 Created` and the document is queryable via `GET /api/itsm/users/new.user`

#### Scenario: POST with bad role returns 400

- **WHEN** the body's `role` is outside the enum
- **THEN** the service responds `400 Bad Request`

#### Scenario: POST with duplicate _id returns 409

- **WHEN** the body's `_id` matches an existing user
- **THEN** the service responds `409 Conflict`

#### Scenario: PATCH whitelist rejects unknown keys

- **WHEN** an admin PATCHes a body with any key outside `{ name, fullName, email, role, group, status, mfa, last }`
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
