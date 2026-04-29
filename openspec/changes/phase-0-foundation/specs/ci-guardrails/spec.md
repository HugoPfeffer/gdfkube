<!-- SPEC: ci-guardrails | CAP-005 -->

## ADDED Requirements

### Requirement: REQ-005-01 chart-lint workflow

A workflow at `.github/workflows/chart-lint.yaml` SHALL run on every `pull_request` and `push` event and execute `gdfkube-src/scripts/chart-lint.sh`. The script MUST enforce: (a) the legacy v1 group-label literal is absent from `gdfkube-src/`; (b) no `Chart.yaml` exists outside the three allowed roots from REQ-001-02; (c) no imperative `apply` invocation against `kubectl` or `oc` exists outside `gdfkube-src/tests/` and `gdfkube-src/scripts/`. On Phase 0 (no charts present), the workflow MUST pass vacuously.

#### Scenario: SCN-005-01-01 Vacuous pass on Phase 0 PR

- **GIVEN** a no-op PR against the Phase 0 acceptance commit
- **WHEN** the `chart-lint` workflow executes
- **THEN** the workflow MUST conclude with status `success` and the job log MUST emit one line per check confirming "0 violations"

#### Scenario: SCN-005-01-02 Imperative cluster-mutation invocation in non-test path fails

- **GIVEN** a PR adds a Bash line invoking the imperative `apply` subcommand of either `kubectl` or `oc` against a manifest file inside `gdfkube-src/camel/run.sh` (a non-`tests/`, non-`scripts/` path)
- **WHEN** the `chart-lint` workflow executes
- **THEN** the workflow MUST conclude with status `failure`, the job log MUST cite guardrail G4, and the failure message MUST quote the offending file and line

### Requirement: REQ-005-02 score-parity workflow

A workflow at `.github/workflows/score-parity.yaml` SHALL run on every `pull_request` and `push` event, install `score-compose` and `score-helm`, regenerate both surfaces from `score.node.yaml` and `score.camel.yaml`, and invoke `gdfkube-src/scripts/score-parity.sh` to diff env-var sets and port lists. The workflow MUST exit non-zero whenever the env-var or port surfaces differ between the two outputs.

#### Scenario: SCN-005-02-01 Identical surfaces pass

- **GIVEN** the Phase 0 Score specs render to identical env-var sets and port lists in both surfaces
- **WHEN** the `score-parity` workflow executes
- **THEN** the workflow MUST conclude with status `success` and the job log MUST report "compose=N helm=N matched=N drift=0" for some integer `N`

#### Scenario: SCN-005-02-02 Helm-only env var fails parity

- **GIVEN** a contributor adds an env var `EXTRA_HELM_VAR` to a Helm template such that it appears only in `score-helm` output
- **WHEN** the `score-parity` workflow executes
- **THEN** the workflow MUST conclude with status `failure`, the job log MUST list `EXTRA_HELM_VAR` under "helm-only", and the message MUST cite guardrail G1

### Requirement: REQ-005-03 connector-parity workflow

A workflow at `.github/workflows/connector-parity.yaml` SHALL run on every `pull_request` and `push` event and invoke `gdfkube-src/scripts/connector-parity.sh` to diff `gdfkube-src/connector.json` against the rendered Strimzi `KafkaConnector` CR template. Any field that differs between the two MUST cause a non-zero exit.

#### Scenario: SCN-005-03-01 Matching connector configs pass

- **GIVEN** `connector.json` and the rendered `KafkaConnector` CR carry identical `config` blocks
- **WHEN** the `connector-parity` workflow executes
- **THEN** the workflow MUST conclude with status `success` and the job log MUST report "connector.json fields=N matched=N drift=0"

#### Scenario: SCN-005-03-02 capture.mode drift fails

- **GIVEN** `connector.json` declares `capture.mode: change_streams_update_full_with_pre_image` but the rendered `KafkaConnector` declares `capture.mode: change_streams`
- **WHEN** the `connector-parity` workflow executes
- **THEN** the workflow MUST conclude with status `failure`, stderr MUST identify `capture.mode` as the drifting field, and the message MUST cite guardrail G2

### Requirement: REQ-005-04 Pre-existing pre-commit guardrail hook coverage

The pre-commit guardrail hook at `.claude/hooks/check-guardrails.sh` SHALL block any `Edit`, `Write`, or `MultiEdit` tool invocation whose payload would introduce the legacy v1 group-label literal anywhere, or an imperative `apply` invocation against `kubectl` or `oc` outside `tests/` and `scripts/`. Both branches MUST exit 2 with a stderr message that names the violated guardrail (G3 or G4).

#### Scenario: SCN-005-04-01 Hook allows compliant write

- **GIVEN** a `Write` tool invocation whose `content` declares `gdfkube.gov/org: acme`
- **WHEN** the pre-commit guardrail hook evaluates the payload
- **THEN** the hook MUST exit 0 and emit nothing on stderr

#### Scenario: SCN-005-04-02 Hook blocks legacy label introduction

- **GIVEN** a `Write` tool invocation whose `content` introduces the legacy v1 group-label literal
- **WHEN** the pre-commit guardrail hook evaluates the payload
- **THEN** the hook MUST exit 2 and stderr MUST contain the substring `blocked by G3`
