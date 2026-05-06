## ADDED Requirements

### Requirement: Forms list and global Form Fields view

The Forms admin page MUST provide two top-level tabs: "Forms" listing every entry in `GDF_ADMIN_DATA.forms` (columns: name, id, topic, fields count, status, last edited), and "Form Fields" showing every field across all forms with columns key, label, type, bucket, required, validation/options.

#### Scenario: forms tab lists active and disabled

- **WHEN** the Forms admin page renders the Forms tab
- **THEN** every entry in `GDF_ADMIN_DATA.forms` appears as a row regardless of its `status`

#### Scenario: form fields tab is global

- **WHEN** the user opens the Form Fields tab
- **THEN** the table includes fields aggregated from `GDF_ADMIN_DATA.fields` for every form id

### Requirement: No standalone "New field" button

The Form Fields global tab MUST NOT render a button that creates a new field. Field creation MUST live only inside a per-form editor's Fields sub-tab.

#### Scenario: no global new field button

- **WHEN** the Form Fields tab renders
- **THEN** no button with the text "New field" is present in the page header or in the filter row

### Requirement: Per-form editor with three sub-tabs

Selecting a form row MUST open a per-form editor with sub-tabs Definition (display name, kafka topic, description, status toggle), Fields (editable list of fields with drag handles), and Template (multi-file YAML editor).

#### Scenario: opening a form lands on Definition

- **WHEN** the user clicks the row for `cluster-request`
- **THEN** the editor opens with the Definition sub-tab active
- **AND** the form's display name, topic, and description are populated in inputs

### Requirement: Drag-and-drop field reordering

The Fields sub-tab MUST allow drag-and-drop reordering of fields via a `⋮⋮` handle. Dragging MUST visually dim the dragged row to 50% opacity and MUST highlight the drop target with a 2px civic-blue border indicating insertion position.

#### Scenario: drag from index 2 to 0 reorders

- **GIVEN** fields ordered `[clusterName, environment, nodes, requesterGroupName]`
- **WHEN** the user drags `nodes` (index 2) and drops above `clusterName`
- **THEN** the new order is `[nodes, clusterName, environment, requesterGroupName]`

### Requirement: Type-aware Validation/options control

The "Validation / options" cell on the Fields editor MUST render a control that depends on the field's `type`: a regex text input for `text`/`textarea`, paired `min`/`max` numeric inputs for `number`, a comma- or semicolon-separated `options` text input for `select`, and a "n/a" placeholder for `checkbox`.

#### Scenario: select shows options input

- **GIVEN** a field with `type: "select"`
- **WHEN** the row is in edit mode
- **THEN** the Validation/options cell renders a text input editing the field's `options` string

#### Scenario: number shows min/max

- **GIVEN** a field with `type: "number"`
- **WHEN** the row is in edit mode
- **THEN** the cell renders two numeric inputs bound to `min` and `max`

### Requirement: Advanced editing row for displayAs, prefix, help

While a field row is in edit mode, an advanced sub-row MUST be rendered exposing `displayAs` (Dropdown / Radio cards) for select fields, `prefix` for text fields, and `help` for any field type. The `displayAs` toggle MUST update the runtime rendering of the corresponding form on the consumer page.

#### Scenario: prefix value persists to runtime

- **GIVEN** the admin sets `prefix: "hc-{requesterGroupName}-"` on the `clusterName` field
- **WHEN** the operator opens the OpenShift Cluster request page
- **THEN** the cluster name input renders the prefix `hc-{requesterGroupName}-` (interpolated against the current value)

### Requirement: Multi-file YAML template editor

The Template sub-tab MUST allow each form to declare multiple YAML files. The user MUST be able to switch between files via inner tabs, rename files, add new files, and remove individual files. Each file's content MUST be edited in a YAML text area. A "Rendered preview" toggle MUST substitute placeholder values into `{{ bucket.key }}` tokens for the active file only.

#### Scenario: add and rename a template file

- **GIVEN** the Template tab is open with files `[hostedcluster.yaml, applicationset.yaml]`
- **WHEN** the user adds a file and renames it to `nodepool.yaml`
- **THEN** the form's template list contains three files including `nodepool.yaml`

### Requirement: Available variables panel with System group

The Template sub-tab MUST render a side panel listing all variables available to templates. It MUST contain a "System · auto-injected" group at the top listing `meta.requestId`, `meta.correlationId`, `meta.requesterName`, `meta.requesterFullName`, `meta.requesterEmail`, `meta.requesterRole`, `meta.submittedAt`, `meta.formId`, followed by a "From form fields" group derived from the form's user-defined fields. Each variable row MUST be clickable and a copy button MUST copy the `{{ bucket.key }}` token to the clipboard.

#### Scenario: clicking copy writes token to clipboard

- **GIVEN** the variable `meta.requestId` is listed in the System group
- **WHEN** the user clicks its copy button
- **THEN** the clipboard's text content is `{{ meta.requestId }}`

### Requirement: Clipboard fallback for sandboxed environments

The clipboard write MUST first attempt `navigator.clipboard.writeText` and, on rejection or unavailability, MUST fall back to a hidden textarea + `document.execCommand('copy')` so that copy works inside sandboxed iframes.

#### Scenario: navigator.clipboard rejected falls back

- **GIVEN** `navigator.clipboard.writeText` rejects with a permission error
- **WHEN** the copy helper is invoked with token `{{ vars.clusterName }}`
- **THEN** the helper completes without throwing
- **AND** the document selection contains the token (verifying the textarea path executed)

### Requirement: Create form persists into the registry

Clicking Create on the New Form page MUST push a new entry into `GDF_ADMIN_DATA.forms` (with today's date and `submissions: 0`), copy the page's defined fields into `GDF_ADMIN_DATA.fields[<id>]`, and return the user to the Forms list. The Create button MUST be disabled when the form id or display name is empty, or when the id collides with an existing form id; in that case the Form ID input MUST display an inline collision error.

#### Scenario: id collision blocks create

- **GIVEN** `GDF_ADMIN_DATA.forms` already contains a form with `id: "cluster-request"`
- **WHEN** the user types `cluster-request` into the New Form page's id input
- **THEN** the Create button is disabled
- **AND** the Form ID input renders an inline collision error message
