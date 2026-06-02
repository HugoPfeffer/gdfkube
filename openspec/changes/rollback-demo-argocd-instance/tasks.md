> Implemented on a `main-openshift`-based worktree (`worktree-rollback-second-argocd`). All platform manifests under `gdfkube-src/gdfkube-infra/platform/` are present on this branch.

## 1. Remove the second ArgoCD instance definition

- [x] 1.1 Delete `platform/manifests/argocd-demo/namespace.yaml`, `argocd.yaml`, `clusterrolebinding.yaml`.

## 2. Re-home the discovery ApplicationSet onto `openshift-gitops`

- [x] 2.1 Rename dir `platform/manifests/argocd-demo/` → `platform/manifests/org-discovery/` (`git mv`).
- [x] 2.2 In `org-discovery/org-repos-discovery.yaml`, set `metadata.namespace` and `spec.template.spec.destination.namespace` to `openshift-gitops`; keep the in-cluster Gitea URL.
- [x] 2.3 Trim `org-discovery/kustomization.yaml` to list only `org-repos-discovery.yaml`.

## 3. Replace the bootstrap Application template

- [x] 3.1 Rename `platform/templates/03-argocd-demo.yaml` → `03-org-discovery.yaml` (`git mv`).
- [x] 3.2 Application name `gdfkube-argocd-demo` → `gdfkube-org-discovery`; `destination.namespace` → `{{ .Values.argocd.namespace }}`; `source.path` → `.../manifests/org-discovery`.

## 4. Re-point the per-org chart templates

- [x] 4.1 `charts/infra/argocd-org/templates/appproject.yaml`: namespace `gdfkube-gitops` → `openshift-gitops`.
- [x] 4.2 `charts/infra/argocd-org/templates/applicationset.yaml`: namespace `gdfkube-gitops` → `openshift-gitops`; automated `syncPolicy` left unchanged.

## 5. Docs and comments

- [x] 5.1 `platform/manifests/apps/camel.yaml`: comment now references `openshift-gitops`.
- [x] 5.2 `docs/09-argocd.md`: rewritten to a single `openshift-gitops` instance; `argocd-demo-instance` backlink removed; embedded YAML, sync-policy, decisions, and migration notes updated.

## 6. OpenSpec

- [x] 6.1 Create change `rollback-demo-argocd-instance` (proposal/design/tasks + delta specs).
- [x] 6.2 Remove published `openspec/specs/argocd-demo-instance/spec.md`.
- [x] 6.3 Update published `openspec/specs/argocd-org-stack/spec.md` (namespace + discovery + doc requirement).

## 7. Verification

- [x] 7.1 `git grep -n "gdfkube-gitops\|argocd-demo\|gdfkube-argocd-demo" gdfkube-src/` → no matches.
- [x] 7.2 `helm template platform ./platform` → `gdfkube-org-discovery` Application in `openshift-gitops`, path `org-discovery`, no `gdfkube-argocd-demo`.
- [x] 7.3 `kubectl kustomize ./platform/manifests/org-discovery` → `gdfkube-infra-orgs` ApplicationSet in `openshift-gitops`.
- [x] 7.4 `helm template org ./charts/infra/argocd-org` → AppProject + ApplicationSet in `openshift-gitops`, automated syncPolicy intact.
- [ ] 7.5 `pre-commit run --all-files` (trufflehog) passes.
