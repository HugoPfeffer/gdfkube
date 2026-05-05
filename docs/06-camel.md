# Camel

> **Implementation Status:** Planned
> **Source:** Handoff `app.jsx` (route descriptions, retry config, error handling)
> **Last validated:** 2026-05-05

## Role in the Pipeline

```
[Kafka dbz.gdfkube.requests] ──▶ request-router ──▶ helm-render ──▶ git-push
                                       │                              │
                                       └─▶ status-emitter ──▶ Kafka gdfkube.pipeline.status
                                       └─▶ audit-sink ──▶ MongoDB audit_log
                                       └─▶ dlq-handler ──▶ MongoDB dlq_log
                                       └─▶ config-reload (consumes dbz.gdfkube.forms)
                                       └─▶ repo-bootstrap (called by request-router)
```

Camel is the orchestrator. It consumes CDC events, renders manifests via Helm,
commits to Git, emits stage progress, and audits everything.

## Responsibilities

- Consume `dbz.gdfkube.requests` and route each event by `formId` and `status`.
- Render Helm charts into YAML manifests.
- Commit and push manifests to the per-org Git repo (auto-create the repo on first request).
- Emit pipeline stage events to `gdfkube.pipeline.status`.
- Append audit entries to `gdfkube.audit` and persist them to MongoDB `audit_log`.
- Drain DLQ topics into MongoDB `dlq_log` for operator visibility.
- **Does NOT** talk to ArgoCD, the Kubernetes API, or RHACM. State changes flow through Git.

## Design

### Tech

- Quarkus 3.x + Camel 4.x. Single Quarkus-native image.
- Camel components: `kafka`, `mongodb`, `file`, `bean`, `direct`, `seda`.
- Helm CLI invoked as a subprocess (no Java Helm SDK).
- JGit for Git operations.

### Topology

- **One Quarkus-Camel app**: `gdfkube-camel` Deployment in namespace `gdfkube-camel`.
- All 6 routes run in-process. Sharing connection pools, the Helm CLI binary, and the cloned-Git working directory.
- Replica count: 1 for the demo (Kafka consumer-group rebalance handles failover if scaled). Idempotent downstream means scaling out is safe.
- **Not** Camel K Integration CRs.

### Routes

| Route | Source | Sink(s) | Purpose |
|---|---|---|---|
| `request-router` | `kafka:dbz.gdfkube.requests` | `direct:helm-render`, `direct:status-emit`, `kafka:dlq.gdfkube.requests` (on retry exhaustion) | Filter actionable ops, branch by formId. |
| `helm-render` | `direct:helm-render` | `direct:git-push`, `kafka:dlq.gdfkube.helm-render` | Build values.yaml, exec `helm template`, return manifests. |
| `git-push` | `direct:git-push` | `kafka:dlq.gdfkube.git-push` | JGit clone/pull, write files, commit, push. Calls `repo-bootstrap` on 404. |
| `repo-bootstrap` | `direct:repo-bootstrap` | `kafka:dlq.gdfkube.repo-bootstrap` | Create per-org repo via the `GitProvider` (Gitea API) if it doesn't exist. Idempotent. |
| `status-emitter` | `direct:status-emit` | `kafka:gdfkube.pipeline.status` | Publish stage transitions. Also writes the request's `stage` field back to MongoDB. |
| `audit-sink` | `kafka:gdfkube.audit` | `mongodb:gdfkube/audit_log` | Persist audit events (TTL 30d in Mongo). |
| `config-reload` | `kafka:dbz.gdfkube.forms` | (in-memory cache) | Refresh the in-process FormDef cache when forms change. |
| `dlq-handler` | `kafka:dlq.gdfkube.*` (multi-pattern) | `mongodb:gdfkube/dlq_log` | Drain DLQ topics into a queryable Mongo collection. Does NOT auto-replay. |

### Filtering Logic in `request-router`

Only two cases are actionable:

1. `op == 'c'` (insert) — always route by formId.
2. `op == 'u'` (update) and `value.status == 'provisioning'` — approval just flipped, kick off provisioning.

All other update events (e.g. `status: ready` set by `status-emitter` itself) are dropped to avoid loops.

### Helm Values Composition

`helmValuesBuilder` bean produces a values.yaml from three tiers:

```yaml
meta:                    # requester metadata (read-only at render time)
  requestId: 01HK6X...
  formId: cluster-request
  org: saude
  email: joao@saude.df.gov.br
  submittedAt: 2026-05-05T12:34:56Z
  correlationId: 01HK6X...

vars:                    # form-submitted values (the operator's input)
  clusterName: vacinacao
  nodeCount: 3
  environment: production

system:                  # injected by the bean — never from the form
  baseDomain: apps.gdfkube.gov
  releaseImage: quay.io/.../release-image:4.16.7
  giteaExternalUrl: https://gitea-gitea.apps.gdfkube.gov
  giteaOwner: gdfkube
  naming:
    hostedClusterName: hc-saude-vacinacao
    namespace: hc-saude-vacinacao
    appProject: saude
    clusterSet: saude
  labels:
    cluster.open-cluster-management.io/clusterset: saude
    setic.gov.br/managed: "true"
    setic.gov.br/customer: saude
    gdfkube.io/managed: "true"
    gdfkube.io/organization: saude
    gdfkube.io/request-id: 01HK6X...
```

`vars.*` keys must match the FormDef field keys. `meta.*` and `system.*` are
not user-editable.

### Helm Charts Source

Helm charts are **not** baked into the Camel image. An initContainer git-clones
`gdfkube-infra` into a shared `emptyDir` volume mounted at `/opt/charts/`.
The Camel container reads from that path. To pick up chart changes, restart
the Camel pod (initContainer re-clones).

This decouples chart releases from Camel image releases.

### Git Commit Message

```
[gdfkube] REQ{requestId}: {action} {resourceName} ({formId})
```

Example: `[gdfkube] REQ01HK6X3F5G9Q: create hc-saude-vacinacao (cluster-request)`.

### Error Handling

```
errorHandler(deadLetterChannel("kafka:dlq.gdfkube.{route}")
  .maximumRedeliveries(3)
  .redeliveryDelay(1000)
  .backOffMultiplier(5.0)        // 1s, 5s, 25s ≈ handoff's 1s/5s/30s
  .useExponentialBackOff()
  .logRetryAttempted(true))
```

- Permanent errors (e.g. missing required field, invalid YAML, rejected by Gitea API with 4xx) skip retries — `retryWhile` guards against retrying on classes annotated as terminal.
- All exceptions bubble through Camel's UoW; `kafkaManualCommit` is **only** called on success. Failed messages are not committed; on retry the broker re-delivers them.

### Status Events

`status-emitter` produces to `gdfkube.pipeline.status` with key = `requestId`. Stage names match the canonical list: `form, mongo, debezium, kafka, camel, git, argocd`. Camel emits the latter four; Express emits `form` and `mongo`; Debezium has no direct emit (its operation is implicit in the CDC topic).

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | Kafka | consumer (kafkajs equivalent in Camel) |
| Outbound | Kafka | producer (`gdfkube.pipeline.status`, `gdfkube.audit`, `dlq.gdfkube.*`) |
| Outbound | MongoDB | direct driver (audit_log, dlq_log writes; stage write-back to requests) |
| Outbound | Helm CLI | subprocess exec |
| Outbound | Git (JGit) | TCP (HTTPS or SSH) |
| Outbound | Gitea API | HTTPS / REST (via `GitProvider`) |

## Operational Concerns

- **Idempotency:** the routes assume retries. File paths in Git are deterministic, so re-runs produce no diff and `git push` is a no-op.
- **Concurrency:** consumer group `gdfkube-camel`. With 6 partitions on `dbz.gdfkube.requests`, up to 6 pods can share the load. The shared Git working directory needs per-org locking — the demo runs single-replica to avoid this.
- **Helm CLI version drift:** pinned via the container image. Chart changes via initContainer re-clone do not bring in a new Helm binary.
- **Approval-loop guard:** `request-router` filter rejects all `u` events except `status: provisioning`. Without this, the `status-emitter` write of `status: ready` would re-trigger provisioning.

## Decisions Resolved

- One Quarkus-Camel app; not Camel K Integration CRs.
- Manual commits (`autoCommitEnable: false` + `kafkaManualCommit`).
- Retries: 3 attempts, 1s/5s/30s exponential backoff, then DLQ.
- DLQ handler is a Camel route that drains to MongoDB; replay is manual via CLI with `x-replayed: true` header.
- Helm charts mounted from `gdfkube-infra` via initContainer (not baked into image).
- Approval flips status to `provisioning`, which triggers the pipeline via CDC.

## Open Questions

- Multi-replica Git working-directory strategy: leader election, file locks, or per-replica clone? Demo is single-replica; production needs a decision.
- Helm chart cache invalidation: today, pod restart. Hot-reload would need a sidecar that watches the volume.
- How to bound `dlq_log` size — TTL like `audit_log`, or manual purge?

## References

- [05-kafka.md](./05-kafka.md) — topics consumed/produced.
- [07-helm.md](./07-helm.md) — chart layout, values reference.
- [08-git.md](./08-git.md) — `GitProvider` interface, Gitea implementation.
- [03-mongodb.md](./03-mongodb.md) — `audit_log` and `dlq_log` schemas.
