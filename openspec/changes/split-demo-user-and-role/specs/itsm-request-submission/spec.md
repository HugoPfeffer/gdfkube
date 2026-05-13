## ADDED Requirements

### Requirement: Server injects meta.requesterGroupName from the active demo user

When the Express service persists a new request via `POST /api/itsm/requests`, the service SHALL inject `meta.requesterGroupName` set to `req.demoUser.group` into the persisted document, regardless of whether the submitted form body contained a field with that key. The injection SHALL happen alongside the existing `meta.correlationId` initialization in `services/requestService.ts`, and SHALL NOT override any other `meta` field returned by the FormDef-driven body validator. The top-level `requesterGroupName` SHALL continue to be sourced from `req.demoUser.group`.

#### Scenario: meta.requesterGroupName is populated from demoUser.group

- **GIVEN** a request with `X-Demo-User: ana.pereira` whose `DEMO_USERS` entry has `group: 'educ'`
- **AND** the submitted form body for `cluster-request` does NOT contain a `requesterGroupName` field
- **WHEN** the service persists the request
- **THEN** the persisted document SHALL contain top-level `requesterGroupName === 'educ'`
- **AND** `meta.requesterGroupName === 'educ'`
- **AND** `meta.correlationId` SHALL be set
- **AND** all other validator-derived `meta.*` fields (`requestId`, `requesterName`, `requesterFullName`, `requesterEmail`, `requesterRole`, `submittedAt`, `formId`) SHALL be present

#### Scenario: meta.requesterGroupName tracks an X-Demo-Role override

- **GIVEN** a request with `X-Demo-User: ana.pereira` (stored role `operator`, group `educ`) and `X-Demo-Role: admin`
- **WHEN** the service persists the request
- **THEN** `meta.requesterGroupName === 'educ'` (group is unchanged by the role override)
- **AND** `requester.role === 'admin'` (the persisted role reflects the toggled perspective at submission time)

#### Scenario: meta.requesterGroupName is set even when the form body omits the field

- **GIVEN** an updated `cluster-request` FormDef that does NOT declare a `requesterGroupName` field
- **WHEN** the operator submits the form
- **THEN** the FormDef-driven body validator SHALL accept the body
- **AND** the persisted document SHALL still contain `meta.requesterGroupName === req.demoUser.group`

---

## MODIFIED Requirements

### Requirement: Prefix and help-text token interpolation

Text fields MAY declare a `prefix` string and any field MAY declare a `help` string. Both MUST support `{fieldKey}` placeholders that interpolate the live value of a sibling field with that `key`. Interpolation MUST update on every value change.

When the placeholder is `{requesterGroupName}` and no form field with `key: 'requesterGroupName'` exists in the current FormDef's `fields[]`, the interpolator MUST resolve the placeholder from the active demo user's `group` (i.e. `user.group`). This fallback SHALL apply to both `prefix` and `help` strings.

For any other placeholder whose sibling field is absent, the interpolator MUST render the empty string for that placeholder (preserving existing behavior).

#### Scenario: prefix interpolates sibling value

- **GIVEN** a text field `clusterName` with `prefix: "hc-{requesterGroupName}-"` and a sibling field `requesterGroupName` whose current value is `saude`
- **WHEN** the runner renders the prefix chrome
- **THEN** the visible prefix text reads `hc-saude-`

#### Scenario: help text reflects live values

- **GIVEN** a help string `namespace will be hc-{requesterGroupName}-{clusterName}` and current values `requesterGroupName=saude, clusterName=vacinacao`
- **WHEN** the form re-renders after an input change
- **THEN** the rendered help text reads `namespace will be hc-saude-vacinacao`

#### Scenario: prefix falls back to user.group when requesterGroupName field is absent

- **GIVEN** a text field `clusterName` with `prefix: "hc-{requesterGroupName}-"`
- **AND** the FormDef's `fields[]` contains NO field with `key: 'requesterGroupName'`
- **AND** the active demo user's `group` is `educ`
- **WHEN** the runner renders the prefix chrome
- **THEN** the visible prefix text reads `hc-educ-`

#### Scenario: help text falls back to user.group when requesterGroupName field is absent

- **GIVEN** a help string `namespace will be hc-{requesterGroupName}-{clusterName}` and a current value `clusterName=vacinacao`
- **AND** the FormDef's `fields[]` contains NO field with `key: 'requesterGroupName'`
- **AND** the active demo user's `group` is `educ`
- **WHEN** the form renders
- **THEN** the rendered help text reads `namespace will be hc-educ-vacinacao`

#### Scenario: unrelated placeholders preserve empty-string fallback

- **GIVEN** a help string `target cluster: {clusterName}` and the `clusterName` field has no current value
- **WHEN** the form renders
- **THEN** the rendered help text reads `target cluster: ` (empty interpolation)
- **AND** the user-group fallback SHALL NOT be triggered for placeholders other than `{requesterGroupName}`
