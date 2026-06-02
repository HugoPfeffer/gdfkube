# Plan: rollback-demo-argocd-instance

**Goal:** Remove the second ArgoCD instance (`gdfkube-gitops`) and consolidate all discovery + per-org artifacts onto the single `openshift-gitops` instance, keeping everything GitOps-managed and retaining the in-cluster Gitea DNS.

**Architecture:** The platform `openshift-gitops` ArgoCD reconciles a renamed child Application `gdfkube-org-discovery` (sync-wave `-8`) that syncs the `platform/manifests/org-discovery/` bundle — now containing only the `gdfkube-infra-orgs` discovery ApplicationSet — into `openshift-gitops`. The `charts/infra/argocd-org` templates render per-org `AppProject`/`ApplicationSet` in `openshift-gitops` (automated sync unchanged). No second `ArgoCD` CR, namespace, or `cluster-admin` ClusterRoleBinding is shipped, since `openshift-gitops` already has cluster-scoped management permissions.

## Steps

1. **Delete second-instance definition** — `platform/manifests/argocd-demo/{namespace,argocd,clusterrolebinding}.yaml`.
2. **Re-home discovery** — `git mv` `argocd-demo/` → `org-discovery/`; flip `metadata.namespace` + `destination.namespace` to `openshift-gitops`; trim `kustomization.yaml` to the discovery manifest only; keep `http://gitea.gdfkube.svc:3000`.
3. **Replace bootstrap template** — `git mv` `templates/03-argocd-demo.yaml` → `03-org-discovery.yaml`; Application `gdfkube-argocd-demo` → `gdfkube-org-discovery`; `destination.namespace` → `{{ .Values.argocd.namespace }}`; source path → `manifests/org-discovery`.
4. **Re-point per-org templates** — `charts/infra/argocd-org/templates/{appproject,applicationset}.yaml` namespace → `openshift-gitops`; automated syncPolicy unchanged.
5. **Comment + docs** — fix `platform/manifests/apps/camel.yaml` comment; rewrite `docs/09-argocd.md` to single-instance.
6. **OpenSpec** — author this change (proposal/design/tasks + delta specs); update published `argocd-org-stack`; remove published `argocd-demo-instance`.

## Verification

- `git grep gdfkube-gitops gdfkube-src/` → no matches.
- `helm template platform ./platform` → `gdfkube-org-discovery` in `openshift-gitops`, no `gdfkube-argocd-demo`.
- `kubectl kustomize ./platform/manifests/org-discovery` → single `gdfkube-infra-orgs` ApplicationSet in `openshift-gitops`.
- `helm template ./charts/infra/argocd-org` → AppProject + ApplicationSet in `openshift-gitops`, automated syncPolicy intact.
- `helm lint` both charts; `pre-commit run --all-files`; `openspec validate rollback-demo-argocd-instance`.
