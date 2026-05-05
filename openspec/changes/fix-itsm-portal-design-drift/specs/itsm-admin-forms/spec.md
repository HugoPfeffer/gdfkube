## ADDED Requirements

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

### Requirement: TemplateEditor Camel/Git info banner, line counter, Download all

The TemplateEditor MUST render an info banner above the file tabs reading "Templates are reconciled by Camel and committed to Git on approval." The active file's editor MUST display a line-count caption to the right of the file's name (e.g. "37 lines"). A "Download all" ghost button MUST be present in the editor header that triggers a synthesized blob download of all the form's templates as a single text file with `--- {filename} ---` separators.

#### Scenario: info banner present

- **WHEN** the TemplateEditor for `cluster-request` renders
- **THEN** an element with text matching "reconciled by Camel" is present above the file tabs

#### Scenario: line counter updates with content

- **GIVEN** the active template file has 37 newline characters
- **WHEN** the editor renders
- **THEN** an element with text matching `38 lines` is present near the file tab (count is `\n.length + 1`)
