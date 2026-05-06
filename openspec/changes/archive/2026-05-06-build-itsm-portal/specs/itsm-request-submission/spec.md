## ADDED Requirements

### Requirement: Single generic dynamic form runner

The New Request page MUST render every form, including `cluster-request`, through one generic runner that reads field definitions from `GDF_ADMIN_DATA.fields[<formId>]`. The runner MUST NOT contain bespoke per-form components; visual variants MUST be expressed solely via field-schema properties.

#### Scenario: cluster-request renders through the generic runner

- **GIVEN** the route is `new-request` with `routeParams.formId = "cluster-request"`
- **WHEN** the page renders
- **THEN** all rendered fields originate from `GDF_ADMIN_DATA.fields["cluster-request"]`
- **AND** no component named `ClusterRequest` exists in the rendered tree

### Requirement: Rich select option grammar

For fields of type `select`, the runner MUST parse the `options` string by splitting on `;` when present, otherwise on `,`. Each option MUST be parsed as `value | label | description | dotColor` (last three optional, separated by `|`). When only `value` is provided the label MUST default to the value.

#### Scenario: pipe-separated option with description and dot color

- **GIVEN** a select field with `options: "production | Production | Live traffic, fully governed | red"`
- **WHEN** the runner parses the options
- **THEN** the resulting option has `value === "production"`, `label === "Production"`, `description === "Live traffic, fully governed"`, and `dotColor === "red"`

#### Scenario: comma fallback for plain lists

- **GIVEN** a select field with `options: "saude, educacao, transportes"`
- **WHEN** the runner parses the options
- **THEN** the result is three options with values `saude`, `educacao`, `transportes` and labels matching their values

### Requirement: Radio-cards display variant for select fields

When a select field has `displayAs: "radio-cards"`, the runner MUST render the field as a row of radio-card components, each showing the option's label, optional description, and an optional colored dot when `dotColor` is provided.

#### Scenario: environment renders as radio cards

- **GIVEN** the `environment` field has `type: "select"` and `displayAs: "radio-cards"` with three options including dotColor values
- **WHEN** the runner renders the field
- **THEN** three radio-card elements are present
- **AND** each card displays a colored dot matching its `dotColor`

### Requirement: Prefix and help-text token interpolation

Text fields MAY declare a `prefix` string and any field MAY declare a `help` string. Both MUST support `{fieldKey}` placeholders that interpolate the live value of a sibling field with that `key`. Interpolation MUST update on every value change.

#### Scenario: prefix interpolates sibling value

- **GIVEN** a text field `clusterName` with `prefix: "hc-{requesterGroupName}-"` and a sibling field `requesterGroupName` whose current value is `saude`
- **WHEN** the runner renders the prefix chrome
- **THEN** the visible prefix text reads `hc-saude-`

#### Scenario: help text reflects live values

- **GIVEN** a help string `namespace will be hc-{requesterGroupName}-{clusterName}` and current values `requesterGroupName=saude, clusterName=vacinacao`
- **WHEN** the form re-renders after an input change
- **THEN** the rendered help text reads `namespace will be hc-saude-vacinacao`

### Requirement: Submit button validation

The Submit button MUST be disabled until every field with `required: true` has a non-empty value, every text field whose `validation` looks like a regex (starts with `^` and ends with `$`) matches its current value, and every number field's value is within `[min, max]` if provided.

#### Scenario: missing required field disables submit

- **GIVEN** a required field `clusterName` with an empty value
- **WHEN** the form renders
- **THEN** the Submit button has the `disabled` attribute

### Requirement: Submission creates a request with status approval

On Submit, the runner MUST push a new entry into `GDF_DATA.REQUESTS` with `status: "approval"`, `stage: 0`, populated `meta` (including `requestId`, `correlationId`, `requesterName`, `requesterFullName`, `requesterEmail`, `requesterRole`, `submittedAt`, `formId`) and `vars` payloads, a non-empty `justification` if provided, and at least one `policyChecks` entry. The runner MUST then navigate to the `request-detail` route with the new id and trigger the "Request submitted for approval" toast.

#### Scenario: submission lands at approval status

- **GIVEN** the operator fills the cluster-request form
- **WHEN** they click Submit
- **THEN** a new entry exists in `GDF_DATA.REQUESTS` whose `status === "approval"`
- **AND** the active route is `request-detail` for the new id
- **AND** an info toast titled "Request submitted for approval" is rendered

### Requirement: Live payload preview

The runner MUST render a side panel showing a live JSON preview of the `meta` and `vars` objects that will be submitted. The preview MUST update on every input change.

#### Scenario: editing field updates preview

- **GIVEN** the JSON preview shows `vars.clusterName: ""`
- **WHEN** the user types `vacinacao` into the cluster name input
- **THEN** the preview updates to show `vars.clusterName: "vacinacao"`
