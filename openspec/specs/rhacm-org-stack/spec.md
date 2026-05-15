## ADDED Requirements

### Requirement: ManagedClusterSet uses exclusive label membership

The `rhacm-org` chart MUST render a `cluster.open-cluster-management.io/v1beta2`
`ManagedClusterSet` named after the org's cluster set whose
`spec.clusterSelector.selectorType` is `ExclusiveClusterSetLabel`. The mandatory
`spec.clusterSelector` block SHALL NOT be omitted.

#### Scenario: ManagedClusterSet renders the exclusive selector

- **GIVEN** an org-bootstrap values file for org `saude`
- **WHEN** the `rhacm-org` chart is rendered with `helm template`
- **THEN** a `ManagedClusterSet` named `saude` is produced
- **AND** `spec.clusterSelector.selectorType` is `ExclusiveClusterSetLabel`

### Requirement: Binding and policy objects render into the policy namespace

The `rhacm-org` chart MUST render the `ManagedClusterSetBinding`, the `Placement`
`<org>-prod-clusters`, the `ConfigurationPolicy`, and the wrapping `Policy` +
`PlacementBinding` into the namespace given by `system.naming.policyNamespace` (default
`gdfkube-policies`). The `Placement` MUST bind `clusterSets: [<clusterSet>]` with a
required predicate matching label `gdfkube.io/env: production`.

#### Scenario: Policy objects co-locate in the policy namespace

- **GIVEN** an org-bootstrap values file for org `saude` with default `policyNamespace`
- **WHEN** the `rhacm-org` chart is rendered
- **THEN** the `ManagedClusterSetBinding`, `Placement`, `ConfigurationPolicy`, `Policy`, and `PlacementBinding` are all in namespace `gdfkube-policies`
- **AND** the `Placement` is named `saude-prod-clusters`, binds `clusterSets: [saude]`, and requires `gdfkube.io/env: production`

### Requirement: ConfigurationPolicy distributes pull-secret and sshkey

The `rhacm-org` chart MUST render a `policy.open-cluster-management.io/v1`
`ConfigurationPolicy` named `hc-pullsecret-distributor` with `remediationAction: enforce`
that templates a `kubernetes.io/dockerconfigjson` `pull-secret` and an `Opaque` `sshkey`
from `open-cluster-management/kubevirt-secret` into hosted-cluster namespaces, wrapped by a
`Policy` bound through the `PlacementBinding` to the org `Placement`. No literal secret
material SHALL be committed (reference-only via RHACM template functions).

#### Scenario: Secret-distribution policy is rendered without literal secrets

- **GIVEN** an org-bootstrap values file for org `saude`
- **WHEN** the `rhacm-org` chart is rendered
- **THEN** a `ConfigurationPolicy` `hc-pullsecret-distributor` with `remediationAction: enforce` is produced
- **AND** it sources `pull-secret` and `sshkey` from `open-cluster-management/kubevirt-secret` via template functions
- **AND** a wrapping `Policy` and `PlacementBinding` reference the `saude-prod-clusters` Placement
- **AND** `pre-commit run --all-files` (trufflehog) reports no findings

### Requirement: ManagedCluster carries the canonical ten-label schema

The `cluster-request` chart MUST render a `cluster.open-cluster-management.io/v1`
`ManagedCluster` that carries all ten canonical labels
(`cluster.open-cluster-management.io/clusterset`, `setic.gov.br/managed`,
`setic.gov.br/customer`, `setic.gov.br/cluster`, `gdfkube.io/managed`,
`gdfkube.io/organization`, `gdfkube.io/cluster`, `gdfkube.io/form-type`, `gdfkube.io/env`,
`gdfkube.io/request-id`) and sets `spec.hubAcceptsClient` to `true`. `HelmValuesBuilder`
MUST emit `setic.gov.br/cluster`, `gdfkube.io/cluster`, `gdfkube.io/form-type`, and
`gdfkube.io/env` derived from the request event.

#### Scenario: Cluster-request event yields the full label set

- **GIVEN** a `cluster-request` event for org `saude`, cluster `vacinacao`, environment `production`
- **WHEN** `HelmValuesBuilder.build` produces values and the `cluster-request` chart is rendered
- **THEN** the `ManagedCluster` carries all ten canonical labels
- **AND** `gdfkube.io/cluster: vacinacao`, `gdfkube.io/form-type: cluster-request`, `gdfkube.io/env: production`, `setic.gov.br/cluster: vacinacao`
- **AND** `spec.hubAcceptsClient` is `true`

### Requirement: RHACM doc body matches the rendered templates

`docs/10-rhacm.md` MUST carry `Implementation Status: Partially implemented`, a current
`Last validated:` date, and a `## Specs` backlink to `rhacm-org-stack`. Every embedded YAML
block (ManagedClusterSet, ManagedClusterSetBinding, Placement, ConfigurationPolicy,
ManagedCluster, Label Schema) MUST be consistent with the rendered templates after the
decision-ledger rulings (R1–R5) are applied.

#### Scenario: Doc reconciled and backlinked

- **GIVEN** the reconciled `rhacm-org` and `cluster-request` templates
- **WHEN** `docs/10-rhacm.md` is read
- **THEN** its embedded YAML and Label Schema table match the rendered output
- **AND** the header shows `Implementation Status: Partially implemented` with a current `Last validated:` date
- **AND** the `## Specs` section links `` [`rhacm-org-stack`](../openspec/specs/rhacm-org-stack/spec.md) ``
