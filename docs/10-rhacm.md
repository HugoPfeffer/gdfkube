# RHACM

> **Implementation Status:** Planned
> **Source:** Handoff `app.jsx` + `uploads/gitops-platform.md`
> **Last validated:** 2026-05-14

## Specs

_No specs yet — this component is not contracted._

## Role in the Pipeline

```
[ArgoCD applies ManagedClusterSet, ManagedCluster, Placement, ConfigurationPolicy]
                                         │
                                         ▼
                          [RHACM hub controllers]
                                         │
                  ┌──────────────────────┼─────────────────────┐
                  ▼                      ▼                     ▼
            [Cluster import]      [Policy binding]      [Secret distribution]
            (klusterlet)        (Placement → MCSB)    (ConfigurationPolicy
                                                       templates pull-secret
                                                       and sshkey into hc-* ns)
```

RHACM is the fleet manager. It owns cluster registration, policy binding, and
secret distribution to hosted clusters. The pipeline writes RHACM CRs the
same way it writes everything else — through Git → ArgoCD.

## Responsibilities

- Register hosted clusters as `ManagedCluster`s (via the hypershift-addon).
- Group `ManagedCluster`s into per-org `ManagedClusterSet`s.
- Bind policies to clusters via `Placement` + `ManagedClusterSetBinding`.
- Distribute platform secrets (pull-secret, sshkey) into hosted-cluster namespaces.
- **Does NOT** provision clusters (HyperShift does), enforce per-org RBAC at the API level (ArgoCD AppProject + Kubernetes RBAC do).

## Design

### Tech

- Red Hat Advanced Cluster Management 2.x.
- API groups: `cluster.open-cluster-management.io/v1` (ManagedCluster), `v1beta2` (ManagedClusterSet, Placement), `policy.open-cluster-management.io/v1` (Policy, ConfigurationPolicy).
- Lives in `open-cluster-management` namespace. Per-org policies live in their own namespaces or a shared `gdfkube-policies` namespace.

### Per-Org ManagedClusterSet (Exclusive)

```yaml
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: saude
spec:
  clusterSelector:
    selectorType: ExclusiveClusterSetLabel
```

**Why ExclusiveClusterSetLabel:** the user-created set type does not accept `LabelSelector`. Each cluster must carry exactly one `cluster.open-cluster-management.io/clusterset: <org>` label, and that label is the only thing that decides set membership. Multiple clusters land in the same set by sharing the label value.

The handoff's suggestion of "use Placement resources for label-based dynamic selection" is what enables targeting at the policy level — see below.

### ManagedCluster (pre-created by Camel)

```yaml
apiVersion: cluster.open-cluster-management.io/v1
kind: ManagedCluster
metadata:
  name: hc-saude-vacinacao
  labels:
    cluster.open-cluster-management.io/clusterset: saude
    setic.gov.br/managed: "true"
    setic.gov.br/customer: saude
    setic.gov.br/cluster: vacinacao
    gdfkube.io/managed: "true"
    gdfkube.io/organization: saude
    gdfkube.io/cluster: vacinacao
    gdfkube.io/form-type: cluster-request
    gdfkube.io/env: production
    gdfkube.io/request-id: 01HK6X3F5G9Q...
spec:
  hubAcceptsClient: true
```

Camel renders this **before** HyperShift creates the control plane. Pre-creating ensures the cluster lands in the right ClusterSet at first import — the hypershift-addon attaches the klusterlet and the import completes with the correct membership without any post-hoc patching.

### ManagedClusterSetBinding

Bound to the namespace where Placement objects live:

```yaml
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSetBinding
metadata:
  name: saude
  namespace: gdfkube-policies
spec:
  clusterSet: saude
```

### Placement (label-based, dynamic)

Where dynamic selection actually happens — at the Placement level, not the set:

```yaml
apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: saude-prod-clusters
  namespace: gdfkube-policies
spec:
  clusterSets:
    - saude
  predicates:
    - requiredClusterSelector:
        labelSelector:
          matchLabels:
            gdfkube.io/env: production
```

Policies bind to this Placement to target only saude's production clusters. The handoff's "use Placement instead of LabelSelector on the set" guidance is captured here.

### ConfigurationPolicy: secret distribution

Pull-secret and sshkey live in `open-cluster-management/kubevirt-secret` (one canonical secret authored by SETIC). A `ConfigurationPolicy` templates them into each hosted-cluster namespace:

```yaml
apiVersion: policy.open-cluster-management.io/v1
kind: ConfigurationPolicy
metadata:
  name: hc-pullsecret-distributor
  namespace: gdfkube-policies
spec:
  remediationAction: enforce
  severity: medium
  object-templates:
    - complianceType: musthave
      objectDefinition:
        apiVersion: v1
        kind: Secret
        type: kubernetes.io/dockerconfigjson
        metadata:
          name: pull-secret
          namespace: '{{ (lookup "cluster.open-cluster-management.io/v1" "ManagedCluster" "" "").metadata.name }}'
        data:
          .dockerconfigjson: '{{ fromSecret "open-cluster-management" "kubevirt-secret" "pullSecret" }}'
    - complianceType: musthave
      objectDefinition:
        apiVersion: v1
        kind: Secret
        type: Opaque
        metadata:
          name: sshkey
          namespace: '...'
        data:
          id_rsa.pub: '{{ fromSecret "open-cluster-management" "kubevirt-secret" "ssh-publickey" }}'
```

A wrapping `Policy` binds this ConfigurationPolicy via `PlacementBinding` to a Placement that selects all clusters in the org's ClusterSet.

### Label Schema (canonical)

| Label | Required | Purpose |
|---|---|---|
| `cluster.open-cluster-management.io/clusterset` | yes | RHACM set membership. **Exclusive.** Value = `<org>`. |
| `setic.gov.br/managed` | yes | Marks the cluster as platform-managed. |
| `setic.gov.br/customer` | yes | Owning org. Value = `<org>`. |
| `setic.gov.br/cluster` | yes | Short cluster name (without `hc-{org}-` prefix). |
| `gdfkube.io/managed` | yes | Distinguishes gdfkube-issued clusters from manually imported ones. |
| `gdfkube.io/organization` | yes | Owning org. |
| `gdfkube.io/cluster` | yes | Short cluster name. |
| `gdfkube.io/form-type` | yes | FormDef id (`cluster-request`, …). |
| `gdfkube.io/env` | yes | `production` / `staging` / `development`. |
| `gdfkube.io/request-id` | yes | ULID of the originating request. Cross-stage correlation. |

### Hub vs Hosted

The hub cluster (`local-cluster`) stays in the built-in `default` ClusterSet (not user-editable). Per-org sets contain only hosted clusters. There is **no global "all clusters" ClusterSet** — fleet-wide policies use multi-set Placements or PolicySets.

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | ArgoCD | server-side apply (Kubernetes API) |
| Inbound | Camel (via Git) | indirect — Camel writes manifests, ArgoCD applies |
| Outbound | Hosted-cluster namespaces | RHACM controllers create Secrets via ConfigurationPolicy |
| Outbound | Hosted clusters (klusterlet) | mTLS over HTTPS (RHACM agent channel) |

## Operational Concerns

- **Set membership is set-once.** Pre-creating ManagedCluster with the clusterset label prevents the alternative — auto-import landing the cluster in `default`, then patching the label after, which races RHACM controllers.
- **Policy compliance:** policies report compliance status per cluster on the hub. Out of scope to surface in the portal for now.
- **Secret rotation:** rotating `kubevirt-secret` automatically propagates via ConfigurationPolicy. No per-cluster updates needed.

## Decisions Resolved

- Per-org `ManagedClusterSet` with `selectorType: ExclusiveClusterSetLabel`.
- Dynamic targeting via `Placement` resources with labelSelectors, bound to one or more ClusterSets via `ManagedClusterSetBinding`.
- Camel pre-creates `ManagedCluster` manifests so clusters land in the right set on first import.
- Secret distribution by `ConfigurationPolicy` templating from `open-cluster-management/kubevirt-secret`.
- No global fleet ClusterSet — per-org isolation is the boundary.

## Open Questions

- Compliance reporting: should the portal surface per-cluster policy status? Not in handoff.
- Cluster decommissioning: removing a cluster from a set + cleaning up secrets. No flow specified.
- ConfigurationPolicy retry / pause semantics: assumed default RHACM behavior.

## References

- [11-hypershift.md](./11-hypershift.md) — what creates the cluster the addon imports.
- [09-argocd.md](./09-argocd.md) — what applies these RHACM CRs.
- [12-security-rbac.md](./12-security-rbac.md) — RBAC tying ClusterRoles to ClusterSet bindings.
