## ADDED Requirements

### Requirement: NewFormPage surfaces create failures via toast

The `NewFormPage` MUST emit an error toast on every rejected `itsmApi.forms.create(...)` call, matching the pattern used by `NewGroupPage` and `NewUserPage`. The catch block in `handleCreate` MUST NOT be empty; in addition to clearing the saving flag, it MUST call `setToast({ variant: 'error', title, body })` with a message that includes either the server error message or the HTTP status. `App.tsx` MUST pass the `setToast` prop to `NewFormPage`.

#### Scenario: Toast appears on create failure

- **GIVEN** the server is unreachable
- **WHEN** an admin clicks Create on the New Form page
- **THEN** an error toast appears via `setToast`
- **AND** the saving spinner clears
- **AND** the form remains populated so the admin can retry

#### Scenario: setToast prop is wired

- **WHEN** `App.tsx` renders `NewFormPage`
- **THEN** the `setToast` prop is passed (same prop already passed to `NewGroupPage`)
