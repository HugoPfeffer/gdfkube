## Context

The demo cluster runs one ArgoCD (`openshift-gitops`) that today owns both the demo platform (Gitea, Kafka, Mongo, ITSM, Camel, Sonar, Debezium, init-jobs) and every ephemeral tenant artifact the demo generates (per-group AppProjects, ApplicationSets, and the workload Applications they spawn).

Platform GitOps enters via `gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`, an app-of-apps Application pointing at `github.com/HugoPfeffer/gdfkube` on branch `main-openshift`. Tenant GitOps enters via a hand-applied `ApplicationSet` at `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` that scans `orgs/*` on the Gitea repo `gdfkube/gdfkube-orgs`. Each discovered `orgs/<group>/` directory contains an `AppProject` and an `ApplicationSet` rendered by the Camel `OrgBootstrapRoute` (`gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/OrgBootstrapRoute.java`) from the `charts/infra/argocd-org` chart. Each per-group `ApplicationSet` then watches `gdfkube-<group>` and reconciles the cluster/namespace/scale-patch manifests pushed by the ITSM-driven Camel pipeline.

Mixing both concerns produces a noisy ArgoCD UI, couples tenant workloads to the platform's manual-sync convention, and makes "platform vs tenant" hard to demonstrate as a single visual on stage.

The OpenShift GitOps operator already permits multiple `argoproj.io/v1beta1 ArgoCD` CRs across namespaces, so the separation can be expressed as a second instance reconciled by the first.

## Goals / Non-Goals

**Goals:**
- Stand up a second ArgoCD instance dedicated to demo-generated artifacts: namespace `gdfkube-gitops`, CR name `gdfkube-gitops`.
- Reconcile the new instance from the existing platform ArgoCD as a child Application (`gdfkube-argocd-demo`) — GitOps all the way down.
- Move the org-discovery `ApplicationSet`, per-group `AppProject`s, and per-group `ApplicationSet`s into the new instance's namespace; each group keeps its own `AppProject`.
- Switch demo workload Applications to automated sync with prune + self-heal so an approved ITSM request reaches the cluster without operator clicks.
- Leave the Camel `OrgBootstrapRoute` and its rendered git layout (`gdfkube-orgs/orgs/<group>/`) untouched.

**Non-Goals:**
- No changes to the platform Applications already syncing (Gitea, Kafka, Mongo, ITSM, Camel, Sonar, Debezium, init-jobs).
- No changes to the platform's manual-sync convention; it remains `automated` per its existing helpers (`_helpers.tpl` already enables prune+selfHeal). The split is about scope, not policy.
- No new Camel routes, MongoDB collections, or Kafka topics.
- No automated cleanup of stale `orgs/<group>/` directories when a group is removed (out of scope; flag in retrospective).
- No SSO / Keycloak wiring for the new ArgoCD UI — operator defaults (Route on, SSO off) are sufficient for the demo.

## Decisions

### D1: Two ArgoCD instances, not one with logical projects

Chose a second physical ArgoCD instance over a single instance with logical AppProject separation.

- **Alternative considered**: Keep one ArgoCD in `openshift-gitops`, add per-group AppProjects there. Simpler, but a single UI/event stream defeats the demo's "platform vs tenant" narrative and forces auto-sync (good for tenants) onto the same instance that intentionally uses manual review gates for platform Applications.
- **Trade-off accepted**: Two ArgoCD controllers means roughly double the controller-pod footprint and a second RBAC surface. Worth it for the demo clarity and lifecycle independence.

### D2: Bootstrap the demo ArgoCD via platform app-of-apps, not a one-shot manual apply

A new child Application `gdfkube-argocd-demo` under `platform/templates/03-argocd-demo.yaml` reconciles a kustomize bundle at `platform/manifests/argocd-demo/`. The bundle contains the Namespace, ArgoCD CR, ClusterRoleBinding, Gitea repo Secret, and the relocated discovery ApplicationSet.

- **Alternative considered**: Apply the demo ArgoCD CR manually once per cluster (`oc apply -f ...`). Simpler templates, but drifts silently if anyone edits the CR and contradicts the project's "GitOps everywhere" thesis.
- **Trade-off accepted**: One extra Application in platform ArgoCD. Acceptable; the platform already lists ~8 children.

### D3: Sync wave -8 for the demo ArgoCD Application

Placed at wave `-8`, after the Gitea operator subscription at `-10`/`-11` but before init-jobs at `-1`.

- **Rationale**: The demo ArgoCD doesn't need Gitea to *exist* (it only reads from Gitea once tenant repos are populated), but staging it early means the discovery ApplicationSet is ready by the time any group bootstrap fires.

### D4: ClusterRoleBinding to cluster-admin for the demo controller

Bind the auto-created `gdfkube-gitops-argocd-application-controller` ServiceAccount to `cluster-admin`, mirroring how OpenShift GitOps wires its own `openshift-gitops-argocd-application-controller`.

- **Alternative considered**: Custom ClusterRole limited to HostedCluster, NodePool, ManagedCluster, Namespace, and verbs needed inside `hc-<group>-*` / `ns-<group>-*`. More correct, but the namespaces are dynamic and HyperShift+RHACM resource models change across releases — chasing the surface area is its own project. Cluster-admin matches the platform ArgoCD's own posture.
- **Trade-off accepted**: Broader cluster permissions than strictly required. Acceptable for a demo cluster; production hardening is a separate concern.

### D5: Move discovery ApplicationSet, delete the standalone file

The file at `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` is deleted. Its content (with `namespace: gdfkube-gitops` and `destination.namespace: gdfkube-gitops`) moves into `platform/manifests/argocd-demo/org-repos-discovery.yaml`.

- **Alternative considered**: Keep a copy in `openshift-gitops` and mirror to `gdfkube-gitops` during transition. Risks duplicate `Application`s syncing the same `orgs/<group>/` to two different ArgoCD instances and racing on the per-group `AppProject` ownership. Hard "one place" is safer.

### D6: Per-group ApplicationSet template adds `syncPolicy.automated`

Append the block below to `charts/infra/argocd-org/templates/applicationset.yaml`:

```yaml
syncPolicy:
  automated:
    prune: true
    selfHeal: true
  syncOptions:
    - CreateNamespace=true
```

`CreateNamespace=true` matters because tenant namespaces (`ns-<group>-*`, `hc-<group>-*`) are created by the workload manifests themselves rather than declared centrally.

### D7: Hardcode `namespace: gdfkube-gitops` in the chart (don't parameterize)

The two argocd-org chart templates currently hardcode `namespace: openshift-gitops`. Flip both to `namespace: gdfkube-gitops` directly rather than adding a Helm value.

- **Rationale**: YAGNI. There is exactly one demo ArgoCD instance. Adding a value now invites a configuration knob that has no second valid setting. If a second demo instance ever appears, that's when the value gets introduced.

### D8: No Camel changes

`OrgBootstrapRoute` keeps rendering the same chart and committing to `gdfkube-orgs/orgs/<group>/`. The chart's namespace flip is transparent to Camel.

- **Rationale**: Keeps the change surface in YAML / Helm; no JVM build, no test re-baseline for Camel.

## Risks / Trade-offs

- **[Risk]** Gitea repo authentication for `gdfkube-<group>.git` from inside `gdfkube-gitops` — the discovery ApplicationSet only reads `gdfkube-orgs`, but each per-group ApplicationSet reads its own repo. → **Mitigation**: ship a single `repo-creds` style Secret in `gdfkube-gitops` covering `https://gitea-gitea.apps.gdfkube.gov/gdfkube/*` (Argo's wildcard credential template). Confirm Gitea CR allows the existing platform token; if not, mint a read-only token via the same `gitea-token-sync-job` pattern.
- **[Risk]** Stale tenant AppProjects/ApplicationSets in the live `openshift-gitops` from prior demo runs. → **Mitigation**: document a one-shot `oc delete appproject,applicationset -n openshift-gitops -l gdfkube.io/organization` for clusters that already ran a demo before this change lands.
- **[Risk]** The OpenShift GitOps operator's per-CR ClusterRoleBinding naming might differ across operator versions. → **Mitigation**: pin the binding to the exact ServiceAccount the operator creates (`gdfkube-gitops-argocd-application-controller`) and verify on a fresh cluster as part of the verification step.
- **[Risk]** Automated sync + prune on tenant workloads will *delete* resources whose manifests Camel removes from `gdfkube-<group>`. For a demo this is desired; in production it would be a footgun. → **Mitigation**: documented as a demo-only choice in `brainstorm.md`; not exposed as a value, so promotion to non-demo deployments would require a deliberate edit.
- **[Trade-off]** Doubling the ArgoCD controller footprint costs ~250m CPU + ~512Mi memory per node compared to single-instance. Acceptable on the demo cluster sizing.

## Migration Plan

This change is additive on a cluster that has not yet run the demo, and minimally surgical on one that has:

1. Apply `platform/app-of-apps.yaml` (no-op if already applied).
2. The platform ArgoCD reconciles the new `gdfkube-argocd-demo` Application, which installs the `gdfkube-gitops` namespace, ArgoCD CR, ClusterRoleBinding, repo Secret, and discovery ApplicationSet.
3. The discovery ApplicationSet in `gdfkube-gitops` enumerates `orgs/*` on `gdfkube-orgs` and creates child Applications targeting `gdfkube-gitops`.
4. Each child Application creates the `AppProject` + `ApplicationSet` for its group in `gdfkube-gitops`.
5. On a cluster with stale tenant resources in `openshift-gitops`, run `oc delete appproject,applicationset -n openshift-gitops -l gdfkube.io/managed=true` (Camel-rendered manifests carry this label, see `charts/infra/argocd-org/values.yaml:23`).

**Rollback**: revert the platform commits and delete the demo ArgoCD CR (`oc delete argocd gdfkube-gitops -n gdfkube-gitops` then `oc delete namespace gdfkube-gitops`). The previous hand-applied discovery file must be re-created in `openshift-gitops` if rollback is needed mid-demo; preserve its content in the commit history of this change.

## Open Questions

- Are existing Gitea repos public-read or token-gated? If public-read, no per-group repo Secret is needed; if token-gated, a wildcard `repo-creds` secret must land in the `argocd-demo` bundle. Verify against the live Gitea CR during verification.
- Should the new ArgoCD UI expose a `Route` at a demo-friendly host (e.g. `gitops.apps.gdfkube.gov`)? Operator default uses a generated hostname; confirm with the demo presenter whether they want a stable URL.
