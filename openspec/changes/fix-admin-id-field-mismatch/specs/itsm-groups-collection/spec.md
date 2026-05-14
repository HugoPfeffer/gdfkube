## MODIFIED Requirements

### Requirement: Groups Admin CRUD

The service SHALL expose `GET /api/itsm/groups`, `GET /api/itsm/groups/:id`, `POST /api/itsm/groups`, and `PATCH /api/itsm/groups/:id` — all admin-only — with PATCH body keys restricted to `{ name, fullName, users, forms, repo, clusters }`. The POST body SHALL use the wire key `id` (not `_id`) to convey the slug that becomes the Mongoose `_id: String` field; the server SHALL map `body.id` onto `_id` on create.

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

#### Scenario: PATCH replaces users[] and forms[] wholesale

- **WHEN** an admin PATCHes `{ users: [<new list>] }`
- **THEN** the document's `users` array is replaced atomically by the new list (matches the SPA's UPDATE_GROUP semantics)

#### Scenario: PATCH whitelist rejects unknown keys

- **WHEN** an admin PATCHes a body with any key outside `{ name, fullName, users, forms, repo, clusters }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH unknown id returns 404

- **WHEN** an admin PATCHes `/api/itsm/groups/ghost`
- **THEN** the service responds `404 Not Found`
