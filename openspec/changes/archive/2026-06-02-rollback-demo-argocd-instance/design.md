## Context

`add-demo-argocd-instance` introduced a second ArgoCD instance (`gdfkube-gitops`) reconciled by the platform `openshift-gitops` instance via a child Application `gdfkube-argocd-demo`. The bundle shipped a `Namespace`, an `ArgoCD` CR, a `cluster-admin` `ClusterRoleBinding` for the auto-created controller SA, and the relocated `gdfkube-infra-orgs` discovery ApplicationSet. The `charts/infra/argocd-org` templates and the discovery ApplicationSet were flipped to target `gdfkube-gitops`.

The demo's tenant workloads are predominantly cluster-scoped (HyperShift + RHACM). `openshift-gitops` already runs with the cluster-scoped permissions to manage them — which is exactly why standing up and matching those permissions on a second instance is redundant overhead.

## Goals / Non-Goals

**Goals:**
- One ArgoCD instance (`openshift-gitops`) owns platform infra, discovery, and per-org artifacts.
- Discovery stays GitOps-managed (no reintroduced manual `oc apply`).
- Keep the legitimately-good in-cluster Gitea DNS (`gitea.gdfkube.svc:3000`).

**Non-Goals:**
- No change to per-org sync behavior — automated sync stays.
- No change to the `org-provision-via-request-pipeline` Camel routes.
- No change to the app-of-apps `targetRevision`.

## Decisions

### D1: Surgical edits, not `git revert`
The four commits (`e63db76`, `2bfb0dd`, `9f4a436`, `b555a75`) are intermixed with a later, unrelated good fix — `b555a75` also switched the Gitea repo URL to in-cluster service DNS — and with the subsequent `org-provision-via-request-pipeline` merge. A blanket revert would regress the URL fix and collide with later history. We make targeted edits instead and explicitly retain the in-cluster URL.
- **Alternative considered**: `git revert` the four commits. Rejected — regresses the URL fix; merge conflicts against current `main-openshift`.

### D2: Keep discovery GitOps-managed (don't restore the hand-applied file)
Pre-feature, discovery was a hand-applied file at `argocd/discovery/org-repos-discovery.yaml`. Rather than reintroduce that manual step, we keep the discovery ApplicationSet inside a kustomize bundle reconciled by a platform Application — just re-pointed at `openshift-gitops`. The bundle dir is renamed `argocd-demo/` → `org-discovery/` to eliminate stale naming, and the template `03-argocd-demo.yaml` → `03-org-discovery.yaml` (Application `gdfkube-org-discovery`).
- **Alternative considered**: restore the hand-applied pre-feature file (truest rollback). Rejected — reintroduces manual toil the feature had removed; the user chose to keep it GitOps-managed.

### D3: `openshift-gitops` controller permissions are sufficient
The deleted `ClusterRoleBinding` granted the second instance's controller SA `cluster-admin` so it could manage on-demand tenant namespaces and cluster-scoped CRs. The default OpenShift GitOps `openshift-gitops` instance already runs with cluster-wide management permissions, so no replacement RBAC is shipped.
- **Migration concern**: on a cluster that previously ran the second instance, delete the orphaned `ArgoCD` CR and namespace (`oc delete argocd gdfkube-gitops -n gdfkube-gitops`; `oc delete namespace gdfkube-gitops`). `openshift-gitops` recreates all tenant artifacts in its own namespace.

### D4: Remove `argocd-demo-instance` capability; fold the survivor into `argocd-org-stack`
The demo-instance capability's namespace/CR/CRB/anonymous-Gitea requirements describe an instance that no longer exists, so the published spec is removed. The two surviving requirements — the platform discovery Application and the discovery ApplicationSet — are re-homed (transformed to `openshift-gitops`) into `argocd-org-stack`, whose Purpose already covers "hub-level discovery."

## Risks / Trade-offs

- **[Risk]** Tenant `Application`/`AppProject`/`ApplicationSet` objects from the old `gdfkube-gitops` namespace linger after rollback on an already-deployed cluster. → **Mitigation**: documented manual cleanup (D3) and in `docs/09-argocd.md` Migration Notes.
- **[Trade-off]** All tenant apps share the `openshift-gitops` instance with platform apps (no controller isolation). Accepted — this is the pre-feature posture and adequate for a demo; AppProject scoping + Casbin RBAC still enforce per-org isolation.
