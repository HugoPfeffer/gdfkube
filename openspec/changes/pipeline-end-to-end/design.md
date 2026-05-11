## Context

The demo stack runs from a root `docker-compose.yml` that hosts a MongoDB 3-node replica set (`mongo1/2/3` + `mongo-init` + `mongo-seed`), a 3-broker Kafka KRaft cluster (`kafka1/2/3` + `kafka-init`), the ITSM API (`gdfkube-itsm-api`), and the ITSM SPA (`itsm`), all on the `gdfkube-net` bridge network. The 9-topic Kafka catalog is already created; this change consumes and produces against it. No downstream pipeline consumers exist yet — Debezium, Camel, and Express SSE are all introduced here.

Sources of truth: [docs/02-express-api.md](../../../docs/02-express-api.md), [docs/03-mongodb.md](../../../docs/03-mongodb.md), [docs/04-debezium.md](../../../docs/04-debezium.md), [docs/05-kafka.md](../../../docs/05-kafka.md), [docs/06-camel.md](../../../docs/06-camel.md), [docs/07-helm.md](../../../docs/07-helm.md), [docs/08-git.md](../../../docs/08-git.md). Doc-level contradictions resolved in brainstorm.md.

### End-to-end flow

```
SPA -> Express POST /requests -> MongoDB.requests
                                        |
                                        v
                                Debezium MongoDB connector (Kafka Connect)
                                        |
                                        v
                                dbz.gdfkube.requests
                                        |
                                        v
   ┌──────────────────────────── Camel routes ───────────────────────────┐
   │ request-router -> helm-render -> git-push -> repo-bootstrap (404)   │
   │     |                                                               │
   │     +---> status-emitter (gdfkube.pipeline.status)                  │
   │     +---> audit interceptor -> gdfkube.audit -> audit-sink -> Mongo │
   │     +---> errors -> dlq.gdfkube.{route} -> dlq-handler -> Mongo     │
   │ config-reload <- dbz.gdfkube.forms                                  │
   └─────────────────────────────────────────────────────────────────────┘
                                        |
                                        v
                                gdfkube.pipeline.status
                                        |
                                        v
                                Express SSE consumer (per-replica group)
                                        |
                                        v
                                GET /api/itsm/requests/:id/events -> SPA
```

## Goals / Non-Goals

**Goals:**

- Bring the full provisioning loop online in Compose: SPA submission → SSE stage stream.
- Establish the `GitProvider` interface seam (mock for dev/test, real `GiteaGitProvider` for production) so a later `gitea-stack` swap is a profile flip.
- Define the canonical `StageEvent` schema produced by Camel and consumed by Express.
- Create durable `audit_log` and `dlq_log` collections with the correct retention shapes.
- Make the snapshot replay (`op=r`) behave identically to live creates (`op=c`) so cold starts are idempotent.
- Prevent the approval-loop bug: Camel's `stage` write-back to MongoDB must NOT re-trigger `request-router`.

**Non-Goals:**

- K8s `Deployment`/`Service`/`initContainer` for Camel and Express (Compose-only; future `camel-k8s-deployment`, `itsm-k8s-deployment`).
- Strimzi `KafkaConnector` CR for Debezium (future `debezium-k8s-strimzi`).
- Real Gitea deployment (future `gitea-stack`; `MockGitProvider` covers dev-loop).
- Quarkus native binary (JVM is sufficient for dev-loop).
- Multi-replica Camel with leader election (single replica per 06-camel.md open question).
- Multi-replica Express SSE with shared subscription registry (single replica; future Redis/sticky-session spec).
- Hot-reload of Helm charts (pod restart is the mechanism).
- ArgoCD and RHACM wiring (Camel never talks to either — Git is the seam).
- TLS / mTLS / SASL / ACLs / Schema registry / Lag monitoring (inherited deferrals).
- Auto-replay from `dlq_log` (manual CLI replay per 06-camel.md).
- SSE backpressure or per-client buffering ("late subscribers may miss earlier stages" is the contract).
- Multi-replica Connect cluster (single Connect container; forestalls `GROUP_ID` collision).
- Express → Kafka producer (architectural decision; 02-express-api.md is authoritative).
- `op=d` (delete) handling in `request-router`.

## Decisions

### 1. Debezium runs as a raw Kafka Connect container

Image: `debezium/connect:2.7.3.Final` (pinned patch tag; image ships the MongoDB connector via the Debezium release bundle). Single replica. Worker state lives entirely in the 3 Connect-internal topics (`connect-configs`, `connect-offsets`, `connect-status`) — no host volume. Recovery: `docker compose down -v`. Host port `127.0.0.1:8083:8083` mirrors the kafka/mongo loopback precedent. Alternative considered: Strimzi `KafkaConnector` CR — rejected because Strimzi requires K8s; not available in Compose.

### 2. Connect-internal topics are owned by the Debezium capability

`gdfkube-connect-topics-init` is a one-shot service (image `apache/kafka:3.7.x`) that runs `kafka-topics.sh --if-not-exists` for the 3 internal topics with `cleanup.policy=compact`. The script lives at `gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh` so that `kafka-broker-stack` remains untouched. This preserves the capability boundary and keeps the archived kafka spec immutable. Alternative: extend `kafka-init` — rejected for boundary reasons.

### 3. Connector registration is an idempotent REST PUT

`gdfkube-debezium-init` is a one-shot `curl` service that depends on `gdfkube-debezium-connect: service_healthy` and runs `PUT http://gdfkube-debezium-connect:8083/connectors/gdfkube-mongo-source/config` with the connector JSON body. `PUT` is idempotent: re-runs with the same body are no-ops; updates replace config. Alternative: bake a `kafka-connect-cli` image — rejected for an extra image dep.

### 4. Capture mode is `change_streams_update_full_with_pre_image`

Required so `request-router` can compare `before.status` vs `after.status` and accept only true approval flips (`approval` → `provisioning`), dropping Camel's own `stage` write-back. Pre-images require the MongoDB collection to be created with `changeStreamPreAndPostImages: true` — `init-camel-collections.js` includes this for `requests` and `forms` (and the seed step in `mongo-seed` is unchanged). Alternative: `change_streams_update_full` (default) with a single-field check on `status == "provisioning"` — rejected because it fires on every `op=u` whose `status` is unchanged-from-provisioning, causing infinite loops with Camel's `stage` write-back.

### 5. Camel is one Quarkus app with 8 in-process routes

Quarkus 3.16.3 + Camel 4.6.0, JVM image only. Single replica. The 8 routes share an in-process Helm CLI binary, a Git working dir under `/tmp`, and the `FormDefCache`. Compose service `gdfkube-camel` bind-mounts `gdfkube-src/gdfkube-infra/charts` at `/opt/charts:ro` (Compose analog of the K8s initContainer). Alternative: Per-route Camel K Integrations — rejected (K8s-only).

### 6. Camel is the sole producer of `gdfkube.pipeline.status` and `gdfkube.audit`

Express does not produce to Kafka (02-express-api.md authoritative). Debezium has no application-level producer hook. Centralizing on Camel keeps the StageEvent schema enforceable and gives all stage events a single ordered emit path. `status-emitter` fires when a request enters the pipeline, emitting the full 7-stage timeline as a batch keyed by `requestId`. Stages whose actual timestamp is known (form/mongo/debezium from `meta.submittedAt` and `source.ts_ms`) carry that timestamp; later stages use processing timestamps. Audit events are emitted by a Camel interceptor invoked by every side-effecting route (`helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`) — one audit event per route execution.

### 7. Approval-loop guard

`request-router` filter predicate:

- `op=c` → route by `formId`.
- `op=r` (snapshot row) → route by `formId` (treated as `op=c`; downstream is idempotent so seeded re-provisioning is a no-op diff).
- `op=u` AND `before.status != "provisioning"` AND `after.status == "provisioning"` → route by `formId` (true approval flip).
- All other `op=u` (including Camel's own `stage` write-back which keeps `status` at `provisioning`) → drop.
- `op=d` → drop (out of scope).

This is the only place the `before.status != after.status` predicate fires; the `dbz.gdfkube.forms` topic uses `op=c|r|u` ignoring `op=d` (a form update is always a true change).

### 8. Stage representation: integer 0–6 with `stageName` string

Existing `Request.stage` Mongoose schema is `Number 0–6`. The SSE `StageEvent` payload uses the integer as the source of truth and adds a `stageName` string from the fixed array `["form", "mongo", "debezium", "kafka", "camel", "git", "argocd"]` for SPA convenience. `status` is `"ok"` or `"fail"`. Camel `status-emitter` produces this schema verbatim; Express re-emits the parsed JSON as SSE `data:` lines without transformation.

### 9. Retry backoff: 1s/5s/25s with multiplier 5.0

Camel `errorHandler(deadLetterChannel(...))` uses `maximumRedeliveries=3`, `redeliveryDelay=1000`, `backOffMultiplier=5.0`. The third redelivery falls at 25s (1 × 5 × 5). This is the exact math; 05-kafka.md's "30s" is the rounded narrative. `kafkaManualCommit` is invoked only on success.

### 10. DLQ headers: 9 mandatory headers, stamped before publish

Every route, before publishing to `dlq.gdfkube.{route}`, stamps: `x-original-topic`, `x-original-partition`, `x-original-offset`, `x-original-key`, `x-error-class`, `x-error-msg`, `x-stage`, `x-attempts`, `x-first-failure-at`, `x-replayed` (initially `false`). Debezium uses `errors.deadletterqueue.context.headers.enable=true` to propagate the equivalent metadata for connector-level failures. The `dlq-handler` route is a multi-pattern consumer on `dlq.gdfkube.*` that persists to `dlq_log` and does not auto-replay.

### 11. GitProvider interface with two implementations

```java
boolean repoExists(String owner, String name);
void createRepo(String owner, String name, RepoOptions opts);
Path cloneOrPull(String owner, String name, String branch);
void commitAndPush(Path workingTree, List<Path> files, String message, GitAuthor author);
```

`GiteaGitProvider` uses Gitea REST + JGit; active when `app.git.provider=gitea`. `MockGitProvider` is in-memory; active when `app.git.provider=mock` (the default in `%dev` profile). Mock state is process-local: a `docker compose restart gdfkube-camel` wipes commits. Acceptable because verification scenarios stay within a single Camel lifecycle and a real Gitea instance is deferred to `gitea-stack`. Commit message format: `[gdfkube] REQ{requestId}: {action} {resourceName} ({formId})`. Author: `gdfkube-camel <camel@gdfkube.gov.br>`.

### 12. Helm CLI as subprocess; charts bind-mounted

The Dockerfile.jvm installs Helm v3.16.x (SHA-pinned). Camel's `helm-render` route shells out to `helm template <release> /opt/charts/<chartRef> --values /tmp/<requestId>-values.yaml --output-dir /tmp/<requestId>-out --include-crds`. `<chartRef>` resolves nested paths (e.g., `infra/argocd-org`). Five full charts are added: `cluster-request`, `namespace-request`, `scale-patch`, `infra/argocd-org`, `infra/rhacm-org`. Acceptance bar: `helm template <chart>` exits 0 and the output is accepted by `kubectl --dry-run=client -f -`. Alternative: Java Helm SDK — rejected; 06-camel.md explicitly chose subprocess.

### 13. helmValuesBuilder three-tier composition

The `helmValuesBuilder` bean produces:

- `meta.{requestId, formId, org, email, submittedAt, correlationId}`
- `vars.*` — pass-through of form input
- `system.{baseDomain, releaseImage, giteaExternalUrl, giteaOwner}`
- `system.naming.{hostedClusterName, namespace, appProject, clusterSet}`
- `system.labels.{"cluster.open-cluster-management.io/clusterset", "setic.gov.br/managed", "setic.gov.br/customer", "gdfkube.io/managed", "gdfkube.io/organization", "gdfkube.io/request-id"}`

The bean writes the composed values to `/tmp/<requestId>-values.yaml` then invokes `helm template`.

### 14. MongoDB collections owned per-capability

`audit_log` and `dlq_log` are two separate per-collection specs to keep ownership clean — `audit_log` is owned by Camel `audit-sink`; `dlq_log` is owned by Camel `dlq-handler`. Both are bootstrapped by `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` running in a new `mongo-collections-init` service (Compose service) that depends on `mongo1: service_healthy`. The script is idempotent: `db.createCollection({ ..., changeStreamPreAndPostImages: true })` is guarded; `createIndex` is naturally idempotent.

### 15. Express SSE: per-replica consumer group + in-memory subscription map

Consumer group `itsm-sse-${HOSTNAME}` ensures every Express replica receives every event (per-replica fan-out is required because subscriptions are local to a replica). `${HOSTNAME}` maps to `{podName}` in K8s and container-id-hash in Compose. `auto.offset.reset=latest` so a new replica only forwards real-time events. In-memory `Map<requestId, Set<Response>>` is the subscription registry; on each consumed message, every subscriber whose key matches receives the event. On client disconnect, the entry is removed. 15-second `:\n\n` heartbeat keeps proxies alive. Alternative: shared group `itsm-sse` — rejected; events would partition across replicas and subscribers would miss messages unless served by the same replica that received the partition.

### 16. SSE synthetic first event handles late subscribers

When a client opens `GET /api/itsm/requests/:id/events`, Express emits a synthetic first event derived from the current `Request.stage` field in MongoDB. If `stage == 0` (the default), the synthetic event is `{stage: 0, stageName: "form"}` so the SPA renders the first checkpoint. If the request is mid-pipeline (e.g., `stage == 5`), the synthetic event is `{stage: 5, stageName: "git"}`. Subsequent events come from the live Kafka consumer. Late subscribers may miss intermediate stage events between `0` and the current `stage` — accepted by 02-express-api.md as the contract.

### 17. Concrete image tags

`debezium/connect:2.7.3.Final`, `quarkus:3.16.3`, `camel:4.6.0`, Helm `v3.16.x` (concrete patch tag in Dockerfile.jvm, SHA-pinned download). The kafka-broker-stack retrospective documented a real bug from a `:3.7` vs `:3.7.2` drift; this change avoids the same trap.

## Risks / Trade-offs

**[Pre-image requirement changes the MongoDB collection options]** → Existing `gdfkube.requests` and `gdfkube.forms` collections must be created (or altered) with `changeStreamPreAndPostImages: true`. `mongo-seed` currently creates `requests` and `forms` implicitly on first insert without this flag. **Mitigation:** `init-camel-collections.js` runs before `gdfkube-debezium-init` and does either a `collMod` (if the collection exists) or a `createCollection` (if it doesn't) with the pre-image option. The script is idempotent: re-running against a configured collection is a no-op.

**[Connector worker state is volatile]** → The Connect container has no persistent volume; worker state lives in compacted Kafka topics. If all kafka volumes are wiped (`docker compose down -v`), the connector loses its offset and re-snapshots the collections. **Mitigation:** snapshot replay is explicitly part of the design (`op=r` is treated as `op=c`; downstream is idempotent). Documented in the `debezium-connect-stack` README.

**[MockGitProvider state is in-memory]** → `docker compose restart gdfkube-camel` wipes commits. Verification scenarios must stay within a single Camel lifecycle. **Mitigation:** documented in the `camel-orchestrator-stack` spec; an end-to-end verification script does not restart Camel mid-scenario.

**[Single-replica Express SSE has no failover]** → If the Express container restarts, all open SSE connections drop and subscribers miss in-flight events until they reconnect (and rely on the synthetic first event). **Mitigation:** SPA reconnect behavior (EventSource native retry) covers this; multi-replica/Redis is a documented future spec.

**[Helm CLI version drift]** → A Helm CLI mismatch between the Camel image and chart authors' local environment can cause silent template differences. **Mitigation:** Helm v3.16.x is SHA-pinned in `Dockerfile.jvm`; chart authors run `helm template` against the Dockerfile-pinned version (documented in `gdfkube-camel/README.md`).

**[`status-emitter` produces a 7-event batch per request]** → A single submission produces 7 messages on `gdfkube.pipeline.status` (one per stage). With current partition count (6) and key (`requestId`), all 7 land on the same partition and are ordered — but downstream observers need to expect bursts. **Mitigation:** ordering is required (SSE renders the timeline in order); batch emission is intentional. Documented in the `camel-orchestrator-stack` spec.

**[Camel's `stage` write-back must not loop]** → A misconfigured pre-image or a regression in the filter predicate would cause `request-router` to fire on Camel's own MongoDB write, creating an infinite loop. **Mitigation:** explicit verification scenario (V7: approval path) asserts that a `provisioning` → `provisioning` update is DROPPED. Integration tests use Testcontainers to exercise this path.

**[Connect topics created outside the kafka-init script]** → A reader looking only at `kafka-broker-stack` will not see `connect-configs/offsets/status`. **Mitigation:** documented in both the `debezium-connect-stack` README and the `kafka-broker-stack` README (which will gain a "see also" pointer in a follow-up — non-spec change, captured in retrospective).

**[Express SSE backpressure on slow clients]** → A slow client could backlog SSE writes in Node's stream buffer. **Mitigation:** Node's writable stream defaults are sufficient for the demo; high-volume backpressure is an explicit non-goal. If needed, switch to `res.write(...)` with a backpressure check in a future enhancement.

## Migration Plan

This is a greenfield bundle — no existing data to migrate. Deployment is `docker compose up -d` against the current stack. Order of service start (Compose handles via `depends_on`):

1. `mongo1/2/3` healthy.
2. `mongo-init` completed; `mongo-seed` completed; `mongo-collections-init` completed.
3. `kafka1/2/3` healthy; `kafka-init` completed.
4. `gdfkube-connect-topics-init` completed.
5. `gdfkube-debezium-connect` healthy.
6. `gdfkube-debezium-init` completed (connector registered).
7. `gdfkube-camel` healthy.
8. `gdfkube-itsm-api` healthy (now with kafkajs consumer initialized).

Rollback: `docker compose down -v` wipes all stack state; re-`up` reaches the same end state via the same dependency order. There is no shared persistent state with prior pre-pipeline configurations, so rollback to "no pipeline" requires reverting this change (git revert) and `docker compose down -v && up`.

For schema migration: this change introduces (does not modify) two new collections. The pre-image `collMod` on existing `requests` and `forms` collections is idempotent and non-destructive. No Kafka consumer-group rebalances are triggered for existing consumers (no existing pipeline consumers).

## Open Questions

Implementation-level only; scope is locked:

1. **Helm chart template-level details** — exact CRD field shapes for `HostedCluster`, `NodePool`, `ManagedCluster`, `AppProject`, `ApplicationSet`, `ManagedClusterSet`, `ManagedClusterSetBinding`. These are sourced from existing `gdfkube-orgs/orgs/sec-*` manifests; chart author task in plan.md will copy and parameterize.
2. **`values.schema.json` constraints** — the depth of schema validation (required fields only, vs full pattern validation). Default: required fields only for v1; tighten in a future enhancement.
3. **JGit timeout tuning** — push/pull HTTP timeouts. Default: 30s connect, 60s read.
4. **Status-emitter timestamp source for `kafka` and `camel` stages** — for stages where there is no upstream timestamp, use the route-execution timestamp at `status-emitter` entry. Documented in the route source comment.
5. **Camel JVM heap** — initial `Xmx512m` for demo, revisit in retrospective if OOMs appear under load.
