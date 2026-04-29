# Cluster Provisioning Flow

End-to-end flow from ITSM form submission to hosted cluster provisioning.

## Overview

```
node-app -> MongoDB -> Debezium -> Kafka -> Camel -> Gitea -> ArgoCD -> HyperShift
```

## Flow Diagram

```
User (saude)
     |
     v
+---------+    +---------+    +---------+    +---------+
| node-app|--->| MongoDB |--->|Debezium |--->|  Kafka  |
| (ITSM)  |    |         |    |  CDC    |    |         |
+---------+    +---------+    +---------+    +---------+
                                                  |
                                                  v
                                            +---------+
                                            |  Camel  |
                                            |Consumer |
                                            +----+----+
                                                 |
                  +------------------------------+----------------------+
                  |                              |                      |
                  v                              v                      v
        +-----------------+           +-----------------+    +-----------------+
        | New org?        |--YES----->| Create repo +   |    | Render cluster  |
        | (first cluster) |           | push infra      |    | templates       |
        +-----------------+           +--------+--------+    +--------+--------+
                  |                            |                      |
                 NO                            v                      |
                  |               +---------------------+             |
                  |               | Push to gdfkube-infra|            |
                  |               | - AppProject         |            |
                  |               | - ApplicationSet     |            |
                  |               | - ManagedClusterSet  |            |
                  |               | - Binding            |            |
                  |               +----------+----------+             |
                  |                          |                        |
                  +--------------------------+------------------------+
                                             |
                                             v
                                  +---------------------+
                                  | Push to gdfkube-{org}|
                                  | clusters/            |
                                  |   {clusterName}/     |
                                  +----------+----------+
                                             |
                                             v
                                       +----------+
                                       |  ArgoCD  |
                                       |  syncs   |
                                       +----+-----+
                                            |
                            +---------------+---------------+
                            v               v               v
                    +-------------+ +-------------+ +-------------+
                    |  Namespace  | |HostedCluster| |  NodePool   |
                    |hc-{org}-    | | {cluster}   | | {cluster}   |
                    |{cluster}    | |             | |             |
                    +-------------+ +-------------+ +-------------+
                                           |
                                           v
                                   +-------------+
                                   |Managed      |
                                   |Cluster      |
                                   | {cluster}   |
                                   +-------------+
```

## Step-by-Step Process

### 1. User Submits Form

The user submits a cluster request via the node-app (ITSM mock).

**Request Document (MongoDB):**

```json
{
  "formId": "cluster-request",
  "requestId": "01HQ3K5M7N8P9Q0R1S2T3U4V5W",
  "meta": {
    "requesterName": "joao.silva",
    "requesterGroupName": "saude"
  },
  "vars": {
    "clusterName": "vacinacao",
    "environment": "production",
    "nodeCount": "3"
  }
}
```

### 2. CDC Event Captured

Debezium captures the MongoDB insert and publishes to `dbz.gdfkube.requests`.

### 3. Camel Processes Event

1. Filters for create operations (`op='c'`)
2. Extracts `formId`, `requestId`, `meta`, `vars`
3. Looks up schema to get `templateFieldIdentifier`
4. Resolves `resourceName` from `vars[templateFieldIdentifier]`

### 4. First Cluster Check

If the org has no customer repo (first cluster):

1. Create customer repo in Gitea (`gdfkube-{org}`)
2. Render infra templates
3. Push to `gdfkube-infra`
4. Rollback on failure

### 5. Render Cluster Templates

The consumer renders from `templates/cluster-request/base/`:

- `managedcluster.yaml`
- `hostedcluster.yaml`
- `nodepool.yaml`
- `etcd-encryption-secret.yaml`

### 6. Push to Git

The consumer pushes to the customer repo:

```
gdfkube-saude/
+-- clusters/
    +-- vacinacao/
        +-- base/
        |   +-- managedcluster.yaml
        |   +-- hostedcluster.yaml
        |   +-- nodepool.yaml
        |   +-- etcd-encryption-secret.yaml
        +-- kustomization.yaml
```

### 7. ArgoCD Sync

The ApplicationSet detects the new directory:

1. Creates Application `hc-saude-vacinacao`
2. Syncs manifests to hub cluster

### 8. HyperShift Provisioning

The HyperShift operator:

1. Provisions control plane pods
2. Creates KubeVirt VMs for worker nodes
3. Generates admin kubeconfig secret

### 9. Customer Access

Extract the kubeconfig:

```bash
oc get secret admin-kubeconfig -n hc-saude-vacinacao \
  -o jsonpath='{.data.kubeconfig}' | base64 -d
```

## Naming Conventions

The provisioning flow uses standardized naming patterns for all resources. For the complete naming convention reference, see [Development and Deployment Standards](../standards/development-deployment.md#naming-conventions).

**Template variables:**

- `{org}`: Organization from `meta.requesterGroupName` (e.g., `saude`)
- `{cluster}`: Cluster name from `vars.clusterName` (e.g., `vacinacao`)
- `{formId}`: Form identifier (e.g., `cluster-request`)

**Key resource patterns:**

- Git repository: `gdfkube-{org}` (e.g., `gdfkube-saude`)
- Namespace: `hc-{org}-{cluster}` (e.g., `hc-saude-vacinacao`)
- ArgoCD AppProject: `{org}` (e.g., `saude`)
- ManagedCluster: `{cluster}` (e.g., `vacinacao`)

The Camel CDC consumer pre-creates ManagedCluster resources via GitOps templates, synced by ArgoCD alongside the HostedCluster. The hypershift-addon-agent uses a Get-then-Create pattern: if the ManagedCluster already exists, it skips creation and preserves all labels. This ensures correct clusterset membership from the start.

## Hub Cluster

The hub cluster hosts RHACM for multi-cluster management.

**Topology:**

- Control plane: 3 nodes (16 vCPU, 16Gi each)
- Workers: 3 nodes (24 vCPU, 64Gi each)

**Platform Components:**

- RHACM/ACM: `release-2.14`
- ODF: `stable-4.18`
- KubeVirt: `stable`

**Responsibilities:**

- Host RHACM for multi-cluster lifecycle
- Provision hosted clusters for customers
- Enforce platform policies
- Centralized observability

**Customer Autonomy:**

- Customers receive `cluster-admin` on their hosted cluster
- Complete authority over OpenShift features
- SETIC retains control over infrastructure only
