## MODIFIED Requirements

### Requirement: Per-group editor and New group page

Selecting a group row MUST open an editor with inputs for id, display name, full name, and mapped Git repo. A "+" button MUST open a New Group page with the same fields (with the Git repo input auto-suggested from id, editable to override) plus a live preview of the repo, AppProject, and ManagedClusterSetBinding to be created.

#### Scenario: git repo auto-suggested from id

- **GIVEN** the New Group page has empty Git repo input
- **WHEN** the user types `cultura` into the Display name input
- **THEN** the Git repo input is auto-populated with `gdfkube-cultura` (and may still be edited)

#### Scenario: editor renders only the four persisted fields

- **WHEN** the GroupEditor opens for an existing group
- **THEN** inputs for id (read-only), display name, full name, and Git repo are present
- **AND** no input labeled "ManagedClusterSet binding" is present
- **AND** no input or toggle labeled "Auto-provision" is present

---

### Requirement: NewGroupPage resource-creation preview

The "Resources that will be created" preview block on the NewGroupPage MUST list three lines showing the exact identifiers that will be provisioned downstream by the Camel automation, in this order:
- `AppProject: {id}-apps`
- `ManagedClusterSetBinding: {id} → {id}`
- `Git repo: {gitRepo}`

The NewGroupPage MUST NOT render a `Keycloak group` line in the preview, because the backend does not provision Keycloak. The NewGroupPage MUST NOT render a ManagedClusterSet `<select>` input — the binding ClusterSet is derived from the group id and is not user-selectable.

#### Scenario: preview reflects current id

- **GIVEN** the user has typed `cultura` into the Display name input
- **WHEN** the preview block renders
- **THEN** an element with text `AppProject: cultura-apps` is present
- **AND** an element with text matching `ManagedClusterSetBinding: cultura → cultura` is present
- **AND** an element with text `Git repo: gdfkube-cultura` is present
- **AND** no element contains text matching `Keycloak group`

#### Scenario: preview contains exactly three list items

- **WHEN** the NewGroupPage renders with any non-empty Display name input
- **THEN** the preview block (`data-testid="group-preview"`) contains exactly three `<li>` children

#### Scenario: no ManagedClusterSet select rendered

- **WHEN** the NewGroupPage renders
- **THEN** no element of type `<select>` with name `managedClusterSet` is present
- **AND** no input labeled "Auto-provision" is present
