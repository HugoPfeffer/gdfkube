## Why

The demo cluster currently runs a single ArgoCD instance in `openshift-gitops` that owns both the demo platform (Gitea, Kafka, Mongo, ITSM, Camel, init-jobs) and every ephemeral tenant artifact the demo generates (per-group AppProjects, ApplicationSets, workload Applications). Mixing both surfaces in one UI/event stream defeats the demo's "platform vs tenant" narrative and forces a single sync policy onto two very different lifecycles. Splitting tenant GitOps into its own ArgoCD instance also lets demo workloads auto-sync without changing the platform's review-gate convention.

## What Changes

**Demo ArgoCD instance**
- From: single ArgoCD in `openshift-gitops` owning everything.
- To: a second ArgoCD CR named `gdfkube-gitops` in namespace `gdfkube-gitops`, reconciled by the platform ArgoCD as a new app-of-apps child Application `gdfkube-argocd-demo`.
- Reason: lifecycle and visual separation between platform and tenant GitOps.
- Impact: non-breaking on a clean cluster; adds one Application under `platform/`. Clusters that already ran the demo need a one-shot cleanup of stale tenant resources in `openshift-gitops` (documented in design migration plan).

**Org-discovery ApplicationSet location**
- From: hand-applied static file at `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` in `openshift-gitops`.
- To: reconciled manifest inside the platform-managed `argocd-demo` kustomize bundle, deployed into `gdfkube-gitops`; generated child Applications target `gdfkube-gitops` instead of `openshift-gitops`.
- Reason: GitOps the discovery itself; remove the manual bootstrap step.
- Impact: breaking for anyone who relies on the old file path — operators must stop `oc apply`-ing it.

**Per-group AppProject and ApplicationSet templates**
- From: `charts/infra/argocd-org/templates/{appproject,applicationset}.yaml` hardcoded to `namespace: openshift-gitops`; ApplicationSet template emits an empty `syncPolicy: {}` for generated workload Applications.
- To: both templates hardcoded to `namespace: gdfkube-gitops`; ApplicationSet template emits `syncPolicy.automated: { prune: true, selfHeal: true }` plus `syncOptions: [CreateNamespace=true]` on generated Applications.
- Reason: tenants live in the new instance; demo workloads auto-reconcile end-to-end from approved ITSM request to live cluster resources.
- Impact: changes the rendered output the Camel `OrgBootstrapRoute` commits into `gdfkube-orgs/orgs/<group>/`. Camel code itself is unchanged.

## Capabilities

### New Capabilities

- `argocd-demo-instance`: the second ArgoCD instance dedicated to demo-generated tenant artifacts — namespace, ArgoCD CR, cluster-role binding, Gitea repo credentials, and the discovery ApplicationSet, all reconciled by the platform ArgoCD as a single child Application.

### Modified Capabilities

- `argocd-org-stack`: requirements about where AppProject + ApplicationSet land (now `gdfkube-gitops` instead of `openshift-gitops`), the sync policy of generated workload Applications (now `automated` with `prune`+`selfHeal`+`CreateNamespace=true` instead of empty), and how the discovery ApplicationSet is delivered (now via the `argocd-demo-instance` bundle instead of a hand-applied static file).

## Impact

- **Manifests changed/added**:
  - New: `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/{namespace,argocd,clusterrolebinding,repo-secret,org-repos-discovery,kustomization}.yaml`
  - New: `gdfkube-src/gdfkube-infra/platform/templates/03-argocd-demo.yaml`
  - Deleted: `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`
  - Modified: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/appproject.yaml` (namespace)
  - Modified: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/applicationset.yaml` (namespace + syncPolicy)
- **Cluster impact**: one new namespace (`gdfkube-gitops`), one new ArgoCD CR, one new ClusterRoleBinding, one new repo Secret, plus the demo ArgoCD's own controller/repo-server/server/applicationset-controller/redis pods (operator-managed). Extra footprint ≈ 250m CPU + 512Mi memory per relevant node.
- **No code or schema changes**: `gdfkube-itsm`, `gdfkube-camel`, MongoDB collections, Kafka topics, and Debezium connectors are untouched.
- **CI/testing strategy**: existing Helm template render tests cover the `argocd-org` chart's namespace and sync-policy outputs; one new render assertion confirms the platform template produces the `gdfkube-argocd-demo` Application pointing at the new bundle path. No new integration test infrastructure needed — verification is via `helm template` plus a cluster bootstrap dry-run.
- **Documentation**: any reference to `oc apply -f gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` must be removed or replaced with the new bootstrap path (`oc apply -n openshift-gitops -f gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`).
