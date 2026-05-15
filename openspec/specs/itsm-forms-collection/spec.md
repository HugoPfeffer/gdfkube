## ADDED Requirements

### Requirement: Forms Document Shape

The `gdfkube.forms` collection SHALL store one document per FormDef with a string `_id` (form id, e.g. `cluster-request`) and the shape declared in `docs/03-mongodb.md:88-104`, extended with an optional `templates: TemplateFile[]` array.

#### Scenario: Required fields enforced by Mongoose

- **WHEN** any code path attempts to save a FormDef without `_id`, `name`, `topic`, `status`, or `fields`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: Status enum

- **WHEN** `status` is set outside `{ active, disabled }`
- **THEN** Mongoose rejects the save

#### Scenario: Fields array uses typed sub-schema

- **WHEN** any field entry in `fields[]` is missing `key`, `label`, or `type`
- **THEN** Mongoose rejects the save

#### Scenario: Templates array is optional

- **WHEN** a FormDef is saved without `templates`
- **THEN** the save succeeds and `templates` is absent or empty
- **AND WHEN** a FormDef is saved with `templates: [{ name, content, language? }]`
- **THEN** the templates round-trip through Mongoose with the `name`, `content`, and optional `language` fields preserved

---

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

---

### Requirement: Forms Indexes

The `gdfkube.forms` collection SHALL have the indexes declared in `docs/03-mongodb.md`, created idempotently by the seed script.

#### Scenario: idx_form_status exists after seed

- **GIVEN** the seed script has run
- **WHEN** the test issues `db.forms.getIndexes()`
- **THEN** the result includes `idx_form_status` (`{ status: 1 }`)

#### Scenario: Re-running the seed is idempotent

- **WHEN** the seed script runs a second time
- **THEN** no duplicate indexes are created

---

### Requirement: Forms Collection in CDC Include List

The `gdfkube.forms` collection SHALL be in Debezium's `collection.include.list` (per `docs/04-debezium.md:48`), and the document shape SHALL match `docs/03-mongodb.md:88-104` so CDC needs no schema rewrite.

#### Scenario: Document shape matches docs verbatim

- **GIVEN** a sampled FormDef document from the seeded collection
- **WHEN** its top-level keys are compared against `docs/03-mongodb.md:88-104`
- **THEN** every documented key is present with the documented type
- **AND** the only undocumented optional addition is the `templates[]` array (intentional, per design.md decision D4)

#### Scenario: PATCH array-replace produces a single change-stream event

- **WHEN** an admin PATCHes `{ fields: [...] }`
- **THEN** Debezium's `change_streams_update_full` would observe exactly one post-image with the new `fields[]` (no partial reorder events)
