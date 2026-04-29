<!-- SPEC: score-workload-spec | CAP-002 -->

## ADDED Requirements

### Requirement: REQ-002-01 Node app Score spec

A file `gdfkube-src/score.node.yaml` SHALL exist conforming to Score `apiVersion: score.dev/v1b1`, declaring `metadata.name: gdfkube-node`, a single `containers.app` with `image: nginxinc/nginx-unprivileged:1.27`, and an `app.variables:` block that publishes `MONGO_URI`, `GITEA_URL`, `GITEA_TOKEN` derived from `${resources.mongo.*}` and `${resources.gitea.*}`. The spec MUST declare `resources.mongo` (type `mongodb`) and `resources.gitea` (type `gitea`) and a `service.ports.http` mapping to container port `8080`.

#### Scenario: SCN-002-01-01 score.node.yaml validates and renders

- **GIVEN** `gdfkube-src/score.node.yaml` exists at the Phase 0 acceptance commit
- **WHEN** `score-compose generate -f score.node.yaml -f score-compose.yaml -o /tmp/c.yaml` runs from `gdfkube-src/`
- **THEN** the command MUST exit 0, `/tmp/c.yaml` MUST contain a service whose `environment` block sets `MONGO_URI`, `GITEA_URL`, and `GITEA_TOKEN`, and the service MUST publish container port `8080`

#### Scenario: SCN-002-01-02 Missing required resource fails

- **GIVEN** a developer removes the `resources.mongo` block from `score.node.yaml`
- **WHEN** `task test:parity` runs
- **THEN** `score-compose generate` MUST exit non-zero, stderr MUST contain a reference to the unresolved `${resources.mongo.host}` placeholder, and `task test:parity` MUST propagate the non-zero exit

### Requirement: REQ-002-02 Camel consumer Score spec

A file `gdfkube-src/score.camel.yaml` SHALL exist conforming to Score `apiVersion: score.dev/v1b1`, declaring `metadata.name: gdfkube-camel`, a single `containers.app` with `image: quay.io/quarkus/quarkus-micro-image:2.0`, and an `app.variables:` block that publishes `KAFKA_BOOTSTRAP_SERVERS`, `GITEA_URL`, `GITEA_TOKEN` derived from `${resources.kafka.*}` and `${resources.gitea.*}`. The spec MUST declare `resources.kafka` (type `kafka`) and `resources.gitea` (type `gitea`).

#### Scenario: SCN-002-02-01 score.camel.yaml validates and renders

- **GIVEN** `gdfkube-src/score.camel.yaml` exists at the Phase 0 acceptance commit
- **WHEN** `score-helm generate -f score.camel.yaml -o /tmp/h` runs from `gdfkube-src/`
- **THEN** the command MUST exit 0 and `/tmp/h/templates/deployment.yaml` MUST contain `env` entries for `KAFKA_BOOTSTRAP_SERVERS`, `GITEA_URL`, and `GITEA_TOKEN`

#### Scenario: SCN-002-02-02 Camel image not pinned fails parity

- **GIVEN** `score.camel.yaml` declares `image: latest` instead of the pinned tag
- **WHEN** `./scripts/score-parity.sh` runs
- **THEN** the script MUST exit non-zero and stderr MUST cite the unpinned image tag

### Requirement: REQ-002-03 Env-var traceability invariant

Every environment variable that appears in either the `score-compose generate` output (`compose.yaml`) or the `score-helm generate` output (Helm release manifests) for the Node and Camel workloads SHALL trace to either a `variables:` entry in the Score spec or a `${resources.<name>.<key>}` provisioner reference. No env var MAY appear in the rendered output without such a Score-side origin.

#### Scenario: SCN-002-03-01 All env vars trace cleanly

- **GIVEN** `score.node.yaml` and `score.camel.yaml` declare every env var in `variables:` or via `${resources...}`
- **WHEN** `./scripts/score-parity.sh` runs against the rendered surfaces
- **THEN** the script MUST exit 0 and emit a one-line "OK" summary listing the count of env vars matched

#### Scenario: SCN-002-03-02 Stray env var in Helm output fails

- **GIVEN** the `score-helm` generator emits a manifest containing an env var `STRAY_VAR` not declared in either Score spec
- **WHEN** `./scripts/score-parity.sh` runs
- **THEN** the script MUST exit non-zero, stderr MUST name `STRAY_VAR`, and the error message MUST cite guardrail G1
