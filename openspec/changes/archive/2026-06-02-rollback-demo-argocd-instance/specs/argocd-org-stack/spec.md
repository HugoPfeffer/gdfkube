## MODIFIED Requirements

### Requirement: Per-org AppProject scopes source, destinations, and resources

The `argocd-org` chart MUST render an `argoproj.io/v1alpha1` `AppProject` named after the
org, in namespace `openshift-gitops`, whose `sourceRepos` is exactly the org's
`gdfkube-<org>` Gitea repo, whose `destinations` are scoped to `hc-<org>-*` and `ns-<org>-*`
on the in-cluster API server, whose `clusterResourceWhitelist` is exactly `HostedCluster`,
`NodePool`, `ManagedCluster`, and `Namespace`, whose `namespaceResourceBlacklist` includes
`ResourceQuota` and `LimitRange`, and which declares an `org-operator` role with Casbin
`sync`/`get` policies on `<org>/*` bound to the org operator group. Wildcard destinations or
a wildcard `clusterResourceWhitelist` SHALL NOT appear.

#### Scenario: AppProject renders scoped isolation for an org

- **GIVEN** an org-bootstrap values file for org `saude`
- **WHEN** the `argocd-org` chart is rendered with `helm template`
- **THEN** the `AppProject` is named `saude` in namespace `openshift-gitops`
- **AND** `sourceRepos` resolves to the `gdfkube-saude` repo URL only
- **AND** `destinations` contain `hc-saude-*` and `ns-saude-*` and no `"*"` entry
- **AND** `clusterResourceWhitelist` lists only HostedCluster, NodePool, ManagedCluster, Namespace
- **AND** an `org-operator` role is present with policies scoped to `saude/*`

### Requirement: ArgoCD doc body matches the rendered templates

`docs/09-argocd.md` MUST carry `Implementation Status: Partially implemented` (until the
change is archived), a `Last validated:` ISO date reflecting the re-check, and a `## Specs`
section backlinking `argocd-org-stack`. It MUST describe a single ArgoCD instance
(`openshift-gitops`) owning platform infrastructure and all tenant artifacts. Every YAML block
embedded in the doc MUST be consistent with the rendered `argocd-org` templates (now in
namespace `openshift-gitops` with automated sync) and the discovery `ApplicationSet` shipped
in the `org-discovery` kustomize bundle.

#### Scenario: Doc reconciled and backlinked

- **GIVEN** the reconciled `argocd-org` templates and the `org-discovery` bundle's discovery manifest
- **WHEN** `docs/09-argocd.md` is read
- **THEN** its embedded ApplicationSet/AppProject YAML matches the rendered output (names, namespace `openshift-gitops`, revision, scoping, automated syncPolicy)
- **AND** the header shows `Implementation Status: Partially implemented` with a current `Last validated:` date
- **AND** the `## Specs` section links `` [`argocd-org-stack`](../openspec/specs/argocd-org-stack/spec.md) `` and does not link a separate demo-instance spec

### Requirement: Per-org ApplicationSet discovers org repo directories with automated sync

The `argocd-org` chart MUST render an `argoproj.io/v1alpha1` `ApplicationSet` named
`appset-<org>` in namespace `openshift-gitops` with a git directory generator over the
org's `gdfkube-<org>` repo scanning `clusters/*`, `namespaces/*`, and `scale-patches/*` at
revision `HEAD`, generating Applications in project `<org>` whose `syncPolicy` is exactly
`automated: { prune: true, selfHeal: true }` with `syncOptions: ["CreateNamespace=true"]`.

#### Scenario: ApplicationSet generates automatically-synced Applications

- **GIVEN** an org-bootstrap values file for org `saude`
- **WHEN** the `argocd-org` chart is rendered
- **THEN** an `ApplicationSet` named `appset-saude` exists in `openshift-gitops`
- **AND** its git generator scans `clusters/*`, `namespaces/*`, `scale-patches/*` at `HEAD`
- **AND** the generated template targets project `saude` with `syncPolicy.automated.prune: true` and `syncPolicy.automated.selfHeal: true`
- **AND** the generated template's `syncPolicy.syncOptions` contains `CreateNamespace=true`

## ADDED Requirements

### Requirement: Platform Application reconciles the org-discovery bundle on `openshift-gitops`

The platform Helm chart at `gdfkube-src/gdfkube-infra/platform` MUST emit an
`argoproj.io/v1alpha1` `Application` named `gdfkube-org-discovery` in namespace
`openshift-gitops`, project `default`, sync-wave `"-8"`, whose `source.path` is
`gdfkube-src/gdfkube-infra/platform/manifests/org-discovery` on the platform repo and
revision, whose `destination.namespace` is `openshift-gitops`, and whose `syncPolicy` is
`automated: { prune: true, selfHeal: true }` via the existing `gdfkube-platform.syncPolicy`
helper. No second ArgoCD instance (namespace, `ArgoCD` CR, or `cluster-admin`
`ClusterRoleBinding`) SHALL be rendered.

#### Scenario: Platform render produces the discovery Application only

- **GIVEN** the platform chart rendered with its default values
- **WHEN** `helm template platform gdfkube-src/gdfkube-infra/platform` is run
- **THEN** an `Application` named `gdfkube-org-discovery` exists in `openshift-gitops`
- **AND** its `metadata.annotations` contain `argocd.argoproj.io/sync-wave: "-8"`
- **AND** its `spec.source.path` is `gdfkube-src/gdfkube-infra/platform/manifests/org-discovery`
- **AND** its `spec.destination.namespace` is `openshift-gitops`
- **AND** no `Application` named `gdfkube-argocd-demo`, no `ArgoCD` CR, and no `gdfkube-gitops` `Namespace` are rendered

### Requirement: Discovery ApplicationSet lives in `openshift-gitops`

The `org-discovery` kustomize bundle MUST ship exactly one
`argoproj.io/v1alpha1` `ApplicationSet` named `gdfkube-infra-orgs` in namespace
`openshift-gitops` (from `gdfkube-src/gdfkube-infra/platform/manifests/org-discovery/`),
with a git directory generator over
`http://gitea.gdfkube.svc:3000/gdfkube/gdfkube-orgs.git` at revision `HEAD` scanning `orgs/*`,
generating Applications in project `default` whose `destination.namespace` is
`openshift-gitops` and whose `source.path` is `{{path}}`. The bundle SHALL NOT ship a
`Namespace`, an `ArgoCD` CR, a `ClusterRoleBinding`, or a repository `Secret`.

#### Scenario: Discovery ApplicationSet targets `openshift-gitops`

- **GIVEN** the rendered `org-discovery` bundle (`kubectl kustomize`)
- **WHEN** the rendered manifests are inspected
- **THEN** the only resource is an `ApplicationSet` named `gdfkube-infra-orgs` in namespace `openshift-gitops`
- **AND** its generator scans `orgs/*` of `gdfkube-orgs.git` at `HEAD`
- **AND** its template generates Applications whose `destination.namespace` is `openshift-gitops`
- **AND** its template's `source.path` is `{{path}}`
