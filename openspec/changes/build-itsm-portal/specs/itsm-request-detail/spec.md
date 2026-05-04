## ADDED Requirements

### Requirement: Seven-stage CDC pipeline visualization

The Request Detail page MUST render a horizontal pipeline visualization with exactly seven stages in the fixed order: Form, MongoDB, Debezium, Kafka, Camel, Git, ArgoCD. Each stage MUST display its label, sub-label, an icon, and a state class (`done`, `active`, `pending`, or `failed`) derived from the request's `status` and `stage`.

#### Scenario: stages reflect current progress

- **GIVEN** request `REQ0010247` has `status: "provisioning"` and `stage: 4` (Camel)
- **WHEN** the Request Detail page renders
- **THEN** stages 1–3 (Form, MongoDB, Debezium) render with class `done`
- **AND** stage 4 (Camel) renders with class `active`
- **AND** stages 5–7 render with class `pending`

#### Scenario: failed stage stops progression

- **GIVEN** request `REQ0010235` has `status: "failed"` and `stage: 5` (Git push)
- **WHEN** the page renders
- **THEN** stage 5 renders with class `failed`
- **AND** stages 6–7 render with class `pending`

### Requirement: Pipeline animation responds to tweak

When `status === "provisioning"`, the active stage's animation duration MUST scale inversely with the `pipelineSpeed` tweak value (a higher tweak value MUST visibly accelerate the animation).

#### Scenario: doubling speed halves animation duration

- **GIVEN** the active animation duration is 4s at `pipelineSpeed: 1`
- **WHEN** `pipelineSpeed` is set to `2`
- **THEN** the active animation duration becomes 2s

### Requirement: Request Details, Approvals, Cluster Access panels

The page MUST render three side panels: Request Details (showing `id`, requester, cluster, environment, nodes, submitted timestamp, current status pill), Approvals (the approval chain with each step's actor and decision), and Cluster Access (a kubeconfig download button that is disabled when `status !== "ready"`).

#### Scenario: kubeconfig disabled until ready

- **GIVEN** a request with `status: "provisioning"`
- **WHEN** the Cluster Access panel renders
- **THEN** the kubeconfig download button has the `disabled` attribute

### Requirement: No raw manifests rendered

The Request Detail page MUST NOT render a "Generated Manifests" card or any other view exposing the underlying YAML artifacts written to Git.

#### Scenario: no manifests card present

- **WHEN** the Request Detail page renders for any request
- **THEN** no element with text matching "Generated Manifests" is present in the DOM

### Requirement: No pipeline activity log card

The Request Detail page MUST NOT render a "Pipeline Activity" log card.

#### Scenario: no activity log card

- **WHEN** the page renders
- **THEN** no element with the heading "Pipeline Activity" is present
