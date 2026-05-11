## Why

The demo pipeline has two infrastructure layers in place (MongoDB replica set, 3-broker Kafka KRaft cluster) and an Express API that persists requests to Mongo, but no wiring between them. The full provisioning loop — request → CDC → Camel orchestration → manifest render → Git commit → SSE stage stream — does not exist. Without it, neither demo verification nor any downstream consumer (UI stage timeline, audit dashboard, DLQ replay tooling) can be exercised. Landing the wiring as one bundle is justified because no subsystem is independently observable: a Debezium connector with no consumer, a Camel app with no producer driver, or an Express SSE route with no events are all unverifiable in isolation.

## What Changes

**New Debezium Kafka Connect stack**
- `gdfkube-debezium-connect` Compose service (image `debezium/connect:2.7.3.Final`), depending on healthy kafka1/2/3 and a one-shot `gdfkube-connect-topics-init` that creates the 3 Connect-internal topics (`connect-configs`, `connect-offsets`, `connect-status`) with `cleanup.policy=compact`. A one-shot `gdfkube-debezium-init` registers the MongoDB connector via curl `PUT` against the Connect REST API. Connector config uses `capture.mode=change_streams_update_full_with_pre_image` to enable the approval-loop guard.

**New Camel orchestrator stack**
- `gdfkube-camel` Compose service running a new Quarkus 3.16.3 / Camel 4.6.0 JVM app with 8 in-process routes (`request-router`, `helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`, `audit-sink`, `config-reload`, `dlq-handler`). The image bundles Helm CLI v3.16.x. Compose bind-mounts the Helm chart catalog at `/opt/charts:ro`. A `GitProvider` interface has a real `GiteaGitProvider` and a `MockGitProvider` (active in `%dev` profile). Five full Helm charts are added at `gdfkube-src/gdfkube-infra/charts/`. Camel is the sole producer of `gdfkube.pipeline.status` and `gdfkube.audit`.

**Two new MongoDB collections**
- `gdfkube.audit_log` (TTL 30 days on `at`, indexed by `{requestId:1, at:-1}`) — owned by Camel `audit-sink` route.
- `gdfkube.dlq_log` (no TTL; indexed by `{topic:1, firstSeenAt:-1}` and `{requestId:1}`) — owned by Camel `dlq-handler` route.
- Both bootstrapped idempotently by a new `init-camel-collections.js` script run from a `mongo-collections-init` service (extension of the mongo-seed precedent).

**Express SSE consumer (ADDED requirements only)**

- From: Express persists `POST /requests` to MongoDB; does not consume or produce on Kafka.
- To: Express persists `POST /requests` to MongoDB (unchanged) and additionally runs a kafkajs consumer on `gdfkube.pipeline.status` (group `itsm-sse-${HOSTNAME}`, `auto.offset.reset=latest`) and exposes `GET /api/itsm/requests/:id/events` as a Server-Sent Events stream.
- Reason: SPA needs real-time pipeline stage visibility.
- Impact: non-breaking; existing `POST /requests` semantics unchanged. New `kafkajs ^2.2.4` dependency.

## Capabilities

### New Capabilities

- `debezium-connect-stack`: Kafka Connect container with the Debezium MongoDB connector, producing `dbz.gdfkube.requests`, `dbz.gdfkube.forms`, and DLQ to `dlq.gdfkube.debezium`. Owns the 3 Connect-internal topics.
- `camel-orchestrator-stack`: Quarkus-Camel app with all 8 routes, `GitProvider` interface (`GiteaGitProvider` + `MockGitProvider`), full Helm chart catalog, and `helmValuesBuilder` bean. Sole producer of `gdfkube.pipeline.status` and `gdfkube.audit`.
- `gdfkube-audit-log-collection`: MongoDB `audit_log` collection (schema, indexes, 30-day TTL). Owned by Camel `audit-sink`.
- `gdfkube-dlq-log-collection`: MongoDB `dlq_log` collection (schema, indexes, no TTL). Owned by Camel `dlq-handler`.

### Modified Capabilities

- `itsm-express-api`: ADDED requirements only — new SSE endpoint `GET /api/itsm/requests/:id/events`, new Kafka consumer on `gdfkube.pipeline.status`, new stage-event payload schema. The existing `Request Submit Endpoint` requirement is NOT modified (Express still does not produce to Kafka).

## Impact

- **Files touched (modify)**: `docker-compose.yml`, `gdfkube-src/gdfkube-itsm/server/package.json`, `gdfkube-src/gdfkube-itsm/server/src/index.ts`, `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml`.
- **Files touched (create)**: full Quarkus-Camel project under `gdfkube-src/gdfkube-camel/`; 5 Helm chart trees under `gdfkube-src/gdfkube-infra/charts/`; Debezium scripts and connector config under `gdfkube-src/gdfkube-infra/debezium/`; `init-camel-collections.js` under `gdfkube-src/gdfkube-infra/mongodb/`; Express SSE/consumer modules under `gdfkube-src/gdfkube-itsm/server/src/`.
- **Dependencies added**: `debezium/connect:2.7.3.Final` (image), Quarkus `3.16.3` + Camel `4.6.0` (pinned), Helm CLI `v3.16.x` (SHA-pinned download in Dockerfile.jvm), `kafkajs ^2.2.4` (npm).
- **Kafka topics consumed/produced** (all created by `kafka-broker-stack`):
  - Produced by Debezium: `dbz.gdfkube.requests`, `dbz.gdfkube.forms`, `dlq.gdfkube.debezium`.
  - Produced by Camel: `gdfkube.pipeline.status`, `gdfkube.audit`, `dlq.gdfkube.{requests,helm-render,git-push,repo-bootstrap}`.
  - Consumed by Camel: `dbz.gdfkube.requests`, `dbz.gdfkube.forms`, `dlq.gdfkube.*`, `gdfkube.audit`.
  - Consumed by Express: `gdfkube.pipeline.status`.
- **Downstream consumers unblocked**: future `argocd-stack`, `rhacm-stack`, operator-tooling specs (audit dashboard, manual DLQ replay), `gitea-stack` (which will swap `MockGitProvider` for `GiteaGitProvider` by flipping `app.git.provider=gitea`).
- **Existing services unchanged in behavior**: `mongo1/2/3`, `mongo-init`, `mongo-seed`, `kafka1/2/3`, `kafka-init`, `gdfkube-itsm-api` Submit endpoint, `itsm` SPA. Compose service definitions for `gdfkube-itsm-api` gain new env vars and `depends_on` only.
- **Testing strategy**:
  - Camel routes: integration with Testcontainers (Kafka + MongoDB) and `CamelTestSupport`.
  - Camel beans (`helmValuesBuilder`, `MockGitProvider`): unit (JUnit 5).
  - Helm charts: `helm template` + `kubectl --dry-run=client -f -` per chart.
  - Express SSE consumer: integration via Jest + kafkajs against Testcontainers Kafka.
  - Express SSE route: contract via Jest + supertest, simulated EventSource client.
  - Debezium connector: smoke via Compose start + `curl /connectors/.../status` → `RUNNING`.
  - End-to-end pipeline: acceptance bash script driving `POST /requests` and asserting Mongo state, Kafka offsets, SSE stream.
