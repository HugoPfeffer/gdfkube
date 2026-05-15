## MODIFIED Requirements

### Requirement: Users Admin CRUD

The service SHALL expose `GET /api/itsm/users`, `GET /api/itsm/users/:id`, `POST /api/itsm/users`, and `PATCH /api/itsm/users/:id` — all admin-only — with PATCH body keys restricted to `{ name, fullName, email, role, group, status, mfa, last }`. The POST body SHALL use the wire key `id` (not `_id`) to convey the username that becomes the Mongoose `_id: String` field; the server SHALL map `body.id` onto `_id` on create.

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

#### Scenario: PATCH whitelist rejects unknown keys

- **WHEN** an admin PATCHes a body with any key outside `{ name, fullName, email, role, group, status, mfa, last }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH unknown id returns 404

- **WHEN** an admin PATCHes `/api/itsm/users/ghost`
- **THEN** the service responds `404 Not Found`
