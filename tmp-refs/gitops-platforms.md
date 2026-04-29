# GitOps Platform Infrastructure

Platform infrastructure for ArgoCD, RHACM, Git repositories, and RBAC.

## Overview

The gdfkube platform manages cluster lifecycle through two Git repositories. `gdfkube-infra` holds shared platform resources (ArgoCD projects, RHACM cluster sets, RBAC). Customer repositories (`gdfkube-{org}`) hold per-cluster manifests. ArgoCD syncs both repository types to the hub cluster, while RHACM enforces policies across the fleet.

## Git Repository Structure

| Repository      | Purpose                            | Created By    |
| --------------- | ---------------------------------- | ------------- |
| `gdfkube-infra` | Platform resources (ArgoCD, RHACM) | Manual (once) |
| `gdfkube-{org}` | Customer cluster manifests         | Camel (auto)  |

### gdfkube-infra (Current State)

```
gdfkube-infra/
+-- argocd/
|   +-- discovery/
|   |   +-- argocd-orgs-appset.yaml     # Example org discovery ApplicationSet
|   +-- _example-org/
|   |   +-- appproject.yaml             # Example per-org AppProject
|   +-- orgs/
|       +-- {org}/                      # Camel-generated per-org directories
|           +-- appproject.yaml
|           +-- applicationset.yaml
+-- rhacm/
|   +-- _example-org/
|   |   +-- managedclusterset.yaml      # Example per-org ManagedClusterSet
|   |   +-- binding.yaml                # Example per-org Binding
|   +-- orgs/
|       +-- {org}/                      # Camel-generated per-org directories
|           +-- managedclusterset.yaml
|           +-- binding.yaml
+-- rbac/
|   +-- setic-platform-admin.yaml       # Admin ClusterRole
|   +-- setic-operator.yaml             # Operator ClusterRole
```

### gdfkube-{org} (Per Customer)

```
gdfkube-saude/
+-- clusters/
    +-- vacinacao/
    |   +-- base/
    |   |   +-- managedcluster.yaml
    |   |   +-- hostedcluster.yaml
    |   |   +-- nodepool.yaml
    |   |   +-- etcd-encryption-secret.yaml
    |   +-- kustomization.yaml
    +-- prontuario/
        +-- ...
```

## ArgoCD Configuration

### Architecture

- Single ArgoCD instance on hub cluster (`openshift-gitops`)
- **`gdfkube-platform` AppProject** for the bootstrap/discovery tier (impersonates `argocd-platform-manager`)
- One AppProject per customer for isolation
- One ApplicationSet per customer for auto-discovery
- Bootstrap ApplicationSet (`org-infra-discovery`) discovers per-org directories in `gdfkube-infra`

### Bootstrap Discovery

**Location:** `platform/argocd/discovery/org-repos-discovery.yaml` (deployed via `oc apply -k`)

The `org-infra-discovery` ApplicationSet uses project `gdfkube-platform` (not `default`) to satisfy impersonation requirements. It discovers directories under `argocd/orgs/*` in `gdfkube-infra` and creates `infra-{org}` Applications that sync per-org resources.

### Per-Customer Resources (Camel-Generated)

**AppProject:** `gdfkube-infra/argocd/orgs/{org}/appproject.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: saude
  namespace: openshift-gitops
spec:
  sourceRepos:
    - "{{giteaExternalUrl}}/{{giteaOwner}}/gdfkube-saude.git"
  destinations:
    - namespace: "hc-saude"
      server: "https://kubernetes.default.svc"
  clusterResourceWhitelist:
    - group: ""
      kind: "Namespace"
    - group: "cluster.open-cluster-management.io"
      kind: "ManagedCluster"
  namespaceResourceWhitelist:
    - group: "hypershift.openshift.io"
      kind: "HostedCluster"
    - group: "hypershift.openshift.io"
      kind: "NodePool"
    - group: ""
      kind: "Secret"
    - group: ""
      kind: "ConfigMap"
  destinationServiceAccounts:
    - server: "https://kubernetes.default.svc"
      namespace: "hc-saude"
      defaultServiceAccount: "local-cluster:argocd-manager"
    - server: "https://kubernetes.default.svc"
      namespace: "*"
      defaultServiceAccount: "local-cluster:argocd-manager"
```

`giteaExternalUrl` resolves to the Gitea route URL (e.g., `https://gitea-gitea.apps.example.com`) on OpenShift, or `http://gitea:3000` locally. `giteaOwner` replaces the hardcoded owner.

**ApplicationSet:** `gdfkube-infra/argocd/orgs/{org}/applicationset.yaml`

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: clusters-saude
  namespace: openshift-gitops
spec:
  generators:
    - git:
        repoURL: {{giteaExternalUrl}}/{{giteaOwner}}/gdfkube-saude.git
        directories:
          - path: 'clusters/*'
  template:
    metadata:
      name: 'saude-{{path.basename}}'
    spec:
      project: saude
      source:
        repoURL: {{giteaExternalUrl}}/{{giteaOwner}}/gdfkube-saude.git
        path: '{{path}}'
      destination:
        namespace: 'hc-saude'
      syncPolicy: {}
```

The configuration disables auto-sync for Camel-generated manifests. Pull secrets are distributed by RHACM ConfigurationPolicy, so operators should review and approve syncs manually before applying HyperShift cluster resources.

## RHACM Configuration

### Architecture

The RHACM ManagedClusterSet model is flat: only per-org ManagedClusterSets exist. There is no global fleet-wide ClusterSet. The hub cluster (`local-cluster`) stays in the RHACM built-in `default` ClusterSet.

```
+---------------------------------------------------------------------+
|                    PER-ORG CLUSTERSET TIER                           |
|  +-------------+  +-------------+  +-------------+                  |
|  |    saude    |  |   educacao  |  |  transporte |                  |
|  +-------------+  +-------------+  +-------------+                  |
|  | vacinacao   |  | matriculas  |  | frota       |                  |
|  | prontuario  |  | notas       |  | bilhetagem  |                  |
|  | farmacia    |  |             |  |             |                  |
|  +-------------+  +-------------+  +-------------+                  |
|                                                                      |
|   Clusters join via label:                                           |
|   cluster.open-cluster-management.io/clusterset={org}                |
+---------------------------------------------------------------------+

Hub cluster: local-cluster  ->  built-in "default" ClusterSet
```

- **Per-org ClusterSets**: Customer-specific policies, isolated operations, org-level reporting
- **Fleet-wide targeting**: Achieved via Placement label selectors (e.g., `setic.gov.br/managed: "true"`), not a dedicated global ClusterSet
- **Hub policies** (`inject-pull-secret`): Deployed in `open-cluster-management` namespace, bound to `default` ManagedClusterSetBinding
- **Cluster membership**: Via explicit `clusterset` label set at pre-creation time (not dynamic label selectors on the ClusterSet)

**RHACM Limitation:** `selectorType: LabelSelector` is NOT supported for user-created ManagedClusterSets. Only the built-in `default` and `global` sets support it. Achieve dynamic label-based cluster selection via Placement resources.

### Per-Customer ManagedClusterSet (Camel-Generated)

**Location:** `gdfkube-infra/rhacm/orgs/{org}/managedclusterset.yaml`

When Camel onboards a new organization, it creates a dedicated ManagedClusterSet for customer-specific operations.

```yaml
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: saude
  labels:
    gdfkube.io/managed: "true"
    gdfkube.io/organization: "saude"
    gdfkube.io/infra-type: "managedclusterset"
spec:
  clusterSelector:
    selectorType: ExclusiveClusterSetLabel
```

**How clusters join:** Add label `cluster.open-cluster-management.io/clusterset: saude` to the ManagedCluster resource.

**Template:** `templates/infra/rhacm/managedclusterset.yaml.mustache`

### Hub-Targeted Policies

Hub cluster policies (e.g., `inject-pull-secret`) deploy to the `open-cluster-management` namespace and use a `default` ManagedClusterSetBinding so the hub Placement can reference the built-in `default` ClusterSet.

```yaml
# Placement targeting hub cluster only
apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: placement-hub-cluster
  namespace: open-cluster-management
spec:
  clusterSets:
    - default
  predicates:
    - requiredClusterSelector:
        labelSelector:
          matchLabels:
            local-cluster: "true"
```

### Fleet-Wide Policy Targeting

Target all managed clusters fleet-wide using Placement label selectors referencing per-org ClusterSets or the standard SETIC identification label:

```yaml
# Placement targeting all SETIC-managed clusters
apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: all-managed-clusters
  namespace: open-cluster-management
spec:
  predicates:
    - requiredClusterSelector:
        labelSelector:
          matchLabels:
            setic.gov.br/managed: "true"
```

### Cluster Membership Model

Each cluster belongs to exactly ONE ManagedClusterSet at a time (RHACM enforces exclusivity). The architecture uses:

1. **Per-customer set membership** for day-to-day operations and customer isolation
2. **Placement label selectors** for fleet-wide policy targeting

The Camel CDC consumer **pre-creates** the ManagedCluster resource via GitOps (rendered from `managedcluster.yaml.mustache` and synced by ArgoCD) before the HostedCluster control plane becomes available. The `hypershift-addon-agent` uses a Get-then-Create pattern: if the ManagedCluster already exists, it skips creation and preserves all labels. This ensures correct clusterset membership from the start, avoiding the default `clusterset: default` assignment.

```
+-------------------------------------------------------------+
|  ManagedCluster: vacinacao                                   |
|                                                              |
|  Labels (for identification):                                |
|    setic.gov.br/managed: "true"                              |
|    setic.gov.br/customer: "saude"                            |
|    setic.gov.br/cluster: "vacinacao"                         |
|    cloud: auto-detect                                        |
|    vendor: auto-detect                                       |
|                                                              |
|  Clusterset membership (exclusive):                          |
|    cluster.open-cluster-management.io/clusterset: "saude"    |
|                                                              |
|  HyperShift annotations (for auto-import):                   |
|    import.open-cluster-management.io/klusterlet-deploy-mode: |
|      "Hosted"                                                |
|    import.open-cluster-management.io/hosting-cluster-name:   |
|      "local-cluster"                                         |
|                                                              |
|  Policy targeting:                                           |
|    Customer policies -> via ManagedClusterSet "saude"         |
|    Fleet-wide policies -> via Placement label selector        |
+-------------------------------------------------------------+
```

### ManagedCluster Labels

All hosted clusters receive these labels (pre-created by Camel via GitOps, from `managedcluster.yaml.mustache`):

```yaml
metadata:
  labels:
    # Clusterset membership (required, exclusive)
    cluster.open-cluster-management.io/clusterset: "saude"

    # Standard RHACM labels
    name: "vacinacao"
    cloud: auto-detect
    vendor: auto-detect

    # SETIC identification labels (for Placement selectors)
    setic.gov.br/managed: "true"
    setic.gov.br/customer: "saude"
    setic.gov.br/cluster: "vacinacao"

    # gdfkube tracking labels
    gdfkube.io/managed: "true"
    gdfkube.io/organization: "saude"
    gdfkube.io/cluster: "vacinacao"
    gdfkube.io/form-type: "cluster-request"
  annotations:
    # HyperShift auto-import annotations (required for hosted mode klusterlet)
    import.open-cluster-management.io/klusterlet-deploy-mode: "Hosted"
    import.open-cluster-management.io/hosting-cluster-name: "local-cluster"
    open-cluster-management/created-via: "hypershift"
```

The `cluster.open-cluster-management.io/clusterset` label determines ManagedClusterSet membership. Pre-creating the ManagedCluster with this label ensures the cluster joins the correct set from the start. The `hypershift-addon-agent` skips creation when the resource already exists, preserving all labels and annotations.

## RBAC Configuration

### Permission Model

```
+-------------------------------------------------------------+
|                      HUB CLUSTER                             |
|                                                              |
|  SETIC Access:                                               |
|  +-- setic-platform-admin - Full infrastructure access       |
|  +-- setic-operator - Read + sync operations                 |
|                                                              |
|  Customer Access: NONE                                       |
+-------------------------------------------------------------+
                           |
           +---------------+---------------+
           v               v               v
    +-------------+ +-------------+ +-------------+
    |   HOSTED    | |   HOSTED    | |   HOSTED    |
    |   CLUSTER   | |   CLUSTER   | |   CLUSTER   |
    |  Customer:  | |  Customer:  | |  Customer:  |
    |  cluster-   | |  cluster-   | |  cluster-   |
    |  admin      | |  admin      | |  admin      |
    +-------------+ +-------------+ +-------------+
```

### ClusterRoles

**setic-platform-admin:** `gdfkube-infra/rbac/setic-platform-admin.yaml`

Full access to HyperShift, RHACM, ArgoCD, namespaces, and secrets.

**setic-operator:** `gdfkube-infra/rbac/setic-operator.yaml`

Read access plus ArgoCD sync capability.

### Access Control

| Resource        | SETIC      | Customer      | Camel |
| --------------- | ---------- | ------------- | ----- |
| Hub cluster     | Full       | None          | None  |
| `gdfkube-infra` | Read/Write | None          | Write |
| `gdfkube-{org}` | Read/Write | None          | Write |
| ArgoCD UI       | Full       | None          | None  |
| Hosted cluster  | Full       | cluster-admin | None  |

### Customer Kubeconfig

**Location:** `Secret: hc-{org}-{cluster}/admin-kubeconfig`

```bash
oc get secret admin-kubeconfig -n hc-saude-vacinacao \
  -o jsonpath='{.data.kubeconfig}' | base64 -d
```

## Camel-Generated Resources

When Camel detects a new organization (first cluster request):

1. Creates customer repo: `gdfkube-{org}`
2. Pushes to `gdfkube-infra`:
   - `argocd/orgs/{org}/appproject.yaml`
   - `argocd/orgs/{org}/applicationset.yaml`
   - `rhacm/orgs/{org}/managedclusterset.yaml`
   - `rhacm/orgs/{org}/binding.yaml`

Templates at: `templates/infra/`

Template context variables include `giteaExternalUrl` and `giteaOwner` to avoid hardcoded Git URLs.
