## ADDED Requirements

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

### Requirement: Per-org ApplicationSet discovers org repo directories with manual sync

The `argocd-org` chart MUST render an `argoproj.io/v1alpha1` `ApplicationSet` named
`appset-<org>` in namespace `openshift-gitops` with a git directory generator over the
org's `gdfkube-<org>` repo scanning `clusters/*`, `namespaces/*`, and `scale-patches/*` at
revision `HEAD`, generating Applications in project `<org>` with an empty `syncPolicy` (no
`automated:` block).

#### Scenario: ApplicationSet generates manually-synced Applications

- **GIVEN** an org-bootstrap values file for org `saude`
- **WHEN** the `argocd-org` chart is rendered
- **THEN** an `ApplicationSet` named `appset-saude` exists in `openshift-gitops`
- **AND** its git generator scans `clusters/*`, `namespaces/*`, `scale-patches/*` at `HEAD`
- **AND** the generated template targets project `saude` with no `automated` sync policy

### Requirement: Hand-applied discovery ApplicationSet bootstraps per-org Applications

A static manifest MUST exist at
`gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` defining an
`argoproj.io/v1alpha1` `ApplicationSet` named `gdfkube-infra-orgs` in `openshift-gitops`
that scans `argocd/orgs/*` in the `gdfkube-infra` repo at revision `HEAD`, with
`project: default` and an empty `syncPolicy`.

#### Scenario: Discovery manifest is present and well-formed

- **GIVEN** the repository at this change's HEAD
- **WHEN** `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml` is read
- **THEN** it is an `ApplicationSet` named `gdfkube-infra-orgs` in `openshift-gitops`
- **AND** its generator scans `argocd/orgs/*` of the `gdfkube-infra` repo at `HEAD`
- **AND** `syncPolicy` is empty (no `automated:` block)

### Requirement: ArgoCD doc body matches the rendered templates

`docs/09-argocd.md` MUST carry `Implementation Status: Partially implemented` (until the
change is archived), a `Last validated:` ISO date reflecting the re-check, and a `## Specs`
section backlinking `argocd-org-stack`. Every YAML block embedded in the doc MUST be
consistent with the rendered `argocd-org` templates and the discovery manifest after the
decision-ledger rulings are applied.

#### Scenario: Doc reconciled and backlinked

- **GIVEN** the reconciled `argocd-org` templates and discovery manifest
- **WHEN** `docs/09-argocd.md` is read
- **THEN** its embedded ApplicationSet/AppProject YAML matches the rendered output (names, namespace, revision, scoping)
- **AND** the header shows `Implementation Status: Partially implemented` with a current `Last validated:` date
- **AND** the `## Specs` section links `` [`argocd-org-stack`](../openspec/specs/argocd-org-stack/spec.md) ``
