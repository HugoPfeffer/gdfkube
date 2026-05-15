## MODIFIED Requirements

### Requirement: Groups Document Shape

The `gdfkube.groups` collection SHALL store one document per organization (group) with a string `_id` equal to the org id (e.g. `saude`) and the shape mirroring `gdfkube-src/gdfkube-itsm/src/types.ts:127-135`, in which `users`, `forms`, and `clusters` are numeric counts (or `null` for `clusters`), not membership arrays. A Group saved without `users` or `forms` MUST default those fields to the numeric value `0` so the persisted document, the seed data, and the frontend `Group` type remain consistent.

#### Scenario: Required fields enforced by Mongoose

- **WHEN** any code path attempts to save a Group without `_id` or `name`
- **THEN** Mongoose rejects the save with a validation error

#### Scenario: users and forms default to numeric zero

- **WHEN** a Group is saved without `users` or `forms`
- **THEN** the persisted document has `users: 0` and `forms: 0`
- **AND** neither field is `undefined`

#### Scenario: Optional fields are accepted

- **WHEN** a Group is saved with `fullName`, `repo`, or `clusters`
- **THEN** the save succeeds and those fields round-trip through Mongoose

#### Scenario: _id is the org id

- **GIVEN** a seeded Group with id `saude`
- **WHEN** the document is fetched
- **THEN** `_id === 'saude'` (no ObjectId, no separate slug field)
