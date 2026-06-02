## Why

The `add-demo-argocd-instance` change (archived 2026-05-21) stood up a second ArgoCD instance — the `gdfkube-gitops` ArgoCD CR in its own namespace, with a dedicated `cluster-admin` ClusterRoleBinding — and re-pointed all tenant artifacts (discovery ApplicationSet, per-org AppProjects, per-org ApplicationSets) at it.

This demo leans heavily on **cluster-scoped** manifests (`HostedCluster`, `NodePool`, `ManagedCluster`, `Namespace`). The main `openshift-gitops` instance already holds the cluster-scoped permissions to manage them; re-configuring a second ArgoCD operator instance to match (RBAC, source namespaces, controller scoping) is too troublesome for a demo and added an operator/RBAC surface without benefit. We are rolling that change back and consolidating everything onto the single `openshift-gitops` instance.

## What Changes

**Second ArgoCD instance — removed**
- From: a kustomize bundle at `platform/manifests/argocd-demo/` ships a `gdfkube-gitops` `Namespace`, an `argoproj.io/v1beta1 ArgoCD` CR named `gdfkube-gitops`, and a `gdfkube-gitops-argocd-application-controller` → `cluster-admin` `ClusterRoleBinding`; a platform `Application` `gdfkube-argocd-demo` (sync-wave `-8`) reconciles the bundle.
- To: the `Namespace`, `ArgoCD` CR, and `ClusterRoleBinding` are deleted. The platform `Application` is renamed `gdfkube-org-discovery` and now syncs `platform/manifests/org-discovery/` (the discovery ApplicationSet only) into `openshift-gitops`.
- Reason: a single instance already has the needed cluster-scoped rights.
- Impact: one fewer ArgoCD controller + its RBAC; no behavior change for operators.

**Org discovery — re-pointed to `openshift-gitops`**
- From: `gdfkube-infra-orgs` discovery ApplicationSet in namespace `gdfkube-gitops`, generating Applications into `gdfkube-gitops`.
- To: same ApplicationSet in `openshift-gitops`, generating into `openshift-gitops`. The in-cluster Gitea URL (`http://gitea.gdfkube.svc:3000`) is retained.
- Reason: discovery follows the surviving instance.
- Impact: still fully GitOps-managed; no manual `oc apply`.

**Per-org chart templates — re-pointed to `openshift-gitops`**
- From: `charts/infra/argocd-org` renders the per-org `AppProject` and `ApplicationSet` in namespace `gdfkube-gitops`.
- To: namespace `openshift-gitops`. The automated `syncPolicy` (prune + selfHeal + `CreateNamespace=true`) on the per-org ApplicationSet is unchanged.
- Reason: tenant artifacts must live in the instance that reconciles them.
- Impact: Camel-rendered per-org output now targets `openshift-gitops`.

## Capabilities

### Removed Capabilities
- `argocd-demo-instance`: the dedicated `gdfkube-gitops` ArgoCD instance, its namespace, CR, ClusterRoleBinding, and demo-only repo-read posture no longer exist. The surviving platform-managed discovery Application is folded into `argocd-org-stack`.

### Modified Capabilities
- `argocd-org-stack`: per-org `AppProject`/`ApplicationSet` namespace flips `gdfkube-gitops` → `openshift-gitops`; the hub discovery ApplicationSet and its reconciling platform Application (`gdfkube-org-discovery`, path `platform/manifests/org-discovery`) now live on `openshift-gitops`; `docs/09-argocd.md` describes a single instance and backlinks only `argocd-org-stack`.

## Impact

- **Helm/manifests** (`gdfkube-src/gdfkube-infra`):
  - Deleted: `platform/manifests/argocd-demo/{namespace,argocd,clusterrolebinding}.yaml`.
  - Renamed dir `platform/manifests/argocd-demo/` → `platform/manifests/org-discovery/` (now holds only `org-repos-discovery.yaml` + `kustomization.yaml`), with `metadata.namespace` and `destination.namespace` flipped to `openshift-gitops`.
  - Renamed template `platform/templates/03-argocd-demo.yaml` → `03-org-discovery.yaml`; Application `gdfkube-argocd-demo` → `gdfkube-org-discovery`, `destination.namespace` and source path updated.
  - `charts/infra/argocd-org/templates/{appproject,applicationset}.yaml`: namespace → `openshift-gitops`.
  - Comment fix in `platform/manifests/apps/camel.yaml`.
- **Docs**: `docs/09-argocd.md` rewritten to single-instance; the `argocd-demo-instance` backlink removed.
- **OpenSpec**: published `argocd-demo-instance` spec removed; `argocd-org-stack` spec updated.
- **No dependency/version changes. No Kafka topic, MongoDB schema, or Camel route changes** — the `org-provision-via-request-pipeline` Camel work is unaffected.
- **Testing**: `helm template` of `platform` and `argocd-org`, plus `kubectl kustomize` of the `org-discovery` bundle, render the consolidated `openshift-gitops` artifacts; `git grep gdfkube-gitops` over `gdfkube-src/` returns nothing.
- **Cluster migration** (manual, only where the second instance was already deployed): `oc delete argocd gdfkube-gitops -n gdfkube-gitops` then `oc delete namespace gdfkube-gitops`.
