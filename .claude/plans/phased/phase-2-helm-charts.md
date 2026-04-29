# Phase 2 — Helm charts + chart-lint CI gate

| Field         | Value                              |
| ------------- | ---------------------------------- |
| Status        | Not started                        |
| Predecessor   | [Phase 1](phase-1-cdc-ingest.md)   |
| Successor     | [Phase 3](phase-3-mvp-consumer.md) |

## 1. Scope

Author the Helm charts that the Camel consumer will eventually render, plus the **mandatory chart-lint CI gate** that catches L10-class bugs before they ship. Phase 2 is "the charts work when you `helm template` them by hand"; runtime rendering happens in Phase 3.

In:

- One chart per form type under `gdfkube-src/charts/` (the three forms the remix bundle exposes — see Phase 0 §0.3):
  - `cluster-request/` — HostedCluster (in namespace `clusters`, name `hc-{org}-{cluster}`), NodePool, ManagedCluster (name `{cluster}`, with the clusterset label and HyperShift hosted-mode annotations — see §3.10), KlusterletAddonConfig.
  - `namespace-request/` — Namespace + ResourceQuota.
  - `scale-request/` — patch-only chart (NodePool replicas) keyed by `vars.clusterName` + `vars.newNodeCount`.
- One org-tier chart at `gdfkube-src/charts/infra/` — AppProject (name `{org}`), ApplicationSet (name `appset-{org}-{cluster}`-templated), ManagedClusterSet (name `{org}`, `selectorType: ExclusiveClusterSetLabel`), ManagedClusterSetBinding, Namespace.
- Per-chart `tests/fixtures/*.values.yaml` — at least one fixture per chart, drawn from the seed data in the remix bundle (`saude/vacinacao`, `educacao/matricula-portal`, …).
- Per-chart `tests/snapshots/*.expected.yaml` — checked-in render snapshots.
- Decision and implementation for **ArgoCD-side templating** (see §3.4 — three options, Option B chosen).
- Decision and implementation for **chart packaging** (see §3.9 — one chart per form type, no umbrella).
- `.github/workflows/chart-lint.yaml` upgraded from Phase-0 skeleton to a real gate.

## 2. Out of scope

- Camel consumer wiring (Phase 3).
- Saga / org-tier rendering at runtime (Phase 4).
- ArgoCD installation in the kind cluster used by lint — only its CRDs need to be loaded.
- **`etcd-encryption-secret`.** v1 emitted an `etcd-encryption-secret.yaml.mustache` per cluster. v2 deliberately does not — encryption-at-rest is reintroduced as a separate concern post-cutover (not a Phase-5 blocker). The chart-lint gate would otherwise need a fixture key path for it.
- **Platform-bootstrap manifests.** The `gdfkube-platform` AppProject, the `org-infra-discovery` ApplicationSet, and `setic-platform-admin` / `setic-operator` ClusterRoles are owned by the operator install runbook (see Phase 0 §0.5). v2's `infra` chart only renders *per-org* resources that live under `gdfkube-src/infra/orgs/<org>/`.
- **Hub-targeted policies** (e.g. `inject-pull-secret` `ConfigurationPolicy` resources). Out of scope for v2 charts.

## 3. Architecture

### 3.1 Engine choice (closes L3)

v2 drops Mustache + Kustomize and renders manifests with **Helm**. Reasons: Helm has first-class ArgoCD support (no two-pass mustache hack), `helm lint` + `helm template` give us a real test loop, and Helm sub-chart conditionals match the form-type-per-chart model the remix surfaces.

The v1 collision (Mustache `{{ }}` colliding with ArgoCD's `{{ }}`) is replaced by a Helm-vs-ArgoCD `{{ }}` collision in a different form. §3.4 below resolves it.

### 3.2 Chart conventions

Helm's native `Chart.yaml` + `values.yaml` + `templates/` replaces v1's `pack.yaml` indirection. The contract this phase establishes:

- One chart per form type, under `gdfkube-src/charts/<formId>/`.
- The chart's `values.yaml` documents every variable the form can supply; `helm lint` enforces presence.
- Tier (customer vs infra) is encoded in the chart's `Chart.yaml` `annotations.gdfkube.gov/tier`. `tier: infra` charts target `gdfkube-src/infra/orgs/<org>/`; `tier: customer` charts target `gdfkube-src/orgs/<org>/<plural>/<resourceName>/`. (These are Helm chart-metadata annotations consumed by Phase 3's renderer; they never appear on rendered Kubernetes objects, distinct from the resource labels documented in §3.3.)
- The plural subdirectory (`clusters/`, `namespaces/`, `scales/`) is taken from `Chart.yaml`'s `annotations.gdfkube.gov/outputRoot` (replaces v1's `outputRoot` in `pack.yaml`).
- New form types are pure-config: add a chart under `charts/`, add a Camel route for the new topic (Phase 1's per-form-type topic naming makes this additive), no other code change.

### 3.3 Values contract (the input shape every chart must accept)

Helm's `values.yaml` is the contract. The Camel consumer (Phase 3) builds a values object from the CDC `RequestContext` and feeds it to `helm template`. The shape is:

```yaml
body:
  formId: string
  requestId: string # ULID
  createdAt: string # ISO-8601, converted from Mongo Extended JSON
  meta:
    requesterName: string
    requesterGroupName: string
    guid: string # 4-hex-char, derived deterministically from requestId (see L6 Alt A, owned by Phase 3)
  vars:
    <slug>: <value> # whatever the form schema defines
org: string # alias for body.meta.requesterGroupName (convenience for infra charts)
gitea:
  host: string
  port: string
  owner: string
  externalUrl: string # used for repoURL in ArgoCD resources
```

Templates inside a chart access fields via `{{ .Values.body.vars.clusterName }}` etc. Authoring `{{ .Values.clusterName }}` (no `body.vars.` prefix) renders empty and is caught by the §3.6 lint gate — see L10.

**Mandatory labels on every emitted resource (locked at Phase 0 §0.3):** `gdfkube.gov/group: {{ .Values.org }}`. The label is the v2 contract for fleet-wide selectors (e.g. RHACM `Placement`, ArgoCD `ApplicationSet` cluster generators in the remix), and it is rendered by every chart — `cluster-request`, `namespace-request`, `scale-request`, and `infra`. Charts do **not** emit `gdfkube.io/*`, `setic.gov.br/*`, or `gdfkube.gov/env` — `env` is form-specific and was rejected in the Phase-0 label decision. The clusterset membership label `cluster.open-cluster-management.io/clusterset: {{ .Values.org }}` is additionally required on `ManagedCluster` (RHACM-mandated, not gdfkube convention).

### 3.4 ArgoCD-side templating decision (Option B)

When a template produces a manifest that itself contains Go-template syntax (ArgoCD ApplicationSets), Helm's `{{ }}` and ArgoCD's `{{ }}` collide. Three options were on the table:

- **Option A.** Escape ArgoCD placeholders inside Helm templates with `{{ "{{" }}.path.basename{{ "}}" }}` — explicit but noisy.
- **Option B (chosen).** Render the ApplicationSet *outside* the per-form chart, in a dedicated `infra` chart that has no Helm-side `{{ }}` of its own. The chart only emits literal Go-template text.
- **Option C.** Pre-render with a sentinel (`__ARGO_OPEN__`/`__ARGO_CLOSE__`), substitute back to `{{`/`}}` after `helm template` returns.

**Why B.** Cheapest in template noise, most readable, and isolates the ApplicationSet definition to one chart that future maintainers find by name. The `infra` chart's templates contain literal `{{` text and the `helm template` invocation is parameterised so Helm itself never tries to expand those — accomplished by keeping the Go-template-bearing strings in `Values.literal.*` keys that the templates emit unchanged.

### 3.5 Output paths (inside the monorepo, populated by Phase 3+)

```
gdfkube-src/orgs/<org>/                 # customer-tier, deletable per request
├── clusters/<resourceName>/            # from charts/cluster-request, resourceName=vars.clusterName
│   ├── managedcluster.yaml             # name: {clusterName}, with clusterset label + HyperShift import annotations (see §3.10)
│   ├── klusterletaddonconfig.yaml      # name: {clusterName}, lives in the {clusterName} namespace RHACM creates
│   ├── hostedcluster.yaml              # name: hc-{org}-{clusterName}, namespace: clusters
│   └── nodepool.yaml                   # name: hc-{org}-{clusterName}-workers, namespace: clusters
├── namespaces/<resourceName>/          # from charts/namespace-request, resourceName=vars.namespaceName
│   ├── namespace.yaml
│   └── resourcequota.yaml
└── scales/<resourceName>-<requestId>/  # from charts/scale-request, resourceName=vars.clusterName
    └── nodepool-patch.yaml             # patch-only; multiple scale events accumulate as separate dirs

gdfkube-src/infra/orgs/<org>/           # org-tier, append-only across requests (rendered from charts/infra/)
├── appproject.yaml                     # name: {org}
├── applicationset.yaml                 # name: appset-{org}, generator path 'clusters/*' inside the org subtree
├── managedclusterset.yaml              # name: {org}, selectorType: ExclusiveClusterSetLabel
├── binding.yaml                        # ManagedClusterSetBinding {org} → {org}
└── namespace.yaml                      # the org's hub-side namespace if needed by ApplicationSet destinations
```

The `scales/` subdirectory layout treats each scale request as an immutable patch document keyed by `requestId` (rather than overwriting `clusters/<clusterName>/nodepool.yaml`), so the audit trail of scale events survives a delete of the cluster. Phase 4's `ResourceNameResolver` for `scale-request` resolves to `vars.clusterName` for the resource-name component but the saga writes under `scales/{clusterName}-{requestId}/` to keep the path unique.

### 3.6 Chart-lint pipeline (mandatory CI gate, closes L10)

A GitHub Actions job runs on every PR that touches `gdfkube-src/charts/**` (and on every push to `main`). The job is **required** for merge — it is the gate that catches L10-class bugs (wrong values paths rendering empty `metadata.name` / `name:` strings).

For each chart under `gdfkube-src/charts/`:

1. **Fixtures.** Render against a corpus of synthetic `values.yaml` files at `gdfkube-src/charts/<formId>/tests/fixtures/*.values.yaml` — at least one per form type the remix exposes (`cluster-request`, `namespace-request`, `scale-request`) plus the `infra` chart.
2. **`helm lint <chart>`** — fails on schema, indentation, or required-value violations.
3. **`helm template <chart> -f <fixture>`** — produces the manifest tree.
4. **`kubectl apply --dry-run=server -f -`** against a kind cluster pre-loaded with the CRDs the chart depends on (HyperShift, KubeVirt, RHACM, ArgoCD). Server-side dry-run catches missing required fields, wrong API versions, and most variable-path bugs.
5. **Diff snapshot** — render output is byte-compared against a checked-in `*.expected.yaml`; intentional drift requires a deliberate snapshot update in the PR.

Failure at any step blocks merge. The fixture corpus is owned by the chart authors; the lint runner is a single reusable workflow at `.github/workflows/chart-lint.yaml`.

### 3.7 Sync-wave preservation (closes L2)

ManagedCluster (sync-wave 0) must be accepted by RHACM before KlusterletAddonConfig (sync-wave 2) can land in the `{clusterName}` namespace that RHACM creates as a side-effect. Charts encode the sync-wave annotation on every emitted manifest:

```yaml
metadata:
  annotations:
    argocd.argoproj.io/sync-wave: "0"
```

The chart-lint snapshot diff test catches any inadvertent strip of the annotation.

### 3.8 Hardcoded values policy

v1 templates carry hardcoded `clusterCIDR`, `serviceCIDR`, instance type, base domain, etc. v2 keeps these defaults but moves them into idiomatic Helm:

- Defaults live in each chart's `values.yaml` under a clearly-labelled `defaults:` block.
- Form-supplied vars override defaults via the `body.vars.*` path; `helm template -f <fixture>` exercises both paths in CI.
- Sensitive defaults (e.g. base domain) move to a single shared `values.shared.yaml` consumed via `--values` so they aren't repeated across charts.

### 3.9 Chart packaging decision (one chart per form type)

**Open question:** one chart per form type, or one umbrella chart with conditional sub-charts? **Decision: one chart per form type.** Reasons: independent versioning, smaller blast radius on a chart change, simpler `helm template charts/<formId>` invocation from Phase 3's renderer. Cost: shared helpers must be duplicated or factored into a chart library — acceptable at the current chart count.

### 3.10 ManagedCluster pre-creation contract (Get-then-Create with the HyperShift addon-agent)

The `cluster-request` chart's `managedcluster.yaml` template is the **authoritative source** for the `ManagedCluster` resource's identity. RHACM's `hypershift-addon-agent` runs a Get-then-Create on the hosting cluster: if a `ManagedCluster` named `{vars.clusterName}` already exists when the addon-agent fires, it skips creation and **preserves all labels and annotations**. This is the only way to guarantee the cluster joins the correct `ManagedClusterSet` (the per-org one, not the default) — RHACM does not support `selectorType: LabelSelector` on user-created sets, so membership is set by the explicit `cluster.open-cluster-management.io/clusterset` label at pre-creation time.

The chart's `managedcluster.yaml` therefore must emit, all at sync-wave **0** (so it lands before HyperShift's `HostedCluster` reconciles and before the addon-agent fires):

```yaml
metadata:
  name: {{ .Values.body.vars.clusterName }}
  labels:
    cluster.open-cluster-management.io/clusterset: {{ .Values.org }}   # exclusive set membership
    gdfkube.gov/group: {{ .Values.org }}                               # fleet-selector label (Phase 0 §0.3)
    name: {{ .Values.body.vars.clusterName }}                          # standard RHACM convention
  annotations:
    import.open-cluster-management.io/klusterlet-deploy-mode: "Hosted"
    import.open-cluster-management.io/hosting-cluster-name: "local-cluster"
    open-cluster-management/created-via: "hypershift"
spec:
  hubAcceptsClient: true
```

The chart-lint snapshot test pins these labels and annotations; removing or renaming any of them must be a deliberate snapshot update in the same PR. Phase 4's `tier-aware destinations` discussion (§3.7) cross-references this contract: the cluster-tier render is the authoritative ManagedCluster identity, and the org-tier `ManagedClusterSet` is the receiving set.

### 3.11 Pull-secret availability gate (sync-wave -1, fail-fast)

Pull-secret distribution to the `clusters` namespace is performed by an externally-installed RHACM `ConfigurationPolicy` (locked out of v2 scope in Phase 0 §0.5). The `cluster-request` chart must not assume the secret is present at sync-time; it must also not silently retry forever. The chosen design is a **chart-level wait Job at sync-wave `-1`** that fails fast.

Why the chart and not the Camel saga: the saga commits manifests to Git and never blocks on hub-cluster state — that decoupling is the whole point of monorepo + GitOps. ArgoCD is the only layer that has direct visibility of the target Secret, so the wait belongs there and surfaces as a normal Application `Degraded` state.

Values block (defaults shown):

```yaml
pullSecretWait:
  enabled: true                # default-on for OCP; local fixtures override to false
  secretName: pull-secret      # HostedCluster.spec.pullSecret.name (LocalObjectReference)
  secretNamespace: clusters    # HostedCluster's own namespace; not the control-plane namespace
  timeoutSeconds: 180          # 2-3 RHACM ConfigurationPolicy reconcile passes
  image: registry.redhat.io/openshift4/ose-cli:latest
```

Rendered by `charts/cluster-request/templates/_pull-secret-wait.yaml` (only this chart — `namespace-request` and `scale-request` don't need it):

```yaml
{{- if .Values.pullSecretWait.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: wait-pull-secret-{{ .Values.body.vars.clusterName }}
  namespace: {{ .Values.pullSecretWait.secretNamespace }}
  annotations:
    argocd.argoproj.io/sync-wave: "-1"
    argocd.argoproj.io/hook: Sync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
  labels:
    gdfkube.gov/group: {{ .Values.org }}
spec:
  activeDeadlineSeconds: {{ .Values.pullSecretWait.timeoutSeconds }}
  backoffLimit: 0
  ttlSecondsAfterFinished: 300
  template:
    spec:
      serviceAccountName: argocd-manager
      restartPolicy: Never
      containers:
        - name: wait
          image: {{ .Values.pullSecretWait.image }}
          command: ["/bin/sh","-c"]
          args:
            - |
              until kubectl -n {{ .Values.pullSecretWait.secretNamespace }} \
                get secret {{ .Values.pullSecretWait.secretName }} \
                -o name >/dev/null 2>&1; do
                echo "waiting for pull-secret"; sleep 5;
              done
{{- end }}
```

After `activeDeadlineSeconds`, the Job exits non-zero, ArgoCD marks the per-cluster Application `Degraded`, and the operator investigates the missing `ConfigurationPolicy`. There is **no** Camel-side compensation — the commit already landed; the saga doesn't see this failure. There is **no** DLQ entry — the consumer never sees the wait outcome.

Local-vs-OCP parity: `score-helm` local profile and the chart-lint local fixture set `pullSecretWait.enabled=false` (no ArgoCD/RHACM on Compose). Chart-lint adds **two** fixtures per `cluster-request` — `*.with-wait.values.yaml` (default) and `*.no-wait.values.yaml` — with snapshots verifying the Job is rendered exactly once and not at all, respectively.

### 3.12 AppProject impersonation (`destinationServiceAccounts`)

The `infra` chart's AppProject template inherits v1's impersonation contract: per-org Applications use the `local-cluster:argocd-manager` ServiceAccount via the AppProject's `destinationServiceAccounts` block, both for the org's pinned namespace and as a `*` fallback. The chart template emits:

```yaml
spec:
  destinationServiceAccounts:
    - server: https://kubernetes.default.svc
      namespace: clusters
      defaultServiceAccount: local-cluster:argocd-manager
    - server: https://kubernetes.default.svc
      namespace: "*"
      defaultServiceAccount: local-cluster:argocd-manager
```

The `clusters` namespace (HyperShift's HostedCluster home, locked in Phase 0 §0.3) replaces v1's `hc-{org}` because v2 lands HostedClusters in the standard HyperShift namespace, not a per-org one. The `*` fallback is required so ArgoCD can apply the `KlusterletAddonConfig` into the `{clusterName}` namespace that RHACM creates as a side-effect (see Phase 2 §3.7 sync-wave 2). Chart-lint snapshot pins this block; the AppProject acceptance test in §7 is extended accordingly.

### 3.13 KlusterletAddonConfig contract

The `cluster-request` chart's `klusterletaddonconfig.yaml` template emits a `KlusterletAddonConfig` (`agent.open-cluster-management.io/v1`) named `{clusterName}` in the `{clusterName}` namespace that RHACM creates as a side-effect of accepting the ManagedCluster. The chart enables the standard add-on set (policy controller, application manager, observability, search collector, cert policy) at default values; no form variable customizes them in v2. Sync-wave `2` (after ManagedCluster wave 0). Chart-lint snapshot pins the resource shape; future form variables that toggle add-ons would be additive values keys with no template restructure.

## 4. Lessons applied in this phase

### L2 — Sync-wave ordering matters inside a single rendered package

**Origin (v1).** ManagedCluster (sync-wave 0) must be accepted before RHACM creates the `{clusterName}` namespace that KlusterletAddonConfig (sync-wave 2) lives in. Reference commits: `e9c404c`, `85b83cd`.

**Action in Phase 2.** Every Helm template that emits a manifest sets `metadata.annotations["argocd.argoproj.io/sync-wave"]` explicitly (see §3.7). The chart-lint snapshot diff (§3.6 step 5) catches any inadvertent removal of the annotation.

### L3 — Mustache `{{ }}` collides with ArgoCD Go templates `{{ }}`

**Origin (v1).** Fixed at v1 with `{{=<% %>=}}` delimiter switching inside ApplicationSet templates. Reference: `templates/infra/argocd/applicationset.yaml.mustache`.

**Action in Phase 2.** v2 drops Mustache + Kustomize and renders manifests with **Helm**. Helm itself uses `{{ }}` and so does ArgoCD's ApplicationSet generator, so a different escaping strategy is needed. §3.4 records three options (Option A explicit escapes, Option B isolating the Go-template-bearing manifests in a dedicated `infra` chart, Option C sentinel-substitute) and selects **Option B** as the cheapest and most readable. The `infra` chart's templates contain literal `{{` text that Helm itself never tries to expand because the relevant strings live in `Values.literal.*` keys the templates emit unchanged.

### L10 — Wrong template variable paths only surface end-to-end

**Origin (v1).** Templates that read `{{clusterName}}` instead of `{{body.vars.clusterName}}` rendered as `name: ` (empty) and were caught by the TDD loop, not by review. Reference commit: `13cea69`.

**Action in Phase 2.** v2 ships a **mandatory chart-lint CI gate** on every PR that touches `gdfkube-src/charts/` (§3.6). The gate runs `helm lint` + `helm template -f <fixture>` + `kubectl apply --dry-run=server` against a kind cluster pre-loaded with the relevant CRDs. Variable-path bugs (`{{ .Values.clusterName }}` vs `{{ .Values.body.vars.clusterName }}`) surface as an empty `metadata.name` and fail the server-side dry-run step. The gate is required for merge.

### Open question closed by this phase

The "chart packaging" open question (one chart per form type vs umbrella with sub-charts) is closed in §3.9. Decision: one chart per form type.

## 5. Deliverables

- `gdfkube-src/charts/<formId>/{Chart.yaml,values.yaml,templates/*}` × 4 charts (3 form-types + `infra`).
- `gdfkube-src/charts/<formId>/tests/fixtures/*.values.yaml` — N fixtures per chart.
- `gdfkube-src/charts/<formId>/tests/snapshots/*.expected.yaml` — render snapshots.
- `.github/workflows/chart-lint.yaml` — required for merge on `gdfkube-src/charts/**`.
- `gdfkube-src/scripts/install-crds.sh` — installs HyperShift, KubeVirt, RHACM, ArgoCD CRDs into a kind cluster (used by both the CI lint job and developers running `task chart:lint` locally).
- `Taskfile.yaml` adds `chart:lint`, `chart:render <formId> <fixture>`, `chart:snapshot <formId>`.
- `gdfkube-src/charts/README.md` — chart conventions (annotation keys, fixture layout, snapshot policy).

## 6. Working-project demo

```
$ task chart:render -- cluster-request saude.values.yaml | head -30
# A valid HostedCluster + NodePool + ManagedCluster + KlusterletAddonConfig tree

$ task chart:lint
# helm lint + helm template + kubectl apply --dry-run=server for every chart × every fixture
PASS  charts/cluster-request    (2 fixtures)
PASS  charts/namespace-request  (1 fixture)
PASS  charts/scale-request      (1 fixture)
PASS  charts/infra              (3 fixtures)

# Demonstrate the L10 trap — open a PR that introduces a wrong-path bug
$ sed -i 's/.Values.body.vars.clusterName/.Values.clusterName/' \
    gdfkube-src/charts/cluster-request/templates/managedcluster.yaml
$ git push origin l10-regression
# CI fails on chart-lint, with a server-side dry-run error pointing at the empty metadata.name
```

## 7. Acceptance criteria (gate to Phase 3)

- [ ] All four charts render successfully against ≥1 fixture each.
- [ ] `helm lint` passes on every chart.
- [ ] `kubectl apply --dry-run=server` (against a kind cluster with CRDs from `install-crds.sh`) succeeds on every rendered fixture.
- [ ] Snapshot tests catch unintended drift — a deliberate template change updates `expected.yaml` in the same PR.
- [ ] `chart-lint.yaml` is **required** to merge into `main` for any PR touching `gdfkube-src/charts/**`.
- [ ] L10 regression demo: a wrong-values-path bug introduced on a feature branch causes CI to fail with a clear "empty `metadata.name`" error.
- [ ] §3.4 decision (B) recorded in `gdfkube-src/charts/README.md`; ApplicationSet template demonstrates literal-Go-template emission with no `helm template` interference.
- [ ] §3.9 decision (one chart per form type) recorded.
- [ ] `cluster-request` chart's `managedcluster.yaml` snapshot test pins the §3.10 labels (`cluster.open-cluster-management.io/clusterset`, `gdfkube.gov/group`, `name`) and HyperShift import annotations; removing any of them fails CI.
- [ ] Every emitted Kubernetes resource (cluster-tier and org-tier) carries `gdfkube.gov/group: {{ .Values.org }}`; no rendered resource carries `gdfkube.io/*`, `setic.gov.br/*`, or `gdfkube.gov/env` (Phase 0 §0.3 contract). Chart-metadata annotations on `Chart.yaml` (e.g. `gdfkube.gov/tier`, `gdfkube.gov/outputRoot`) are excluded from this rule — they are renderer-internal metadata and never reach the cluster.
- [ ] `cluster-request` chart emits a sync-wave `-1` `Job` named `wait-pull-secret-{clusterName}` by default (`pullSecretWait.enabled=true`); chart-lint snapshot pins the manifest, the 180s `activeDeadlineSeconds`, the `Sync` hook, and `argocd-manager` SA. A `pullSecretWait.enabled=false` fixture renders zero Jobs — verified by snapshot diff.
- [ ] `infra` chart's AppProject template emits the two `destinationServiceAccounts` entries (clusters + `*` fallback) verbatim; chart-lint snapshot pins them.
- [ ] `cluster-request` chart's `klusterletaddonconfig.yaml` renders at sync-wave 2 with the standard add-on set; chart-lint snapshot pins the resource shape.

## 8. Test plan

| Test                          | Type        | How                                                                            |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------ |
| Chart renders                 | CI / Manual | `task chart:lint`                                                              |
| Snapshot diff                 | CI          | `helm template …` piped into `diff -u tests/snapshots/<…>.expected.yaml -`     |
| Server-side dry-run           | CI          | `helm template` piped into `kubectl apply --dry-run=server -f -`               |
| L10 regression                | Manual      | The intentional bad-path PR demonstrated above                                 |
| ArgoCD-side template survives | Manual      | `helm template charts/infra` produces output where `{{ .path.basename }}` etc. remain literal |
| Required-status               | CI config   | Branch protection requires `chart-lint` for merge                              |

## 9. Risks and on-hold items

- L3 (Mustache vs ArgoCD `{{ }}`) collapses to "Helm vs ArgoCD `{{ }}`" and is resolved by the §3.4 decision recorded in this phase. If Option B turns out to leak Go-template `{{ }}` through Helm's parser in some edge case, fall back to Option A (explicit escapes); Option C is a last resort.
- v1's `pack.yaml` indirection is formally retired here; chart conventions live in `Chart.yaml` annotations + `values.yaml` + `gdfkube-src/charts/README.md`.

## 10. References

- [Helm best practices](https://helm.sh/docs/chart_best_practices/) — naming, values, templates
- [Helm chart linting](https://helm.sh/docs/helm/helm_lint/) — `helm lint`
- [ArgoCD ApplicationSet generators](https://argo-cd.readthedocs.io/en/stable/operator-manual/applicationset/) — Cluster, Git directory, list
- `kubectl apply --dry-run=server` — the server-side validation step backing §3.6's gate
- HyperShift, KubeVirt, RHACM, ArgoCD CRD bundles for `install-crds.sh`
