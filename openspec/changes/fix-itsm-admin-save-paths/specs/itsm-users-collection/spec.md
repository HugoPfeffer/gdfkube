## MODIFIED Requirements

### Requirement: Users Admin CRUD

The service SHALL expose `GET /api/itsm/users`, `GET /api/itsm/users/:id`, `POST /api/itsm/users`, and `PATCH /api/itsm/users/:id` — all admin-only — with PATCH body keys restricted to `{ name, fullName, email, role, group, status, username, active, mfa, last }`. The keys `username` and `active` were added to the server whitelist by commit `19c7371` to support the UserEditor's account-disable affordance and username rename; this requirement closes the drift between spec and server code.

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
