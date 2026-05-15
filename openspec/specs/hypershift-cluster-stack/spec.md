## ADDED Requirements

### Requirement: HostedCluster renders the full provisioning spec

For a `cluster-request`, the `cluster-request` chart MUST render a
`hypershift.openshift.io/v1beta1` `HostedCluster` in namespace
`{{ system.naming.namespace }}` with: `spec.release.image` from `system.releaseImage`;
`spec.pullSecret.name: pull-secret`; `spec.sshKey.name: sshkey`; `spec.platform.type:
KubeVirt` with value-driven `kubevirt.baseDomain`; `spec.dns.baseDomain` from values;
`spec.networking` with `clusterNetwork`/`serviceNetwork` defaulting to `10.132.0.0/14` and
`172.31.0.0/16` (overridable via `vars`) and `networkType: OVNKubernetes`; and the five
service publishing strategies — `APIServer` as `LoadBalancer`, and `OAuthServer`, `OIDC`,
`Konnectivity`, `Ignition` as `Route`. The shared `clusters` namespace SHALL NOT be
hard-coded.

#### Scenario: HostedCluster renders complete spec with defaults

- **GIVEN** a `cluster-request` event for org `saude`, cluster `vacinacao`, no CIDR override
- **WHEN** `HelmValuesBuilder.build` produces values and the `cluster-request` chart is rendered
- **THEN** the `HostedCluster` is in namespace `hc-saude-vacinacao`
- **AND** it has `sshKey.name: sshkey`, `dns.baseDomain`, `networkType: OVNKubernetes`
- **AND** `clusterNetwork` is `10.132.0.0/14` and `serviceNetwork` is `172.31.0.0/16`
- **AND** all five service publishing strategies are present with the documented types

### Requirement: CIDR override is schema-validated and value-driven

The `cluster-request` `values.schema.json` MUST permit optional `vars` CIDR override keys.
When the request supplies an override, `HelmValuesBuilder` MUST pass it through so the
rendered `HostedCluster` uses it; when absent, the documented defaults MUST apply. A
values/schema mismatch MUST fail `helm template`.

#### Scenario: Supplied CIDR override flows through to the manifest

- **GIVEN** a `cluster-request` event whose vars set a clusterNetwork CIDR of `10.200.0.0/14`
- **WHEN** values are built and the chart is rendered
- **THEN** the rendered `HostedCluster` `spec.networking.clusterNetwork` is `10.200.0.0/14`
- **AND** rendering succeeds against `values.schema.json`

### Requirement: NodePool renders compute, storage, and release

For a `cluster-request`, the rendered `hypershift.openshift.io/v1beta1` `NodePool` MUST be
named `<hostedClusterName>-workers` in namespace `{{ system.naming.namespace }}`, with
`spec.clusterName` set, `spec.replicas` from `vars.nodeCount` (default `1`),
`spec.management.autoRepair: true`, `spec.release.image` from `system.releaseImage`, and
KubeVirt `compute` (default `16Gi` memory / `4` cores) and `rootVolume` (Persistent `64Gi`
on `ocs-storagecluster-ceph-rbd`).

#### Scenario: NodePool renders sizing and release defaults

- **GIVEN** a `cluster-request` event for cluster `vacinacao` with `nodeCount: 3`
- **WHEN** the `cluster-request` chart is rendered
- **THEN** a `NodePool` named `hc-saude-vacinacao-workers` exists in namespace `hc-saude-vacinacao`
- **AND** `spec.replicas` is `3`, `spec.management.autoRepair` is `true`, `spec.release.image` is the configured release
- **AND** `kubevirt.compute` is `16Gi`/`4` and `rootVolume` is Persistent `64Gi` on `ocs-storagecluster-ceph-rbd`

### Requirement: Scale patch targets the worker NodePool

The `scale-request` chart MUST render a `NodePool` named `<hostedClusterName>-workers` in
`{{ system.naming.namespace }}` whose `spec.replicas` comes from `vars.replicas`, using the
same NodePool name as the `cluster-request` chart so a scale patch targets the existing
worker pool.

#### Scenario: Scale patch name matches the cluster-request NodePool

- **GIVEN** a `scale-request` event for `hc-saude-vacinacao` with `replicas: 5`
- **WHEN** the `scale-request` chart is rendered
- **THEN** the `NodePool` is named `hc-saude-vacinacao-workers` (identical to the cluster-request name)
- **AND** `spec.replicas` is `5`

### Requirement: HyperShift doc body matches the rendered templates

`docs/11-hypershift.md` MUST carry `Implementation Status: Partially implemented`, a current
`Last validated:` date, and a `## Specs` backlink to `hypershift-cluster-stack`. Its
embedded HostedCluster and NodePool YAML MUST be consistent with the rendered templates
after the decision-ledger rulings (H1–H11) are applied, and the doc MUST document
`management.autoRepair` (H10) and the `vars.replicas` vs `vars.nodeCount` distinction (H12).

#### Scenario: Doc reconciled and backlinked

- **GIVEN** the reconciled `cluster-request` and `scale-request` templates
- **WHEN** `docs/11-hypershift.md` is read
- **THEN** its embedded HostedCluster/NodePool YAML matches the rendered output (namespace, sshKey, dns, networking, services, compute, rootVolume, NodePool name)
- **AND** the header shows `Implementation Status: Partially implemented` with a current `Last validated:` date
- **AND** the `## Specs` section links `` [`hypershift-cluster-stack`](../openspec/specs/hypershift-cluster-stack/spec.md) ``
