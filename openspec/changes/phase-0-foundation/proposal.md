## Why

Phase 0 of the gdfkube v2 rewrite freezes the plumbing — monorepo shape, Score-driven workload specs, local-dev stack, TDD task runner, and CI guardrails — so every later phase (CDC ingest, Helm charts, Camel routes, sagas, hardening) inherits a stable substrate without rework. Without this foundation the rewrite cannot enforce local↔OpenShift parity, single-source-of-truth contracts, or the GitOps invariant that gates downstream work.

## What Changes

- Collapse the three v1 Git repos (`gdfkube-infra`, `gdfkube-{org}`, `gdfkube-templates`) into one monorepo at `gdfkube-src/` with `gdfkube-infra/` and `gdfkube-orgs/` as top-level subtrees.
- Author two CNCF Score specs (`score.node.yaml`, `score.camel.yaml`) as the parity contract for the Node app and Camel-Quarkus consumer workloads — dummy images in this phase.
- Generate and check in a `compose.yaml` (via `score-compose`) that boots the local-dev stack: `mongo:7.0`, `apache/kafka:3.9`, `quay.io/debezium/connect:3.0`, `gitea/gitea:1.22`, plus the two dummy workloads.
- Check in `connector.json` as the **single source of truth** for the Debezium MongoDB connector config (empty body in Phase 0; SMTs land in Phase 1).
- Ship `Taskfile.yaml` as the TDD test runner (`test`, `test:unit`, `test:int`, `test:watch`, `test:parity`, `test:chart-lint`, `test:helm-dry-run`) with `dev:*` and `score:*` convenience wrappers.
- Add three CI workflows: `chart-lint.yaml` (vacuous pass on Phase 0; layout + label gates), `score-parity.yaml` (diffs `score-compose` vs `score-helm` env-vars and ports), `connector-parity.yaml` (diffs `connector.json` against the rendered `KafkaConnector` CR).
- Lock naming and label conventions inherited from the remix bundle: `gdfkube.gov/org` label namespace, `hc-{org}-{cluster}` HostedCluster name, `appset-{org}-{cluster}` ApplicationSet name, `clusters` HyperShift namespace.
- Choose Camel-Quarkus (full container) over Camel K for the consumer — encoded in `score.camel.yaml`.
- Drop the v1 Gitea token mtime-watch loop: Phase 3 will read `GITEA_TOKEN` from a `Secret`-shaped env contract identical in compose and OpenShift.
- Document `task dev:up` smoke test in `gdfkube-src/README.md`.

## Non-Goals

- MongoDB schema, pre/post-image config, or any actual CDC routing (Phase 1).
- Authoring real Helm chart contents under `charts/` subtrees (Phase 2 — Phase 0 ships empty `.gitkeep` placeholders).
- Camel routes, GUID derivation, `GitWriter`, or any business logic in the Camel container (Phase 3).
- Form submission UI or Node app endpoints beyond a `/health` (Phase 1).
- Deploying ArgoCD, RHACM, HyperShift, Strimzi, Bitnami MongoDB, or Gitea on the OpenShift hub — agnosticd Ansible owns hub bootstrap.
- Authoring the bootstrap `ApplicationSet`, `gdfkube-platform` AppProject, hub-side ClusterRoles, or RHACM `ConfigurationPolicy` resources — agnosticd owns these.
- Multi-tenant RBAC for the form UI.
- Any imperative cluster-mutation execution path (e.g., `kubectl`/`oc` direct `apply` invocations) inside the deliverable; cluster mutations route through ArgoCD reading Git.

## Capabilities

### New Capabilities

- `CAP-001: monorepo-layout` — Lock the `gdfkube-src/` directory tree, chart-path conventions (`gdfkube-infra/charts/`, `gdfkube-orgs/charts/`, `gdfkube-orgs/{org}/charts/`), and label-namespace convention (`gdfkube.gov/org`).
- `CAP-002: score-workload-spec` — Author Score specs for the Node and Camel workloads as the single parity contract; every env var traces to a Score `variables:` or `resources:` provisioner.
- `CAP-003: local-dev-stack` — Generate a runnable `compose.yaml` covering Mongo, Kafka, Kafka Connect, Gitea, and the two dummy workloads, with init scripts under `scripts/`.
- `CAP-004: task-runner-tdd` — Ship `Taskfile.yaml` as the TDD runner: `test:watch` is the inner loop; `dev:*` and `score:*` wrap compose and Score generation.
- `CAP-005: ci-guardrails` — Wire `chart-lint.yaml`, `score-parity.yaml`, and `connector-parity.yaml` workflows enforcing G1–G7 invariants from §3.6.
- `CAP-006: connector-config-source` — Establish `gdfkube-src/connector.json` as the only place SMTs / capture-mode are authored; both local REST registration and Strimzi `KafkaConnector` consume it.

### Modified Capabilities

<!-- None — this is the first change in the v2 rewrite; no prior specs exist to modify. -->

## Impact

- New files: `gdfkube-src/score.node.yaml`, `gdfkube-src/score.camel.yaml`, `gdfkube-src/score-compose.yaml`, `gdfkube-src/connector.json`, `gdfkube-src/compose.yaml`, `gdfkube-src/Taskfile.yaml`, `gdfkube-src/README.md`.
- New directory tree under `gdfkube-src/`: `gdfkube-infra/{charts,orgs}/.gitkeep`, `gdfkube-orgs/charts/.gitkeep`, `camel/.gitkeep`, `node/.gitkeep`, `scripts/`, `tests/`.
- New scripts: `gdfkube-src/scripts/init-mongo.js`, `gdfkube-src/scripts/register-connector.sh`, `gdfkube-src/scripts/gitea-init.sh`, `gdfkube-src/scripts/score-parity.sh`, `gdfkube-src/scripts/connector-parity.sh`, `gdfkube-src/scripts/chart-lint.sh`.
- New CI workflows: `.github/workflows/chart-lint.yaml`, `.github/workflows/score-parity.yaml`, `.github/workflows/connector-parity.yaml`.
- External tooling required in dev/CI: `score-compose`, `score-helm`, `kubectl`, `helm`, `docker compose`, `watchexec`, a kind cluster for dry-run.
- No production OpenShift impact — Phase 0 ships dummy images and empty chart subtrees.
- Existing `.claude/reference/standards/development-deployment.md` env-contract document remains authoritative for env-var names; Phase 0 wires Score `variables:` / `resources:` to match it.

## Mode

Mode: deep
