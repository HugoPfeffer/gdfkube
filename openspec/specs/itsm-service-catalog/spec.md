# itsm-service-catalog Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
### Requirement: Catalog tiles are sourced from the active forms registry

The Service Catalog page MUST render one tile per form in `GDF_ADMIN_DATA.forms` whose `status` is `active`. Tiles MUST NOT include forms with status `disabled` or `draft`. The tile for `cluster-request` MUST be marked as featured.

#### Scenario: disabled form does not render a tile

- **GIVEN** `GDF_ADMIN_DATA.forms` contains a form with `id: "namespace-request"` and `status: "disabled"`
- **WHEN** the Catalog renders
- **THEN** no tile with the title "Namespace Onboarding" is present

#### Scenario: cluster-request tile is featured

- **GIVEN** the `cluster-request` form is `active`
- **WHEN** the Catalog renders
- **THEN** its tile renders with the `featured` modifier class

### Requirement: Tile click routes to NewRequest with formId

Each catalog tile MUST be clickable and MUST navigate to the `new-request` route, passing the form's `id` as `routeParams.formId`.

#### Scenario: clicking the namespace tile passes formId

- **GIVEN** the Catalog displays an active "Namespace Onboarding" tile (formId `namespace-request`)
- **WHEN** the user clicks the tile
- **THEN** the active route is `new-request`
- **AND** `routeParams.formId === "namespace-request"`

### Requirement: Unknown form ids fall back to a generic icon and description

A catalog tile for a form whose `id` is not present in the per-id icon/description lookup MUST render with a generic icon and a generic descriptive copy derived from the form's `name` field.

#### Scenario: new form added in admin appears with generic chrome

- **GIVEN** an admin creates a form with `id: "secret-rotation-v2"` and `name: "Secret Rotation v2"`
- **WHEN** the Catalog re-renders
- **THEN** a tile titled "Secret Rotation v2" appears with the generic catalog icon
- **AND** clicking the tile routes to `new-request` with `formId: "secret-rotation-v2"`

### Requirement: No filter chips and no Knowledge Base section

The Catalog MUST NOT render category filter chips and MUST NOT render a "Knowledge Base" panel.

#### Scenario: chips and KB are absent

- **WHEN** the Catalog renders
- **THEN** no element with the role of filter chip is present
- **AND** no element with text "Knowledge Base" is present

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

