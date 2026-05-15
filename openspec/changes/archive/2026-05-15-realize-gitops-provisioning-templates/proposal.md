## Why

Docs `09-argocd.md`, `10-rhacm.md`, `11-hypershift.md` describe a complete, reasoned
provisioning design, but the real Helm chart templates are minimal stubs that have drifted
from it and several documented manifests have no file at all. The `fix-spec-doc-drift`
change deliberately left doc bodies untouched, so the platform cannot actually provision
correctly and the three docs lie (still badged `Planned` despite shipped code). Closing this
now makes the GitOps provisioning path real and the docs trustworthy.

## What Changes

**ArgoCD `argocd-org` chart + discovery**
- From: permissive AppProject (wildcard destinations/resources, no RBAC), no discovery manifest
- To: scoped destinations, resource whitelist/blacklist, Casbin `org-operator` roles, plus a
  hand-applied discovery ApplicationSet file
- Reason / Impact: enforces documented per-org isolation; non-breaking (org-bootstrap render)

**RHACM `rhacm-org` chart**
- From: ManagedClusterSet missing `selectorType`; binding in org ns; no Placement/ConfigurationPolicy
- To: `ExclusiveClusterSetLabel`; binding/Placement/ConfigurationPolicy/Policy/PlacementBinding
  in a `policyNamespace`
- Reason / Impact: makes set membership + secret distribution actually work

**HyperShift `cluster-request` chart**
- From: HostedCluster ~70% incomplete, NodePool missing release/compute/rootVolume
- To: full HostedCluster (sshKey, dns, networking + CIDR override, 5 service strategies) and
  NodePool (release image, compute, rootVolume)

**Camel + schema**: `HelmValuesBuilder` emits the 4 missing canonical labels, `policyNamespace`,
and CIDR pass-through; `values.yaml` + `values.schema.json` updated in lockstep.

**Docs**: 09/10/11 embedded YAML reconciled to final templates, re-badged `Partially
implemented` (→ `Implemented` at archive), `## Specs` backlinks added, README regenerated.

Doc⇄template conflicts are resolved per a case-by-case ledger (design.md); the genuine
judgment calls (A7, A9, H1, H4, H8) are flagged for explicit user confirmation.

## Capabilities

### New Capabilities
- `argocd-org-stack`: ArgoCD per-org AppProject + ApplicationSet contract and the hand-applied discovery ApplicationSet that bootstraps org Applications.
- `rhacm-org-stack`: RHACM per-org ManagedClusterSet, ManagedClusterSetBinding, Placement, and ConfigurationPolicy/Policy/PlacementBinding secret-distribution contract.
- `hypershift-cluster-stack`: HyperShift HostedCluster + NodePool (and scale patch) manifest contract, including networking/CIDR override and the canonical ManagedCluster label schema.

### Modified Capabilities
<!-- None: the gdfkube-architecture-docs spec's requirements are unchanged; this change conforms to them (re-badge + ## Specs backlinks) rather than altering them. -->

## Impact

- **Helm charts**: `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/`, `.../infra/rhacm-org/`,
  `.../cluster-request/`, `.../scale-request/` (templates, `values.yaml`, `values.schema.json`).
- **New file**: `gdfkube-src/gdfkube-infra/argocd/discovery/org-repos-discovery.yaml`.
- **Camel**: `gdfkube-src/gdfkube-camel/.../bean/HelmValuesBuilder.java` (`buildLabels`,
  `buildNaming`, `buildForOrg`, CIDR pass-through). Affects org-bootstrap and cluster-request
  render flows only. No Kafka topic, MongoDB schema, or consumer-group changes.
- **Docs**: `docs/09-argocd.md`, `docs/10-rhacm.md`, `docs/11-hypershift.md`, `docs/README.md`,
  governed by `openspec/specs/gdfkube-architecture-docs/spec.md`.
- **External dependency (unchanged, referenced only)**: `open-cluster-management/kubevirt-secret`
  (SETIC-authored; not created here; trufflehog-safe — no literal secret material).
- **No new dependency versions**: Helm v2 charts, existing `hypershift.openshift.io/v1beta1`,
  `cluster.open-cluster-management.io` (`v1`/`v1beta1`/`v1beta2`), `policy.open-cluster-management.io/v1`,
  `argoproj.io/v1alpha1` API versions as already used in the docs.
- **Testing**: `helm lint`/`helm template` per chart (schema validated implicitly); JUnit for
  `HelmValuesBuilder` (extends `strengthen-org-bootstrap-tests` coverage); `openspec validate`
  + the architecture-docs spec/grep gate; `pre-commit` (trufflehog).
