## MODIFIED Requirements

### Requirement: No live Gitea secret SHALL be committed to the repo

The committed `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` placeholder MUST ship `token=CHANGE_ME` (placeholder) and MUST NOT carry an `endpoint` field. The in-cluster `endpoint` is owned exclusively by `gitea-token-sync`, which upserts `http://gitea:3000` at runtime; the seed file MUST NOT pre-populate any value that `gitea-token-sync` writes (`endpoint`, `owner`, `token`, `updatedBy`, `updatedAt`). Any defaults appearing in `.env.example` MUST be placeholders (e.g., `GITEA_ADMIN_PASSWORD=ChangeMeLocally123!`) and MUST carry a `# trufflehog:ignore` comment so the pre-commit trufflehog scan stays green. Live tokens MUST only exist at runtime: in the `gitea-data` volume's `/data/itsm/token` file and in the Mongo `gitea_settings.token` field.

#### Scenario: trufflehog pre-commit hook stays green

- **GIVEN** all files in this change are staged
- **WHEN** `pre-commit run --all-files` is executed
- **THEN** trufflehog SHALL report no findings
- **AND** the run SHALL exit with code 0

#### Scenario: Committed seed file omits endpoint

- **GIVEN** this change is merged
- **WHEN** `gdfkube-src/gdfkube-infra/mongodb/seed-data/settings.json` is read
- **THEN** the JSON document SHALL contain `_id: "gitea"` and `token: "CHANGE_ME"`
- **AND** the document SHALL NOT contain an `endpoint` field
- **AND** the document SHALL NOT contain an `updatedAt` field
