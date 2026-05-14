## MODIFIED Requirements

### Requirement: Forms Admin Lifecycle

Admin users SHALL create new FormDefs via `POST /api/itsm/forms` and update existing ones via `PATCH /api/itsm/forms/:id` with body keys restricted to `{ name, topic, status, fields, templates }`. The POST body SHALL use the wire key `id` (not `_id`) to convey the form id that becomes the Mongoose `_id: String` field; the server SHALL map `body.id` onto `_id` on create.

#### Scenario: Admin POST creates form atomically

- **GIVEN** `X-Demo-User: maria.costa` (role admin)
- **WHEN** the client POSTs a complete FormDef body with `id: '<form-id>'` as the wire key for the slug
- **THEN** the service responds `201 Created` and the document is queryable via `GET /api/itsm/forms/:id`

#### Scenario: Duplicate id returns 409

- **WHEN** a POST repeats an existing `id` (matching an existing form's `_id`)
- **THEN** the service responds `409 Conflict` (Mongoose duplicate-key error mapped)

#### Scenario: POST body with `_id` instead of `id` does not alias

- **WHEN** an admin POSTs a FormDef body with `_id: '<form-id>'` (no `id`)
- **THEN** the persisted document's `_id` is NOT `'<form-id>'` (the wire key `_id` is silently ignored by the server, which reads `body.id`)

#### Scenario: PATCH whitelist rejects unknown keys

- **WHEN** an admin PATCHes a body with any key outside `{ name, topic, status, fields, templates }`
- **THEN** the service responds `400 Bad Request` and the document is unchanged

#### Scenario: PATCH replaces fields[] atomically

- **WHEN** an admin PATCHes `{ fields: [<reordered or edited>] }`
- **THEN** the document's `fields[]` is replaced by the supplied array in a single Mongo update with no partial reorder visible to readers or to CDC

#### Scenario: PATCH replaces templates[] atomically

- **WHEN** an admin PATCHes `{ templates: [<new templates>] }`
- **THEN** the document's `templates[]` is replaced wholesale in a single Mongo update
