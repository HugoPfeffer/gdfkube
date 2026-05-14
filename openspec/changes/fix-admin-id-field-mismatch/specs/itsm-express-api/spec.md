## MODIFIED Requirements

### Requirement: Forms Admin Write Endpoints

The service SHALL expose `POST /api/itsm/forms` and `PATCH /api/itsm/forms/:id` for admin users only, with strict body whitelist `{ name, topic, status, fields, templates }`. The POST body SHALL use the wire key `id` (not `_id`) to convey the form id that becomes the Mongoose `_id: String` field; the server SHALL map `body.id` onto `_id` on create.

#### Scenario: Admin creates a new form

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** the client POSTs `{ id: 'new-form', name: 'New', topic: 'gdfkube.requests.new', status: 'active', fields: [...] }`
- **THEN** the service responds `201 Created` and a subsequent `GET /api/itsm/forms/new-form` returns the persisted document

#### Scenario: Duplicate form id returns 409

- **WHEN** a POST repeats an existing `id` (matching an existing form's `_id`)
- **THEN** the service responds `409 Conflict`

#### Scenario: POST body with `_id` instead of `id` does not alias

- **WHEN** an admin POSTs `{ _id: 'new-form', name: 'New', topic: 'gdfkube.requests.new', status: 'active', fields: [...] }` (no `id`)
- **THEN** the persisted document's `_id` is NOT `'new-form'` (the wire key `_id` is silently ignored by the server, which reads `body.id`)

#### Scenario: PATCH whitelist enforced

- **WHEN** an admin PATCHes a body containing a key outside `{ name, topic, status, fields, templates }`
- **THEN** the service responds `400 Bad Request`

#### Scenario: PATCH replaces fields[] atomically

- **WHEN** an admin PATCHes `{ fields: [<reordered>] }`
- **THEN** the persisted document's `fields[]` matches the new array exactly with no partial reorders

#### Scenario: PATCH unknown id returns 404

- **WHEN** an admin PATCHes `/api/itsm/forms/nope`
- **THEN** the service responds `404 Not Found`
