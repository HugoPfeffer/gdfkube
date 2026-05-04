## ADDED Requirements

### Requirement: Users tab and Groups tab

The Users admin page MUST provide two top-level tabs: "Users" listing every user record (columns: avatar, name, username, email, group, role, status), and "Groups" listing every department group (columns: id, display name, user count, form count, mapped Git repo, cluster count).

#### Scenario: users tab renders user table

- **WHEN** the Users admin page renders
- **THEN** the Users tab shows the seeded user rows with the role of each user visible in a `role` column

#### Scenario: groups tab shows departments

- **WHEN** the user opens the Groups tab
- **THEN** rows for `saude`, `educacao`, `transportes`, `fazenda`, `agricultura`, and `seguranca` are present

### Requirement: User search and role filter

The Users tab MUST provide a search input filtering by name, username, or email, and a role filter selecting among `operator`, `approver`, `admin`, `service`, or `all`.

#### Scenario: filtering by role narrows table

- **GIVEN** the seed contains users with roles operator and admin
- **WHEN** the user selects role filter `admin`
- **THEN** only rows whose `role === "admin"` appear

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
