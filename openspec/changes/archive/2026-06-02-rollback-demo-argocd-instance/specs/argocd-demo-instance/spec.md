## REMOVED Requirements

### Requirement: Platform Application reconciles the demo ArgoCD bundle

**Reason**: The second ArgoCD instance is removed; the reconciling Application is renamed `gdfkube-org-discovery` and re-homed under `argocd-org-stack`, syncing `platform/manifests/org-discovery/` into `openshift-gitops`.

The platform Helm chart MUST emit an `Application` named `gdfkube-argocd-demo` whose `source.path` is `platform/manifests/argocd-demo` and whose `destination.namespace` is `gdfkube-gitops`.

### Requirement: Demo ArgoCD namespace and CR are declared as kustomize manifests

**Reason**: No second ArgoCD instance exists. The demo consolidates on the single `openshift-gitops` instance.

The kustomize bundle MUST declare a `Namespace` named `gdfkube-gitops` and an `ArgoCD` CR named `gdfkube-gitops`.

### Requirement: Demo ArgoCD application controller has cluster-wide management permissions

**Reason**: No second instance controller SA exists; `openshift-gitops` already holds the cluster-scoped management permissions for the demo's cluster-scoped manifests.

The bundle MUST ship a `ClusterRoleBinding` binding `gdfkube-gitops-argocd-application-controller` to `cluster-admin`.

### Requirement: Demo ArgoCD reads Gitea repos anonymously

**Reason**: Superseded — the demo-instance bundle no longer exists. Anonymous in-cluster Gitea reads remain a property of the `openshift-gitops` discovery wiring described in `argocd-org-stack`.

The `argocd-demo` bundle MUST NOT ship a repository or `repo-creds` `Secret`.

### Requirement: Discovery ApplicationSet lives in the demo ArgoCD namespace

**Reason**: Re-homed into `argocd-org-stack` and re-pointed to `openshift-gitops`.

The bundle MUST ship a `gdfkube-infra-orgs` `ApplicationSet` in namespace `gdfkube-gitops` generating Applications whose `destination.namespace` is `gdfkube-gitops`.
