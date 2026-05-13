# Architecture Overview

> **Implementation Status:** Reference (Planned for the system as a whole)
> **Source:** `.tmp/handoff/gdfkube-remix/project/backend-architecture/app.jsx`
> **Last validated:** 2026-05-05

## What gdfkube Is

A self-service Kubernetes provisioning platform for the Distrito Federal's
SETIC. Operators in customer organizations (saúde, educação, transportes…)
submit a form in the ITSM portal; minutes later they receive a kubeconfig for
a freshly provisioned hosted OpenShift cluster. Everything between the form
and the cluster is event-driven, GitOps-reconciled, and tenant-isolated.

## The 7-Stage Pipeline

```
 ┌───────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │ Operator  │     │  Express │     │ MongoDB  │     │ Debezium │
 │  Portal   │ ──▶ │   API    │ ──▶ │  rs0     │ ──▶ │  source  │
 └───────────┘     └──────────┘     └──────────┘     └────┬─────┘
                                                          │
                                                          ▼
 ┌───────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │  ArgoCD   │ ◀── │   Git    │ ◀── │  Camel   │ ◀── │  Kafka   │
 │ + RHACM   │     │ (Gitea)  │     │ Quarkus  │     │ (Strimzi)│
 └─────┬─────┘     └──────────┘     └──────────┘     └──────────┘
       │
       ▼
 ┌───────────┐
 │ HyperShift│
 │ HostedCl. │
 └───────────┘
```

| # | Stage | Component | Doc |
|---|---|---|---|
| 1 | Form | [ITSM Portal](./01-itsm-portal.md) + [Express API](./02-express-api.md) | 01, 02 |
| 2 | Persist | [MongoDB](./03-mongodb.md) | 03 |
| 3 | CDC | [Debezium](./04-debezium.md) | 04 |
| 4 | Stream | [Kafka](./05-kafka.md) | 05 |
| 5 | Render & Push | [Camel](./06-camel.md) + [Helm](./07-helm.md) + [Git](./08-git.md) | 06, 07, 08 |
| 6 | Reconcile | [ArgoCD](./09-argocd.md) + [RHACM](./10-rhacm.md) | 09, 10 |
| 7 | Provision | [HyperShift](./11-hypershift.md) | 11 |

## Design Principles (verbatim from handoff)

> **Event-driven core.** All state changes flow as immutable events through
> Kafka. No direct service-to-service calls in the provisioning path.

> **GitOps reconciliation.** Rendered manifests are committed to Git. ArgoCD
> reconciles — the pipeline never talks to the Kubernetes API directly.

> **Helm as template engine.** Helm renders YAML from values. No Helm
> releases, no Tiller, no release state. Pure `helm template`.

> **Dead-letter resilience.** Every Kafka consumer has a DLQ topic. Failed
> events are retried with backoff, then parked for manual inspection.

> **Per-org tenant isolation.** Each department gets its own Git repo, RBAC
> scope, ArgoCD AppProject, and RHACM ManagedClusterSet. Cross-tenant access
> is impossible by design.

> **Two-repo model.** `gdfkube-infra` holds shared platform resources
> (ArgoCD projects, RHACM cluster sets, RBAC). Per-org `gdfkube-{org}` repos
> hold customer cluster manifests. Camel writes to both.

## End-to-End Sequence

1. Operator submits a form in the [Portal](./01-itsm-portal.md).
2. [Express API](./02-express-api.md) validates, assigns a ULID `requestId`, inserts the document into [MongoDB](./03-mongodb.md) `gdfkube.requests` with `status: approval`.
3. SETIC platform admin approves in the portal → Express updates the doc to `status: provisioning`.
4. [Debezium](./04-debezium.md) tails the oplog, publishes the change event to [Kafka](./05-kafka.md) topic `dbz.gdfkube.requests` with `key = requestId`.
5. [Camel](./06-camel.md) `request-router` filters for actionable ops (`c` or `u → provisioning`), routes by `formId`.
6. [Helm](./07-helm.md) `template` renders chart manifests from a values doc built out of `meta.*` (requester), `vars.*` (form input), `system.*` (injected defaults).
7. Camel commits the rendered YAML to the per-org [Git repo](./08-git.md) `gdfkube-{org}`. If the repo is missing, `repo-bootstrap` creates it via the Gitea API.
8. Camel publishes pipeline-stage events to `gdfkube.pipeline.status`. Express subscribes and pushes them to the portal via SSE.
9. SETIC operator opens [ArgoCD](./09-argocd.md), inspects the diff, approves the sync manually. Auto-sync is disabled everywhere.
10. ArgoCD applies HostedCluster, NodePool, ManagedCluster manifests on the hub.
11. [HyperShift](./11-hypershift.md) provisions the hosted control plane (KubeVirt VMs).
12. [RHACM](./10-rhacm.md) `ConfigurationPolicy` injects `pull-secret` and `sshkey` into the `hc-{org}-{cluster}` namespace; the hypershift-addon attaches the cluster as a `ManagedCluster` (already pre-created by Camel so it lands in the correct ClusterSet).
13. Camel `status-emitter` flips request status to `ready`. Portal shows the cluster as available; operator downloads kubeconfig.

Errors at any stage land in `dlq.gdfkube.*` topics with context headers, are visible in MongoDB `dlq_log`, and require manual replay (see [Kafka](./05-kafka.md) and [Camel](./06-camel.md)).

## Glossary

| Term | Meaning |
|---|---|
| **org** | A customer department (saúde, educação, transportes, …). One org = one Git repo + one ArgoCD AppProject + one RHACM ManagedClusterSet. |
| **SETIC** | Distrito Federal's central IT secretariat. Owns the hub cluster and the platform itself. |
| **operator** | A user inside an org who submits requests. Cannot approve their own requests. |
| **platform admin** | A SETIC employee who approves requests and operates the platform. In the demo, the ITSM `admin` user maps here. |
| **hub cluster** | The OpenShift cluster running RHACM, ArgoCD, Strimzi, Camel, MongoDB, Gitea. |
| **hosted cluster** | A KubeVirt-backed OpenShift cluster created by HyperShift, owned by exactly one org. |
| **request** | A MongoDB document representing one form submission. ULID `requestId` is the Kafka key and the cross-stage correlation id. |
| **form** | A FormDef document declaring the schema, target Helm chart, and target Kafka topic for a kind of request (e.g. `cluster-request`, `namespace-request`). |
| **gdfkube-infra** | Shared platform Git repo. Holds ArgoCD AppProjects, ApplicationSets, RHACM ClusterSets, RBAC, Helm charts. |
| **gdfkube-{org}** | Per-org Git repo. Holds rendered cluster/namespace/scaling manifests for that org. |
| **DLQ** | Dead-letter queue. Per-route Kafka topic where messages land after retry exhaustion. |
| **ULID** | Universally Unique Lexicographically Sortable Identifier. Used as `requestId`; sortable by creation time. |
| **CDC** | Change Data Capture. Debezium tails the MongoDB oplog and emits change events to Kafka. |

## Resolved Decisions Summary

The full list lives in the per-component docs. Highlights:

- **All ArgoCD syncs are manual.** No auto-sync on either repo.
- **Kafka is at-least-once**, with manual offset commits + idempotent downstream operations.
- **Helm is template-only.** No releases, no Tiller, no in-cluster state.
- **Approvals require a SETIC platform admin.** One admin signoff is enough for the demo.
- **Gitea is the only Git provider**, behind a pluggable `GitProvider` interface.
- **One Quarkus-Camel app**, not multiple Camel K Integrations.
- **Per-org RHACM ClusterSets are exclusive.** Dynamic targeting uses Placement, not LabelSelector on the set.

## What This Doc Does Not Cover

- Implementation detail (deferred to per-component PRDs).
- Observability stack — see [13-observability.md](./13-observability.md) (deferred).
- Backup / DR strategy — not in handoff, not yet decided.
- Cost model and capacity planning.
