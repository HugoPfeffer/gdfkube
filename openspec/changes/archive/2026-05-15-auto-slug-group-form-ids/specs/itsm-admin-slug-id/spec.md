## ADDED Requirements

### Requirement: Group ID SHALL be auto-derived from Display name on create

On `NewGroupPage`, the Group ID input MUST be `disabled` and `readOnly`. Its value MUST equal `slugify(displayName)` for the current Display name input, recomputed on every Display name change. The user MUST NOT be able to type into or otherwise edit the ID input directly.

#### Scenario: typing into Display name updates the read-only ID input
- **GIVEN** the user has opened the New Group page
- **WHEN** the user types `Min. da fazenda` into the Display name input
- **THEN** the read-only ID input renders `min-da-fazenda`

#### Scenario: Display name with Portuguese diacritics folds to ASCII
- **GIVEN** the user has opened the New Group page
- **WHEN** the user types `Educação` into the Display name input
- **THEN** the read-only ID input renders `educacao`

#### Scenario: ID input is not user-editable
- **GIVEN** the user has opened the New Group page and typed `Cultura` into Display name
- **WHEN** the user attempts to focus and type into the ID input
- **THEN** the ID input remains `disabled` / `readOnly` and its value continues to track `slugify(displayName)`

---

### Requirement: Form ID SHALL be auto-derived from Display name on create

On `NewFormPage`, the Form ID input MUST be `disabled` and `readOnly`. Its value MUST equal `slugify(displayName)` for the current Display name input. The pre-existing form-id collision detection MUST continue to compare the derived slug against `forms.some((f) => f.id === id)` and render the existing inline collision banner when a match is found.

#### Scenario: typing into Display name updates the read-only Form ID input
- **GIVEN** the user has opened the New Form page
- **WHEN** the user types `Solicitação de Acesso` into the Display name input
- **THEN** the read-only Form ID input renders `solicitacao-de-acesso`

#### Scenario: derived slug collides with an existing form
- **GIVEN** the seeded forms list contains a form with id `cultura`
- **AND** the user has opened the New Form page
- **WHEN** the user types `Cultura` into the Display name input
- **THEN** the read-only Form ID input renders `cultura`
- **AND** the existing collision banner ("A form with id 'cultura' already exists.") is shown
- **AND** the `Create` button is disabled

---

### Requirement: Empty derived slug SHALL disable the Create action

The `Create` button on `NewGroupPage` and `NewFormPage` MUST be disabled whenever `slugify(displayName) === ''`. The SPA MUST NOT POST to `/api/itsm/groups` or `/api/itsm/forms` with an empty `_id`. No inline error message SHALL be rendered solely for the empty-slug condition; the disabled state plus the empty ID input field together communicate it.

#### Scenario: only punctuation entered in Display name
- **GIVEN** the user has opened the New Group page
- **WHEN** the user types `...` into the Display name input
- **THEN** the read-only ID input renders the empty string
- **AND** the `Create group` button is disabled
- **AND** no inline error message is rendered for this condition

#### Scenario: only whitespace entered in Display name
- **GIVEN** the user has opened the New Form page
- **WHEN** the user types `   ` (three spaces) into the Display name input
- **THEN** the read-only Form ID input renders the empty string
- **AND** the `Create` button is disabled

---

### Requirement: slugify utility SHALL produce DNS-1123-compatible IDs

A shared utility `slugify(input: string): string` MUST be exported from `src/utils/slug.ts`. It SHALL fold Unicode diacritics via NFD-normalize plus combining-mark strip, lowercase the result, collapse any run of non-alphanumeric characters into a single hyphen, and trim leading/trailing hyphens. For any non-empty output, the result MUST match the exported `SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/`. The function MUST be idempotent: `slugify(slugify(x)) === slugify(x)` for all inputs.

#### Scenario: collapsing runs of mixed punctuation
- **WHEN** `slugify('Sec. Educ.')` is called
- **THEN** it returns `sec-educ`

#### Scenario: leading and trailing punctuation is trimmed
- **WHEN** `slugify('  -- Cultura --  ')` is called
- **THEN** it returns `cultura`

#### Scenario: empty and all-punctuation inputs return empty string
- **WHEN** `slugify('')` or `slugify('...')` is called
- **THEN** it returns the empty string

#### Scenario: output conforms to SLUG_REGEX
- **WHEN** `slugify` returns any non-empty string
- **THEN** `SLUG_REGEX.test(result)` is `true`

#### Scenario: slugify is idempotent
- **GIVEN** `s1 = slugify(input)` for any input
- **WHEN** `s2 = slugify(s1)` is computed
- **THEN** `s2 === s1`

---

### Requirement: Group Edit form ID input SHALL remain read-only

On `GroupEditor`, the ID input MUST continue to render as `disabled readOnly` showing the persisted `group.id`. This change MUST NOT regress that behavior. No re-keying of an existing group is permitted via the UI.

#### Scenario: opening an existing group for edit
- **GIVEN** a group with id `saude` exists
- **WHEN** the user opens it in `GroupEditor`
- **THEN** the ID input renders `saude` and is `disabled` / `readOnly`
- **AND** the user cannot edit the ID
