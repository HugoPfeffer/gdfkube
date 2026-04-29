# Design — Phase 0 Foundation

## Context

This change is the first phase of the gdfkube v2 rewrite (see `.claude/plans/phased/phase-0-foundation.md`). v1 sprawled across three Git repos (`gdfkube-infra`, `gdfkube-{org}`, `gdfkube-templates`) and entangled local-dev wiring with cluster-bootstrap concerns. The v2 architecture inverts that:

- **Hub bootstrap is owned by the agnosticd Ansible framework**, not this repo. agnosticd installs Strimzi, Bitnami MongoDB, Gitea, ArgoCD, RHACM, HyperShift, and the seed `ApplicationSet` before our deliverable ever runs.
- **Our deliverable is a single Helm chart** that ArgoCD applies. Nothing in `gdfkube-src/` mutates the cluster directly.
- **Local-dev parity is preserved by Score** (CNCF spec). One `score.yaml` per workload becomes both the local `compose.yaml` service and the OpenShift Helm release.

Phase 0 must lock the substrate — directory tree, parity tooling, CI guardrails, TDD harness — so subsequent phases (CDC ingest, Helm charts, Camel routes, sagas, hardening) plug in without re-litigating these decisions. The capabilities introduced are CAP-001 (monorepo-layout), CAP-002 (score-workload-spec), CAP-003 (local-dev-stack), CAP-004 (task-runner-tdd), CAP-005 (ci-guardrails), CAP-006 (connector-config-source).

Stakeholders: the v2 rewrite squad (Camel + Node app authors, Helm-chart maintainers), the agnosticd team that owns hub bootstrap, and the form-UI team consuming the remix bundle's UX contract.

## Goals / Non-Goals

**Goals:**

- Implement REQ-001-01..04 (monorepo tree, chart-path containment, canonical label namespace, remix-inherited naming conventions) so later phases inherit a frozen, lintable layout.
- Implement REQ-002-01..03 (Node + Camel Score specs, env-var traceability) so the same spec drives compose and Helm renders.
- Implement REQ-003-01..04 (compose stack, Mongo replica-set init, connector registration, Gitea local-dev shape) so `task dev:up` boots a usable substrate within 120 seconds.
- Implement REQ-004-01..04 (`task test`, `test:watch`, `dev:up`, `score:gen`) so the TDD inner loop is the primary surface for contributors.
- Implement REQ-005-01..04 (chart-lint, score-parity, connector-parity, pre-commit guardrails) to enforce G1–G7 invariants on every PR.
- Implement REQ-006-01..02 (`connector.json` shape, single-source-of-truth contract) so SMTs in Phase 1 land in exactly one place.

**Non-Goals:**

- Authoring real Helm chart contents (Phase 2). Phase 0 ships `.gitkeep` placeholders only.
- Authoring Camel routes or business logic (Phase 3). The Camel container is a Quarkus shell.
- Building Node-app endpoints beyond `/health` (Phase 1).
- Deploying ArgoCD, RHACM, HyperShift, Strimzi, Bitnami MongoDB, Gitea, or any operator on OpenShift — agnosticd owns hub bootstrap.
- Authoring OpenShift-side ApplicationSet, AppProject, ClusterRoles, or RHACM ConfigurationPolicy — agnosticd owns these.
- Performance tuning, security hardening (Phase 5), or production observability beyond what is needed to surface CI failures.

## Decisions

### DES-001: CNCF Score as the parity contract for the two workloads we own

**Choice**: Author one `score.yaml` per workload (`score.node.yaml`, `score.camel.yaml`) and use `score-compose` and `score-helm` to generate `compose.yaml` and the Helm release. Stateful platform pieces (Mongo, Kafka, Connect, Gitea) are referenced via Score `resources:` provisioners, not described as workloads. (Implements REQ-002-01..03, REQ-005-02.)

**Rationale**: The platform infra is not ours to deploy in OpenShift — agnosticd has already provisioned it. Score's `resources:` block is the simplest declarative way to express "discover an existing endpoint" while keeping the workload spec environment-agnostic. For the Node and Camel workloads we DO own, a single Score spec is the parity contract: any env-var or port that exists in one rendered surface but not the other is a CI-detectable drift.

**Alternatives Considered**:

- **Hand-write `compose.yaml` and Helm chart in parallel**: rejected because it duplicates the env-var contract across two surfaces; v1 paid for this with L13 (connector parity drift) and recurring "works locally, breaks in OCP" bugs.
- **Helmfile + a compose-translator**: rejected because Helmfile assumes Helm is the source of truth; we'd need extra tooling to extract the compose surface, and we'd still author env vars in Helm-template syntax (the `{{ }}`/Mustache collision recorded as L3).
- **Pure Kustomize overlays per environment**: rejected because Kustomize cannot generate Docker Compose, so local-dev would fall back to hand-authored YAML — no parity guarantee. v1's Mustache+Kustomize stack already burned this lesson (L3, L10).

**Consequences**: We accept a dependency on the Score CLI in CI and devcontainers. Any env var consumed by a workload MUST trace to a Score `variables:` or `resources:` entry — guardrail G1, enforced by `score-parity.sh`. Score's resource provisioner DSL is still maturing, so we pin Score versions in `score-compose.yaml` overlays; bumping is a deliberate review-required change.

---

### DES-002: Camel-Quarkus container, not Camel K, as the consumer runtime

**Choice**: The Camel consumer ships as a full Camel-Quarkus container image on both local and OpenShift, deployed as a Kubernetes `Deployment` rendered by `score-helm`. (Implements the runtime-choice constraint behind REQ-002-02 and L1 closure.)

**Rationale**: Every processor we will author in Phase 3 (`resourceNameResolver`, `requestContextBuilder`, etc.) needs `@ApplicationScoped` / `@Inject`. Camel K's YAML-only Integration runtime cannot host CDI beans. v1 hit this wall and rewrote the consumer; we refuse to repeat that. Quarkus also gives us the dev-mode hot-reload story that the TDD inner loop (REQ-004-02) depends on.

**Alternatives Considered**:

- **Camel K Integration CR**: rejected — see L1; YAML-only runtime cannot host CDI beans, so every non-trivial route would need workarounds.
- **Camel-on-Spring-Boot**: rejected because Spring Boot's startup time and image size hurt the local-dev loop, and it gains us nothing over Quarkus for the CDI features we need.

**Consequences**: We commit to a JVM image (`quay.io/quarkus/quarkus-micro-image:2.0` in Phase 0; native-compiled JAR in Phase 5 if cold-start matters). The container deploys identically across compose and Helm — no per-environment runtime selection. Phase 0 only needs a bare Quarkus shell to prove the build/test loop; routes land in Phase 3.

---

### DES-003: Single `connector.json` consumed by both registration paths

**Choice**: `gdfkube-src/connector.json` is the only authoritative source for the Debezium MongoDB connector configuration. The local-dev path (`scripts/register-connector.sh` POSTing to the Connect REST API) and the cluster path (a Strimzi `KafkaConnector` CR template Phase 1 will introduce) both consume this file by reference. CI gate `connector-parity.yaml` diffs the two surfaces. (Implements REQ-006-01..02, REQ-005-03.)

**Rationale**: v1's L13 ("connector parity drifts") happened because the local `register-connector.sh` and the OCP `KafkaConnector` ended up with different `capture.mode` values — the bug only surfaced when delete events arrived in production. A single JSON file plus a parity gate eliminates the drift class entirely.

**Alternatives Considered**:

- **Author `KafkaConnector` CR as the source of truth, derive the local payload at build time**: rejected because the local stack must work without Helm tooling; deriving JSON from rendered YAML adds a build dependency to `task dev:up`.
- **Author both inline (status quo from v1)**: rejected — see L13.

**Consequences**: Phase 1's SMT chain edits a single file, and the parity gate catches regressions before merge. The Strimzi template under `scripts/strimzi-kafka-connector.template.yaml` is interpolated, not authored — any direct edit to `config:` fields fails `connector-parity.sh`.

---

### DES-004: agnosticd owns hub bootstrap; this repo consumes Secrets by reference

**Choice**: Hub-cluster bootstrap (operator installs, Gitea repo mirroring, the seed `ApplicationSet`, RHACM `ConfigurationPolicy`, hub ClusterRoles) is delivered by the agnosticd Ansible framework. Our deliverable consumes pre-existing endpoints (Strimzi `Kafka`, Bitnami MongoDB `Service`, Gitea API URL) and reads credentials from Kubernetes `Secret`s that agnosticd provisions. The Camel container reads `GITEA_TOKEN` from `process.env` at startup; if missing, fail fast. (Implements REQ-003-04 and L14 closure.)

**Rationale**: v1's `gitea-init.sh` ran *after* the consumer container had started and used mtime-based file watching to pick up the token — a race condition that caused boot failures whenever Gitea took longer than expected. Moving credential creation to agnosticd (which runs BEFORE our chart is applied) eliminates the race. It also keeps this repo focused on the application; hub bootstrap is a different team's concern.

**Alternatives Considered**:

- **Bundle a hub-bootstrap Helm chart in this repo**: rejected because it conflates "what the application needs to run" with "how the cluster is built", and would require this repo to know about RHACM versions, hub topology, and SSH/pull-secret distribution policies — all of which change independently.
- **Keep the v1 mtime-watch loop**: rejected because the race condition was real and recurring; the fix is to make the credential available before the consumer starts, not to retry harder.

**Consequences**: This repo cannot be tested end-to-end without an agnosticd-provisioned hub or its compose-stack equivalent. The local `scripts/gitea-init.sh` mirrors the same `Secret`-shaped contract (env var `GITEA_TOKEN`) so the consumer code path is identical. The cutover runbook (Phase 5) lists the agnosticd-managed bootstrap manifests as a prerequisite, not a deliverable.

---

### DES-005: Taskfile.yaml as the TDD-first surface; compose / Score as wrappers

**Choice**: `gdfkube-src/Taskfile.yaml` is the primary entry point for contributors. The `test:*` namespace is the inner loop (with `test:watch` running on every save). The `dev:*` and `score:*` namespaces are convenience wrappers around the Docker Compose and Score CLIs. CI runs the same `task test:*` targets so local and CI behavior never diverge. (Implements REQ-004-01..04, REQ-005-01..03.)

**Rationale**: A TDD loop that requires three different commands depending on what changed is friction; contributors will skip tests. By making `task test` mean "run everything that CI runs" and `task test:watch` re-run the smallest relevant subset, we keep the loop tight without sacrificing coverage. Putting CI scripts under `gdfkube-src/scripts/` (called from both Taskfile and GitHub Actions) makes "what does CI run?" answerable by reading one shell script per gate.

**Alternatives Considered**:

- **Use `npm run` from `node/package.json` as the entrypoint**: rejected because the Camel container is JVM-based and contributors working on routes shouldn't need Node tooling installed.
- **Use Make**: rejected — Make's tab/space sensitivity and lack of structured task descriptions hurts onboarding; Taskfile gives us `task --list` for free.

**Consequences**: Contributors install `task` (and `watchexec` for the watch target) once via the devcontainer Dockerfile. CI workflows are thin wrappers that call `task test:<gate>`; if a contributor passes locally, CI passes — modulo flake. The `--wait` flag on `docker compose up` means `task dev:up` blocks until healthchecks pass, which is what the 2-minute SLA in REQ-004-03 measures.

---

### DES-006: Pre-commit guardrail hook + CI grep gate, two layers

**Choice**: The G3 (legacy label) and G4 (imperative cluster-mutation `apply`) invariants are enforced at two layers: (a) a Claude Code `PreToolUse` hook at `.claude/hooks/check-guardrails.sh` blocks `Edit`/`Write`/`MultiEdit` payloads that introduce violations; (b) the `chart-lint.yaml` workflow greps the working tree on every PR. Layer (a) catches drift at authoring time; layer (b) is the merge-blocking gate. (Implements REQ-005-01, REQ-005-04, REQ-001-03.)

**Rationale**: Hook-only enforcement misses contributors who don't use Claude Code; CI-only enforcement misses the fast-feedback signal during authoring. Both layers use the same regex, so a violation looks the same in either place. The pre-commit hook is opt-in (Claude Code only), but it is the most common authoring path in this project.

**Alternatives Considered**:

- **Pre-commit framework hook only**: rejected because it doesn't catch the `Edit` tool's surgical replacements before they write to disk; contributors would notice violations only at `git commit`, after they had already shipped the file across multiple Edits.
- **CI gate only**: rejected because the feedback loop is too slow — contributors would re-run CI multiple times per PR for guardrail-class issues that should fail at authoring time.

**Consequences**: The hook script needs to handle `MultiEdit`'s array of `new_string` values (it does — see existing implementation). The CI grep is the source of truth: when the rules change, edit the regex in one shell function and call it from both layers.

## Risks / Trade-offs

- **Score CLI version skew between dev and CI** → pin both `score-compose` and `score-helm` versions in `score-compose.yaml` and the GitHub Actions step (`score-spec/setup-score-{compose,helm}@v1` with explicit `version:` input); fail CI if the local devcontainer Dockerfile pins a different version.
- **`docker compose up --wait` 120-second SLA on slow networks (cold cache)** → the SLA is documented as "warm cache" (REQ-004-03); cold-start failures surface the underlying timeout error and leave the partial stack inspectable, so contributors can diagnose without re-running.
- **Phase 0 `.github/workflows/chart-lint.yaml` passes vacuously, masking a regression in the gate logic itself** → add a unit test under `gdfkube-src/tests/unit/chart-lint-self-test.sh` that seeds a fixture violating each rule and asserts the script exits non-zero; the test runs as part of `task test:unit` so the gate is exercised even before charts exist.
- **Strimzi `KafkaConnector` template under `scripts/` looks like a deliverable but is consumed only by the parity diff** → name it `strimzi-kafka-connector.template.yaml` (the `.template.` infix) and add a comment header marking it as parity-only; Phase 1 promotes it to a real chart artifact.
- **Mongo replica-set init script races with `score-compose`-generated healthcheck** → the init script runs via `/docker-entrypoint-initdb.d/`, which Mongo executes BEFORE accepting client connections, and the healthcheck uses `db.adminCommand('ping')` which only succeeds post-init; the order is enforced by Mongo itself, not by compose.
- **Pre-commit hook regex over-matches a legitimate use of `gdfkube.gov/` prefix that isn't the legacy label** → the regex (`gdfkube\.gov/group([^a-zA-Z0-9_-]|$)`) requires the literal `group` followed by a non-word boundary; alternative suffixes (`gdfkube.gov/org`, `gdfkube.gov/grouping`) do not match. Tested in `tests/unit/guardrail-hook-test.sh`.

## Migration Plan

This is a greenfield substrate; nothing in production consumes Phase 0 outputs. There is no migration from v1 — v2 is a parallel track. The "deploy" of Phase 0 is the merge of the change to `main`, after which Phase 1 starts.

**Deploy steps**:

1. Land all Wave 0–3 tasks (see tasks.md) on a feature branch.
2. Verify `task test` exits 0 in the devcontainer.
3. Verify all three CI workflows (`chart-lint`, `score-parity`, `connector-parity`) pass on the PR.
4. Merge to `main`. The merge is the "deploy" — there is no runtime to roll out.
5. Tag the commit `phase-0-foundation` so Phase 1's PR can reference the substrate it builds on.

**Rollback**: revert the merge commit. Because Phase 0 ships only files (no runtime, no state), revert is a clean `git revert -m 1 <merge-sha>`. No data migration, no downtime, no coordinated rollout.

## Open Questions

| Question | Owner | Deadline | Resolution |
|----------|-------|----------|------------|
| _None — every decision needed for Phase 0 implementation is locked above. Phase 1's open questions (SMT chain shape, approval-stream topic naming) live in that phase's design._ | — | — | n/a |
