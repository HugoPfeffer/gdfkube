## 1. Demo ArgoCD kustomize bundle

- [x] 1.1 Create directory `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/`.
- [x] 1.2 Add `namespace.yaml` declaring `Namespace` `gdfkube-gitops` with the labels OpenShift expects (`openshift.io/cluster-monitoring: "true"` if other platform namespaces use it; do not set `argocd.argoproj.io/managed-by`).
- [x] 1.3 Add `argocd.yaml` declaring an `argoproj.io/v1beta1 ArgoCD` named `gdfkube-gitops` in `gdfkube-gitops` with: `sourceNamespaces: ["gdfkube-gitops"]`, `defaultClusterScopedRoleDisabled: false`, application controller / repo server / applicationset controller / server / redis components enabled, Route enabled, SSO disabled.
- [x] 1.4 Add `clusterrolebinding.yaml` binding ServiceAccount `gdfkube-gitops-argocd-application-controller` in namespace `gdfkube-gitops` to ClusterRole `cluster-admin`, with exactly one subject.
- [x] 1.5 Add `repo-secret.yaml` — a `Secret` labeled `argocd.argoproj.io/secret-type: repo-creds` for URL prefix `https://gitea-gitea.apps.gdfkube.gov/gdfkube`, sourcing `username`/`password` from the existing platform-managed Gitea credentials (no literal token in git). Confirm against the existing `gitea-token` Secret used by the platform; if it lives in a different namespace, ship a copy job under `init-jobs` rather than referencing across namespaces.
- [x] 1.6 Add `org-repos-discovery.yaml` — the existing discovery `ApplicationSet`, with two edits relative to `argocd/discovery/org-repos-discovery.yaml`: `metadata.namespace: gdfkube-gitops` and `spec.template.spec.destination.namespace: gdfkube-gitops`. Keep `repoURL`, `revision: HEAD`, generator `directories: [orgs/*]`, `project: default`, `path: '{{path}}'`.
- [x] 1.7 Add `kustomization.yaml` listing all five manifests above under `resources:`. Do not add Helm dependencies, ConfigMap generators, or patches.

## 2. Platform Application that ships the bundle

- [x] 2.1 Create `gdfkube-src/gdfkube-infra/platform/templates/03-argocd-demo.yaml` modeled exactly on `platform/templates/05-gitea-operator.yaml`: `kind: Application`, `name: gdfkube-argocd-demo`, `namespace: {{ .Values.argocd.namespace }}`, sync-wave annotation `"-8"`, `project: {{ .Values.argocd.project }}`.
- [x] 2.2 Use the helper `{{- include "gdfkube-platform.source" . | nindent 4 }}` for the source block, and append `path: gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo`.
- [x] 2.3 Hardcode `destination.namespace: gdfkube-gitops` (do not use the `gdfkube-platform.destination` helper here — that one points at `.Values.workload.namespace`).
- [x] 2.4 Use the `{{- include "gdfkube-platform.syncPolicy" . | nindent 4 }}` helper (yields `automated: { prune: true, selfHeal: true }`).
- [x] 2.5 Add a `finalizers: [resources-finalizer.argocd.argoproj.io]` block so a delete of the platform Application cascades to the demo ArgoCD CR.

## 3. argocd-org chart updates

- [x] 3.1 In `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/appproject.yaml`, change `namespace: openshift-gitops` (line 5) to `namespace: gdfkube-gitops`.
- [x] 3.2 In `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/applicationset.yaml`, change `namespace: openshift-gitops` (line 5) to `namespace: gdfkube-gitops`.
- [x] 3.3 In the same `applicationset.yaml`, append under the `template.spec` block (after `destination:`) a `syncPolicy:` block: `automated: { prune: true, selfHeal: true }` and `syncOptions: [CreateNamespace=true]`.

## 4. Remove the obsolete hand-applied discovery file

- [x] 4.1 Delete `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`.
- [x] 4.2 If `gdfkube-src/gdfkube-infra/argocd/discovery/` and `gdfkube-src/gdfkube-infra/argocd/` are now empty (no other files), remove the empty directories.

## 5. Documentation reconciliation

- [x] 5.1 Update `docs/09-argocd.md`: change every `namespace: openshift-gitops` in embedded YAML blocks to `namespace: gdfkube-gitops` for AppProject / ApplicationSet / discovery samples; add the automated `syncPolicy` block to the per-org ApplicationSet sample; replace any reference to the deleted file path with a note that the discovery ApplicationSet is reconciled by `gdfkube-argocd-demo`; bump `Last validated:` to today; add `argocd-demo-instance` to the `## Specs` backlinks.
- [x] 5.2 Grep the repo for any other reference to `argocd/discovery/org-repos-discovery.yaml` (e.g. READMEs, opsx changes, openspec archive notes) and either delete or update those references to the new bootstrap path.

## 6. Local render verification

- [x] 6.1 Run `helm template platform gdfkube-src/gdfkube-infra/platform` and confirm: a `Namespace gdfkube-gitops` and `Application gdfkube-argocd-demo` are present; the Application's `source.path` is `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo`, `destination.namespace` is `gdfkube-gitops`, sync-wave is `"-8"`, and `syncPolicy.automated` has both `prune` and `selfHeal` `true`.
- [x] 6.2 Run `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo` and confirm: `Namespace`, `ArgoCD`, `ClusterRoleBinding`, `Secret`, `ApplicationSet` all render; the `ClusterRoleBinding` has exactly one `ServiceAccount` subject named `gdfkube-gitops-argocd-application-controller`; the `Secret` does not contain a base64-decoded token; the `ApplicationSet` is named `gdfkube-infra-orgs` in `gdfkube-gitops`.
- [x] 6.3 Run `helm template saude gdfkube-src/gdfkube-infra/charts/infra/argocd-org --set meta.org=saude --set system.naming.appProject=saude` and confirm: `AppProject saude` is in `gdfkube-gitops`; `ApplicationSet appset-saude` is in `gdfkube-gitops`; the generated template's `syncPolicy.automated` has both `prune` and `selfHeal` `true`; `syncOptions` contains `CreateNamespace=true`.
- [x] 6.4 Run `pre-commit run --all-files` and address any findings (trufflehog must pass — confirm no literal Gitea token landed in `repo-secret.yaml`).

## 7. Cluster bootstrap dry-run (manual, on a demo cluster)

- [ ] 7.1 On a cluster with the OpenShift GitOps operator already installed, run `oc apply -n openshift-gitops -f gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml` and wait for `gdfkube-platform` Application to go Healthy.
- [ ] 7.2 Confirm `oc get application gdfkube-argocd-demo -n openshift-gitops` reports Synced+Healthy and that `oc get argocd gdfkube-gitops -n gdfkube-gitops` shows the instance Available.
- [ ] 7.3 Confirm `oc get applicationset gdfkube-infra-orgs -n gdfkube-gitops` exists and reconciles.

## 8. End-to-end ITSM verification (manual, on a demo cluster)

- [ ] 8.1 Trigger a group creation via ITSM (e.g. POST to `/api/itsm/groups` or restore one in the seed) and wait for Camel `OrgBootstrapRoute` to push `orgs/<group>/appproject.yaml` + `applicationset.yaml` to the `gdfkube-orgs` Gitea repo.
- [ ] 8.2 Confirm in the demo ArgoCD UI (`gdfkube-gitops`) that a child Application `gdfkube-infra-<group>` appears (from the discovery ApplicationSet) and syncs, and that `AppProject <group>` + `ApplicationSet appset-<group>` exist in `gdfkube-gitops` as a result.
- [ ] 8.3 Submit a cluster-request from ITSM for that group, wait for Camel to push the rendered manifests to `gdfkube-<group>/clusters/<release>/`, and confirm the per-group ApplicationSet generates a workload Application that auto-syncs without operator interaction.
- [ ] 8.4 Confirm in the platform ArgoCD UI (`openshift-gitops`) that no tenant-shaped Applications appear — only the platform's own children plus the single `gdfkube-argocd-demo`.

## 9. Cluster cleanup for already-demoed clusters

- [ ] 9.1 If the target cluster previously ran the demo with the old single-instance layout, run `oc delete application,appproject,applicationset -n openshift-gitops -l gdfkube.io/managed=true` once to remove stale tenant resources. Document this step in `docs/09-argocd.md` migration notes.

## 10. Commit and pre-commit hygiene

- [ ] 10.1 `git add` only the files explicitly created or modified by this change (no `git add -A`).
- [ ] 10.2 `git commit -m "feat(argocd): add gdfkube-gitops demo ArgoCD instance and per-group AppProjects"`; ensure trufflehog pre-commit passes.
