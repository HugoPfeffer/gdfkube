# Phase 4 — Full sagas, all form types, delete, org-tier

| Field         | Value                                   |
| ------------- | --------------------------------------- |
| Status        | Not started                             |
| Predecessor   | [Phase 3](phase-3-mvp-consumer.md)      |
| Successor     | [Phase 5](phase-5-hardening-cutover.md) |

## 1. Scope

Take the Phase-3 spine and broaden it: introduce the saga runner, support the three form types from the remix, render and protect the org-tier (`infra/orgs/<org>/`), and implement delete with pre-image-derived paths. After this phase the system can run any form type the catalog exposes and clean up after itself without touching shared org-tier resources.

In:

- `SagaRunner` — generic forward/compensate executor (see §3.2 / §3.3 for the contract).
- `CreateOrUpdateSaga` with steps:
  1. `resolveResourceName(after)` — per-`formId` switch in Java.
  2. `renderOrgInfraIfFirst(org)` — conditional on `InfraStateChecker.state(org) == EMPTY`.
  3. `renderResource(formId, resourceName, after)`.
  4. `commitMonorepo(requestId)` — single commit covering both subtrees, push.
- `DeleteSaga`:
  1. `resolveResourceName(before)`.
  2. `removeResourceDir(org, resourceName, formId, requestId)` — `git rm -r <path>`, commit if dirty, push. Path follows the form-specific layout pinned in Phase 2 §3.5: `orgs/<org>/clusters/<resourceName>/` for `cluster-request`, `orgs/<org>/namespaces/<resourceName>/` for `namespace-request`. `scale-request` is patch-only and not eligible for delete (see §3.10).
- `InfraStateChecker` — walks `gdfkube-src/infra/orgs/<org>/` and reports `EMPTY` / `COMPLETE` / `PARTIAL`. `PARTIAL` fails loudly with a structured error (see §3.2).
- `ResourceNameResolver` widened to handle the three remix form types. `vars.<field>` mapping per form type:
  - `cluster-request → vars.clusterName`
  - `namespace-request → vars.namespaceName`
  - `scale-request → vars.clusterName` (the existing cluster being scaled — same key as `cluster-request`; the saga writes to a different subtree, see §3.10)
- Camel consumer subscribes to **all** `dbz.gdfkube.requests.*` topics. The subscription strategy decision lands here (see §3.6 — pattern subscription with internal dispatch chosen).
- Tier-aware destinations (L12 closure): `infra/orgs/<org>/` is append-only across requests; cluster-tier (`orgs/<org>/<plural>/<resourceName>/`) is deletable per request.
- `op=r` (snapshot) routes through the same path as `op=c`.

## 2. Out of scope

- DLQ structured-reason routing (Phase 5 — Phase 4 keeps the Phase-1 catch-all DLQ).
- JGit pull-rebase-retry on non-fast-forward push (Phase 5).
- Deep observability (structured saga step logs land in Phase 5; Camel default logs are fine here).
- OCP smoke / cutover (Phase 5).
- Re-rendering on demand for L11 — that lesson stays held; we will judge in Phase 5 whether ArgoCD-side rendering removed the problem entirely.

## 3. Architecture

### 3.1 Component map (Phase 4 final form)

```
                      +----------------------+
                      |  KafkaCdcConsumer    |   from("kafka:dbz.gdfkube.requests.*?topicIsPattern=true")
                      |  (route)             |   parses envelope, reads formId from topic name,
                      +----------+-----------+   builds RequestContext
                                 |
                                 v
                       +---------+----------+      +---------------------+
                       |   RequestRouter    +----->|  PipelineSelector   |
                       |  (route)           |      |  c/u/r → CreateOrUpdateSaga
                       +---------+----------+      |  d     → DeleteSaga
                                 |                 +----------+----------+
                                 v                            |
                     +-----------+-----------+   +-----------+-----------+
                     |  CreateOrUpdateSaga   |   |     DeleteSaga        |
                     |  - resolveResourceName|   |  - resolveResourceName|
                     |  - renderInfra (1st)  |   |  - removeResourceDir  |
                     |  - renderResource     |   +-----------+-----------+
                     |  - commitMonorepo     |               |
                     +-----------+-----------+               v
                                 |               +-----------------------+
                                 v               |   GitWriter (JGit)    |
                     +-----------------------+   +-----------------------+
                     |     HelmRenderer      +---------------+
                     |  (helm template)      |
                     +-----------+-----------+
                                 |
                                 v
                     +-----------------------+
                     |    ValuesBuilder      |
                     |  (RequestContext →    |
                     |   values.yaml object) |
                     +-----------------------+
```

### 3.2 Saga model

A saga is an ordered list of steps. Each step is `{name, action, compensation}`. The runtime executes forward; on failure, it walks completed steps in reverse calling each `compensation`. With the monorepo (L8 obsoleted), there is **one** Git target — `gdfkube-src/` — so the saga is much shorter than v1's two-repo dance.

**`CreateOrUpdateSaga`** for `op ∈ {c, u, r}`:

| Step | Action                                                                                                                                                                                  | Compensation                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1    | `resolveResourceName(after)` — derived from `formId`-specific rules (the topic *is* the form id; per-formId resolution is a small switch in code, not a runtime lookup)                 | —                           |
| 2    | `renderOrgInfraIfFirst(org)` — `helm template charts/infra -f <values built from RequestContext>` to tmp                                                                                | clean tmp                   |
| 3    | `renderResource(formId, resourceName, after)` — `helm template charts/<formId> -f <values>` to tmp                                                                                      | clean tmp                   |
| 4    | `commitMonorepo(requestId)` — JGit `add` of both `infra/orgs/<org>/` and `orgs/<org>/<plural>/<resourceName>/`, single commit, push (skip if `git diff --cached` empty). The saga **never** waits on hub-cluster state; pull-secret availability is enforced by the chart's wave -1 wait Job (Phase 2 §3.11) and surfaces as ArgoCD `Degraded`, not as a saga compensation trigger. | revert commit (best-effort) |

Step 2 is conditional on `InfraStateChecker.state(org) == EMPTY`. Three outcomes:

- `EMPTY` → render and include in the commit.
- `COMPLETE` → skip rendering.
- `PARTIAL` → fail loudly; org-tier is corrupt and must be repaired by hand. (v1 already detects this; v2 makes it actionable.)

**`DeleteSaga`** for `op = d`:

| Step | Action                                                                                                                                                       | Compensation                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1    | `resolveResourceName(before)`                                                                                                                                | —                                               |
| 2    | `removeResourceDir(org, resourceName, requestId)` — JGit `rm -r orgs/<org>/<plural>/<resourceName>/`, commit if dirty, push                                  | none (delete is intentionally non-rollbackable) |

Org-tier (`infra/orgs/<org>/`) is **never** touched on delete (closes L12). An empty `orgs/<org>/<plural>/` directory inside the monorepo is harmless — the ApplicationSet generator simply discovers nothing.

### 3.3 Component contracts (final)

| Bean                       | Responsibility                                                   | v1 → v2 changes                                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KafkaCdcConsumer` (route) | Parse envelope, build `RequestContext`, dispatch                 | Subscribes via topic pattern `dbz.gdfkube.requests.*` (decision recorded in §3.6). Replaces inline `<choice>` on `${header.cdcOperation}`.                                                                                     |
| ~~`SchemaClient`~~         | _(retired)_                                                      | The runtime schema-fetch indirection is closed (see §3.9). Form-specific behaviour lives in code keyed off `formId` (i.e. the topic name).                                                                                    |
| `ResourceNameResolver`     | Maps `vars.*` → `resourceName` per form type                     | Per-formId switch in Java instead of v1's generic `templateFieldIdentifier` lookup. Takes `RequestContext` not headers. Mappings: cluster-request→`clusterName`, namespace-request→`namespaceName`, scale-request→`clusterName`. |
| `InfraStateChecker`        | Walks `gdfkube-src/infra/orgs/<org>/` for completeness           | New in this phase. Computes against the rendered manifest list of `charts/infra` (already dynamic in v1 logic).                                                                                                                |
| ~~`TemplateProvider`~~     | _(retired)_                                                      | With charts living in the same monorepo as the consumer's commit target, there is no separate "templates Git repo" to provide. Charts are read from `gdfkube-src/charts/` directly.                                            |
| `HelmRenderer`             | Runs `helm template <chart> -f <values>` and writes to a tmp dir | Inherited from Phase 3; widened here to render any chart by `formId`.                                                                                                                                                          |
| `ValuesBuilder`            | Constructs the `values.yaml` object from a `RequestContext`      | Inherited from Phase 3; identical contract.                                                                                                                                                                                    |
| `GitWriter`                | JGit-backed clone, copy/remove, commit, push, cleanup            | Inherited from Phase 3; gains `removeResourceDir` and `addBoth` semantics for the dual-tree commit.                                                                                                                            |
| ~~`GiteaApiClient`~~       | _(retired with monorepo, see L8)_                                | No per-org repo creation needed.                                                                                                                                                                                               |
| ~~`GiteaRepoService`~~     | _(retired with monorepo, see L8)_                                | —                                                                                                                                                                                                                              |
| `GiteaTokenProvider`       | mtime-watched token file                                         | Still needed — `GitWriter` authenticates against Gitea using the token.                                                                                                                                                        |
| `SagaRunner`               | Generic forward/compensate executor                              | New in this phase. Replaces nested `doTry/doCatch` in YAML; saga is shorter post-monorepo.                                                                                                                                     |

### 3.4 Routes (final form)

The YAML route file shrinks dramatically because business logic moves into `SagaRunner` + step beans. The file must remain ≤150 lines (this is one of the project-level acceptance criteria — v1's `cdc-consumer.camel.yaml` is ~810 lines). Target shape:

```yaml
- route:
    id: cdc-main
    from:
      uri: "kafka:dbz.gdfkube.requests.*?topicIsPattern=true&groupId={{gdfkube.cdc.group}}"
      steps:
        - process: { ref: cdcEnvelopeParser } # builds RequestContext; reads formId from topic name
        - choice:
            when:
              - simple: "${exchangeProperty.context.op} in 'c,u,r'"
                steps:
                  - to: direct:create-or-update
              - simple: "${exchangeProperty.context.op} == 'd'"
                steps:
                  - to: direct:delete

- route:
    id: create-or-update
    from:
      uri: direct:create-or-update
      steps:
        - process: { ref: createOrUpdateSagaRunner }

- route:
    id: delete
    from:
      uri: direct:delete
      steps:
        - process: { ref: deleteSagaRunner }
```

Three routes total. Step orchestration lives in Java.

### 3.5 Operation handling matrix (full)

| `op` | `before` | `after`  | v2 behaviour                                                                                                                                                             |
| ---- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `c`  | null     | full doc | Render + push (cluster-tier; conditionally org-tier on first-of-org)                                                                                                     |
| `u`  | full doc | full doc | **Re-render** if any `vars.*` changed; otherwise no-op.                                                                                                                  |
| `d`  | full doc | null     | Delete cluster-tier manifests using `before` document. Org-tier untouched.                                                                                               |
| `r`  | null     | full doc | Snapshot — same path as `c`.                                                                                                                                             |

The soft-delete-via-update workaround in v1 is **removed**. With pre-images enabled (Phase 1), real deletes carry their context.

### 3.6 Subscription strategy decision

**Open question:** regex-pattern subscription with internal dispatch, or one route per topic? **Decision: pattern subscription with internal dispatch.**

- Pros: simpler operations at current form-type cardinality (≤10), one consumer group, one offset stream per partition.
- Cons: a single bad route handler can affect every form type — mitigated by the per-formId switch in `ResourceNameResolver` being narrow and unit-tested.

Per-route subscription becomes attractive only if a single high-volume form type needs independent scaling; revisit when that pressure appears.

### 3.7 Tier-aware destinations (closes L12)

"Create-once" is a per-org fact, not a per-request fact. The first request from `org=saude` triggers creation of `AppProject(saude)`, `ApplicationSet(saude)`, `ManagedClusterSet(saude)`, `Binding(saude→saude-clusterset)`, and `Namespace(saude)`. Subsequent requests from `saude` find them present (`InfraStateChecker.state == COMPLETE`) and skip step 2. A delete of `cluster=vacinacao` removes only `orgs/saude/clusters/vacinacao/` and leaves every org-tier object untouched, otherwise the next request from `saude` would re-create them and ArgoCD would churn.

v2 codifies this as **tier-aware destinations**: cluster-tier writes are deletable; org-tier writes are append-only.

The org-tier `ManagedClusterSet` is the receiving set for the cluster-tier `ManagedCluster` resources rendered by the `cluster-request` chart. Phase 2 §3.10 pins the cluster-tier `ManagedCluster` as the **authoritative identity source** for HyperShift's `hypershift-addon-agent` — the agent uses Get-then-Create on the hosting cluster, so the labels and annotations the chart emits at sync-wave 0 (`cluster.open-cluster-management.io/clusterset: {{ .Values.org }}`, `gdfkube.gov/org: {{ .Values.org }}`, and the HyperShift import annotations) are the cluster's permanent identity. The saga's job is just to land the rendered manifest in the right path; the contract that the manifest carries the correct labels lives in the chart, not in the saga.

### 3.8 Idempotency (delete half)

Phase 3 covered `c/u/r` idempotency. Phase 4 closes the loop:

- A `d` event re-delivered after the directory has already been removed produces an empty `git diff --cached`; no commit, no push.
- The temp working directory is `/tmp/{requestId}-delete` and is **always** cleaned, even on failure.
- A `d` event with `before == null` is rejected by §3.4's `cdcEnvelopeParser` rather than reaching the saga; Phase 5 wires it to a structured DLQ reason.

### 3.9 Schema lookup (closes the held question from Phase 1/3)

The runtime schema-fetch indirection from v1 is retired. With per-form-type topics (Phase 1) and a chart-per-form-type layout (Phase 2), the consumer no longer needs `templateFieldIdentifier` / `templatePack` indirection: the topic name **is** the form id, and the chart for that form id lives at a fixed path. The `SchemaClient` bean is removed.

### 3.10 `scale-request` semantics (patch-only, not eligible for delete)

`scale-request` is a patch event keyed by `vars.clusterName` and `vars.newNodeCount`. The saga writes to `orgs/<org>/scales/<clusterName>-<requestId>/nodepool-patch.yaml` (see Phase 2 §3.5), so each scale event is an immutable record. A subsequent ArgoCD sync on the cluster-tier subtree picks up the patch alongside the original `nodepool.yaml`. Two consequences:

- **Delete (`op=d`) on a `scale-request` is a no-op.** The `DeleteSaga` is invoked, but `resolveResourceName(before)` for `formId=scale-request` returns `null` and the saga short-circuits with a structured log line (`step=resolveResourceName, status=skipped, reason=patch-only`). The Kafka offset is committed; no Git activity.
- **Delete of the *underlying* cluster (`cluster-request` `op=d`)** removes `orgs/<org>/clusters/<clusterName>/` but does **not** remove `orgs/<org>/scales/<clusterName>-*/` directories. The audit trail of historical scale events survives. ArgoCD prunes the patches naturally because the `HostedCluster` they patched is gone.

Phase 5 wires the patch-only short-circuit to a dedicated DLQ reason (`scale_delete_noop`) only if it turns out to be a useful signal; the default is silent skip.

### 3.11 Approvals join (closes the remix's approval queue contract)

Phase 1 §3.6 stood up the `approvals` collection and its `dbz.gdfkube.approvals` topic. Phase 4 wires the saga to honor approvals before any rendering happens.

- The Camel consumer subscribes to `dbz.gdfkube.approvals` in addition to the `dbz.gdfkube.requests.*` pattern. The new route `cdc-approvals` parses the approval envelope and emits a `direct:approval-decision` exchange keyed by `requestId`.
- The `CreateOrUpdateSaga` gains a **precondition step 0** before `resolveResourceName`: `awaitApproval(requestId)`. Implementation: a per-`requestId` `CompletableFuture` registered in an in-memory `ApprovalRegistry` bean; the request route parks the saga until the matching approval event resolves the future.
- A `decision: "approved"` resolves the future with `APPROVED` and the saga continues from step 1.
- A `decision: "rejected"` resolves the future with `REJECTED`; the saga short-circuits with a structured log line (`step=awaitApproval, status=rejected, requestId=...`) and commits the Kafka offset for the `requests` event without writing manifests.
- A `requests` event arriving with no matching approval after a configurable wait (default `gdfkube.approval.timeout=30m`) is treated as `REJECTED` (timeout). The Phase-5 DLQ reason `approval_timeout` covers this case.
- Approval events arriving **before** the matching request event are queued in the `ApprovalRegistry` for up to the same timeout; they resolve the future as soon as the request arrives. This handles out-of-order delivery.
- The `ApprovalRegistry` is in-memory only; a consumer restart drops pending approvals, but Kafka redelivery on the `requests` topic re-arms them and the operator can re-post the approval event from the `approvals` collection (idempotent because Camel uses Mongo `_id` deduplication on `decidedBy + requestId`).

The saga compensation chain stays unchanged — `awaitApproval` has no compensation because nothing has been written yet at step 0.

**Phase 3 (MVP) explicit deviation:** Phase 3 does *not* implement the approval join. Every `requests` event is auto-approved at the route level (a `direct:auto-approve` step that resolves the future immediately). Phase 4 replaces the auto-approver with the real `cdc-approvals` route. This is documented in Phase 3 §2 as out-of-scope.

## 4. Lessons applied in this phase

### L8 — Multi-repo write needs transactional rollback (obsoleted by monorepo)

**Origin (v1).** Wrapped customer-repo creation + infra push in `doTry/doCatch` so a failed push deleted the just-created repo. Reference: `cdc-consumer.camel.yaml:186-263`.

**Action in Phase 4.** Already obsoleted by the monorepo collapse — there is no second repo to create, no cross-repo half-state, no `GiteaRepoService.deleteRepo` compensation step. A failed commit is just a failed commit; Kafka redelivers. The `CreateOrUpdateSaga` and `DeleteSaga` defined in §3.2 reflect this — the only compensation that survives is "revert commit (best-effort)" on the single monorepo target.

### L9 — The `templateFieldIdentifier` indirection is the right abstraction (replaced)

**Origin (v1).** Reference: `ResourceNameResolver` + the `vm-request` template addition. The intention was: let one renderer serve any form type without code changes by reading a `templateFieldIdentifier` from the schema document at runtime.

**Action in Phase 4.** With per-form-type topics (Phase 1) and a chart-per-form-type layout (Phase 2), the topic *is* the form id and the chart for that form id lives at a fixed path. The runtime indirection collapses to a small per-`formId` switch in `ResourceNameResolver` (Java, compiler-checked). Lesson formally retired.

### L11 — Templates outlive the renderer

**Origin (v1).** Pre-existing rendered manifests in customer repos are not retroactively updated when the template changes. Reference: `2026-02-23-align-hypershift-templates-ssh-policy` impact section.

**Action in Phase 4 (pinned).** ArgoCD reads from `gdfkube-src/orgs/<org>/…` which contains the *rendered* output, so a chart change does not retroactively update existing rendered manifests unless the consumer is asked to re-render. Phase 4 verdict: keep the lesson pinned (still a real concern); Phase 5 closes it via an admin re-render task (`task admin:rerender -- <requestId>`).

### L12 — Org-level grouping infra is create-once

**Origin (v1).** AppProject, ApplicationSet, ManagedClusterSet, Binding, Namespace are aggregated across requests; deleting a cluster must NOT touch them. Reference: `add-request-deletion` proposal §4.

**Action in Phase 4.** Implemented via `InfraStateChecker` + tier-aware destinations. "Create-once" is a per-org fact, not a per-request fact: the first request from `org=saude` triggers creation of the five org-tier objects under `infra/orgs/saude/`; subsequent requests from `saude` find them present (`InfraStateChecker.state == COMPLETE`) and skip step 2 of `CreateOrUpdateSaga`. A delete of `cluster=vacinacao` removes only `orgs/saude/clusters/vacinacao/` and leaves every org-tier object untouched, otherwise the next request from `saude` would re-create them and ArgoCD would churn.

### Open questions closed by this phase

- **Schema lookup at runtime** — closed (retired). The original v1 plan was to have the consumer fetch form metadata from the Node app on every event, with a 5-second cache and a circuit-breaker. With per-form-type topics + chart-per-form-type, the consumer no longer needs `templateFieldIdentifier` / `templatePack` indirection. The `SchemaClient` bean is removed.
- **Subscription strategy** — closed (pattern subscription with internal dispatch; see §3.6).

## 5. Deliverables

- `gdfkube-src/camel/src/main/java/io/gdfkube/camel/saga/`:
  - `SagaStep.java`, `SagaRunner.java`, `CompensationFailure.java`
  - `CreateOrUpdateSaga.java`, `DeleteSaga.java`
  - `InfraStateChecker.java`
- `gdfkube-src/camel/src/main/java/io/gdfkube/camel/ResourceNameResolver.java` — full switch.
- `gdfkube-src/camel/src/main/resources/routes/cdc-consumer.camel.yaml` — pattern subscription, ≤150 lines (project-level acceptance criterion).
- E2E test suite at `tests/e2e/`:
  - `cluster-request.test.ts` (already from Phase 3)
  - `namespace-request.test.ts`, `scale-request.test.ts`
  - `delete-from-gitea.test.ts` — full create + delete cycle (cluster-request + namespace-request).
  - `scale-patch-only.test.ts` — `scale-request` writes under `orgs/<org>/scales/<clusterName>-<requestId>/`; a follow-up `op=d` on a scale-request is a no-op (no Git activity).
  - `org-tier-isolation.test.ts` — second request from same org leaves infra/ unchanged; delete leaves infra/ unchanged.
  - `partial-org-tier.test.ts` — manually corrupt `infra/orgs/<org>/` (delete one file), assert the saga aborts with `PARTIAL` and surfaces a clear error.
  - `managedcluster-identity.test.ts` — assert the rendered `managedcluster.yaml` carries the §3.10-pinned labels (`cluster.open-cluster-management.io/clusterset`, `gdfkube.gov/org`, `name`) and HyperShift import annotations (regression cover for the Get-then-Create contract).

## 6. Working-project demo

```
$ task dev:up

# Submit one of each form type for the same org
$ for f in cluster-request namespace-request scale-request; do
    curl -fsS -XPOST http://localhost:8080/api/requests \
      -H 'content-type: application/json' \
      --data @gdfkube-src/tests/fixtures/cdc/saude/$f.json
  done

$ task gitea:tree -- gdfkube-src/orgs/saude/
clusters/vacinacao/...
namespaces/saude-shared/...
scales/vacinacao-01HQK.../nodepool-patch.yaml
# (scale-request writes its own patch directory keyed by requestId — see Phase 2 §3.5 + Phase 4 §3.10)

$ task gitea:tree -- gdfkube-src/infra/orgs/saude/
appproject.yaml
applicationset.yaml
managedclusterset.yaml
binding.yaml
namespace.yaml
# Created exactly once, on the first submission

# Submit a second cluster from the same org
$ curl ... cluster-request-2.json
$ task gitea:show -- gdfkube-src/infra/orgs/saude/  # HEAD unchanged

# Delete the first cluster
$ mongosh ... 'db.requests.deleteOne({requestId: "01HQ..."})'
$ task gitea:tree -- gdfkube-src/orgs/saude/clusters/
agendamento-v2/...   # second cluster still here
# vacinacao/ is gone

$ task gitea:show -- gdfkube-src/infra/orgs/saude/    # HEAD still unchanged — org-tier untouched
```

## 7. Acceptance criteria (gate to Phase 5)

- [ ] All three form-type E2E tests pass (`cluster-request`, `namespace-request`, `scale-request`).
- [ ] `delete-from-gitea.test.ts` passes — only cluster-tier removed; `before` payload drove the path resolution.
- [ ] `org-tier-isolation.test.ts` passes:
  - First request from `org=saude` creates `infra/orgs/saude/`.
  - Subsequent requests from `saude` leave `infra/orgs/saude/` HEAD unchanged.
  - Any delete from `saude` leaves `infra/orgs/saude/` HEAD unchanged.
- [ ] `partial-org-tier.test.ts` passes — `PARTIAL` state aborts with reason `infra_tier_partial`.
- [ ] Camel route YAML ≤150 lines (project-level acceptance criterion).
- [ ] Snapshot (`op=r`) events route through the same code path as `op=c` (verified by replaying a Debezium snapshot).
- [ ] Decision for the subscription strategy (pattern vs per-route — §3.6) recorded in `gdfkube-src/camel/README.md`.
- [ ] §4.6 (schema lookup) is formally retired here if not needed; otherwise its replacement design is documented.

## 8. Test plan

| Test                          | Type        | Notes                                                                                |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| Saga forward                  | Unit        | Mock steps, assert order; happy path                                                  |
| Saga compensation             | Unit        | Failing step N → compensations 1..N-1 invoked in reverse                              |
| Compensation failure          | Unit        | A compensation that itself throws → wrapped in `CompensationFailure`                  |
| `InfraStateChecker` outcomes  | Unit        | `EMPTY` / `COMPLETE` / `PARTIAL` against synthetic trees                              |
| Topic-pattern subscription    | Component   | Camel test feeds events on all three form-type topics; correct route picks each       |
| All three form types          | E2E         | One test per form type (`cluster-request`, `namespace-request`, `scale-request`)      |
| ManagedCluster identity       | E2E         | Rendered `managedcluster.yaml` carries §3.10 labels + HyperShift annotations          |
| Scale patch-only delete       | E2E         | `op=d` on a `scale-request` is a no-op (no Git activity, offset committed)            |
| Delete                        | E2E         | Create then delete; assert tier-aware behaviour                                       |
| Org-tier idempotence          | E2E         | Two requests from same org → infra/ created once                                      |
| `op=r` snapshot               | E2E         | `task kafka:resnapshot` triggers a snapshot; verify same path as `op=c`               |

## 9. Risks and on-hold items

- L9 (templateFieldIdentifier indirection) — formally retired here in favour of the per-`formId` switch in `ResourceNameResolver`.
- L11 (templates outlive renderer) — still pinned; Phase 5 closes it via an admin re-render task.

## 10. References

- [Saga pattern](https://microservices.io/patterns/data/saga.html) — orchestration with explicit compensations
- [Apache Camel routing slip / dynamic routing](https://camel.apache.org/components/4.4.x/eips/routingSlip-eip.html) — pattern subscription strategy
- [JGit revert and force-push semantics](https://www.eclipse.org/jgit/) — best-effort compensation step
- [Camel test framework](https://camel.apache.org/components/4.4.x/others/test.html) — saga-level tests with mocked steps
