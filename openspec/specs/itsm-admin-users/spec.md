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

### Requirement: UserEditor Save body includes fullName and active

The `UserEditor` component MUST include `fullName` and `active` in the PATCH body sent by `handleSave` whenever those fields are dirty relative to the loaded user. `fullName` MUST default to `user.fullName ?? user.name` when the input is unset; `active` MUST be derived from the status radio as `(status ?? 'active') === 'active'`. The `isDirty` predicate MUST track changes to `fullName` so the Save button enables when only the Full name input is edited.

#### Scenario: Save persists fullName

- **GIVEN** an admin opens the editor for user `m.costa` and edits the Full name input from `"Maria Costa"` to `"Maria S. Costa"`
- **WHEN** the admin clicks Save
- **THEN** `itsmApi.users.update` is called with a body that contains `fullName: "Maria S. Costa"`
- **AND** the persisted document reflects the new `fullName` after a page refresh

#### Scenario: Save sends active flag derived from status

- **GIVEN** an admin opens the editor and toggles the status radio to `disabled`
- **WHEN** the admin clicks Save
- **THEN** the PATCH body contains `active: false`
- **AND** the PATCH body also contains `status: "disabled"`

#### Scenario: Save button enables when only fullName is edited

- **GIVEN** an admin opens the editor with no other changes
- **WHEN** the admin types in the Full name input
- **THEN** the Save button is enabled

### Requirement: Admin editors capture server response on Save

Both `UserEditor` and `GroupEditor` MUST capture the JSON document returned by `itsmApi.<entity>.update(...)`, MUST dispatch a reducer action with that document as the patch (`UPDATE_USER` / `UPDATE_GROUP`), and MUST seed the editor's "saved" baseline from the spread `{ ...local, ...updated }` so that server-side normalization (trim, role-enum constraints, derived fields) propagates to the UI without an extra round-trip.

#### Scenario: UserEditor dispatches the server response

- **GIVEN** an admin saves changes to a user
- **AND** the server returns `{ _id, name, fullName, ... }` with `fullName` trimmed
- **WHEN** the Save promise resolves
- **THEN** the reducer receives `UPDATE_USER` with `patch` equal to the server response
- **AND** the editor's local state reflects the trimmed `fullName`

#### Scenario: GroupEditor dispatches the server response

- **GIVEN** an admin saves changes to a group
- **AND** the server returns the updated group document
- **WHEN** the Save promise resolves
- **THEN** the reducer receives `UPDATE_GROUP` with `patch` equal to the server response
- **AND** the editor's local state is `{ ...localBeforeSave, ...serverResponse }`

### Requirement: NewUserPage surfaces create failures via toast

The `NewUserPage` MUST emit a toast (variant `error`) on every rejected `itsmApi.users.create(...)` call, matching the pattern already used by `NewGroupPage`. The catch block MUST NOT be empty; in addition to clearing the saving flag, it MUST call `setToast({ variant: 'error', title: ..., body: ... })` with a message that includes either the server error message or the HTTP status. `App.tsx` MUST pass the `setToast` prop to `NewUserPage`.

#### Scenario: Toast appears on create failure

- **GIVEN** the server is unreachable
- **WHEN** an admin clicks Create on the New User page
- **THEN** an error toast appears
- **AND** the saving spinner clears
- **AND** the form remains populated so the admin can retry

#### Scenario: setToast prop is wired

- **WHEN** `App.tsx` renders `NewUserPage`
- **THEN** the `setToast` prop is passed (same prop already passed to `NewGroupPage`)

### Requirement: NewGroupPage uses server response as authoritative

After a successful `itsmApi.groups.create(...)` call, `NewGroupPage` MUST seed the reducer dispatch from the server response directly. It MUST NOT use a `created.<field> ?? local.<field>` fallback chain. If a field is missing from the server response, the next `Bootstrap` refresh reconciles; the page MUST NOT paper over the gap with the locally-entered value.

#### Scenario: Reducer receives server response directly

- **WHEN** an admin creates a group `{ _id: 'cultura', name: 'Cultura', repo: 'gdfkube-cultura' }`
- **AND** the server returns `{ _id: 'cultura', name: 'Cultura', repo: 'gdfkube-cultura', users: [], forms: [] }`
- **THEN** the `ADD_GROUP` dispatch contains the server response verbatim (not merged with local guesses)

#### Scenario: Missing field is not papered over

- **WHEN** the server response omits `repo`
- **THEN** the dispatched group has `repo` undefined (or absent)
- **AND** the next Bootstrap refresh reconciles the persisted shape

### Requirement: New user page

The Users tab MUST provide a primary "+" button that opens a New User page collecting name, username, email, group, role, account status, MFA, and an optional invite-email toggle. The Create button MUST be disabled until name, username, email, group, and role are non-empty. When `itsmApi.users.create(...)` rejects, the page MUST emit an error toast via the `setToast` prop and MUST NOT silently clear the saving flag.

#### Scenario: missing fields disables create

- **GIVEN** the New User page is open with empty username
- **WHEN** the user fills only name, email, group, role
- **THEN** the Create button has the `disabled` attribute

#### Scenario: rejected create surfaces an error toast

- **GIVEN** the New User page form is valid
- **AND** `itsmApi.users.create` is mocked to reject
- **WHEN** the admin clicks Create
- **THEN** `setToast` is invoked with `variant: 'error'` and a non-empty title

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

