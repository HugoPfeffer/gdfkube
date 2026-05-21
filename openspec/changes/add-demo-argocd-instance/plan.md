# Demo ArgoCD Instance Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a second, platform-reconciled ArgoCD instance (`gdfkube-gitops`) that owns all demo-generated tenant artifacts, while the existing `openshift-gitops` ArgoCD keeps owning only the platform itself.

**Architecture:** A new kustomize bundle at `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/` ships the `gdfkube-gitops` Namespace, an `argoproj.io/v1beta1 ArgoCD` CR, a `cluster-admin` ClusterRoleBinding for the controller SA, a Gitea repo Secret, and the relocated `gdfkube-infra-orgs` discovery ApplicationSet. A new platform Helm template `templates/03-argocd-demo.yaml` emits an `Application gdfkube-argocd-demo` (sync-wave `-8`) that the platform ArgoCD reconciles onto the cluster. The `charts/infra/argocd-org` templates flip `openshift-gitops` → `gdfkube-gitops` and the per-group ApplicationSet template gains `syncPolicy.automated` so workload Applications reach the cluster without operator clicks. Camel's `OrgBootstrapRoute` is unchanged.

**Tech Stack:** Helm v3, Kustomize, OpenShift GitOps operator (argoproj.io/v1beta1 ArgoCD), Gitea, Apache Camel (downstream consumer, untouched).

---

## Task 1: Demo ArgoCD namespace manifest

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/namespace.yaml`

- [ ] **Step 1:** Create the namespace manifest.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: gdfkube-gitops
  labels:
    gdfkube.io/managed: "true"
```

- [ ] **Step 2:** Confirm the file parses.

Run: `kubectl --dry-run=client apply -f gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/namespace.yaml -o yaml`
Expected: prints the namespace manifest, no error.

## Task 2: Demo ArgoCD CR

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/argocd.yaml`

- [ ] **Step 1:** Write the ArgoCD CR.

```yaml
apiVersion: argoproj.io/v1beta1
kind: ArgoCD
metadata:
  name: gdfkube-gitops
  namespace: gdfkube-gitops
spec:
  sourceNamespaces:
    - gdfkube-gitops
  defaultClusterScopedRoleDisabled: false
  controller: {}
  repo: {}
  applicationSet: {}
  server:
    route:
      enabled: true
  redis: {}
  sso: null
```

- [ ] **Step 2:** Verify the CR's apiVersion and key fields are correct.

Run: `grep -E '^(apiVersion|kind|name|namespace|sourceNamespaces)' gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/argocd.yaml`
Expected: `apiVersion: argoproj.io/v1beta1`, `kind: ArgoCD`, `name: gdfkube-gitops`, `namespace: gdfkube-gitops`, `sourceNamespaces:`.

## Task 3: Cluster role binding for the controller SA

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/clusterrolebinding.yaml`

- [ ] **Step 1:** Write the binding (single subject).

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: gdfkube-gitops-argocd-application-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: gdfkube-gitops-argocd-application-controller
    namespace: gdfkube-gitops
```

- [ ] **Step 2:** Confirm exactly one subject and that the roleRef points at `cluster-admin`.

Run: `yq '.subjects | length, .roleRef.name' gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/clusterrolebinding.yaml`
Expected: `1` then `cluster-admin`.

## Task 4: Gitea repo-creds Secret (no literal token)

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/repo-secret.yaml`
- Confirm sourcing: read `gdfkube-src/gdfkube-infra/platform/templates/05-secrets.yaml` or any existing `gitea-token` Secret reference under `platform/` to learn how the platform already exposes Gitea creds.

- [ ] **Step 1:** Find the existing Gitea credentials source.

Run: `grep -rn "gitea-token\|GITEA_TOKEN" gdfkube-src/gdfkube-infra/platform/ | head`
Expected: at least one Secret or env reference; record its namespace and key names.

- [ ] **Step 2:** Write the Secret as `repo-creds` (URL prefix), with `username`/`password` sourced via a sync hook or a `gitea-token-sync-job` style copy into `gdfkube-gitops`. **No literal token in YAML.**

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitea-orgs-repo-creds
  namespace: gdfkube-gitops
  labels:
    argocd.argoproj.io/secret-type: repo-creds
type: Opaque
stringData:
  url: https://gitea-gitea.apps.gdfkube.gov/gdfkube
  # username and password are populated by gitea-token-sync-job at runtime;
  # see gdfkube-src/gdfkube-infra/platform/manifests/init-jobs/gitea-token-sync-job.yaml
```

- [ ] **Step 3:** If the existing `gitea-token-sync-job` writes only into `gdfkube` namespace, extend it (or add a sibling job) to also copy the username/password keys into the `gitea-orgs-repo-creds` Secret in `gdfkube-gitops`. Keep this in the same kustomize bundle so the lifecycle is co-located.

- [ ] **Step 4:** Trufflehog check — confirm no literal token landed.

Run: `pre-commit run trufflehog --files gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/repo-secret.yaml`
Expected: pass.

## Task 5: Relocated discovery ApplicationSet

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/org-repos-discovery.yaml`
- Source for content: `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` (existing).

- [ ] **Step 1:** Copy the existing file's content, then change exactly two values: `metadata.namespace: gdfkube-gitops` and `spec.template.spec.destination.namespace: gdfkube-gitops`.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: gdfkube-infra-orgs
  namespace: gdfkube-gitops
spec:
  generators:
    - git:
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-orgs.git
        revision: HEAD
        directories:
          - path: orgs/*
  template:
    metadata:
      name: 'gdfkube-infra-{{path.basename}}'
    spec:
      project: default
      source:
        repoURL: https://gitea-gitea.apps.gdfkube.gov/gdfkube/gdfkube-orgs.git
        targetRevision: HEAD
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: gdfkube-gitops
      syncPolicy: {}
```

- [ ] **Step 2:** Confirm namespaces.

Run: `yq '.metadata.namespace, .spec.template.spec.destination.namespace' gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/org-repos-discovery.yaml`
Expected: `gdfkube-gitops` printed twice.

## Task 6: Kustomization wiring

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/kustomization.yaml`

- [ ] **Step 1:** List every manifest under `resources:`.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - argocd.yaml
  - clusterrolebinding.yaml
  - repo-secret.yaml
  - org-repos-discovery.yaml
```

- [ ] **Step 2:** Render and count documents.

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo | grep -c '^kind:'`
Expected: `5`.

- [ ] **Step 3:** Confirm each Kind appears once.

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo | yq -p yaml -o yaml '.kind' | sort -u`
Expected: `ApplicationSet`, `ArgoCD`, `ClusterRoleBinding`, `Namespace`, `Secret`.

## Task 7: Platform Application that ships the bundle

**Files:**
- Create: `gdfkube-src/gdfkube-infra/platform/templates/03-argocd-demo.yaml`
- Reference pattern: `gdfkube-src/gdfkube-infra/platform/templates/05-gitea-operator.yaml`

- [ ] **Step 1:** Write the Application template using existing helpers.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: gdfkube-argocd-demo
  namespace: {{ .Values.argocd.namespace }}
  finalizers:
    - resources-finalizer.argocd.argoproj.io
  annotations:
    argocd.argoproj.io/sync-wave: "-8"
spec:
  project: {{ .Values.argocd.project }}
  source:
    {{- include "gdfkube-platform.source" . | nindent 4 }}
    path: gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo
  destination:
    server: {{ .Values.argocd.destination.server }}
    namespace: gdfkube-gitops
  syncPolicy:
    {{- include "gdfkube-platform.syncPolicy" . | nindent 4 }}
```

- [ ] **Step 2:** Render the platform chart and find the new Application.

Run: `helm template platform gdfkube-src/gdfkube-infra/platform | yq -p yaml -o yaml 'select(.metadata.name == "gdfkube-argocd-demo")'`
Expected: one document where `spec.source.path` ends in `manifests/argocd-demo`, `spec.destination.namespace` is `gdfkube-gitops`, sync-wave annotation is `"-8"`, `syncPolicy.automated.prune` and `selfHeal` both `true`.

## Task 8: argocd-org chart — namespace flip

**Files:**
- Modify: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/appproject.yaml` (line 5)
- Modify: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/applicationset.yaml` (line 5)

- [ ] **Step 1:** In `appproject.yaml` replace `namespace: openshift-gitops` with `namespace: gdfkube-gitops`.
- [ ] **Step 2:** In `applicationset.yaml` replace `namespace: openshift-gitops` with `namespace: gdfkube-gitops`.
- [ ] **Step 3:** Render the chart for one org and confirm both land in `gdfkube-gitops`.

Run:
```
helm template saude gdfkube-src/gdfkube-infra/charts/infra/argocd-org \
  --set meta.org=saude --set system.naming.appProject=saude \
  | yq -p yaml -o yaml 'select(.kind == "AppProject" or .kind == "ApplicationSet") | .metadata.namespace' | sort -u
```
Expected: a single line `gdfkube-gitops`.

## Task 9: argocd-org chart — automated syncPolicy on generated Applications

**Files:**
- Modify: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/applicationset.yaml`

- [ ] **Step 1:** Append a `syncPolicy` block to the template's `spec:` (after `destination:`).

```yaml
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

- [ ] **Step 2:** Render and confirm the generated template carries the policy.

Run:
```
helm template saude gdfkube-src/gdfkube-infra/charts/infra/argocd-org \
  --set meta.org=saude --set system.naming.appProject=saude \
  | yq -p yaml -o yaml 'select(.kind == "ApplicationSet") | .spec.template.spec.syncPolicy'
```
Expected: `automated.prune: true`, `automated.selfHeal: true`, `syncOptions: [CreateNamespace=true]`.

## Task 10: Delete the old hand-applied discovery file

**Files:**
- Delete: `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`

- [ ] **Step 1:** Remove the file.

Run: `git rm gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`

- [ ] **Step 2:** Remove any now-empty parent directories.

Run: `rmdir gdfkube-src/gdfkube-infra/argocd/discovery 2>/dev/null; rmdir gdfkube-src/gdfkube-infra/argocd 2>/dev/null; true`
Expected: no error if removed, no error if non-empty.

## Task 11: Documentation — docs/09-argocd.md

**Files:**
- Modify: `docs/09-argocd.md`

- [ ] **Step 1:** Replace `namespace: openshift-gitops` with `namespace: gdfkube-gitops` in every embedded `AppProject`, `ApplicationSet`, and discovery `ApplicationSet` block.
- [ ] **Step 2:** Add the `syncPolicy.automated` + `syncOptions: [CreateNamespace=true]` block under the per-org ApplicationSet sample.
- [ ] **Step 3:** Replace the "Hand-applied discovery" section's `oc apply -f gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` instruction with a paragraph explaining that the discovery ApplicationSet is now reconciled by the platform Application `gdfkube-argocd-demo` and lives in `platform/manifests/argocd-demo/`.
- [ ] **Step 4:** Update the `Last validated:` line to today.
- [ ] **Step 5:** Add `argocd-demo-instance` to the `## Specs` backlink section.
- [ ] **Step 6:** Confirm no leftover references to the deleted path.

Run: `grep -rn "argocd/discovery/org-repos-discovery" docs/ gdfkube-src/ openspec/`
Expected: no matches (or only inside `openspec/changes/add-demo-argocd-instance/` itself).

## Task 12: Render verification battery

- [ ] **Step 1:** Full platform render — no errors.

Run: `helm template platform gdfkube-src/gdfkube-infra/platform >/dev/null`
Expected: exit 0.

- [ ] **Step 2:** Kustomize render — no errors.

Run: `kustomize build gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo >/dev/null`
Expected: exit 0.

- [ ] **Step 3:** argocd-org render for `saude` — no errors.

Run: `helm template saude gdfkube-src/gdfkube-infra/charts/infra/argocd-org --set meta.org=saude --set system.naming.appProject=saude >/dev/null`
Expected: exit 0.

- [ ] **Step 4:** Pre-commit (covers trufflehog).

Run: `pre-commit run --all-files`
Expected: pass.

## Task 13: Commit

- [ ] **Step 1:** Stage only changed files (no `git add -A`).

Run:
```
git add \
  gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/ \
  gdfkube-src/gdfkube-infra/platform/templates/03-argocd-demo.yaml \
  gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/appproject.yaml \
  gdfkube-src/gdfkube-infra/charts/infra/argocd-org/templates/applicationset.yaml \
  docs/09-argocd.md \
  openspec/changes/add-demo-argocd-instance/
git rm gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml
```

- [ ] **Step 2:** Commit with a conventional, imperative message.

Run: `git commit -m "feat(argocd): add gdfkube-gitops demo ArgoCD instance and per-group AppProjects"`
Expected: commit succeeds, trufflehog clean.

## Task 14: Cluster verification (manual — requires a live cluster)

- [ ] **Step 1:** Bootstrap the platform.

Run: `oc apply -n openshift-gitops -f gdfkube-src/gdfkube-infra/platform/app-of-apps.yaml`
Expected: `application.argoproj.io/gdfkube-platform configured` or `created`.

- [ ] **Step 2:** Watch the demo ArgoCD Application reach Healthy/Synced.

Run: `oc -n openshift-gitops wait --for=jsonpath='{.status.sync.status}'=Synced application/gdfkube-argocd-demo --timeout=10m`
Expected: condition met.

- [ ] **Step 3:** Confirm the demo ArgoCD instance is Available.

Run: `oc -n gdfkube-gitops get argocd gdfkube-gitops -o jsonpath='{.status.phase}'`
Expected: `Available`.

- [ ] **Step 4:** Confirm the discovery ApplicationSet exists in the new namespace.

Run: `oc -n gdfkube-gitops get applicationset gdfkube-infra-orgs`
Expected: one row, no error.

- [ ] **Step 5:** End-to-end ITSM smoke — submit a request for a known group, wait for Camel to push, confirm in the demo ArgoCD UI that the per-group AppProject + ApplicationSet + workload Application are all present and auto-syncing.

Expected: workload Application reaches Synced+Healthy without operator interaction.

- [ ] **Step 6:** Confirm the platform ArgoCD is no longer holding tenant artifacts.

Run: `oc -n openshift-gitops get applications.argoproj.io -l gdfkube.io/managed=true`
Expected: empty list. If the cluster previously ran the demo with the old layout, run the one-shot cleanup from `docs/09-argocd.md` migration notes first.
