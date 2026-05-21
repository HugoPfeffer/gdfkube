# argocd-demo-instance Specification

## Purpose
TBD - created by archiving change add-demo-argocd-instance. Update Purpose after archive.
## Requirements
### Requirement: Platform Application reconciles the demo ArgoCD bundle

The platform Helm chart at `gdfkube-src/gdfkube-infra/platform` MUST emit an `argoproj.io/v1alpha1` `Application` named `gdfkube-argocd-demo` in namespace `openshift-gitops`, project `default`, sync-wave `"-8"`, whose `source.path` is `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo` on the platform repo and revision, whose `destination.namespace` is exactly `gdfkube-gitops`, and whose `syncPolicy` is `automated: { prune: true, selfHeal: true }` via the existing `gdfkube-platform.syncPolicy` helper.

#### Scenario: Platform render produces the demo ArgoCD Application

- **GIVEN** the platform chart rendered with its default values
- **WHEN** `helm template platform gdfkube-src/gdfkube-infra/platform` is run
- **THEN** an `Application` named `gdfkube-argocd-demo` exists in `openshift-gitops`
- **AND** its `metadata.annotations` contain `argocd.argoproj.io/sync-wave: "-8"`
- **AND** its `spec.source.path` is `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo`
- **AND** its `spec.destination.namespace` is `gdfkube-gitops`
- **AND** its `spec.syncPolicy.automated.prune` and `spec.syncPolicy.automated.selfHeal` are both `true`

### Requirement: Demo ArgoCD namespace and CR are declared as kustomize manifests

The kustomize bundle at `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/` MUST declare a `Namespace` named `gdfkube-gitops` and an `argoproj.io/v1beta1` `ArgoCD` named `gdfkube-gitops` in namespace `gdfkube-gitops`, with `sourceNamespaces: ["gdfkube-gitops"]`, `defaultClusterScopedRoleDisabled: false`, and the application controller, repo server, and applicationset controller components enabled. The bundle's `kustomization.yaml` MUST list every manifest file it ships and SHALL NOT introduce Helm dependencies.

#### Scenario: Bundle declares the namespace and ArgoCD CR

- **GIVEN** the manifest tree under `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/`
- **WHEN** the bundle is rendered with `kustomize build`
- **THEN** the output contains a `Namespace` named `gdfkube-gitops`
- **AND** the output contains an `ArgoCD` CR named `gdfkube-gitops` in `gdfkube-gitops`
- **AND** the ArgoCD CR's `spec.sourceNamespaces` equals `["gdfkube-gitops"]`
- **AND** the ArgoCD CR enables the application controller, repo server, and applicationset controller

### Requirement: Demo ArgoCD application controller has cluster-wide management permissions

The bundle MUST ship a `ClusterRoleBinding` named `gdfkube-gitops-argocd-application-controller` that binds the auto-created `gdfkube-gitops-argocd-application-controller` ServiceAccount in namespace `gdfkube-gitops` to the cluster-scoped `cluster-admin` `ClusterRole`. The binding MUST NOT use a wildcard subject and MUST NOT grant any additional principals.

#### Scenario: ClusterRoleBinding grants cluster-admin to the controller SA only

- **GIVEN** the rendered `argocd-demo` bundle
- **WHEN** the ClusterRoleBinding is inspected
- **THEN** its `roleRef` is `ClusterRole/cluster-admin`
- **AND** it has exactly one subject of kind `ServiceAccount`, name `gdfkube-gitops-argocd-application-controller`, namespace `gdfkube-gitops`

### Requirement: Demo ArgoCD reads Gitea repos anonymously

The `argocd-demo` bundle MUST NOT ship a repository or `repo-creds` `Secret` for the in-cluster Gitea service `gitea.gdfkube.svc:3000`. The platform's `gitea-bootstrap` job (`gdfkube-src/gdfkube-infra/platform/manifests/init-jobs/gitea-bootstrap-job.yaml`) creates the `gdfkube` Gitea organisation with `visibility: "public"`, so its repositories are anonymously cloneable and the demo ArgoCD MUST authenticate using no credentials. If the Gitea org's visibility is ever changed to `private`, this requirement SHALL be revisited via a follow-up change that introduces a `repo-creds` Secret populated from `gitea-pat`.

#### Scenario: Bundle ships no Gitea Secret

- **GIVEN** the rendered `argocd-demo` bundle
- **WHEN** all rendered manifests are inspected
- **THEN** no `Secret` resource is present in the rendered output
- **AND** the `kustomization.yaml` `resources` list does not include `repo-secret.yaml`
- **AND** the source tree under `gdfkube-src/gdfkube-infra/platform/manifests/argocd-demo/` contains no file declaring an `argocd.argoproj.io/secret-type` label

### Requirement: Discovery ApplicationSet lives in the demo ArgoCD namespace

The bundle MUST ship an `argoproj.io/v1alpha1` `ApplicationSet` named `gdfkube-infra-orgs` in namespace `gdfkube-gitops` with a git directory generator over `http://gitea.gdfkube.svc:3000/gdfkube/gdfkube-orgs.git` at revision `HEAD` scanning `orgs/*`, generating Applications in project `default` whose `destination.namespace` is exactly `gdfkube-gitops` and whose `source.path` is `{{path}}`.

#### Scenario: Discovery ApplicationSet targets the demo ArgoCD namespace

- **GIVEN** the rendered `argocd-demo` bundle
- **WHEN** the discovery ApplicationSet is inspected
- **THEN** it is named `gdfkube-infra-orgs` in namespace `gdfkube-gitops`
- **AND** its generator scans `orgs/*` of `gdfkube-orgs.git` at `HEAD`
- **AND** its template generates Applications whose `destination.namespace` is `gdfkube-gitops`
- **AND** its template's `source.path` is `{{path}}`

