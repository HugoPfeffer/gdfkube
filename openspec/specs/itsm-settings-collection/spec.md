## ADDED Requirements

### Requirement: Gitea settings Mongoose model SHALL define a singleton schema

The file `server/src/models/GiteaSettings.ts` MUST define a Mongoose model for the `gitea_settings` collection with the following schema:

| Field | Type | Constraints |
|---|---|---|
| `_id` | String | Fixed value `'gitea'` |
| `endpoint` | String | Required, match `^https?://.+$` |
| `owner` | String | Required, match `^[a-zA-Z0-9_-]+$` |
| `token` | String | Required |
| `updatedAt` | Date | Auto-managed |
| `updatedBy` | String | Auto-managed |

The collection name MUST follow the existing snake_case convention used by other models in `server/src/models/`.

#### Scenario: Model enforces endpoint validation

- **GIVEN** a document with `endpoint: 'not-a-url'`
- **WHEN** the document is validated
- **THEN** Mongoose SHALL reject it with a validation error

#### Scenario: Model enforces owner validation

- **GIVEN** a document with `owner: 'bad owner!!'`
- **WHEN** the document is validated
- **THEN** Mongoose SHALL reject it with a validation error

#### Scenario: Model requires token

- **GIVEN** a document with `token: ''` or missing `token`
- **WHEN** the document is validated
- **THEN** Mongoose SHALL reject it with a validation error

---

### Requirement: Seed data SHALL match project-default Gitea values

The seed data for the `gitea_settings` collection MUST contain exactly one document:

```json
{
  "_id": "gitea",
  "endpoint": "https://gitea-gitea.apps.gdfkube.gov",
  "owner": "gdfkube",
  "token": "CHANGE_ME",
  "updatedBy": "seed"
}
```

The `endpoint` and `owner` values MUST match the defaults in `gdfkube-infra/charts/cluster-request/values.yaml` (`giteaExternalUrl` and `giteaOwner`). The `token` value MUST be a clearly non-real placeholder (`CHANGE_ME`) with a `trufflehog:ignore` comment in the TypeScript source.

#### Scenario: Seed values match Helm values

- **GIVEN** the seed data for `gitea_settings`
- **WHEN** compared against `values.yaml`
- **THEN** `endpoint` SHALL equal `giteaExternalUrl` from `values.yaml`
- **AND** `owner` SHALL equal `giteaOwner` from `values.yaml`

#### Scenario: Token is a placeholder

- **GIVEN** the seed data for `gitea_settings`
- **WHEN** the `token` field is inspected
- **THEN** the value SHALL be `'CHANGE_ME'`

---

### Requirement: Seed on empty DB SHALL create the singleton document

When `seed-collections.js` runs against an empty database, the `gitea_settings` collection MUST contain exactly one document with `_id: 'gitea'`, the project-default `endpoint` and `owner`, and the placeholder `token`.

#### Scenario: Fresh seed creates the document

- **GIVEN** the `gitea_settings` collection does not exist or is empty
- **WHEN** `seed-collections.js` executes
- **THEN** the collection SHALL contain exactly one document
- **AND** `_id` SHALL be `'gitea'`
- **AND** `endpoint` SHALL be `'https://gitea-gitea.apps.gdfkube.gov'`
- **AND** `owner` SHALL be `'gdfkube'`
- **AND** `token` SHALL be `'CHANGE_ME'`

---

### Requirement: Re-seed SHALL NOT overwrite admin-edited values

When `seed-collections.js` runs against a database where the `gitea_settings` singleton already has admin-edited values, those values MUST be preserved. The seeder MUST use `updateOne` with `$setOnInsert` (not `replaceOne` with `upsert`) so that existing documents are never overwritten.

#### Scenario: Re-seed preserves admin edits

- **GIVEN** the `gitea_settings` collection contains a document with `owner: 'edited-by-admin'`
- **WHEN** `seed-collections.js` executes
- **THEN** `owner` SHALL still be `'edited-by-admin'`
- **AND** the document SHALL NOT have been replaced with seed defaults

---

### Requirement: Seed export SHALL produce settings.json

When `npm run seed:export` (or `scripts/export-seed-data.mjs`) runs, it MUST produce a file at `gdfkube-infra/mongodb/seed-data/settings.json` containing the singleton Gitea settings document matching the seeded shape.

#### Scenario: Export generates settings.json

- **GIVEN** the export script runs
- **WHEN** execution completes
- **THEN** `gdfkube-infra/mongodb/seed-data/settings.json` SHALL exist
- **AND** the file SHALL contain a JSON document with `_id: 'gitea'`, `endpoint`, `owner`, and `token` fields
