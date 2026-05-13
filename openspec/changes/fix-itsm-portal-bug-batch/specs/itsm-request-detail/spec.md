## MODIFIED Requirements

### Requirement: Seven-stage CDC pipeline visualization

The Request Detail page MUST render a horizontal pipeline visualization with exactly seven stages in the fixed order: Form, MongoDB, Debezium, Kafka, Camel, Git, ArgoCD. Each stage MUST display its label, sub-label, an icon, and a state class (`done`, `active`, `pending`, or `failed`) derived from the request's `status` and `stage`.

The Camel orchestrator MUST advance the request's `stage` field in MongoDB as work progresses through each stage. Specifically: stage 4 (Camel) MUST be written when `RequestRouterRoute` first receives the request from Kafka; stage 5 (Git) MUST be written after the Gitea repo has been successfully created/pushed by `RepoBootstrapRoute`/`GitPushRoute`. Stage updates MUST be monotonic — implementations MUST use a `$max` update on `stage` so out-of-order Kafka events cannot decrement a higher stage to a lower one.

Stage 6 (ArgoCD) MUST NOT be written by this change. ArgoCD integration is deferred to a future spec; until then, ready requests SHALL leave stage 6 in the `active` (animated) state.

#### Scenario: stages reflect current progress

- **GIVEN** request `REQ0010247C` has `status: "provisioning"` and `stage: 4` (Camel)
- **WHEN** the Request Detail page renders
- **THEN** stages 1–4 (Form, MongoDB, Debezium, Kafka) render with class `done`
- **AND** stage 5 (Camel) renders with class `active`
- **AND** stages 6–7 render with class `pending`

#### Scenario: failed stage stops progression

- **GIVEN** request `REQ0010235C` has `status: "failed"` and `stage: 5` (Git push)
- **WHEN** the page renders
- **THEN** stage 5 renders with class `failed`
- **AND** stages 6–7 render with class `pending`

#### Scenario: Camel emits intermediate stage write on receipt

- **GIVEN** an approved request with `stage: 1` lands on the `dbz.gdfkube.requests` Kafka topic
- **WHEN** `RequestRouterRoute` consumes the message
- **THEN** the document's `stage` is updated to 4 via `$max`

#### Scenario: Git push emits stage update

- **GIVEN** `RepoBootstrapRoute`/`GitPushRoute` completes a Gitea push for a request
- **WHEN** the route succeeds
- **THEN** the document's `stage` is updated to 5 via `$max`

#### Scenario: Out-of-order events do not regress stage

- **GIVEN** a document already at `stage: 5`
- **WHEN** a late-arriving event tries to set `stage: 4`
- **THEN** the `$max` update is a no-op and `stage` remains 5

#### Scenario: ArgoCD stage remains pending until that spec lands

- **GIVEN** a request whose Camel pipeline has finished (Gitea repo created) with `stage: 5`
- **WHEN** the Request Detail page renders
- **THEN** stage 6 (ArgoCD) renders with class `active` (animated)
- **AND** no code path in this change writes stage 6
