## Design Summary

Stand up a second ArgoCD instance (`gdfkube-gitops` CR in the `gdfkube-gitops` namespace) dedicated to demo-generated tenant artifacts, and keep the existing `openshift-gitops` ArgoCD focused on the platform itself. Platform ArgoCD bootstraps the demo ArgoCD via a new app-of-apps child Application. The hub-level `org-repos-discovery` ApplicationSet, the per-group `AppProject`s, and the per-group `ApplicationSet`s (all currently in `openshift-gitops`) move into `gdfkube-gitops`. Each group keeps its own `AppProject` named after the group, scoped to its `gdfkube-<group>` Gitea repo and `hc-<group>-*` / `ns-<group>-*` namespaces. Demo workload Applications get `automated` sync with `prune` + `selfHeal`.

## Alternatives Considered

### Option A: Single ArgoCD with logical AppProject split
- **Approach**: Keep one ArgoCD in `openshift-gitops`. Add per-group AppProjects there. No second instance.
- **Pros**: Simplest. No new namespace, no new CR, no new RBAC.
- **Cons**: Platform Applications and ephemeral tenant Applications share one UI, one event stream, one notification channel; pruning/automated-sync for tenant workloads couples to the platform's manual-sync convention; harder to demo "platform vs tenant" separation in a single screenshot.
- **Why not chosen**: The whole point of this change is to give the demo a clean visual + lifecycle split between the platform GitOps and the demo's ephemeral GitOps.

### Option B: Second ArgoCD instance bootstrapped via platform app-of-apps (chosen)
- **Approach**: Add `manifests/argocd-demo/` (Namespace, ArgoCD CR named `gdfkube-gitops`, ClusterRoleBinding, repo Secret, the discovery ApplicationSet) plus a `templates/03-argocd-demo.yaml` Application under `platform/`. Platform ArgoCD reconciles it; the new instance then takes over tenant discovery and per-group AppProjects/ApplicationSets.
- **Pros**: GitOps all the way down — the demo ArgoCD itself is a reconciled resource. Clean blast-radius separation: tenant churn never touches platform Applications. Auto-sync for workloads is safe because it only fires inside the demo instance.
- **Cons**: Extra ArgoCD controller pods + RBAC surface. Need a second repo credential entry for Gitea inside `gdfkube-gitops`.
- **Why not chosen**: chosen.

### Option C: Manual one-shot demo ArgoCD apply
- **Approach**: Operator applies a static manifest set once per cluster. Demo ArgoCD is not GitOps-managed.
- **Pros**: Zero extra Applications in platform ArgoCD; simpler templates.
- **Cons**: Demo ArgoCD drifts silently if anyone edits the CR; reproducibility on a fresh cluster requires remembering a manual step; contradicts the project's "GitOps everywhere" demo narrative.
- **Why not chosen**: drift risk + breaks the demo's own thesis.

## Agreed Approach

Option B. Platform ArgoCD bootstraps `gdfkube-gitops` (namespace + ArgoCD CR + cluster-role binding + Gitea repo secret + relocated discovery `ApplicationSet`) via a new child Application `gdfkube-argocd-demo` at sync wave `-8`. The `charts/infra/argocd-org` templates flip `namespace: openshift-gitops` → `namespace: gdfkube-gitops` and the per-group `ApplicationSet` template grows an `automated` `syncPolicy` with `prune: true`, `selfHeal: true`, `CreateNamespace=true`. The Camel `OrgBootstrapRoute` is unchanged — it keeps committing rendered `AppProject` + `ApplicationSet` to `gdfkube-orgs/orgs/<group>/`; only the target ArgoCD instance changes.

## Key Decisions

- **Demo ArgoCD location**: namespace `gdfkube-gitops`, ArgoCD CR name `gdfkube-gitops` (branded, mirrors `openshift-gitops` naming style).
- **Bootstrap path**: platform app-of-apps owns the demo ArgoCD lifecycle (Option B above).
- **Discovery relocation**: `org-repos-discovery` ApplicationSet moves into `gdfkube-gitops`; the hand-applied file at `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` is deleted.
- **Per-group AppProject scope**: unchanged shape — one AppProject per group, named `<group>`, source repo `gdfkube-<group>.git`, destinations `hc-<group>-*` and `ns-<group>-*`, `org-operator` RBAC role.
- **Workload sync policy**: `automated` with `prune: true`, `selfHeal: true`, `syncOptions: [CreateNamespace=true]` on the per-group `ApplicationSet` template.
- **Cluster-wide permissions**: bind the auto-created `gdfkube-gitops-argocd-application-controller` ServiceAccount to `cluster-admin` (mirrors the OpenShift GitOps pattern) so the demo ArgoCD can manage tenant namespaces created on demand.
- **No Camel changes**: the `OrgBootstrapRoute` and `HelmValuesBuilder` stay as-is.

## Open Questions

- **Per-group Gitea repo credentials**: are anonymous reads on `gdfkube-<group>.git` enabled in the demo Gitea CR? If not, a second repository Secret per group (or a `repo-creds` template covering `https://gitea-gitea.apps.gdfkube.gov/gdfkube/*`) must land in `gdfkube-gitops`. Resolve during specs.
- **Stale-AppProject cleanup**: when a group is removed, who deletes `orgs/<group>/` from the `gdfkube-orgs` repo? Currently nothing automates this. Out of scope for this change; flag in retrospective.
- **Demo ArgoCD SSO/Route**: assume operator defaults (Route on, SSO off). Confirm with stakeholder if a login flow is needed for the demo UI.
