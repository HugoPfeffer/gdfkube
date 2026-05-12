## ADDED Requirements

### Requirement: Camel app SHALL run as a single Quarkus JVM service on gdfkube-net

A new Maven project at `gdfkube-src/gdfkube-camel/` MUST build a Quarkus 3.16.3 / Camel 4.6.0 JVM application packaged as `Dockerfile.jvm` based on `registry.access.redhat.com/ubi9/openjdk-21-runtime:1.21`. The Dockerfile MUST install Helm CLI v3.16.x using a SHA-pinned download. The repo-root `docker-compose.yml` MUST define a service `gdfkube-camel` running the built image, attached to `gdfkube-net`, with `depends_on`:

- `kafka1`/`kafka2`/`kafka3` `condition: service_healthy`
- `mongo1` `condition: service_healthy`
- `gdfkube-debezium-init` `condition: service_completed_successfully`

The service MUST bind-mount `gdfkube-src/gdfkube-infra/charts:/opt/charts:ro` and declare a healthcheck on `http://localhost:8080/q/health/ready`. The service MUST be a single replica (no horizontal scaling). The service MUST set these env vars (defaults shown):

| Variable | Default |
|---|---|
| `QUARKUS_PROFILE` | `dev` (selects `MockGitProvider`) |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka1:19092,kafka2:19092,kafka3:19092` |
| `MONGODB_URI` | `mongodb://mongo1:27017,mongo2:27017,mongo3:27017/gdfkube?replicaSet=rs0` |

#### Scenario: Camel container comes up healthy

- **GIVEN** kafka1/2/3, mongo1, and gdfkube-debezium-init have completed/are healthy
- **WHEN** `docker compose up -d gdfkube-camel` is run
- **THEN** within 120 seconds `docker compose ps gdfkube-camel` SHALL report state `healthy`
- **AND** `curl http://gdfkube-camel:8080/q/health/ready` from within the network SHALL return `200 OK` with `status: UP`

#### Scenario: Helm CLI is available at the pinned version

- **GIVEN** the gdfkube-camel container is running
- **WHEN** `docker compose exec gdfkube-camel helm version --short` is run
- **THEN** the output SHALL match `v3.16.x`

---

### Requirement: Eight Camel routes SHALL be defined per the topology

The Camel app MUST define exactly 8 routes:

| Route | Source | Sink |
|---|---|---|
| `request-router` | `kafka:dbz.gdfkube.requests` | direct routes to `helm-render` |
| `helm-render` | direct from `request-router` | direct to `git-push` |
| `git-push` | direct from `helm-render` | direct to `repo-bootstrap` on 404 |
| `repo-bootstrap` | direct from `git-push` on 404 | re-enters `git-push` |
| `status-emitter` | direct/Camel SEDA invoked at pipeline entry | `kafka:gdfkube.pipeline.status` + `mongodb:requests` (stage write-back) |
| `audit-sink` | `kafka:gdfkube.audit` (group `gdfkube-camel`) | `mongodb:audit_log` |
| `config-reload` | `kafka:dbz.gdfkube.forms` (group `gdfkube-camel`) | `bean:FormDefCache#refresh` |
| `dlq-handler` | `kafka:dlq.gdfkube.*` (multi-pattern, group `gdfkube-camel`) | `mongodb:dlq_log` |

All Kafka consumers MUST use group `gdfkube-camel` and MUST set `enable.auto.commit=false`. Pipeline consumers (`request-router`, `config-reload`, `dlq-handler`) MUST set `auto.offset.reset=earliest`. `kafkaManualCommit.commitSync()` MUST be invoked only after the unit of work completes successfully.

#### Scenario: All 8 routes register on startup

- **GIVEN** the Camel app starts cleanly
- **WHEN** `curl http://gdfkube-camel:8080/q/camel/routes` is queried
- **THEN** the response SHALL list exactly the 8 route IDs: `request-router`, `helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`, `audit-sink`, `config-reload`, `dlq-handler`
- **AND** every route SHALL be in state `Started`

---

### Requirement: request-router SHALL drop Camel's own stage write-backs

The `request-router` route MUST consume `dbz.gdfkube.requests` and MUST filter messages with this predicate (using the Debezium pre-image and post-image fields):

- `op=c` → accept
- `op=r` → accept (snapshot row, treated identically to `op=c`)
- `op=u` AND `before.status != "provisioning"` AND `after.status == "provisioning"` → accept (true approval flip)
- All other `op=u` (including any update where `before.status == "provisioning"`) → drop
- `op=d` → drop

Accepted messages MUST be routed to `helm-render` based on `formId`.

#### Scenario: New submission is accepted

- **GIVEN** the route is running
- **WHEN** an `op=c` event arrives with `formId=cluster-request`
- **THEN** the message SHALL be passed to `helm-render`
- **AND** the Kafka offset SHALL be committed after the unit of work succeeds

#### Scenario: Approval flip is accepted

- **GIVEN** the route is running
- **WHEN** an `op=u` event arrives with `before.status=approval` and `after.status=provisioning`
- **THEN** the message SHALL be passed to `helm-render`

#### Scenario: Provisioning-to-provisioning update is dropped

- **GIVEN** the route is running
- **WHEN** an `op=u` event arrives with `before.status=provisioning` and `after.status=provisioning` (Camel's own stage write-back)
- **THEN** the message SHALL be filtered out
- **AND** `helm-render` SHALL NOT be invoked
- **AND** the offset SHALL be committed without re-processing

#### Scenario: Delete is dropped

- **GIVEN** the route is running
- **WHEN** an `op=d` event arrives
- **THEN** the message SHALL be filtered out

---

### Requirement: helm-render SHALL compose three-tier values and shell out to helm template

The `helm-render` route MUST invoke a `helmValuesBuilder` bean that produces a values document with the keys: `meta.{requestId, formId, org, email, submittedAt, correlationId}`, `vars.*` (pass-through of form input), `system.{baseDomain, releaseImage, giteaExternalUrl, giteaOwner}`, `system.naming.{hostedClusterName, namespace, appProject, clusterSet}`, and `system.labels.*` (the 6 required labels). The values MUST be written to `/tmp/<requestId>-values.yaml`. The route MUST then exec `helm template <release> /opt/charts/<chartRef> --values /tmp/<requestId>-values.yaml --output-dir /tmp/<requestId>-out --include-crds` where `<chartRef>` resolves nested paths (e.g., `infra/argocd-org`).

#### Scenario: helm template produces non-empty manifests for a valid request

- **GIVEN** a request with `formId=cluster-request` and a complete `vars.*` payload
- **WHEN** `helm-render` runs
- **THEN** the helm subprocess SHALL exit with code 0
- **AND** `/tmp/<requestId>-out/` SHALL contain at least one YAML file
- **AND** the rendered output SHALL include `system.labels` and `system.naming` values

#### Scenario: Missing required values cause a render failure that flows to DLQ

- **GIVEN** a request with `formId=cluster-request` and an incomplete `vars.*` payload
- **WHEN** `helm-render` runs
- **THEN** the helm subprocess SHALL exit non-zero
- **AND** after 3 redeliveries (1s/5s/25s backoff) the message SHALL land on `dlq.gdfkube.helm-render` with all 9 mandatory headers

---

### Requirement: Helm chart catalog SHALL provide 5 charts that lint clean

The directory `gdfkube-src/gdfkube-infra/charts/` MUST contain these chart trees, each with `Chart.yaml`, `values.yaml`, `values.schema.json`, and `templates/`:

| Chart | Renders |
|---|---|
| `cluster-request/` | HostedCluster, NodePool, ManagedCluster |
| `namespace-request/` | Namespace |
| `scale-patch/` | NodePool replica patch |
| `infra/argocd-org/` | AppProject, ApplicationSet |
| `infra/rhacm-org/` | ManagedClusterSet, ManagedClusterSetBinding |

Every chart's templates MUST apply `system.labels` and reference `system.naming.*` from the bean output.

#### Scenario: Every chart renders and lints

- **GIVEN** the chart catalog exists
- **WHEN** `helm template <release> gdfkube-src/gdfkube-infra/charts/<chartRef>` is run for each chart
- **THEN** each invocation SHALL exit 0
- **AND** the rendered output piped to `kubectl --dry-run=client -f -` SHALL exit 0

---

### Requirement: GitProvider interface SHALL have a real and a mock implementation

A `GitProvider` Java interface MUST be defined at `gdfkube-src/gdfkube-camel/src/main/java/gov/gdf/camel/git/GitProvider.java` with these methods:

```java
boolean repoExists(String owner, String name);
void createRepo(String owner, String name, RepoOptions opts);
Path cloneOrPull(String owner, String name, String branch);
void commitAndPush(Path workingTree, List<Path> files, String message, GitAuthor author);
```

A `GiteaGitProvider` implementation MUST use Gitea REST + JGit and MUST be active when configuration property `app.git.provider=gitea`. A `MockGitProvider` in-memory implementation MUST be active when `app.git.provider=mock`. The Quarkus `%dev` profile MUST default `app.git.provider=mock`. Git commits authored by Camel MUST use the message format `[gdfkube] REQ{requestId}: {action} {resourceName} ({formId})` and the author `gdfkube-camel <camel@gdfkube.gov.br>`.

#### Scenario: Dev profile uses MockGitProvider

- **GIVEN** the gdfkube-camel container is running with `QUARKUS_PROFILE=dev`
- **WHEN** `helm-render` produces manifests for a request and `git-push` runs
- **THEN** the commit SHALL be recorded in the `MockGitProvider`'s in-memory state
- **AND** no network call SHALL be made to any real Git host

#### Scenario: Mock state is process-local

- **GIVEN** a series of commits has been recorded in the mock
- **WHEN** `docker compose restart gdfkube-camel` is run
- **THEN** the mock state SHALL be empty after restart
- **AND** subsequent submissions SHALL produce fresh mock commits

---

### Requirement: status-emitter SHALL be the sole producer of gdfkube.pipeline.status

No other route, service, or container in the stack MAY produce to `gdfkube.pipeline.status`. The `status-emitter` route MUST publish events keyed by `requestId` with the canonical `StageEvent` payload (defined in the `itsm-express-api` spec). At pipeline entry, `status-emitter` MUST emit the full 7-stage timeline (`form` → `mongo` → `debezium` → `kafka` → `camel` → `git` → `argocd`) as a batch. For stages with a known upstream timestamp (form/mongo/debezium), the event's `at` field MUST reflect that timestamp (using `meta.submittedAt` and `source.ts_ms`). For later stages, `at` MUST reflect the processing timestamp at status-emitter entry. `status-emitter` MUST also write the integer `stage` field back to MongoDB `requests` for the active stage.

#### Scenario: Stage timeline is emitted in order

- **GIVEN** a valid `op=c` event flows through the pipeline
- **WHEN** `status-emitter` runs
- **THEN** 7 messages SHALL be produced to `gdfkube.pipeline.status` keyed by the request's `requestId`
- **AND** the `stage` field SHALL be `0, 1, 2, 3, 4, 5, 6` in order
- **AND** the `stageName` field SHALL be `form, mongo, debezium, kafka, camel, git, argocd` in order

#### Scenario: No other producer writes to gdfkube.pipeline.status

- **GIVEN** the full stack is running
- **WHEN** the topic is consumed and message headers are inspected
- **THEN** every message SHALL carry a header identifying `gdfkube-camel/status-emitter` as the producer

---

### Requirement: audit-sink SHALL persist audit events to MongoDB

A Camel-internal `AuditInterceptor` bean MUST emit one audit event to `gdfkube.audit` per execution of each side-effecting route (`helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`). The `audit-sink` route MUST consume `gdfkube.audit` (group `gdfkube-camel`) and persist the event to MongoDB `gdfkube.audit_log` with the schema defined in `gdfkube-audit-log-collection`.

#### Scenario: Each side-effecting route produces one audit row

- **GIVEN** a request flows through `helm-render`, `git-push`, `repo-bootstrap` (no-op for existing repo), and `status-emitter`
- **WHEN** the pipeline completes successfully
- **THEN** `audit_log` SHALL contain at least 4 rows for that `requestId`
- **AND** each row SHALL have a `stage`, `verb`, `actor`, and `at` field per the audit collection schema

---

### Requirement: config-reload SHALL refresh FormDefCache on form changes

The `config-reload` route MUST consume `dbz.gdfkube.forms` (group `gdfkube-camel`, `auto.offset.reset=earliest`) and MUST invoke `FormDefCache#refresh` for each accepted event. The route MUST accept `op=c`, `op=r`, and `op=u`. The route MUST ignore `op=d`. Snapshot replays on cold start MUST be idempotent.

#### Scenario: Form update refreshes the cache

- **GIVEN** the route is running
- **WHEN** an existing form definition in MongoDB is updated
- **THEN** `dbz.gdfkube.forms` emits an `op=u` event
- **AND** the route logs a `FormDefCache invalidated` line at INFO level
- **AND** subsequent `helm-render` invocations for that `formId` use the refreshed definition

---

### Requirement: dlq-handler SHALL persist DLQ events without auto-replay

The `dlq-handler` route MUST consume topics matching `dlq.gdfkube.*` (group `gdfkube-camel`) and MUST persist each message to MongoDB `gdfkube.dlq_log` with the schema defined in `gdfkube-dlq-log-collection`. The route MUST NOT republish DLQ messages to their original topics. Replay MUST be a manual CLI operation outside this capability's scope.

#### Scenario: DLQ message is persisted

- **GIVEN** a Camel route exhausts its 3-redelivery budget and publishes to `dlq.gdfkube.helm-render`
- **WHEN** the published message is consumed by `dlq-handler`
- **THEN** a new row SHALL appear in `dlq_log` with `topic=dlq.gdfkube.helm-render`, `replayCount=0`, and all 9 mandatory context headers
- **AND** the message SHALL NOT be republished

---

### Requirement: Error handling SHALL use 3 redeliveries with 1s/5s/25s backoff

Every route MUST use `errorHandler(deadLetterChannel(...))` with `maximumRedeliveries=3`, `redeliveryDelay=1000`, `backOffMultiplier=5.0`, producing the third redelivery at 25 seconds. On final failure, the route MUST stamp the 9 mandatory DLQ context headers per `kafka-broker-stack` before publishing to `dlq.gdfkube.{route}`: `x-original-topic`, `x-original-partition`, `x-original-offset`, `x-original-key`, `x-error-class`, `x-error-msg`, `x-stage`, `x-attempts`, `x-first-failure-at`, `x-replayed` (initially `false`).

#### Scenario: Three redeliveries before DLQ

- **GIVEN** a route whose downstream consistently fails
- **WHEN** a message enters the route
- **THEN** the route SHALL attempt processing 4 times total (initial + 3 redeliveries)
- **AND** the time between the first attempt and the fourth SHALL be approximately 31 seconds (1s + 5s + 25s)
- **AND** after the fourth failure the message SHALL be published to `dlq.gdfkube.{route}` with all 9 mandatory headers
- **AND** the original consumer offset SHALL be committed only after the DLQ publish succeeds

---

### Requirement: Camel MUST NOT modify kafka-broker-stack or mongodb-replica-set-stack files

The Camel capability MUST NOT modify any file in `gdfkube-src/gdfkube-infra/kafka/**` or `gdfkube-src/gdfkube-infra/mongodb/**` except for creating `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` (owned by the audit/dlq collection capabilities). All Camel artifacts MUST live under `gdfkube-src/gdfkube-camel/` and `gdfkube-src/gdfkube-infra/charts/`.

#### Scenario: No edits to kafka or mongodb infra files

- **GIVEN** the change is applied
- **WHEN** `git diff main -- gdfkube-src/gdfkube-infra/kafka/` is run
- **THEN** the output SHALL be empty
- **AND** the only modification under `gdfkube-src/gdfkube-infra/mongodb/` SHALL be the addition of `init-camel-collections.js`
