# itsm-admin-users Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
### Requirement: Users tab and Groups tab

The Users admin page MUST provide two top-level tabs: "Users" listing every user record (columns: avatar, name, username, email, group, role, status), and "Groups" listing every department group (columns: id, display name, user count, form count, mapped Git repo, cluster count).

#### Scenario: users tab renders user table

- **WHEN** the Users admin page renders
- **THEN** the Users tab shows the seeded user rows with the role of each user visible in a `role` column

#### Scenario: groups tab shows departments

- **WHEN** the user opens the Groups tab
- **THEN** rows for `saude`, `educacao`, `transportes`, `fazenda`, `agricultura`, and `seguranca` are present

### Requirement: User search and role filter

The Users tab MUST render a search input that filters the visible users by case-insensitive substring match on `name`, `fullName`, `email`, or `_id`. It MUST also render a role filter accepting one of `{ all, operator, admin }`. The role filter MUST NOT offer `approver` or `service` options.

#### Scenario: search filters by name

- **GIVEN** the search box contains `maria`
- **WHEN** the users table renders
- **THEN** only users whose `name` or `fullName` matches `/maria/i` are shown

#### Scenario: role filter narrows to admins

- **GIVEN** the role filter is set to `admin`
- **WHEN** the table renders
- **THEN** only users with `role === 'admin'` are shown

#### Scenario: role filter has no approver or service options

- **WHEN** the role filter dropdown is opened
- **THEN** the available options are exactly `{ all, operator, admin }`
- **AND** no `approver` or `service` option appears

### Requirement: Per-user editor

Selecting a user row MUST open an editor with inputs for name, username, email, group, role, account status, password (set/change), MFA method, and a recent-sessions list (read-only).

#### Scenario: opening a user shows recent sessions

- **WHEN** the user clicks on `m.costa`
- **THEN** the editor renders inputs for `m.costa`'s name, username, email, group, role
- **AND** a "Recent sessions" list is present

### Requirement: New user page

The Users tab MUST provide a primary "+" button that opens a New User page collecting name, username, email, group, role, account status, MFA, and an optional invite-email toggle. The Create button MUST be disabled until name, username, email, group, and role are non-empty.

#### Scenario: missing fields disables create

- **GIVEN** the New User page is open with empty username
- **WHEN** the user fills only name, email, group, role
- **THEN** the Create button has the `disabled` attribute

### Requirement: Per-group editor and New group page

Selecting a group row MUST open an editor with inputs for id, display name, full name, mapped Git repo (auto-suggested from id), ManagedClusterSet binding, and an auto-provision toggle. A "+" button MUST open a New Group page with the same fields plus a live preview of the Keycloak group, repo, AppProject, and binding to be created.

#### Scenario: git repo auto-suggested from id

- **GIVEN** the New Group page has empty Git repo input
- **WHEN** the user types `cultura` into the id input
- **THEN** the Git repo input is auto-populated with `gdfkube-cultura` (and may still be edited)

### Requirement: UserEditor avatar banner and role/status radio-cards

The UserEditor MUST render at the top a `.user-banner` block containing the user's initials avatar (32px), full name, and `username · email` line. Below the banner, instead of free-text role and status inputs, the editor MUST render role as a row of radio-cards (one per role: operator / approver / admin / service) and status as a radio-card pair (active / disabled). Each card MUST be keyboard activatable (Enter / Space). A "Disable account" red ghost button MUST appear at the bottom of the editor (separate from the status radio); clicking it MUST set status to `disabled` AND show a confirmation toast.

#### Scenario: banner shows fullName and username·email

- **GIVEN** a user `m.costa` with `fullName: "Maria Costa"`, `email: "m.costa@gdf.gov.br"`
- **WHEN** the editor opens
- **THEN** an element with text "Maria Costa" is present at the top of the editor
- **AND** an element with text matching `m.costa · m.costa@gdf.gov.br` is present

#### Scenario: role radio-cards switch role

- **GIVEN** the editor is open for `m.costa` with role `admin`
- **WHEN** the user clicks the radio-card labeled "Approver"
- **THEN** UPDATE_USER is dispatched with `{username: "m.costa", patch: {role: "approver"}}`

### Requirement: NewUserPage role description info banner and Initial credentials section

The NewUserPage MUST render an info banner above the form fields explaining the role choices: "Operator submits requests · Approver reviews and approves · Admin manages forms and users · Service is for automation accounts". Below the form fields, an "Initial credentials" subsection MUST render: a checkbox "Send invite email" (default checked) and a help paragraph "When checked, the user receives an email with a one-time link to set their password.".

#### Scenario: info banner lists all four role descriptions

- **WHEN** the NewUserPage renders
- **THEN** an element with text matching "Operator submits requests" is present
- **AND** elements with text matching "Approver reviews", "Admin manages forms", "Service is for" are also present

### Requirement: NewGroupPage ManagedClusterSet seeded select and resource-creation preview

The NewGroupPage MUST render the ManagedClusterSet input as a `<select>` with seeded options: `default`, `production`, `staging`, `internal`. The "Resources that will be created" preview block MUST list four lines showing the exact identifiers that will be provisioned, in this order:
- `Keycloak group: gdf-{id}`
- `AppProject: {id}-apps`
- `ManagedClusterSetBinding: {selectedManagedClusterSet} → {id}`
- `Git repo: {gitRepo}`

#### Scenario: ManagedClusterSet renders as a select with seeded options

- **WHEN** the NewGroupPage renders
- **THEN** an element of type `<select>` with name `managedClusterSet` is present
- **AND** its options include `default`, `production`, `staging`, `internal`

#### Scenario: preview reflects current id and managedClusterSet

- **GIVEN** the user has typed `cultura` into the id input and selected `staging` for ManagedClusterSet
- **WHEN** the preview block renders
- **THEN** an element with text `Keycloak group: gdf-cultura` is present
- **AND** an element with text `AppProject: cultura-apps` is present
- **AND** an element with text matching `ManagedClusterSetBinding: staging → cultura` is present

