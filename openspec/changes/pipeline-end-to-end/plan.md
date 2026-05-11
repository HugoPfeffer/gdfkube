# Pipeline End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Commit after each task.

**Goal:** Wire the end-to-end provisioning loop in Compose — Express POST → MongoDB → Debezium CDC → 8 Camel routes → Helm render → MockGit commit → SSE stage stream — by landing 4 new capabilities (`debezium-connect-stack`, `camel-orchestrator-stack`, `gdfkube-audit-log-collection`, `gdfkube-dlq-log-collection`) and adding ADDED-only requirements to `itsm-express-api`.

**Architecture:** Single Quarkus/Camel JVM app hosting 8 in-process routes consumes `dbz.gdfkube.requests` (Debezium MongoDB connector capturing pre/post-image change streams) and produces `gdfkube.pipeline.status` (which Express consumes per-replica and re-emits as SSE) plus `gdfkube.audit` (persisted to `audit_log`). DLQ traffic on `dlq.gdfkube.*` is persisted to `dlq_log`. `GitProvider` interface seam runs `MockGitProvider` in the `%dev` profile; real `GiteaGitProvider` is built but inactive. Helm CLI is a subprocess; charts bind-mounted at `/opt/charts`.

**Tech Stack:** Docker Compose, Debezium 2.7.3.Final, Kafka Connect, Apache Kafka 3.7, MongoDB 7 (replica set), Quarkus 3.16.3, Apache Camel 4.6.0, Helm v3.16.x, JGit, Node.js 20 + kafkajs 2.2.4, Express.

---

## File Structure

### New files

| Path | Action | Responsibility |
|---|---|---|
| `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` | create | Idempotent collection + index bootstrap for `audit_log` and `dlq_log`; `collMod` for pre-image on `requests`/`forms` |
| `gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh` | create | Idempotent creation of `connect-configs/offsets/status` with `cleanup.policy=compact` |
| `gdfkube-src/gdfkube-infra/debezium/connector-config.json` | create | Full MongoDB connector spec (capture mode, SMTs, DLQ) |
| `gdfkube-src/gdfkube-infra/debezium/register-connector.sh` | create | Idempotent `curl PUT` of the connector config |
| `gdfkube-src/gdfkube-infra/debezium/README.md` | create | Connector lifecycle, reset path, topic-prefix mapping |
| `gdfkube-src/gdfkube-infra/charts/cluster-request/{Chart.yaml,values.yaml,values.schema.json,templates/*}` | create | HostedCluster, NodePool, ManagedCluster |
| `gdfkube-src/gdfkube-infra/charts/namespace-request/{Chart.yaml,values.yaml,values.schema.json,templates/namespace.yaml}` | create | Namespace |
| `gdfkube-src/gdfkube-infra/charts/scale-patch/{Chart.yaml,values.yaml,values.schema.json,templates/nodepool-patch.yaml}` | create | NodePool replica patch |
| `gdfkube-src/gdfkube-infra/charts/infra/argocd-org/{Chart.yaml,values.yaml,values.schema.json,templates/*}` | create | AppProject, ApplicationSet |
| `gdfkube-src/gdfkube-infra/charts/infra/rhacm-org/{Chart.yaml,values.yaml,values.schema.json,templates/*}` | create | ManagedClusterSet, ManagedClusterSetBinding |
| `gdfkube-src/gdfkube-camel/pom.xml` | create | Quarkus 3.16.3 + Camel 4.6.0 BOM; pinned deps |
| `gdfkube-src/gdfkube-camel/Dockerfile.jvm` | create | UBI9 OpenJDK 21 + SHA-pinned Helm v3.16.x + app jar |
| `gdfkube-src/gdfkube-camel/README.md` | create | Build + run + profile + Helm version pinning |
| `gdfkube-src/gdfkube-camel/src/main/resources/application.properties` | create | Quarkus config; `%dev` / `%prod` profiles |
| `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/{RequestRouter,HelmRender,GitPush,RepoBootstrap,StatusEmitter,AuditSink,ConfigReload,DlqHandler}Route.java` | create | 8 routes |
| `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/bean/{HelmValuesBuilder,FormDefCache,AuditInterceptor}.java` | create | Beans |
| `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/git/{GitProvider,GiteaGitProvider,MockGitProvider,RepoOptions,GitAuthor}.java` | create | Interface + 2 impls + value types |
| `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/model/{RequestEvent,StageEvent,AuditEvent}.java` | create | Wire types |
| `gdfkube-src/gdfkube-camel/src/test/java/gov/gdf/camel/**` | create | Integration + unit tests |
| `gdfkube-src/gdfkube-itsm/server/src/kafka/consumer.ts` | create | kafkajs consumer setup |
| `gdfkube-src/gdfkube-itsm/server/src/pipeline/subscriptions.ts` | create | In-memory subscription map |
| `gdfkube-src/gdfkube-itsm/server/src/pipeline/stageEvents.ts` | create | StageEvent type + validator |
| `gdfkube-src/gdfkube-itsm/server/src/routes/sse.ts` | create | `GET /api/itsm/requests/:id/events` |

### Modified files

| Path | Action | Responsibility |
|---|---|---|
| `docker-compose.yml` | modify | Add `mongo-collections-init`, `gdfkube-connect-topics-init`, `gdfkube-debezium-connect`, `gdfkube-debezium-init`, `gdfkube-camel`; modify `gdfkube-itsm-api` (env + depends_on) |
| `gdfkube-src/gdfkube-itsm/server/package.json` | modify | Add `kafkajs ^2.2.4` |
| `gdfkube-src/gdfkube-itsm/server/src/index.ts` | modify | Read first to confirm filename; init kafka consumer before HTTP listener; mount SSE router |
| `gdfkube-src/gdfkube-itsm/server/src/openapi.yaml` | modify | Add SSE path + `StageEvent` schema |

### Untouched (DO NOT MODIFY)

`gdfkube-src/gdfkube-infra/kafka/**`, `gdfkube-src/gdfkube-infra/mongodb/init-replica.js`, `gdfkube-src/gdfkube-infra/mongodb/seed-*.js`, `openspec/specs/kafka-broker-stack/**`, `openspec/specs/mongodb-replica-set-stack/**`.

---

## Task 1: MongoDB collection bootstrap

**Files:** `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` (create), `docker-compose.yml` (modify)

- [ ] **Step 1:** Write `init-camel-collections.js`

Create `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js`:

```js
const db = db.getSiblingDB('gdfkube');

function ensureCollection(name, options) {
  if (!db.getCollectionNames().includes(name)) {
    db.createCollection(name, options || {});
    print(`created collection ${name}`);
  } else {
    print(`collection ${name} already exists`);
  }
}

function ensurePreImage(name) {
  try {
    db.runCommand({ collMod: name, changeStreamPreAndPostImages: { enabled: true } });
    print(`preImages enabled on ${name}`);
  } catch (e) {
    print(`preImages collMod on ${name} skipped: ${e.message}`);
  }
}

ensureCollection('audit_log');
ensureCollection('dlq_log');
ensurePreImage('requests');
ensurePreImage('forms');

db.audit_log.createIndex({ at: 1 }, { expireAfterSeconds: 2592000 });
db.audit_log.createIndex({ requestId: 1, at: -1 });
db.dlq_log.createIndex({ topic: 1, firstSeenAt: -1 });
db.dlq_log.createIndex({ requestId: 1 });

print('ok');
```

- [ ] **Step 2:** Add `mongo-collections-init` Compose service

Insert after `mongo-seed` in `docker-compose.yml`:

```yaml
  mongo-collections-init:
    image: mongo:7
    restart: "no"
    depends_on:
      mongo1:
        condition: service_healthy
    volumes:
      - ${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js:/init-camel-collections.js:ro
    networks:
      - gdfkube-net
    entrypoint: ["mongosh", "mongodb://mongo1:27017/gdfkube?replicaSet=rs0", "/init-camel-collections.js"]
```

- [ ] **Step 3:** Verify

```bash
docker compose up mongo-collections-init
docker compose exec mongo1 mongosh --quiet --eval 'db = db.getSiblingDB("gdfkube"); printjson(db.audit_log.getIndexes()); printjson(db.dlq_log.getIndexes())'
```

Expected: exits 0; `audit_log` shows TTL on `at` and compound `{requestId:1,at:-1}`; `dlq_log` shows `{topic:1,firstSeenAt:-1}` and `{requestId:1}`, no TTL.

- [ ] **Step 4:** Verify idempotence

```bash
docker compose run --rm mongo-collections-init
```

Expected: exits 0; index output unchanged.

- [ ] **Step 5:** Commit

```bash
git add gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js docker-compose.yml
git commit -m "add mongo-collections-init for audit_log and dlq_log"
```

---

## Task 2: Connect-internal topic creation

**Files:** `gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh` (create), `docker-compose.yml` (modify)

- [ ] **Step 1:** Write the init script

Create `gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh`:

```bash
#!/bin/bash
set -euo pipefail
BOOTSTRAP="kafka1:19092"
KAFKA_BIN="/opt/kafka/bin"

create() {
  local topic="$1" partitions="$2"
  "$KAFKA_BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$topic" --partitions "$partitions" --replication-factor 3
  "$KAFKA_BIN/kafka-configs.sh" --bootstrap-server "$BOOTSTRAP" --entity-type topics \
    --entity-name "$topic" --alter --add-config "cleanup.policy=compact"
  echo "topic $topic ready"
}

create connect-configs 1
create connect-offsets 25
create connect-status 5
echo "connect topics ready"
```

```bash
chmod +x gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh
```

- [ ] **Step 2:** Add Compose service

Insert in `docker-compose.yml`:

```yaml
  gdfkube-connect-topics-init:
    image: apache/kafka:3.7.2
    restart: "no"
    depends_on:
      kafka1: { condition: service_healthy }
      kafka2: { condition: service_healthy }
      kafka3: { condition: service_healthy }
    volumes:
      - ${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh:/scripts/init-connect-topics.sh:ro
    networks: [gdfkube-net]
    entrypoint: ["bash", "/scripts/init-connect-topics.sh"]
```

- [ ] **Step 3:** Verify

```bash
docker compose up gdfkube-connect-topics-init
docker compose exec kafka1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:19092 --list | grep ^connect-
docker compose exec kafka1 /opt/kafka/bin/kafka-configs.sh --bootstrap-server localhost:19092 --entity-type topics --entity-name connect-configs --describe
```

Expected: 3 `connect-*` topics; each has `cleanup.policy=compact`.

- [ ] **Step 4:** Commit

```bash
git add gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh docker-compose.yml
git commit -m "add connect-internal topics init under debezium capability"
```

---

## Task 3: Debezium MongoDB connector + registration

**Files:** `gdfkube-src/gdfkube-infra/debezium/{connector-config.json,register-connector.sh,README.md}` (create), `docker-compose.yml` (modify)

- [ ] **Step 1:** Write `connector-config.json`

Create `gdfkube-src/gdfkube-infra/debezium/connector-config.json`:

```json
{
  "connector.class": "io.debezium.connector.mongodb.MongoDbConnector",
  "tasks.max": "1",
  "mongodb.connection.string": "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0",
  "topic.prefix": "dbz.gdfkube",
  "database.include.list": "gdfkube",
  "collection.include.list": "gdfkube.requests,gdfkube.forms",
  "snapshot.mode": "initial",
  "capture.mode": "change_streams_update_full_with_pre_image",
  "signal.data.collection": "gdfkube.debezium_signals",
  "transforms": "unwrap,reroute",
  "transforms.unwrap.type": "io.debezium.connector.mongodb.transforms.ExtractNewDocumentState",
  "transforms.unwrap.delete.handling.mode": "rewrite",
  "transforms.unwrap.add.headers": "op,source.ts_ms",
  "transforms.reroute.type": "org.apache.kafka.connect.transforms.RegexRouter",
  "transforms.reroute.regex": "dbz.gdfkube.gdfkube.(.*)",
  "transforms.reroute.replacement": "dbz.gdfkube.$1",
  "key.converter": "org.apache.kafka.connect.json.JsonConverter",
  "value.converter": "org.apache.kafka.connect.json.JsonConverter",
  "key.converter.schemas.enable": "false",
  "value.converter.schemas.enable": "false",
  "errors.tolerance": "all",
  "errors.deadletterqueue.topic.name": "dlq.gdfkube.debezium",
  "errors.deadletterqueue.topic.replication.factor": "3",
  "errors.deadletterqueue.context.headers.enable": "true"
}
```

- [ ] **Step 2:** Write `register-connector.sh`

```bash
#!/bin/sh
set -e
URL="http://gdfkube-debezium-connect:8083/connectors/gdfkube-mongo-source/config"
for i in 1 2 3; do
  if curl -sf -X PUT -H 'Content-Type: application/json' --data @/connector-config.json "$URL"; then
    echo "connector registered"
    exit 0
  fi
  echo "retry $i..."
  sleep 2
done
echo "connector registration failed"
exit 1
```

```bash
chmod +x gdfkube-src/gdfkube-infra/debezium/register-connector.sh
```

- [ ] **Step 3:** Add `gdfkube-debezium-connect` Compose service

```yaml
  gdfkube-debezium-connect:
    image: debezium/connect:2.7.3.Final
    ports: ["127.0.0.1:8083:8083"]
    environment:
      BOOTSTRAP_SERVERS: kafka1:19092,kafka2:19092,kafka3:19092
      GROUP_ID: gdfkube-connect
      CONFIG_STORAGE_TOPIC: connect-configs
      OFFSET_STORAGE_TOPIC: connect-offsets
      STATUS_STORAGE_TOPIC: connect-status
      KEY_CONVERTER: org.apache.kafka.connect.json.JsonConverter
      VALUE_CONVERTER: org.apache.kafka.connect.json.JsonConverter
      KEY_CONVERTER_SCHEMAS_ENABLE: "false"
      VALUE_CONVERTER_SCHEMAS_ENABLE: "false"
    depends_on:
      kafka1: { condition: service_healthy }
      kafka2: { condition: service_healthy }
      kafka3: { condition: service_healthy }
      gdfkube-connect-topics-init: { condition: service_completed_successfully }
    networks: [gdfkube-net]
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8083/ >/dev/null"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
```

- [ ] **Step 4:** Add `gdfkube-debezium-init` Compose service

```yaml
  gdfkube-debezium-init:
    image: curlimages/curl:8.10.1
    restart: "no"
    depends_on:
      gdfkube-debezium-connect: { condition: service_healthy }
    volumes:
      - ${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src/gdfkube-infra/debezium/connector-config.json:/connector-config.json:ro
      - ${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src/gdfkube-infra/debezium/register-connector.sh:/register-connector.sh:ro
    networks: [gdfkube-net]
    entrypoint: ["sh", "/register-connector.sh"]
```

- [ ] **Step 5:** Write `README.md` documenting REST lifecycle, reset path, topic-prefix mapping, DLQ topic name.

- [ ] **Step 6:** Verify

```bash
docker compose up -d gdfkube-debezium-connect
docker compose up gdfkube-debezium-init
curl -s http://127.0.0.1:8083/connectors | jq .
curl -s http://127.0.0.1:8083/connectors/gdfkube-mongo-source/status | jq '.connector.state, .tasks[0].state'
```

Expected: connector listed; both states `RUNNING`.

- [ ] **Step 7:** Commit

```bash
git add gdfkube-src/gdfkube-infra/debezium/ docker-compose.yml
git commit -m "add debezium kafka connect + mongodb connector"
```

---

## Task 4: Helm chart catalog (5 charts)

**Files:** `gdfkube-src/gdfkube-infra/charts/**` (create)

- [ ] **Step 1:** Author `cluster-request` chart

Create `Chart.yaml` (apiVersion v2, name `cluster-request`), a `values.yaml` documenting the expected `meta`/`vars`/`system` shape, a `values.schema.json` enforcing required fields, and `templates/hostedcluster.yaml`, `templates/nodepool.yaml`, `templates/managedcluster.yaml`. Source field shapes from `gdfkube-src/gdfkube-orgs/orgs/sec-*` existing manifests; parameterize via `{{ .Values.system.naming.hostedClusterName }}`, `{{ .Values.vars.* }}`, etc. Every resource MUST include `{{ toYaml .Values.system.labels | nindent 4 }}` under `metadata.labels`.

- [ ] **Step 2:** Author `namespace-request` chart (1 template: `namespace.yaml` with labels)

- [ ] **Step 3:** Author `scale-patch` chart (1 template: `nodepool-patch.yaml` rendering a NodePool with updated `spec.replicas` from `vars.replicas`)

- [ ] **Step 4:** Author `infra/argocd-org` chart (`templates/appproject.yaml`, `templates/applicationset.yaml`)

- [ ] **Step 5:** Author `infra/rhacm-org` chart (`templates/managedclusterset.yaml`, `templates/managedclustersetbinding.yaml`)

- [ ] **Step 6:** Verify per chart

For each chart:

```bash
helm template test gdfkube-src/gdfkube-infra/charts/<chartRef> \
  --set-string meta.requestId=test --set-string meta.formId=cluster-request --set-string meta.org=test \
  --set-string meta.email=t@example.com --set-string meta.submittedAt=2026-05-11T00:00:00Z \
  --set-string meta.correlationId=cid \
  --set-string system.baseDomain=demo.local --set-string system.releaseImage=quay.io/openshift-release-dev/ocp-release:4.16.0-x86_64 \
  --set-string system.giteaExternalUrl=http://gitea.local --set-string system.giteaOwner=gdfkube \
  --set-string system.naming.hostedClusterName=hc-test --set-string system.naming.namespace=ns-test \
  --set-string system.naming.appProject=ap-test --set-string system.naming.clusterSet=cs-test \
  | kubectl --dry-run=client -f - apply
```

Expected: helm template exits 0; kubectl dry-run exits 0.

- [ ] **Step 7:** Commit

```bash
git add gdfkube-src/gdfkube-infra/charts/
git commit -m "add helm chart catalog (cluster-request, namespace-request, scale-patch, infra/argocd-org, infra/rhacm-org)"
```

---

## Task 5: Quarkus-Camel project scaffold

**Files:** `gdfkube-src/gdfkube-camel/{pom.xml,Dockerfile.jvm,README.md,src/main/resources/application.properties}` (create)

- [ ] **Step 1:** Initialize project

```bash
mkdir -p gdfkube-src/gdfkube-camel/src/main/{java,resources}
mkdir -p gdfkube-src/gdfkube-camel/src/test/java
```

- [ ] **Step 2:** Write `pom.xml` with Quarkus BOM 3.16.3 and these deps:

```xml
<dependency><groupId>org.apache.camel.quarkus</groupId><artifactId>camel-quarkus-kafka</artifactId></dependency>
<dependency><groupId>org.apache.camel.quarkus</groupId><artifactId>camel-quarkus-mongodb</artifactId></dependency>
<dependency><groupId>org.apache.camel.quarkus</groupId><artifactId>camel-quarkus-jgit</artifactId></dependency>
<dependency><groupId>org.apache.camel.quarkus</groupId><artifactId>camel-quarkus-rest</artifactId></dependency>
<dependency><groupId>io.quarkus</groupId><artifactId>quarkus-arc</artifactId></dependency>
<dependency><groupId>io.quarkus</groupId><artifactId>quarkus-smallrye-health</artifactId></dependency>
<dependency><groupId>io.quarkus</groupId><artifactId>quarkus-micrometer-registry-prometheus</artifactId></dependency>
```

Plus test scope: `camel-quarkus-junit5`, `testcontainers-kafka`, `testcontainers-mongodb`.

- [ ] **Step 3:** Write `application.properties`:

```properties
quarkus.http.port=8080
quarkus.application.name=gdfkube-camel

camel.component.kafka.brokers=${KAFKA_BOOTSTRAP_SERVERS:kafka1:19092,kafka2:19092,kafka3:19092}
camel.component.mongodb.uri=${MONGODB_URI:mongodb://mongo1:27017,mongo2:27017,mongo3:27017/gdfkube?replicaSet=rs0}

app.git.provider=${APP_GIT_PROVIDER:gitea}
%dev.app.git.provider=mock
%prod.app.git.provider=gitea
```

- [ ] **Step 4:** Write `Dockerfile.jvm` based on `registry.access.redhat.com/ubi9/openjdk-21-runtime:1.21` with a Helm v3.16.x SHA-pinned download:

```dockerfile
FROM registry.access.redhat.com/ubi9/openjdk-21-runtime:1.21
USER root
ARG HELM_VERSION=v3.16.3
ARG HELM_SHA256=<lookup-real-sha-for-amd64>
RUN curl -fsSL -o /tmp/helm.tgz https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz \
 && echo "${HELM_SHA256}  /tmp/helm.tgz" | sha256sum -c - \
 && tar -xzf /tmp/helm.tgz -C /tmp \
 && mv /tmp/linux-amd64/helm /usr/local/bin/helm \
 && rm -rf /tmp/helm.tgz /tmp/linux-amd64
USER 185
COPY --chown=185 target/quarkus-app/lib/ /deployments/lib/
COPY --chown=185 target/quarkus-app/*.jar /deployments/
COPY --chown=185 target/quarkus-app/app/ /deployments/app/
COPY --chown=185 target/quarkus-app/quarkus/ /deployments/quarkus/
EXPOSE 8080
ENV JAVA_OPTS_APPEND="-Xmx512m" LANG=en_US.UTF-8
ENTRYPOINT ["java", "-jar", "/deployments/quarkus-run.jar"]
```

> Look up the actual Helm v3.16.x SHA from the [official release page](https://github.com/helm/helm/releases) and embed it.

- [ ] **Step 5:** Build smoke

```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q package -DskipTests
```

Expected: builds an empty Quarkus app jar; no compile errors.

- [ ] **Step 6:** Commit

```bash
git add gdfkube-src/gdfkube-camel/
git commit -m "scaffold quarkus-camel project (build-only, no routes yet)"
```

---

## Task 6: Camel model classes and beans

**Files:** Java sources under `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/`

- [ ] **Step 1:** Write model types (`RequestEvent`, `StageEvent`, `AuditEvent`) — POJOs with public fields matching the JSON wire shape from the specs.

- [ ] **Step 2:** Write `FormDefCache` bean (`@ApplicationScoped`) with `ConcurrentHashMap<String, FormDef>` and `refresh(String formId)` reading the form from MongoDB.

- [ ] **Step 3:** Write `HelmValuesBuilder` bean composing `meta`/`vars`/`system` and dumping to `/tmp/<requestId>-values.yaml` via SnakeYAML.

- [ ] **Step 4:** Write `AuditInterceptor` bean exposing `emit(routeName, requestId, stage, verb, detail)` producing to `gdfkube.audit`.

- [ ] **Step 5:** Unit test `HelmValuesBuilder` against the 6 required labels and nested `chartRef`.

```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q test
```

- [ ] **Step 6:** Commit

```bash
git add gdfkube-src/gdfkube-camel/src/
git commit -m "add camel model, FormDefCache, HelmValuesBuilder, AuditInterceptor"
```

---

## Task 7: GitProvider interface + implementations

**Files:** `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/git/*.java`

- [ ] **Step 1:** Write `GitProvider`, `RepoOptions`, `GitAuthor` (interface and value types).

- [ ] **Step 2:** Write `MockGitProvider` with `@ApplicationScoped` and `@IfBuildProperty(name="app.git.provider", stringValue="mock", enableIfMissing=false)`. State: `ConcurrentHashMap<String, List<Commit>>`. `cloneOrPull` returns a fresh temp dir; `commitAndPush` records the commit.

- [ ] **Step 3:** Write `GiteaGitProvider` skeleton using `org.eclipse.jgit` + a small Gitea REST client (via JDK `HttpClient`). Activated when `app.git.provider=gitea`.

- [ ] **Step 4:** Unit tests for `MockGitProvider` covering all 4 interface methods.

- [ ] **Step 5:** Commit

```bash
git add gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/git/ gdfkube-src/gdfkube-camel/src/test/
git commit -m "add GitProvider interface with MockGitProvider and Gitea skeleton"
```

---

## Task 8: Camel routes (8 routes)

**Files:** `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/*.java`

- [ ] **Step 1:** Write `RequestRouterRoute` consuming `kafka:dbz.gdfkube.requests?groupId=gdfkube-camel&autoOffsetReset=earliest&autoCommitEnable=false`. Use a `Predicate` body that inspects the `op`, `before.status`, `after.status` headers (set by Debezium `ExtractNewDocumentState`) and forwards only acceptable events to `direct:helm-render`. Use `kafkaManualCommit` to commit only after success.

- [ ] **Step 2:** Write `HelmRenderRoute` invoking `HelmValuesBuilder` then `exec:helm` with the args `template <release> /opt/charts/<chartRef> --values /tmp/<id>-values.yaml --output-dir /tmp/<id>-out --include-crds`. Read rendered files into the exchange body for the next route.

- [ ] **Step 3:** Write `GitPushRoute`: call `gitProvider.cloneOrPull(...)`. If repo missing, route to `direct:repo-bootstrap` and re-enter. Then `commitAndPush(...)` with the format `[gdfkube] REQ{requestId}: {action} {resourceName} ({formId})`.

- [ ] **Step 4:** Write `RepoBootstrapRoute` calling `gitProvider.createRepo(...)` guarded by `repoExists`.

- [ ] **Step 5:** Write `StatusEmitterRoute` producing the 7-stage batch to `kafka:gdfkube.pipeline.status?key=requestId` AND writing the stage integer back to `mongodb:gdfkube?collection=requests&operation=update` using `{ _id: <requestId> }` filter and `{ $set: { stage: <int> } }`. Each batch message MUST have a producer header identifying `gdfkube-camel/status-emitter`.

- [ ] **Step 6:** Write `AuditSinkRoute` consuming `kafka:gdfkube.audit?groupId=gdfkube-camel&autoCommitEnable=false` and inserting into `mongodb:gdfkube?collection=audit_log&operation=insert`.

- [ ] **Step 7:** Write `ConfigReloadRoute` consuming `kafka:dbz.gdfkube.forms?groupId=gdfkube-camel&autoOffsetReset=earliest&autoCommitEnable=false`, filtering on `op != "d"`, and invoking `bean:FormDefCache?method=refresh`.

- [ ] **Step 8:** Write `DlqHandlerRoute` consuming `kafka:dlq.gdfkube.*?groupId=gdfkube-camel&consumerTopicPattern=dlq\\.gdfkube\\..*` and inserting into `mongodb:gdfkube?collection=dlq_log&operation=insert`. Populate the `dlq_log` document by reading the 9 headers from the message.

- [ ] **Step 9:** Add global `errorHandler(deadLetterChannel("kafka:dlq.gdfkube.${routeId}").maximumRedeliveries(3).redeliveryDelay(1000).backOffMultiplier(5.0).useExponentialBackOff())`. In an `onException` block, stamp the 9 mandatory headers from `${exchangeProperty.CamelToEndpoint}`, `${exception.message}`, etc., before the message is published to the DLQ.

- [ ] **Step 10:** Wire `AuditInterceptor` as a `routePolicy` attached to `helm-render`, `git-push`, `repo-bootstrap`, `status-emitter` so each emit one audit row per execution.

- [ ] **Step 11:** Build

```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q package -DskipTests
```

- [ ] **Step 12:** Commit

```bash
git add gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/routes/
git commit -m "add 8 camel routes with error handler and audit interceptor"
```

---

## Task 9: Camel integration tests

**Files:** `gdfkube-src/gdfkube-camel/src/test/java/**`

- [ ] **Step 1:** Add a `@QuarkusTest` with `@Testcontainers` spinning up Kafka + MongoDB. Publish a synthesized Debezium `op=c` payload to `dbz.gdfkube.requests` and assert: `helm-render` runs, `git-push` records exactly one commit in `MockGitProvider`, 7 messages on `gdfkube.pipeline.status` (assert count and key), `audit_log` has ≥4 documents for the `requestId`.

- [ ] **Step 2:** Approval-loop test: publish `op=u` with `before.status=provisioning` AND `after.status=provisioning`. Assert no `helm-render` invocation (mock counter), and the consumer offset is committed.

- [ ] **Step 3:** DLQ test: stub `HelmValuesBuilder` to throw on missing `vars.clusterName`. Publish a malformed `op=c`; assert the message lands on `dlq.gdfkube.helm-render` with all 9 headers (count via consumer); assert `dlq_log` has the row.

- [ ] **Step 4:** Run

```bash
cd gdfkube-src/gdfkube-camel && ./mvnw -q test
```

- [ ] **Step 5:** Commit

```bash
git add gdfkube-src/gdfkube-camel/src/test/
git commit -m "add camel integration tests (golden path, approval-loop guard, dlq)"
```

---

## Task 10: Camel Compose service

**Files:** `docker-compose.yml` (modify)

- [ ] **Step 1:** Add `gdfkube-camel` service

```yaml
  gdfkube-camel:
    build:
      context: ./gdfkube-src/gdfkube-camel
      dockerfile: Dockerfile.jvm
    image: gdfkube-camel:dev
    environment:
      QUARKUS_PROFILE: dev
      KAFKA_BOOTSTRAP_SERVERS: kafka1:19092,kafka2:19092,kafka3:19092
      MONGODB_URI: mongodb://mongo1:27017,mongo2:27017,mongo3:27017/gdfkube?replicaSet=rs0
    volumes:
      - ${COMPOSE_HOST_WORKSPACE:-.}/gdfkube-src/gdfkube-infra/charts:/opt/charts:ro
    depends_on:
      kafka1: { condition: service_healthy }
      kafka2: { condition: service_healthy }
      kafka3: { condition: service_healthy }
      mongo1: { condition: service_healthy }
      gdfkube-debezium-init: { condition: service_completed_successfully }
      mongo-collections-init: { condition: service_completed_successfully }
    networks: [gdfkube-net]
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8080/q/health/ready | grep -q UP"]
      interval: 10s
      timeout: 5s
      retries: 18
      start_period: 60s
```

- [ ] **Step 2:** Verify

```bash
docker compose build gdfkube-camel
docker compose up -d gdfkube-camel
sleep 60
docker compose ps gdfkube-camel
docker compose exec gdfkube-camel curl -sf http://localhost:8080/q/camel/routes | jq 'length'
```

Expected: state `healthy`; `length == 8`.

- [ ] **Step 3:** Commit

```bash
git add docker-compose.yml
git commit -m "add gdfkube-camel compose service"
```

---

## Task 11: Express SSE + Kafka consumer

**Files:** `gdfkube-src/gdfkube-itsm/server/{package.json,src/index.ts,src/openapi.yaml}` (modify), `src/{kafka,pipeline,routes}/*.ts` (create), `docker-compose.yml` (modify)

- [ ] **Step 1:** Add dependency

```bash
cd gdfkube-src/gdfkube-itsm/server && npm install kafkajs@^2.2.4
```

- [ ] **Step 2:** Write `src/pipeline/stageEvents.ts`

```ts
export type StageName = 'form' | 'mongo' | 'debezium' | 'kafka' | 'camel' | 'git' | 'argocd';
export const STAGE_NAMES: StageName[] = ['form', 'mongo', 'debezium', 'kafka', 'camel', 'git', 'argocd'];

export interface StageEvent {
  requestId: string;
  stage: number;       // 0..6
  stageName: StageName;
  status: 'ok' | 'fail';
  at: string;          // ISO-8601
  detail?: string;
}

export function validateStageEvent(p: unknown): p is StageEvent {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.requestId === 'string'
    && typeof o.stage === 'number' && o.stage >= 0 && o.stage <= 6
    && typeof o.stageName === 'string' && STAGE_NAMES.includes(o.stageName as StageName)
    && (o.status === 'ok' || o.status === 'fail')
    && typeof o.at === 'string';
}
```

- [ ] **Step 3:** Write `src/pipeline/subscriptions.ts`

```ts
import type { Response } from 'express';

const subs = new Map<string, Set<Response>>();

export function register(requestId: string, res: Response): void {
  if (!subs.has(requestId)) subs.set(requestId, new Set());
  subs.get(requestId)!.add(res);
}

export function unregister(requestId: string, res: Response): void {
  const set = subs.get(requestId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subs.delete(requestId);
}

export function broadcast(requestId: string, payload: unknown): void {
  const set = subs.get(requestId);
  if (!set) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) res.write(line);
}
```

- [ ] **Step 4:** Write `src/kafka/consumer.ts`

```ts
import { Kafka, logLevel } from 'kafkajs';
import { broadcast } from '../pipeline/subscriptions';
import { validateStageEvent } from '../pipeline/stageEvents';

export async function startStageConsumer(): Promise<void> {
  const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'kafka1:19092,kafka2:19092,kafka3:19092').split(',');
  const kafka = new Kafka({ clientId: 'itsm-sse', brokers, logLevel: logLevel.WARN });
  const groupId = `itsm-sse-${process.env.HOSTNAME ?? 'unknown'}`;
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: 'gdfkube.pipeline.status', fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString('utf8');
      if (!raw) return;
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { console.error('stage event JSON parse failed'); return; }
      if (!validateStageEvent(parsed)) { console.error('stage event schema invalid', parsed); return; }
      broadcast(parsed.requestId, parsed);
    },
  });
}
```

- [ ] **Step 5:** Write `src/routes/sse.ts`

```ts
import { Router, Request, Response } from 'express';
import { register, unregister } from '../pipeline/subscriptions';
import { STAGE_NAMES } from '../pipeline/stageEvents';
import { Request as RequestModel } from '../models/Request';

export const sseRouter = Router();

sseRouter.get('/api/itsm/requests/:id/events', async (req: Request, res: Response) => {
  const doc = await RequestModel.findById(req.params.id).lean();
  if (!doc) { res.status(404).json({ error: 'not_found' }); return; }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  const stage = typeof doc.stage === 'number' ? doc.stage : 0;
  const synthetic = {
    requestId: doc._id.toString(),
    stage,
    stageName: STAGE_NAMES[stage] ?? 'form',
    status: 'ok' as const,
    at: new Date().toISOString(),
  };
  res.write(`data: ${JSON.stringify(synthetic)}\n\n`);

  register(synthetic.requestId, res);
  const heartbeat = setInterval(() => res.write(':\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unregister(synthetic.requestId, res);
  });
});
```

Note: confirm `models/Request` filename by reading current source; adjust import.

- [ ] **Step 6:** Wire up in `src/index.ts`

Read current `src/index.ts`, then before `app.listen(...)` add:

```ts
import { startStageConsumer } from './kafka/consumer';
import { sseRouter } from './routes/sse';

await startStageConsumer();
app.use(sseRouter);
```

- [ ] **Step 7:** Update `src/openapi.yaml` — add the SSE path under `paths` and `StageEvent` under `components.schemas`. Run the existing contract test to confirm.

- [ ] **Step 8:** Update `docker-compose.yml` `gdfkube-itsm-api` block

```yaml
  gdfkube-itsm-api:
    # ... existing fields ...
    environment:
      # ... existing env ...
      KAFKA_BOOTSTRAP_SERVERS: kafka1:19092,kafka2:19092,kafka3:19092
    depends_on:
      # ... existing deps ...
      kafka1: { condition: service_healthy }
      kafka2: { condition: service_healthy }
      kafka3: { condition: service_healthy }
```

- [ ] **Step 9:** Tests

Write `__tests__/sse.test.ts` (supertest) covering: 404 unknown request, synthetic first event on `stage=0`, synthetic first event on `stage=5`, heartbeat after 16s. Write `__tests__/kafka-consumer.test.ts` (Testcontainers Kafka) covering: a published valid StageEvent invokes `broadcast`; a non-JSON message is dropped without crash.

```bash
cd gdfkube-src/gdfkube-itsm/server && npm test
```

- [ ] **Step 10:** Commit

```bash
git add gdfkube-src/gdfkube-itsm/server/ docker-compose.yml
git commit -m "add express SSE consumer and route for pipeline stage events"
```

---

## Task 12: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1:** Clean slate

```bash
docker compose down -v
```

- [ ] **Step 2:** Bring up the full stack

```bash
docker compose up -d
```

Wait for healthy on `kafka1/2/3`, `mongo1/2/3`, `gdfkube-debezium-connect`, `gdfkube-camel`, `gdfkube-itsm-api`, `itsm`.

- [ ] **Step 3:** Connect verification

```bash
curl -s http://127.0.0.1:8083/connectors | jq .
curl -s http://127.0.0.1:8083/connectors/gdfkube-mongo-source/status | jq '.connector.state, .tasks[0].state'
```

Expected: `["gdfkube-mongo-source"]`; both states `RUNNING`.

- [ ] **Step 4:** Collections verification

```bash
docker compose exec mongo1 mongosh --quiet --eval '
db = db.getSiblingDB("gdfkube");
print("audit_log indexes:"); printjson(db.audit_log.getIndexes());
print("dlq_log indexes:"); printjson(db.dlq_log.getIndexes());'
```

Expected: TTL on `audit_log.at`; both indexes on `dlq_log`; no TTL on `dlq_log`.

- [ ] **Step 5:** Golden path

```bash
REQ=$(curl -sf -X POST -H 'Content-Type: application/json' -H 'X-Demo-User: alice' \
  http://127.0.0.1:3001/api/itsm/requests \
  --data '{"formId":"cluster-request","vars":{"clusterName":"hc-demo","replicas":1}}' | jq -r '._id')
echo "requestId=$REQ"
# Wait a few seconds for the pipeline to run
sleep 15
docker compose exec mongo1 mongosh --quiet --eval "db = db.getSiblingDB('gdfkube'); printjson(db.audit_log.find({requestId:'$REQ'}).toArray()); printjson(db.requests.findOne({_id:'$REQ'}))"
```

Expected: `audit_log` has ≥4 rows; `requests.stage` advanced past 0.

- [ ] **Step 6:** SSE

```bash
curl -N "http://127.0.0.1:3001/api/itsm/requests/$REQ/events" &
SSE_PID=$!
sleep 10
kill $SSE_PID
```

Expected output stream contains a synthetic first event then up to 7 stage events.

- [ ] **Step 7:** Approval-loop guard

Update an existing request to flip `status` from `approval` to `provisioning` (via the approvals endpoint) and observe Camel logs:

```bash
docker compose logs --tail=50 gdfkube-camel | grep request-router
```

Expected: one accept on the flip, then DROP entries on subsequent `op=u` events where `before.status==provisioning`.

- [ ] **Step 8:** Helm charts

```bash
for c in cluster-request namespace-request scale-patch infra/argocd-org infra/rhacm-org; do
  echo "== $c =="
  helm template smoke gdfkube-src/gdfkube-infra/charts/$c --set 'meta.requestId=t' --set 'meta.formId=t' \
    | kubectl --dry-run=client -f - apply
done
```

Expected: every chart exits 0.

- [ ] **Step 9:** DLQ flow (Camel)

```bash
echo '{"op":"c","after":{"_id":"BADREQ","formId":"nonexistent"}}' \
  | docker compose exec -T kafka1 /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server localhost:19092 --topic dbz.gdfkube.requests
sleep 35
docker compose exec mongo1 mongosh --quiet --eval 'db = db.getSiblingDB("gdfkube"); printjson(db.dlq_log.find({requestId:"BADREQ"}).toArray())'
```

Expected: `dlq_log` row with `topic` matching `dlq.gdfkube.*` and 9 headers populated.

- [ ] **Step 10:** Manual-commit semantics

```bash
docker compose kill gdfkube-camel
docker compose up -d gdfkube-camel
# Restart should reprocess any uncommitted in-flight message exactly once; assert no duplicate audit rows.
```

- [ ] **Step 11:** Idempotence

```bash
docker compose up -d
docker compose run --rm gdfkube-debezium-init      # no-op PUT
docker compose run --rm gdfkube-connect-topics-init # --if-not-exists
docker compose run --rm mongo-collections-init      # no-op createIndex
```

Expected: every run exits 0; no errors.

- [ ] **Step 12:** Reset path

```bash
docker compose down -v
docker compose up -d
# Wait for healthy; repeat Step 5 golden path.
```

Expected: same end state as the first run.

- [ ] **Step 13:** Final commit (only if any fixup edits made during verification)

```bash
git status
git diff
# only commit fixes; the spec/plan/tasks artifacts should be committed separately.
```
