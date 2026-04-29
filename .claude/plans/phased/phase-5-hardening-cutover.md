# Phase 5 — Hardening + cutover

| Field         | Value                            |
| ------------- | -------------------------------- |
| Status        | Not started                      |
| Predecessor   | [Phase 4](phase-4-full-sagas.md) |
| Successor     | — (production)                   |

## 1. Scope

Take the functionally complete Phase-4 system and harden it into something we are willing to point at production: structured DLQ reasons, observability, push-conflict recovery, end-to-end parity verification across local and OpenShift, and the v1 → v2 cutover itself.

In:

- DLQ wiring with **structured reasons** (the failure-mode → reason mapping is defined in §3.2):
  - `unknown_formId` — topic name has no matching route.
  - `chart_render_failed` — `helm template` non-zero exit; stderr captured.
  - `chart_render_empty_name` — defence-in-depth against §6.6 lint regressions.
  - `missing_pre_image` — `op=d` with `before == null`; alert on (config drift).
  - `approval_timeout` — `requests` event sat in the `ApprovalRegistry` past `gdfkube.approval.timeout` (default 30m) without a matching approval; treated as rejected. Phase 4 §3.11 contract.
- Structured saga step logs at every step boundary:
  - Single JSON line per step: `{requestId, formId, org, op, step, status, durationMs, gitRef?}` (see §3.1).
- JGit push-conflict recovery: pull-rebase once, retry push once, then DLQ (see §3.3).
- Score parity gate: `score-compose` and `score-helm` outputs diffed in CI; any drift in env vars / ports / resource references fails the build (see §3.4).
- OCP smoke test: `task ocp:smoke` runs the full pipeline against a live OCP cluster, asserts a Gitea commit and ArgoCD-applied manifest.
- v1 → v2 cutover runbook + dry-run.
- Final sweep on held items:
  - L11 (templates outlive renderer) — close via the admin re-render task described in §3.8.
  - The runtime schema-fetch indirection — already retired in Phase 4; Phase 5 verifies nothing depends on it.
  - The ArgoCD-side templating decision — already chosen in Phase 2 (Option B); Phase 5 verifies the chosen approach holds in OCP smoke.

## 2. Out of scope

- New form types — additive change post-cutover.
- New backends (e.g. moving Gitea to GitHub) — out of v2.
- The `requestId → commitSha` index (a small Mongo collection so the UI can link from a request to its Git commit) — possible follow-on, not a Phase-5 blocker.

## 3. Architecture

### 3.1 Observability (structured saga step logs)

Each saga step emits a structured JSON log line at boundary entry/exit:

```
{ "requestId": "01HQ…", "formId": "cluster-request", "org": "saude",
  "op": "c", "step": "renderResource", "status": "success",
  "durationMs": 142, "gitRef": "a4b1c8e" }
```

`gitRef` is the commit SHA on success (only emitted by `commitMonorepo`/`removeResourceDir` steps). With this, an operator can answer "where did request `01HQ…` end up?" in one log query. Logs are emitted via SLF4J + a JSON encoder; no custom log pipeline.

The structured log is the foundation for the Phase-5 SLO dashboard (saga step durations, failure rates per step, lag-vs-completion-time correlation). The dashboard itself is out of scope for Phase 5; Phase 5 only guarantees the data is emitted correctly.

### 3.2 Error handling (DLQ structured reasons)

Phase 4 left a catch-all DLQ. Phase 5 wires every failure mode to a specific `reason` header on the DLQ record:

| Failure                                       | DLQ reason                  | Behaviour                                                                 |
| --------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Unknown `formId` (no route handles the topic) | `unknown_formId`            | Catch-all topic-pattern handler routes to DLQ; consumer continues.        |
| `helm template` non-zero exit                 | `chart_render_failed`       | DLQ record carries Helm's stderr (truncated) so the failure is debuggable. |
| `helm template` produces empty `metadata.name`| `chart_render_empty_name`   | Defence-in-depth against §6.6 lint regressions — should never fire if CI works. |
| JGit push rejected (non-fast-forward)         | `push_conflict_unresolved`  | Pull-rebase once, retry push once; failure → DLQ. See §3.3.               |
| Pre-image absent (`before == null` on `op=d`) | `missing_pre_image`         | DLQ + alert (config drift on Mongo or connector).                         |
| Approval timeout                              | `approval_timeout`          | `requests` event waited past `gdfkube.approval.timeout` without a matching approval event; routed to DLQ with the request envelope so an operator can decide to re-approve or drop. |

The consumer commits Kafka offsets only after the saga reaches a terminal state (success or DLQ). No "fire and forget".

DLQ records carry the original CDC envelope as the body; the `reason`, `formId`, `requestId`, and a truncated `cause` go on the headers so `task dlq:tail` can summarise without parsing the body.

### 3.3 Push-conflict recovery (closes the JGit push-rejected case)

When two requests for the same org race to commit, the second push is rejected as non-fast-forward. The recovery loop is:

1. Fetch + rebase onto the new HEAD.
2. Retry the push exactly once.
3. On second failure, route to DLQ with reason `push_conflict_unresolved`.

The retry budget is intentionally tight — at higher contention something is wrong (e.g. an external writer pushing to `main` directly) and the operator wants to know.

### 3.4 Score parity hard gate

The Phase-0 score-parity workflow ran as advisory ("warn on drift"). Phase 5 promotes it to a **required** check on `main`. Inputs to the diff:

- All env vars exposed by the Node and Camel workloads.
- All ports declared in either output.
- All `resources:` references and their resolved env-var contributions.

Any non-trivial difference fails the build. The diff tolerates known-runtime-specific bits (e.g. `KUBERNETES_SERVICE_HOST` exists only on OCP) via an explicit allow-list checked into `.github/score-parity-ignore.txt`.

### 3.5 Testing strategy (final matrix)

| Layer             | Test                                                                       | Where                                                        |
| ----------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Unit              | `ValuesBuilder` shape, `ResourceNameResolver`, `InfraStateChecker` logic, `GuidDeriver` determinism | `gdfkube-src/camel/src/test/java/...`                        |
| Component         | `HelmRenderer` against fixture charts                                       | Same                                                         |
| Route             | `SagaRunner` with mocked Gitea + Git                                        | Camel test framework                                         |
| Integration       | Compose-up, post a form, assert Gitea contents                              | `gdfkube-src/tests/e2e/form-to-gitea.test.ts`                |
| E2E delete        | Compose-up, post then delete, assert Gitea diff                             | `gdfkube-src/tests/e2e/delete-from-gitea.test.ts`            |
| Chart lint        | Render + helm lint + dry-run apply                                          | CI on `gdfkube-src/charts/**` (Phase 2)                      |
| Score parity      | Diff `score-compose generate` vs `score-helm generate`                      | CI required check on `main`                                  |
| Chaos             | Poison message, push contention, killed-mid-saga                            | `gdfkube-src/tests/chaos/`                                   |
| OCP smoke         | `task ocp:smoke`                                                            | Live OCP cluster                                             |

### 3.6 Migration plan (cutover proper)

The rewrite is greenfield, so "migration" means *cutover* rather than *incremental refactor*. The full sequence — including the prerequisite phases — is:

1. **Phase 0 — Monorepo collapse.** Merge `gdfkube-infra`, `gdfkube-{org}`, and `gdfkube-templates` into `gdfkube-src/` as `infra/`, `orgs/<org>/`, and `charts/` subtrees. Repoint ArgoCD `Application`/`ApplicationSet` resources at the new paths.
2. **Phase 1 — Pillar 1.** Stand up MongoDB with pre-and-post-images, register the new connector JSON with the `RegexRouter` SMT (per-form-type topics), verify each topic locally with `kafka-console-consumer`.
3. **Phase 2 — Pillar 3.** Author Helm charts under `gdfkube-src/charts/` for each form type the remix exposes, with `tests/fixtures/*.values.yaml` and the chart-lint workflow.
4. **Phase 3 + 4 — Pillar 2.** Implement `HelmRenderer`, `ValuesBuilder`, `GitWriter`, `SagaRunner`, and the two saga classes. Wire them into the slimmed-down route YAML.
5. **Phase 0/5 — Score parity.** Author `score.node.yaml` and `score.camel.yaml`; promote the parity gate from advisory to required.
6. **Parity check.** Same form submission must produce a byte-identical tree under `gdfkube-src/orgs/<org>/` and `gdfkube-src/infra/orgs/<org>/` as v1 produced across its three repos (modulo the deterministic GUID and monorepo path moves).
7. **Switch over (this phase).** Replace the v1 container image; old CDC events finish processing on v1 first (drain the legacy topic before cutover, or run both consumers in different groups during transition).

**Hub-cluster prerequisites** (verified by the runbook; v2 does not author them — see Phase 0 §0.5):

- `gdfkube-platform` AppProject deployed (impersonates `argocd-platform-manager`).
- `org-infra-discovery` ApplicationSet deployed and pointing at `gdfkube-src/infra/orgs/*`. Without this, per-org Applications are never created and Camel commits would never reach the cluster.
- `setic-platform-admin` / `setic-operator` ClusterRoles applied.
- `inject-pull-secret` `ConfigurationPolicy` applied in `open-cluster-management` namespace, bound to the `default` ManagedClusterSetBinding, distributing the `pull-secret` Secret into the `clusters` namespace. This is what the cluster-request chart's wave -1 wait Job (Phase 2 §3.11) blocks on.
- RHACM (`release-2.14`+), HyperShift, KubeVirt, ODF (`stable-4.18`+) operators installed on a hub cluster of the v1 reference topology (3 control-plane nodes 16 vCPU / 16Gi each, 3 workers 24 vCPU / 64Gi each, per `tmp-refs/cluster-provisioning.md`). v2 does not assert specific versions but will fail-fast against environments missing any of these CRDs (chart-lint catches drift in CI).

The cutover script verifies each prerequisite is present (`kubectl get appproject gdfkube-platform`, `kubectl get applicationset org-infra-discovery`, etc.) and aborts if any are missing.

`gdfkube-src/CUTOVER.md` documents the operator runbook with rollback steps. Cutover is performed off-hours; rollback simply re-points the consumer Deployment image at the v1 tag and re-subscribes the v1 consumer group.

### 3.7 Final acceptance criteria (composite of the project-level criteria, owned by their respective phases)

| Criterion                                                                                                        | Closed in phase |
| ----------------------------------------------------------------------------------------------------------------- | --------------- |
| One `HelmRenderer` class renders every form-type chart (`cluster-request`, `namespace-request`, `scale-request`)  | Phase 4         |
| No `exec:git` invocations remain in any route YAML                                                                | Phase 4 (started Phase 3) |
| Camel route YAML ≤150 lines                                                                                       | Phase 4         |
| Delete CDC event with `before` populated removes only `gdfkube-src/orgs/<org>/<plural>/<resourceName>/`           | Phase 4         |
| Re-delivering the same `op=c` event produces a no-op commit                                                       | Phase 3         |
| GUID for a given `requestId` is identical across re-renders (unit-tested)                                         | Phase 3         |
| An event whose `formId` has no matching route ends up in DLQ; consumer continues progressing                      | Phase 5         |
| Local and OpenShift connector JSONs are byte-identical except for `mongodb.connection.string`                     | Phase 1         |
| Chart-lint CI gate is required for merge on `gdfkube-src/charts/**`                                               | Phase 2         |
| `score-compose generate` and `score-helm generate` run from the same `score.*.yaml` and produce matching surfaces | Phase 5         |
| `task dev:up` produces a working pipeline on a fresh checkout, with no connector-config divergence               | Phase 0 (full pipeline by Phase 4) |

Phase 5 is responsible for **verifying every row above is still green** at cutover time; any regression is a Phase-5 blocker.

### 3.8 Closure of all remaining holds

| Hold                                  | Closure in Phase 5                                                                                                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L11 — templates outlive the renderer  | Promoted from "pinned" (Phase 4) to **closed** by an admin re-render task (`task admin:rerender -- <requestId>`) that pushes the current chart output for an existing request and surfaces the diff. The task is a defensive hatch, not part of the hot path. |
| Runtime schema lookup indirection     | Already retired in Phase 4; Phase 5 verifies nothing depends on it (no `SchemaClient`-shaped artefact remains in the codebase or in deployment manifests).                                                                                                                       |
| ArgoCD-side templating                | Decision recorded in Phase 2 (Option B — render the ApplicationSet from a dedicated `infra` chart that emits literal Go-template text); Phase 5 verifies the chosen approach holds in OCP smoke.                                                                                                       |
| `requestId → commitSha` index         | Decided **out of v2** as a follow-on; the Phase-5 cutover does not block on it. The audit trail is the structured saga step log + Git history.                                                                                                                                                          |
| Best-effort revert compensation       | Stated explicitly in the `CreateOrUpdateSaga` definition (Phase 4 §3.2); no code change in Phase 5. With the monorepo a half-applied org-tier write only affects one tree, so the worst case is a stray commit that the next request reconciles.                                                        |

## 4. Lessons applied in this phase

### L11 — Templates outlive the renderer (closure)

**Origin (v1).** Pre-existing rendered manifests in customer repos are not retroactively updated when the template changes.

**Action in Phase 5.** Add an admin re-render task: `task admin:rerender -- <requestId>` looks up the request, rebuilds the values, runs `helm template` with the current chart, and pushes the diff into the monorepo as a normal commit (commit subject: `re-render: <requestId>`). The task is a defensive hatch operators reach for after a chart-wide policy change; it is not on the hot path. The Phase-5 work is the task itself plus a runbook entry in `gdfkube-src/CUTOVER.md`.

### L4, L7, L13, L14 (regression coverage)

These four lessons were closed (or scaffolded) earlier — Phase 0 for L1/L13/L14, Phase 3 for L4/L7. Phase 5's role is to verify nothing has regressed under cutover conditions:

- **L4 — `exec:git`:** The chaos suite includes a "kill the consumer mid-push" test; the recovery path uses JGit only.
- **L7 — typed exchange property:** The OCP smoke run inspects log output to confirm `RequestContext` is the only state carrier.
- **L13 — connector parity:** The score-parity gate is promoted from advisory (Phase 0) to required (Phase 5).
- **L14 — token lifecycle:** The OCP smoke includes a token rotation drill (touch the token file mid-flight); the consumer must continue without a restart.

All v1 lessons are now either implemented (closed) or pinned with a documented rationale and a defensive workaround.

## 5. Deliverables

- `gdfkube-src/camel/src/main/java/io/gdfkube/camel/dlq/`:
  - `DlqReason.java` (enum)
  - `DlqRouter.java` — wraps the DLQ producer, attaches `formId`, `requestId`, `reason`, `cause` headers.
- Saga-step `Logger` integration emitting the structured JSON line.
- `gdfkube-src/camel/src/main/java/io/gdfkube/camel/git/PushConflictRetry.java`.
- `.github/workflows/score-parity.yaml` upgraded to a hard diff (Phase 0's looser version graduates).
- `Taskfile.yaml` adds `ocp:smoke`, `cutover:dry-run`, `cutover:execute`.
- `gdfkube-src/CUTOVER.md` — runbook with rollback steps.
- Updated phase PRDs:
  - Phase 4's L9 entry confirms retirement.
  - Phase 4's L11 entry pinned; Phase 5 §4 records the closure here.
  - Phase 4's §3.9 confirms the schema-lookup retirement.
  - Phase 2's §3.4 marked "implemented (Option B)" once OCP smoke verifies it.
  - All project-level acceptance checkboxes (this phase §3.7) ticked.

## 6. Working-project demo

```
# Poison message → DLQ with reason
$ task chaos:poison -- cluster-request 'this-is-not-json'
$ task dlq:tail
{"reason":"chart_render_failed","formId":"cluster-request","requestId":"01HQ...","cause":"YAML parse error..."}

# Push conflict → recovers
$ task chaos:concurrent-push   # writes a file directly to gdfkube-src/main behind the consumer's back
$ task camel:logs | grep push
push rejected (non-fast-forward), pull-rebase, retry push (success)

# Score parity green
$ task score:diff
no drift detected

# OCP smoke
$ task ocp:smoke
e2e: cluster-request → Gitea → ArgoCD → ManagedCluster Accepted
PASS

# Cutover
$ task cutover:dry-run
v1 consumer drained: 0 lag on dbz.gdfkube.requests
v2 consumer ready: subscribed, idle
all green; ready for cutover:execute
```

## 7. Acceptance criteria (production gate)

All project-level acceptance criteria (the composite list in §3.7) are checked off. In addition:

- [ ] DLQ contains structured reasons for each of the four induced failure modes (chaos suite).
- [ ] A saga step log lookup by `requestId` returns the full step trace ordered by time.
- [ ] Concurrent push test: pull-rebase-retry succeeds at least 95% of the time across 100 trials; the 5% that fail land in DLQ with `push_conflict_unresolved`.
- [ ] `task score:diff` is zero-diff on `main` (CI-enforced).
- [ ] `task ocp:smoke` runs to completion in a real OCP environment.
- [ ] Cutover dry-run executed; rollback procedure exercised on a staging environment.
- [ ] All project-level holds (L9, L11, runtime schema lookup, ArgoCD-side templating) are resolved or explicitly pinned with a rationale.

## 8. Test plan

| Test                            | Type   | Notes                                                                                       |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Each DLQ reason                 | Chaos  | Force each of the four failure modes; assert exact `reason` header                          |
| Step-log shape                  | Unit   | Snapshot of one step log line                                                               |
| Push-conflict recovery          | Chaos  | 100-trial loop; ≥95 recover, residue lands in DLQ                                           |
| Score-compose vs score-helm     | CI     | Hard diff job; any non-trivial difference fails                                             |
| Connector-config parity         | CI     | Phase-1 job extended to cover any new SMT additions                                         |
| OCP smoke                       | Manual | Live OCP cluster; pre-deployment baseline                                                   |
| Cutover dry-run                 | Manual | Drain v1 topic, confirm zero lag, switch image, run smoke, document elapsed time            |
| Rollback                        | Manual | After cutover dry-run, simulate a bad v2 deployment and roll back to v1                     |

## 9. Risks and on-hold items

- All previously held items are resolved or explicitly closed in this phase. Anything that survives Phase 5 as still-held is a known follow-on tracked in a fresh issue, not in any PRD.
- The OCP smoke depends on a working RHACM / HyperShift / KubeVirt / ArgoCD environment. If the staging environment is not ready, the smoke step is the schedule risk for this phase.

## 10. References

- [JSON Lines](https://jsonlines.org/) — saga-step log encoding
- [SLF4J + Logstash JSON encoder](https://github.com/logfellow/logstash-logback-encoder) — JVM-side structured logging
- [Kafka DLQ + error-handling configs](https://kafka.apache.org/documentation/#errors-tolerance) — `errors.tolerance`, `errors.deadletterqueue.*`
- [Strimzi `KafkaConnector` CR docs](https://strimzi.io/docs/operators/latest/full/configuring.html#assembly-using-kafka-connect-with-plug-ins-str) — error-handling configuration
- [JGit non-fast-forward handling](https://www.eclipse.org/jgit/) — `RemoteRefUpdate.Status.REJECTED_NONFASTFORWARD`
- [kind](https://kind.sigs.k8s.io/) — local Kubernetes cluster used by the chart-lint and OCP smoke harnesses
