# itsm-request-submission Specification

## Purpose
TBD - created by archiving change build-itsm-portal. Update Purpose after archive.
## Requirements
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

### Requirement: Default field values seeded on initial render

GenericRequest MUST seed initial form values from each field's schema on first render: `select` → first parsed option's `value`; `number` → `field.min` if defined else empty; `checkbox` → `false`; `text` / `textarea` → empty string. This MUST run for every field (including non-required ones) so PayloadPreview reflects the schema's intent at first paint.

#### Scenario: select seeds first option

- **GIVEN** the `cluster-request` field `environment` has options `"development | Development | Sandbox | yellow ; staging | Staging | Pre-prod | amber ; production | Production | Live | red"`
- **WHEN** the New Request page renders
- **THEN** the `vars.environment` value in the live preview is `development`

#### Scenario: number seeds field.min

- **GIVEN** the `cluster-request` field `nodes` has `min: 3`
- **WHEN** the form renders
- **THEN** the `vars.nodes` value in the live preview is `3`

### Requirement: Inline error display under invalid fields

When a field has a non-null `validateField(field, value)` result, GenericRequest MUST render the result as a `<small className="field-error">` element directly below the field's input. The text MUST update on every value change. This is independent of Submit-button enablement (the button stays disabled while any error exists; the inline message tells the user *which* field and *why*).

#### Scenario: regex mismatch shows inline error

- **GIVEN** a text field `clusterName` with `validation: "^[a-z][a-z0-9-]{2,30}$"` and current value `"X"`
- **WHEN** the form re-renders
- **THEN** an element with class `field-error` is present below the cluster-name input
- **AND** its text starts with "Invalid format" or "Must match"

### Requirement: env field defaults to development

GenericRequest's submit handler MUST default the request's `env` field to `"development"` when no `environment` field exists in the form schema (current default `"production"` is a demo footgun that produces accidental production requests).

#### Scenario: cluster-request without environment field defaults to development

- **GIVEN** a synthetic form with no `environment` field
- **WHEN** the operator submits the form
- **THEN** the dispatched ADD_REQUEST has `env === "development"`

### Requirement: "What happens next" sidebar narrative

The New Request page MUST render an informational sidebar below PayloadPreview titled "What happens next". For `cluster-request` the sidebar MUST list 6 steps (Submit → MongoDB → Debezium → Kafka → Camel → Git → ArgoCD). For other forms it MUST list 5 steps (omitting MongoDB-Debezium intermediate). The sidebar MUST also render a footer row with `<Icons.shield>` and the text "Routed via Kafka topic dbz.gdfkube.requests".

#### Scenario: cluster-request shows 6 steps and Kafka footer

- **GIVEN** the route is `new-request` with `routeParams.formId === "cluster-request"`
- **WHEN** the page renders
- **THEN** an element with text "What happens next" is present
- **AND** below it 6 numbered steps are rendered
- **AND** an element with text matching "Routed via Kafka topic dbz.gdfkube.requests" is present

