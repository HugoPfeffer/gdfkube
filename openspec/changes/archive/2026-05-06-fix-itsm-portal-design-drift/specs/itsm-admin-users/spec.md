## ADDED Requirements

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
