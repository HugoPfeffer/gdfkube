## ADDED Requirements

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

---

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

---

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

---

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

---

## MODIFIED Requirements

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
