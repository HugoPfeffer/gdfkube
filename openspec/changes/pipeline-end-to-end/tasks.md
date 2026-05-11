## 1. MongoDB collection bootstrap (audit_log, dlq_log)

- [ ] 1.1 Create `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` that runs `db.createCollection("audit_log", { changeStreamPreAndPostImages: true })`-style idempotent setup (guarded with `getCollectionNames().includes(...)`) and the same for `dlq_log` (no pre-image option)
- [ ] 1.2 In the same script, add `collMod` calls to ensure `gdfkube.requests` and `gdfkube.forms` have `changeStreamPreAndPostImages: true` (guarded with a `try/catch` so it is no-op if already set)
- [ ] 1.3 In the same script, `db.audit_log.createIndex({ at: 1 }, { expireAfterSeconds: 2592000 })` and `db.audit_log.createIndex({ requestId: 1, at: -1 })` — both naturally idempotent
- [ ] 1.4 In the same script, `db.dlq_log.createIndex({ topic: 1, firstSeenAt: -1 })` and `db.dlq_log.createIndex({ requestId: 1 })`
- [ ] 1.5 Make the script log a one-line "ok" message per step so `docker compose up mongo-collections-init` produces readable output
- [ ] 1.6 Add a new Compose service `mongo-collections-init` to `docker-compose.yml`: image `mongo:7` (matching the replica set image), `restart: "no"`, `depends_on` `mongo1: service_healthy`, bind-mount the script at `/init-camel-collections.js:ro`, entrypoint `["mongosh", "mongodb://mongo1:27017/gdfkube?replicaSet=rs0", "/init-camel-collections.js"]`, on `gdfkube-net`
- [ ] 1.7 Verify: `docker compose up mongo-collections-init` exits 0; `mongosh --eval "db.audit_log.getIndexes()"` shows the TTL and compound index; `db.dlq_log.getIndexes()` shows the 2 indexes; re-running the service is a no-op

## 2. Connect-internal topic creation

- [ ] 2.1 Create `gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh` with `set -euo pipefail` and `kafka-topics.sh --create --if-not-exists` invocations for `connect-configs` (1 part, RF=3), `connect-offsets` (25 parts, RF=3), `connect-status` (5 parts, RF=3), followed by `kafka-configs.sh --alter --add-config cleanup.policy=compact` on each
- [ ] 2.2 `chmod +x` the script
- [ ] 2.3 Add Compose service `gdfkube-connect-topics-init` (image `apache/kafka:3.7.2`, `restart: "no"`, `depends_on` kafka1/2/3 healthy, bind-mount script at `/scripts/init-connect-topics.sh:ro`, entrypoint `bash /scripts/init-connect-topics.sh`)
- [ ] 2.4 Verify: service exits 0; `kafka-topics.sh --list` includes the 3 internal topics with `cleanup.policy=compact`

## 3. Debezium MongoDB connector

- [ ] 3.1 Create `gdfkube-src/gdfkube-infra/debezium/connector-config.json` with the full connector spec (all keys listed in the `debezium-connect-stack` spec)
- [ ] 3.2 Create `gdfkube-src/gdfkube-infra/debezium/register-connector.sh` that runs `curl -sf -X PUT -H 'Content-Type: application/json' --data @/connector-config.json http://gdfkube-debezium-connect:8083/connectors/gdfkube-mongo-source/config` with a retry loop (3 retries on connection refused, 2s between attempts)
- [ ] 3.3 `chmod +x` the register script
- [ ] 3.4 Add Compose service `gdfkube-debezium-connect` (image `debezium/connect:2.7.3.Final`, env per the spec, `127.0.0.1:8083:8083` host binding, healthcheck `curl -sf http://localhost:8083/`, `depends_on` kafka1/2/3 healthy + `gdfkube-connect-topics-init` completed, on `gdfkube-net`, no volumes)
- [ ] 3.5 Add Compose service `gdfkube-debezium-init` (image `curlimages/curl:8.10.1`, `restart: "no"`, bind-mounts `connector-config.json` and `register-connector.sh`, entrypoint runs the register script, `depends_on` `gdfkube-debezium-connect: service_healthy`)
- [ ] 3.6 Create `gdfkube-src/gdfkube-infra/debezium/README.md` documenting connector REST lifecycle, reset path, topic-prefix mapping, and `dlq.gdfkube.debezium`
- [ ] 3.7 Verify: `docker compose up -d gdfkube-debezium-connect` → healthy in < 90s; `gdfkube-debezium-init` exits 0; `curl http://127.0.0.1:8083/connectors/gdfkube-mongo-source/status` returns `RUNNING`; seeded `gdfkube.requests` rows produce `op=r` events on `dbz.gdfkube.requests`

## 4. Helm chart catalog (5 charts)

- [ ] 4.1 Create `gdfkube-src/gdfkube-infra/charts/cluster-request/{Chart.yaml,values.yaml,values.schema.json,templates/}` with HostedCluster, NodePool, ManagedCluster templates (source field shapes from existing `gdfkube-orgs/orgs/sec-*` manifests; parameterize via `meta`/`vars`/`system.naming`/`system.labels`)
- [ ] 4.2 Create `gdfkube-src/gdfkube-infra/charts/namespace-request/{Chart.yaml,values.yaml,values.schema.json,templates/namespace.yaml}` rendering a Namespace with `system.labels`
- [ ] 4.3 Create `gdfkube-src/gdfkube-infra/charts/scale-patch/{Chart.yaml,values.yaml,values.schema.json,templates/nodepool-patch.yaml}` rendering a NodePool replica-count patch
- [ ] 4.4 Create `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/{Chart.yaml,values.yaml,values.schema.json,templates/}` with AppProject and ApplicationSet
- [ ] 4.5 Create `gdfkube-src/gdfkube-infra/charts/infra/rhacm-org/{Chart.yaml,values.yaml,values.schema.json,templates/}` with ManagedClusterSet and ManagedClusterSetBinding
- [ ] 4.6 Verify per chart: `helm template <release> gdfkube-src/gdfkube-infra/charts/<chartRef>` exits 0 with non-empty output; output piped to `kubectl --dry-run=client -f -` exits 0

## 5. Quarkus-Camel project scaffold

- [ ] 5.1 Create `gdfkube-src/gdfkube-camel/pom.xml` with Quarkus BOM 3.16.3 and dependencies: `camel-quarkus-kafka`, `camel-quarkus-mongodb`, `camel-quarkus-jgit`, `camel-quarkus-rest`, `quarkus-rest`, `quarkus-arc`, `quarkus-smallrye-health`, `quarkus-micrometer-registry-prometheus`
- [ ] 5.2 Create `gdfkube-src/gdfkube-camel/src/main/resources/application.properties` with Quarkus config: HTTP port 8080, Kafka bootstrap from env, MongoDB URI from env, profile-specific `app.git.provider` (`%dev=mock`, `%prod=gitea`)
- [ ] 5.3 Create `gdfkube-src/gdfkube-camel/Dockerfile.jvm` based on `registry.access.redhat.com/ubi9/openjdk-21-runtime:1.21` with a Helm v3.16.x SHA-pinned install step and the app jar copy
- [ ] 5.4 Create `gdfkube-src/gdfkube-camel/README.md` documenting the build (`./mvnw package`), the Dockerfile build, profile flags, and the Helm CLI version pinning rule

## 6. Camel beans and value types

- [ ] 6.1 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/model/RequestEvent.java` mapping `op`, `before`, `after`, `source.ts_ms`, `key`
- [ ] 6.2 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/model/StageEvent.java` matching the canonical schema from `itsm-express-api` spec (requestId, stage, stageName, status, at, detail)
- [ ] 6.3 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/model/AuditEvent.java` matching the `audit_log` schema
- [ ] 6.4 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/FormDefCache.java` with `refresh(formId)` and `lookup(formId)` plus an in-memory `ConcurrentHashMap` cache
- [ ] 6.5 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/HelmValuesBuilder.java` that composes the 3-tier values document and writes `/tmp/<requestId>-values.yaml`
- [ ] 6.6 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/AuditInterceptor.java` that emits one audit event to `gdfkube.audit` per side-effecting route execution

## 7. GitProvider interface + implementations

- [ ] 7.1 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/git/{GitProvider.java,RepoOptions.java,GitAuthor.java}`
- [ ] 7.2 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/git/MockGitProvider.java` with an in-memory `Map<String, List<Commit>>` and `@IfBuildProperty(name="app.git.provider", stringValue="mock")` activation
- [ ] 7.3 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/git/GiteaGitProvider.java` using Gitea REST + JGit for the real impl, with `@IfBuildProperty(name="app.git.provider", stringValue="gitea")` activation (build artifact may be empty/stub at this stage; verification is the dev profile)
- [ ] 7.4 Unit tests for `MockGitProvider` (createRepo, cloneOrPull, commitAndPush, repoExists) in `src/test/java/`

## 8. Camel routes (8 routes)

- [ ] 8.1 Create `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/RequestRouterRoute.java` consuming `dbz.gdfkube.requests` with the filter predicate (`op=c|r` accept; `op=u` accept only when `before.status != "provisioning"` AND `after.status == "provisioning"`; drop everything else)
- [ ] 8.2 Create `HelmRenderRoute.java` invoking `HelmValuesBuilder` then exec `helm template <release> /opt/charts/<chartRef> --values /tmp/<id>-values.yaml --output-dir /tmp/<id>-out --include-crds`
- [ ] 8.3 Create `GitPushRoute.java` calling `GitProvider.cloneOrPull` + `commitAndPush`; on 404, route to `repo-bootstrap` and re-enter
- [ ] 8.4 Create `RepoBootstrapRoute.java` calling `GitProvider.createRepo` (idempotent — checks `repoExists` first)
- [ ] 8.5 Create `StatusEmitterRoute.java` producing the full 7-stage batch to `gdfkube.pipeline.status` keyed by `requestId` AND writing the integer `stage` back to MongoDB `requests`
- [ ] 8.6 Create `AuditSinkRoute.java` consuming `gdfkube.audit` and persisting to `audit_log` via `camel-quarkus-mongodb`
- [ ] 8.7 Create `ConfigReloadRoute.java` consuming `dbz.gdfkube.forms`, accepting `op=c|r|u`, ignoring `op=d`, and invoking `FormDefCache#refresh`
- [ ] 8.8 Create `DlqHandlerRoute.java` consuming `dlq.gdfkube.*` (multi-pattern) and persisting to `dlq_log` with all 9 mandatory context headers
- [ ] 8.9 Add a global `errorHandler(deadLetterChannel(...))` with `maximumRedeliveries=3`, `redeliveryDelay=1000`, `backOffMultiplier=5.0`; on final failure, stamp the 9 mandatory DLQ headers before producing to `dlq.gdfkube.{route}`
- [ ] 8.10 Wire the `AuditInterceptor` as a per-route `routePolicy` on `helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`

## 9. Camel integration tests

- [ ] 9.1 Add `camel-quarkus-test-junit5` and `testcontainers-kafka`, `testcontainers-mongodb` to test scope in `pom.xml`
- [ ] 9.2 Write an integration test that boots Kafka + MongoDB Testcontainers, publishes a Debezium-shaped `op=c` event to `dbz.gdfkube.requests`, and asserts `helm-render` runs, `git-push` records a commit in `MockGitProvider`, `status-emitter` produces 7 messages to `gdfkube.pipeline.status`, and `audit_log` has ≥4 rows
- [ ] 9.3 Write an integration test asserting the approval-loop guard: publish an `op=u` event with `before.status="provisioning"` AND `after.status="provisioning"` and assert NO downstream `helm-render` invocation
- [ ] 9.4 Write an integration test for the DLQ path: induce a `helm-render` failure (missing required value) and assert the message lands on `dlq.gdfkube.helm-render` with all 9 headers and `dlq_log` records it
- [ ] 9.5 Unit tests for `HelmValuesBuilder` covering the 6 required `system.labels` and nested `chartRef` paths

## 10. Camel Compose service

- [ ] 10.1 Add Compose service `gdfkube-camel` (built from `gdfkube-src/gdfkube-camel/Dockerfile.jvm`, env per the spec, bind-mount charts at `/opt/charts:ro`, healthcheck `/q/health/ready`, `depends_on` kafka1/2/3 + mongo1 healthy + `gdfkube-debezium-init` completed, on `gdfkube-net`)
- [ ] 10.2 Verify: `docker compose build gdfkube-camel` succeeds; `docker compose up -d gdfkube-camel` reaches healthy in < 120s; `curl http://gdfkube-camel:8080/q/camel/routes` lists all 8 routes in state `Started`

## 11. Express SSE + Kafka consumer (itsm-express-api delta)

- [ ] 11.1 Add `kafkajs ^2.2.4` to `gdfkube-src/gdfkube-itsm/server/package.json`; run `npm install`
- [ ] 11.2 Create `gdfkube-src/gdfkube-itsm/server/src/pipeline/stageEvents.ts` with the `StageEvent` TypeScript type and a `validateStageEvent(payload): boolean` JSON-schema-ish validator
- [ ] 11.3 Create `gdfkube-src/gdfkube-itsm/server/src/pipeline/subscriptions.ts` exporting `register(requestId, res)`, `unregister(requestId, res)`, and `broadcast(requestId, event)` against an in-memory `Map<string, Set<Response>>`
- [ ] 11.4 Create `gdfkube-src/gdfkube-itsm/server/src/kafka/consumer.ts` that creates a kafkajs consumer with `groupId = "itsm-sse-${HOSTNAME}"`, subscribes to `gdfkube.pipeline.status` with `fromBeginning: false`, parses each message as JSON, validates it, and calls `broadcast(requestId, event)`; unparseable / invalid messages are logged and dropped
- [ ] 11.5 Create `gdfkube-src/gdfkube-itsm/server/src/routes/sse.ts` registering `GET /api/itsm/requests/:id/events`: 404 on unknown request; on found, set SSE headers, emit a synthetic first event from `request.stage` (defaulting to `stage=0, stageName="form"` if `stage==0`), register in subscription map, set up 15s heartbeat interval, deregister on `req.on('close')`
- [ ] 11.6 Modify `gdfkube-src/gdfkube-itsm/server/src/index.ts` (read first to confirm exact filename and shape) to: connect kafkajs consumer before binding HTTP listener; mount the SSE router under `/api/itsm`
- [ ] 11.7 Modify `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml` to add the `GET /api/itsm/requests/{id}/events` path (200 with `text/event-stream`, 404) and `components.schemas.StageEvent`
- [ ] 11.8 Modify `docker-compose.yml` `gdfkube-itsm-api` block: add `KAFKA_BOOTSTRAP_SERVERS=kafka1:19092,kafka2:19092,kafka3:19092` env; add `depends_on` for `kafka1`/`kafka2`/`kafka3` `service_healthy`
- [ ] 11.9 Write a Jest integration test using Testcontainers Kafka: produce a `StageEvent` to `gdfkube.pipeline.status` and assert the subscription map's broadcast was invoked
- [ ] 11.10 Write a supertest contract test for `GET /api/itsm/requests/:id/events`: 404 path; synthetic first event on `stage=0`; synthetic first event on `stage=5`; heartbeat keeps the response open for 16s

## 12. End-to-end verification

- [ ] 12.1 Clean state: `docker compose down -v`
- [ ] 12.2 Bring up the full stack: `docker compose up -d` and wait for healthy on `kafka1/2/3`, `mongo1/2/3`, `gdfkube-debezium-connect`, `gdfkube-camel`, `gdfkube-itsm-api`, `itsm`
- [ ] 12.3 Verify Connect: `curl http://127.0.0.1:8083/connectors` returns `["gdfkube-mongo-source"]`; `/status` shows `RUNNING`
- [ ] 12.4 Verify collections: `mongosh` confirms `audit_log` (TTL on `at`, compound index) and `dlq_log` (2 indexes, no TTL)
- [ ] 12.5 Verify snapshot replay: seed a row in `gdfkube.requests` BEFORE the connector registers; on cold start, the `op=r` flows through `request-router` → `helm-render` → `git-push` → `status-emitter`; `audit_log` records the path; no infinite loop
- [ ] 12.6 Verify golden path: `POST /api/itsm/requests` with a valid `cluster-request` payload; Express writes to MongoDB only; Debezium emits `op=c` to `dbz.gdfkube.requests`; Camel renders, commits to `MockGitProvider`, emits 7-stage batch to `gdfkube.pipeline.status`; `audit_log` has ≥4 rows
- [ ] 12.7 Verify SSE: open `GET /api/itsm/requests/:id/events` from `curl -N`; observe the synthetic first event then 7 stage events in order
- [ ] 12.8 Verify approval-loop guard: update an existing request `status` from `approval` → `provisioning`; Camel re-runs once; subsequent `stage` write-backs (`provisioning` → `provisioning`) are dropped; no infinite loop in logs
- [ ] 12.9 Verify all 5 charts render and lint clean (`helm template` + `kubectl --dry-run=client -f -`)
- [ ] 12.10 Verify form-cache reload: update a document in `gdfkube.forms`; observe `FormDefCache invalidated` log line in `gdfkube-camel`
- [ ] 12.11 Verify Camel DLQ flow: produce a malformed payload to `dbz.gdfkube.requests` (via `kafka-console-producer.sh`); observe 3 redeliveries then landing on `dlq.gdfkube.requests` with 9 headers; `dlq_log` records it
- [ ] 12.12 Verify Debezium DLQ flow: stop `mongo2` temporarily to induce a connector error; observe landing on `dlq.gdfkube.debezium` with context headers; restart `mongo2`
- [ ] 12.13 Verify manual-commit semantics: `docker compose kill gdfkube-camel` mid-route; restart; assert message redelivered (offset not committed) and `audit_log` has exactly one row per side-effecting route (not duplicated)
- [ ] 12.14 Verify SSE late-subscriber: trigger a request, wait until `stage=5` (git), then open SSE; first event is `stage: 5, stageName: "git"` synthetic
- [ ] 12.15 Verify SSE synthetic on stage=0: insert a `requests` document directly with `stage=0`, open SSE; first event is `stage: 0, stageName: "form"`
- [ ] 12.16 Verify idempotence: `docker compose up -d` against a populated stack — no duplicate connector (PUT no-op), `--if-not-exists` skips topics, `init-camel-collections.js` skips indexes, Camel routes start clean
- [ ] 12.17 Verify reset path: `docker compose down -v` then `docker compose up -d` reaches the same end state as 12.2
