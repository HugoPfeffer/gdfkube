## ADDED Requirements

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
