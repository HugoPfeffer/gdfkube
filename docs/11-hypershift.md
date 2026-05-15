# HyperShift

> **Implementation Status:** Partially implemented
> **Source:** Handoff `app.jsx` (HostedCluster topology, KubeVirt, addon)
> **Last validated:** 2026-05-15

## Specs

- [`hypershift-cluster-stack`](../openspec/changes/realize-gitops-provisioning-templates/specs/hypershift-cluster-stack/spec.md)

## Role in the Pipeline

```
[ArgoCD applies HostedCluster + NodePool] ──▶ [HyperShift operator on hub]
                                                          │
                                                          ▼
                                          [Hosted control plane Pods on hub]
                                                          │
                                                          ▼
                                  [KubeVirt VMs hosting worker nodes]
                                                          │
                                                          ▼
                              [hypershift-addon imports as ManagedCluster]
                                                          │
                                                          ▼
                            [RHACM ConfigurationPolicy injects pull-secret + sshkey]
                                                          │
                                                          ▼
                                  [Cluster Ready → Camel sets request status=ready]
```

HyperShift creates the cluster. RHACM imports it. The pipeline never touches
the hosted control plane directly — it just writes the CRs and ArgoCD applies
them.

## Responsibilities

- Provision hosted control planes as Pods on the hub cluster.
- Manage worker nodes as KubeVirt VMs.
- Surface the cluster as a `ManagedCluster` (via the RHACM hypershift-addon).
- **Does NOT** provision storage classes, configure CNI beyond defaults, or distribute platform secrets (RHACM does that).

## Design

### Tech

- HyperShift API: `hypershift.openshift.io/v1beta1`.
- Platform: `KubeVirt` (worker nodes are VMs running on the hub).
- OpenShift release image: `4.16.7` (pinned in chart `system.releaseImage`).
- RHACM hypershift-addon: `hypershift-addon-manager` + `hypershift-addon-agent` ServiceAccounts handle import.

### HostedCluster (rendered by Camel)

```yaml
apiVersion: hypershift.openshift.io/v1beta1
kind: HostedCluster
metadata:
  name: hc-saude-vacinacao
  namespace: hc-saude-vacinacao           # per-cluster namespace (system.naming.namespace)
  labels:                                 # 10-label canonical set (see 10-rhacm.md Label Schema)
    cluster.open-cluster-management.io/clusterset: saude
    setic.gov.br/managed: "true"
    setic.gov.br/customer: saude
    setic.gov.br/cluster: vacinacao
    gdfkube.io/managed: "true"
    gdfkube.io/organization: saude
    gdfkube.io/cluster: vacinacao
    gdfkube.io/form-type: cluster-request
    gdfkube.io/env: production
    gdfkube.io/request-id: 01HK6X3F5G9Q
spec:
  release:
    image: quay.io/openshift-release-dev/ocp-release:4.16.7-x86_64
  pullSecret:
    name: pull-secret                    # injected by RHACM ConfigurationPolicy
  sshKey:
    name: sshkey                         # injected by RHACM ConfigurationPolicy
  platform:
    type: KubeVirt
    kubevirt:
      baseDomain: apps.gdfkube.gov       # value-driven (system.baseDomain)
  dns:
    baseDomain: apps.gdfkube.gov
  networking:
    clusterNetwork:
      - cidr: 10.132.0.0/14              # default; per-form override via vars.clusterNetworkCidr
    serviceNetwork:
      - cidr: 172.31.0.0/16              # default; per-form override via vars.serviceNetworkCidr
    networkType: OVNKubernetes
  services:
    - service: APIServer
      servicePublishingStrategy:
        type: LoadBalancer
    - service: OAuthServer
      servicePublishingStrategy:
        type: Route
    - service: OIDC
      servicePublishingStrategy:
        type: Route
    - service: Konnectivity
      servicePublishingStrategy:
        type: Route
    - service: Ignition
      servicePublishingStrategy:
        type: Route
```

### NodePool

```yaml
apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: hc-saude-vacinacao-workers       # suffix: -workers (matches scale-request patch)
  namespace: hc-saude-vacinacao
spec:
  clusterName: hc-saude-vacinacao
  replicas: 3                            # from vars.nodeCount (initial provisioning)
  management:
    autoRepair: true                     # HyperShift re-creates unhealthy nodes automatically
  release:
    image: quay.io/openshift-release-dev/ocp-release:4.16.7-x86_64
  platform:
    type: KubeVirt
    kubevirt:
      compute:
        memory: 16Gi
        cores: 4
      rootVolume:
        type: Persistent
        persistent:
          size: 64Gi
          storageClass: ocs-storagecluster-ceph-rbd
```

**Scaling:** initial provisioning uses `vars.nodeCount` (from the `cluster-request` form). Subsequent scale operations use `vars.replicas` in the `scale-request` chart, which patches the same NodePool's `.spec.replicas`. The two variable names are intentionally distinct to separate the "create" and "scale" request semantics.

### CIDR Override (optional Advanced UI)

The chart's `values.schema.json` allows the form to override `clusterNetwork`/`serviceNetwork`. If the form's "Advanced" section is left blank, defaults apply. Operator is responsible for non-overlapping ranges.

### Cluster Lifecycle

1. Camel renders + Git push: `hostedcluster.yaml`, `nodepool.yaml`, `managedcluster.yaml`.
2. Operator manually syncs the Application in ArgoCD (no auto-sync).
3. ArgoCD applies the namespace first (sync-wave -10), then the CRs.
4. HyperShift operator on the hub creates the control-plane Pods and KubeVirt VMs.
5. The control plane reaches Ready; klusterlet (deployed in hosted mode by the hypershift-addon) registers with RHACM.
6. Because the `ManagedCluster` was pre-created with the clusterset label, the cluster lands in the `saude` ClusterSet immediately.
7. RHACM `ConfigurationPolicy` (see [10-rhacm.md](./10-rhacm.md)) injects `pull-secret` and `sshkey` into `hc-saude-vacinacao` namespace. HyperShift retries until the secrets exist.
8. Camel `status-emitter` flips `requests._id`'s status to `ready`. Portal reflects this via SSE.

### Secret Distribution Flow

```
  open-cluster-management/kubevirt-secret
  (single canonical secret, authored once by SETIC)
        │
        │ ConfigurationPolicy (RHACM)
        ▼
  ┌─────────────────────────┐    ┌─────────────────────────┐
  │ hc-saude-vacinacao ns   │    │ hc-saude-prontuario ns  │
  │ ├─ pull-secret          │    │ ├─ pull-secret          │
  │ └─ sshkey               │    │ └─ sshkey               │
  └─────────────────────────┘    └─────────────────────────┘
```

The handoff is explicit that this project does **not** use `HypershiftDeployment` (which would copy secrets automatically). RHACM ConfigurationPolicy is the active mechanism. HyperShift retries Pod creation until the secrets show up — eventually consistent and tolerant of the order in which ArgoCD and RHACM finish.

### Hosted-mode klusterlet

The hypershift-addon deploys the agent in **hosted mode** — the klusterlet runs on the hub control plane (in the `hc-{org}-{cluster}` namespace) instead of inside the hosted cluster. This avoids extra resource usage in the customer's tiny hosted control plane.

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | ArgoCD | server-side apply |
| Outbound | Hub kube-apiserver | creates Pods, KubeVirt VMs, Routes, LBs |
| Outbound | Hosted-cluster control plane | management plane traffic via Konnectivity |
| Inbound | RHACM hypershift-addon | klusterlet registration channel |

## Operational Concerns

- **Capacity:** each hosted cluster consumes hub CPU/memory for control-plane Pods + KubeVirt VMs. Capacity planning out of scope here.
- **Storage:** chart hardcodes `ocs-storagecluster-ceph-rbd`. Demo assumes ODF/OCS is available on the hub.
- **DNS:** `apps.gdfkube.gov` is the platform's wildcard domain. Both `kubevirt.baseDomain` and `dns.baseDomain` reference it (value-driven from `system.baseDomain`).
- **Failure modes:** if RHACM or HyperShift is unavailable, ArgoCD sync stalls but doesn't roll back. Camel doesn't see this directly — pipeline status reflects "git pushed" but not "cluster ready" until `status-emitter` polls or RHACM signals.

## Decisions Resolved

- Raw HostedCluster manifests (no `HypershiftDeployment`).
- KubeVirt platform.
- Camel pre-creates `ManagedCluster` to fix ClusterSet membership at first import.
- Hypershift-addon owns klusterlet + kubeconfig extraction.
- CIDR defaults hardcoded; per-form Advanced override surface is allowed.
- Secret distribution is RHACM ConfigurationPolicy (not HyperShift's built-in copy).

## Open Questions

- How does Camel learn that the hosted cluster is Ready, to flip `request.status` from `provisioning` to `ready`? Options: poll RHACM ManagedCluster `Available` condition, or react to a status field in HostedCluster via a separate watcher. Not specified.
- KubeVirt VM sizing: `16Gi/4 cores` baked into the chart. Form-driven sizing would need a values key.
- Multi-zone scheduling for KubeVirt VMs: not specified.

## References

- [09-argocd.md](./09-argocd.md) — what applies these CRs.
- [10-rhacm.md](./10-rhacm.md) — ManagedCluster, ConfigurationPolicy.
- [07-helm.md](./07-helm.md) — `cluster-request` chart structure.
