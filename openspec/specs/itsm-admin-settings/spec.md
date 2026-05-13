# itsm-admin-settings Specification

## Purpose
TBD - created by archiving change add-gitea-settings. Update Purpose after archive.
## Requirements
### Requirement: Settings page SHALL be admin-gated

The Settings page (`src/pages/admin/Settings.tsx`) MUST check the current user's role. If `role !== 'admin'`, the page MUST render an "Admin only" notice and MUST NOT render the settings form. The gating pattern MUST mirror the check used in `Dashboard.tsx`.

#### Scenario: Non-admin sees admin-only notice

- **GIVEN** a signed-in user with role `operator`
- **WHEN** the user navigates to the `settings` route
- **THEN** the page SHALL render an "Admin only" notice
- **AND** the settings form SHALL NOT be rendered

#### Scenario: Admin sees the settings form

- **GIVEN** a signed-in user with role `admin`
- **WHEN** the user navigates to the `settings` route
- **THEN** the page SHALL render the Gitea settings form with three fields

### Requirement: Settings form SHALL render three validated fields

The Settings form MUST render three required fields:

| Field | Type | Validation | Help text |
|---|---|---|---|
| Gitea Endpoint URL | text | `^https?://.+$` | "Base URL of your Gitea instance (e.g., https://gitea.example.com)" |
| Owner | text | `^[a-zA-Z0-9_-]+$` | "User or organization under which forms will create repos" |
| Personal Access Token | password (masked) | non-empty | "PAT with `write:repository` scope" |

Field validation regex constants MUST match the server-side `match` validators in `server/src/models/GiteaSettings.ts`.

#### Scenario: Endpoint field rejects non-URL

- **GIVEN** the admin is on the Settings page
- **WHEN** the admin enters `not-a-url` in the Endpoint URL field
- **AND** the admin attempts to save
- **THEN** the field SHALL show a validation error

#### Scenario: Owner field rejects special characters

- **GIVEN** the admin is on the Settings page
- **WHEN** the admin enters `bad owner!!` in the Owner field
- **AND** the admin attempts to save
- **THEN** the field SHALL show a validation error

#### Scenario: Token field is masked

- **GIVEN** the admin is on the Settings page
- **WHEN** the Token field renders
- **THEN** the field input type SHALL be `password`

#### Scenario: All fields are required

- **GIVEN** the admin is on the Settings page
- **WHEN** any of the three fields is left empty
- **AND** the admin attempts to save
- **THEN** the form SHALL show a validation error for the empty field

### Requirement: Settings form SHALL load and save via the API

The Settings page MUST fetch the current settings from `GET /api/itsm/settings?reveal=1` on mount and populate the form fields. On save, the page MUST send `PATCH /api/itsm/settings` with the form values. On success, the page MUST display a success toast. On error, the page MUST display an error toast. The page MUST show a read-only metadata strip displaying `updatedAt` and `updatedBy` from the fetched settings.

#### Scenario: Page loads existing settings

- **GIVEN** the `gitea_settings` collection has a singleton with `endpoint: 'https://gitea.example.com'`, `owner: 'myorg'`
- **WHEN** an admin navigates to the Settings page
- **THEN** the Endpoint URL field SHALL be populated with `https://gitea.example.com`
- **AND** the Owner field SHALL be populated with `myorg`

#### Scenario: Save success shows toast

- **GIVEN** an admin edits the Owner field to `neworg`
- **WHEN** the admin clicks Save
- **AND** the `PATCH /api/itsm/settings` returns `200 OK`
- **THEN** a success toast SHALL appear

#### Scenario: Save error shows error toast

- **GIVEN** an admin edits the Endpoint URL field to an invalid value that passes client validation but fails server validation
- **WHEN** the admin clicks Save
- **AND** the `PATCH /api/itsm/settings` returns `400`
- **THEN** an error toast SHALL appear

#### Scenario: Metadata strip shows last update info

- **GIVEN** the settings were last updated by `maria.costa` at `2026-05-12T14:30:00Z`
- **WHEN** the admin views the Settings page
- **THEN** the page SHALL display the `updatedBy` and `updatedAt` values in a read-only metadata strip
