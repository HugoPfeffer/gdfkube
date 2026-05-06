# itsm-admin-forms Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
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

### Requirement: NewFormPage exposes Definition / Fields / Template sub-tabs

The New Form page MUST render the same three sub-tabs as the FormEditor (Definition / Fields / Template) so the operator can author all three slices before clicking Create. The Fields sub-tab MUST allow adding draft fields (with the same type-aware Validation/options control). The Template sub-tab MUST allow creating draft template files. On Create, ALL drafts MUST be persisted along with the form: dispatch ADD_FORM, then dispatch UPDATE_FIELD for each draft field, then dispatch UPDATE_TEMPLATES for the draft templates.

#### Scenario: New Form page lands on Definition

- **WHEN** the user navigates to the New Form page
- **THEN** the Definition sub-tab is active

#### Scenario: drafts persist on Create

- **GIVEN** the user has filled Definition (id="newform", name="New Form"), added 2 draft fields on the Fields sub-tab, and added 1 draft template file on the Template sub-tab
- **WHEN** the user clicks Create
- **THEN** `state.forms` contains an entry with `id: "newform"`
- **AND** `state.fields["newform"]` contains exactly 2 entries
- **AND** `state.templates["newform"]` contains exactly 1 entry

### Requirement: FormsTable Submissions column

The Forms admin tab table MUST render a "Submissions" column showing each form's `submissions` count. The column MUST sort numerically when clicked.

#### Scenario: submissions column shows seed value

- **GIVEN** the form `cluster-request` has `submissions: 12` in seed data
- **WHEN** the Forms tab renders
- **THEN** the row for `cluster-request` shows the cell `12` under the "Submissions" header

### Requirement: FormEditor Reload-from-Git and Save buttons

The FormEditor header MUST render two buttons to the right of the back link: a ghost "Reload from Git" button and a primary "Save changes" button. Both are decorative for the demo: clicking either MUST trigger an info toast ("Reloaded from Git (demo)" / "Saved (demo)") without mutating data — UPDATE_FORM and UPDATE_FIELD continue to fire on individual field/definition edits as today.

#### Scenario: Save button shows demo toast

- **GIVEN** the FormEditor is open for `cluster-request`
- **WHEN** the user clicks the "Save changes" button
- **THEN** a toast titled "Saved (demo)" is rendered

### Requirement: FieldsTable Add field affordance and MongoDB shape preview

The FieldsTable MUST render an "Add field" button at the bottom of the table. Clicking it MUST append a new field with synthesized id (`field-${Date.now()}`), key="newField", label="New field", type="text", bucket="vars", required=false, and immediately enter edit mode for that row. Below the table the FieldsTable MUST render a "MongoDB document shape (preview)" block containing a `<pre>` element that shows the JSON shape of `{vars, meta}` derived from the current field set.

#### Scenario: clicking Add field adds an editable row

- **GIVEN** the cluster-request form has 4 fields
- **WHEN** the user clicks "Add field"
- **THEN** the table has 5 rows
- **AND** the new row is in edit mode (its inputs are visible)

#### Scenario: MongoDB shape preview reflects field set

- **WHEN** the FieldsTable for `cluster-request` renders
- **THEN** an element with text "MongoDB document shape" is present
- **AND** below it a `<pre>` element contains the substring `"clusterName"` (one of the seeded field keys)

### Requirement: TemplateEditor tab strip layout and button alignment

The TemplateEditor's `.template-tabs` container MUST be styled purely via CSS (flexbox with `border-bottom`, `flex-wrap`) — it MUST NOT use inline styles for `display`, `borderBottom`, or `flexWrap`. The "+ Add manifest" button inside the tab strip MUST be vertically centered via `.template-tabs > .btn { align-self: center; }`.

#### Scenario: template-tabs has no inline styles

- **WHEN** the TemplateEditor renders its tab strip (`role="tablist"`)
- **THEN** the element has no `style` attribute for display, border, or flex-wrap properties
- **AND** the tab strip's layout comes from its `.template-tabs` CSS class

### Requirement: TemplateEditor Camel/Git info banner, line counter, Download all

The TemplateEditor MUST render an info banner above the file tabs reading "Templates are reconciled by Camel and committed to Git on approval." The active file's editor MUST display a line-count caption to the right of the file's name (e.g. "37 lines"). A "Download all" ghost button MUST be present in the editor header that triggers a synthesized blob download of all the form's templates as a single text file with `--- {filename} ---` separators.

#### Scenario: info banner present

- **WHEN** the TemplateEditor for `cluster-request` renders
- **THEN** an element with text matching "reconciled by Camel" is present above the file tabs

#### Scenario: line counter updates with content

- **GIVEN** the active template file has 37 newline characters
- **WHEN** the editor renders
- **THEN** an element with text matching `38 lines` is present near the file tab (count is `\n.length + 1`)

### Requirement: AvailableVariablesPanel grid layout and copy feedback

The variables panel's `.var-row` elements MUST use CSS Grid layout (`grid-template-columns: 1fr auto`) so that the copy button sits inline to the right of the variable token and description. When the user clicks the copy button, the button MUST provide visual feedback by switching its icon to a checkmark character ("✓") with a `.copied` class (triggering `color: var(--green-600)`) for approximately 1200ms before reverting to the default copy icon ("⧉").

#### Scenario: copy button shows checkmark feedback

- **GIVEN** the AvailableVariablesPanel is visible with a variable `{{ vars.clusterName }}`
- **WHEN** the user clicks the copy button for that variable
- **THEN** the button text changes to "✓" and the button has class `copied`
- **AND** after ~1200ms the button reverts to "⧉" without the `copied` class

#### Scenario: var-row uses grid layout

- **WHEN** the AvailableVariablesPanel renders variable rows
- **THEN** each `.var-row` element uses CSS Grid with the copy button in a fixed-width column to the right

