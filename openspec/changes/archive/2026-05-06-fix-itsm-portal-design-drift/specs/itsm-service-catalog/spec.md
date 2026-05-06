## ADDED Requirements

### Requirement: Catalog tile meta row

Each catalog tile MUST render a `.meta` row below its description containing `<Icons.clock>` and a relative duration string (e.g. "~3 min"). For the three known forms the duration MUST be: `cluster-request` → "~3 min", `namespace-request` → "~30 sec", `scale-request` → "~1 min". For unknown form ids (generic fallback) the meta row MUST render "Self-service · varies".

#### Scenario: cluster tile shows clock and duration

- **WHEN** the Catalog renders the `cluster-request` tile
- **THEN** the tile contains an element with class `meta`
- **AND** the meta element contains the text `~3 min`
- **AND** the meta element contains a clock icon (svg)

### Requirement: Empty state when no active forms exist

When `state.forms.filter(f => f.status === "active").length === 0`, the Catalog MUST render an empty-state block instead of the tile grid: a 32px `<Icons.form>` icon plus the text "No active forms. Create a form in the admin portal to get started.".

#### Scenario: empty state renders when no forms are active

- **GIVEN** `state.forms` is empty (or all entries are `disabled` / `draft`)
- **WHEN** the Catalog renders
- **THEN** an element with text matching "No active forms" is present
- **AND** no `.cat-tile` element is rendered
