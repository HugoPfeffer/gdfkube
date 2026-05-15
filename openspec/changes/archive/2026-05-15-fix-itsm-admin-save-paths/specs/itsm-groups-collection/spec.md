## MODIFIED Requirements

### Requirement: Groups Admin CRUD

The service SHALL expose `GET /api/itsm/groups`, `GET /api/itsm/groups/:id`, `POST /api/itsm/groups`, and `PATCH /api/itsm/groups/:id` — all admin-only — with PATCH body keys restricted to `{ name, fullName, repo }`. The previously-accepted keys `users`, `forms`, and `clusters` SHALL be rejected: those fields remain stored on the Mongoose document but are no longer writable via the admin PATCH path, which closes the drift with the SPA GroupEditor (which only sends `{ name, fullName, repo }`).

#### Scenario: List as admin returns array sorted by name

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** the client issues `GET /api/itsm/groups`
- **THEN** the response is `200 OK` with a JSON array sorted ascending by `name`

#### Scenario: List as operator is forbidden

- **GIVEN** `X-Demo-User: joao.silva` (role operator)
- **WHEN** the client issues `GET /api/itsm/groups`
- **THEN** the service responds `403 Forbidden`

#### Scenario: POST creates group

- **WHEN** an admin POSTs `{ _id: 'novo-org', name: 'Novo Org', users: [], forms: [] }`
- **THEN** the response is `201 Created` and the document is queryable via `GET /api/itsm/groups/novo-org`

#### Scenario: POST with duplicate _id returns 409

- **WHEN** the body's `_id` matches an existing group
- **THEN** the service responds `409 Conflict`

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

## REMOVED Requirements

<!-- None — the "PATCH replaces users[] and forms[] wholesale" scenario was a Scenario under "Groups Admin CRUD", so it is removed via the MODIFIED block above by omission. The Requirement itself is not removed. -->
