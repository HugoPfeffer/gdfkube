## Purpose

Defines the Camel orchestrator stack: a Quarkus/Camel service consuming Kafka CDC events and rendering GitOps manifests via Helm.

## Requirements

### Requirement: Camel app SHALL run as a single Quarkus JVM service on gdfkube-net

A new Maven project at `gdfkube-src/gdfkube-camel/` MUST build a Quarkus 3.16.3 / Camel 4.6.0 JVM application packaged as `Dockerfile.jvm` based on `registry.access.redhat.com/ubi9/openjdk-21-runtime:1.21`. The Dockerfile MUST install Helm CLI v3.16.x using a SHA-pinned download. The repo-root `docker-compose.yml` MUST define a service `gdfkube-camel` running the built image, attached to `gdfkube-net`, with `depends_on`:

- `kafka1`/`kafka2`/`kafka3` `condition: service_healthy`
- `mongo1` `condition: service_healthy`
- `gdfkube-debezium-init` `condition: service_completed_successfully`

The service MUST bind-mount `gdfkube-src/gdfkube-infra/charts:/opt/charts:ro` and declare a healthcheck that probes the Quarkus readiness endpoint at `http://localhost:8080/q/health/ready` from inside the container. The healthcheck MUST permit a Quarkus startup grace period (`start_period >= 30s`) and MUST eventually flip the container to `unhealthy` if the readiness endpoint never returns 200 — for example, when a Camel route fails to register due to a missing extension. The service MUST be a single replica (no horizontal scaling). The service MUST set these env vars (defaults shown):

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

#### Scenario: A healthy Camel container reports `healthy` under docker compose ps

- **GIVEN** the full stack is started with `docker compose up -d` and all Camel routes register successfully
- **WHEN** `docker compose ps gdfkube-camel` is inspected after the `start_period`
- **THEN** the reported state SHALL be `healthy`

#### Scenario: A Camel container with an unresolved route is reported `unhealthy`

- **GIVEN** the `gdfkube-camel` image is intentionally missing a `camel-quarkus-*` extension required by a declared route
- **WHEN** the container is started via `docker compose up -d gdfkube-camel` and the `start_period + retries * interval` window elapses
- **THEN** `docker compose ps gdfkube-camel` SHALL report state `unhealthy`
- **AND** any service that lists `gdfkube-camel` under `depends_on` with `condition: service_healthy` SHALL be prevented from starting

---

### Requirement: Nine Camel routes SHALL be defined per the topology

The Camel app MUST define exactly 9 routes:

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
| `org-bootstrap` | `kafka:dbz.gdfkube.groups` (group `gdfkube-camel`) | git push to central `gdfkube-orgs` repo + `kafka:gdfkube.audit` |

All Kafka consumers MUST use group `gdfkube-camel` and MUST set `enable.auto.commit=false`. Pipeline consumers (`request-router`, `config-reload`, `dlq-handler`, `org-bootstrap`) MUST set `auto.offset.reset=earliest`. `kafkaManualCommit.commitSync()` MUST be invoked only after the unit of work completes successfully.

#### Scenario: All 9 routes register on startup

- **GIVEN** the Camel app starts cleanly
- **WHEN** `curl http://gdfkube-camel:8080/q/camel/routes` is queried
- **THEN** the response SHALL list exactly the 9 route IDs: `request-router`, `helm-render`, `git-push`, `repo-bootstrap`, `status-emitter`, `audit-sink`, `config-reload`, `dlq-handler`, `org-bootstrap`
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

---

### Requirement: The packaged gdfkube-camel artifact SHALL register every declared route at boot

The `gdfkube-camel` Maven module MUST ship a `@QuarkusIntegrationTest` (Failsafe-bound, naming convention `*IT.java`) that boots the **packaged** Quarkus artifact (i.e., not the test-classpath dev mode) and asserts that the `CamelContext` reaches state `Started` and that every route declared in the topology reports route status `Started`. The IT MUST exercise the production-classpath augmentation path — the same path the deployed container uses — so that any missing `camel-quarkus-*` extension fails the build.

#### Scenario: Packaged artifact boots and registers all declared routes

- **GIVEN** the `gdfkube-camel` module has been packaged via `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify`
- **WHEN** the Failsafe-bound `AppStartupIT` runs against the packaged artifact
- **THEN** the test SHALL pass
- **AND** the `CamelContext` status SHALL be `Started`
- **AND** each route id in the declared topology (including `git-push` and `repo-bootstrap`) SHALL report status `Started`

#### Scenario: A missing Camel component extension fails the integration test

- **GIVEN** the `gdfkube-camel` module's `pom.xml` omits a `camel-quarkus-<scheme>` extension required by a route URI in `src/main/java`
- **WHEN** `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` is executed
- **THEN** `AppStartupIT` SHALL fail
- **AND** the failure message SHALL reference the unresolved scheme (e.g., `No endpoint could be found for: <scheme>://...`)
- **AND** the Maven exit code SHALL be non-zero

#### Scenario: `mvn test` (without verify) remains fast and does not run the integration test

- **GIVEN** a developer runs `./mvnw -pl gdfkube-src/gdfkube-camel test`
- **WHEN** Surefire executes
- **THEN** the `*IT.java` class SHALL NOT be invoked
- **AND** the run SHALL complete using only `@QuarkusTest`-bound unit tests

---

### Requirement: PR CI SHALL run the packaged-artifact smoke for the gdfkube-camel module

The repository MUST contain a GitHub Actions workflow at `.github/workflows/gdfkube-camel-ci.yml` that triggers on `pull_request` and `push` to `main` filtered by paths under `gdfkube-src/gdfkube-camel/**` (and the workflow file itself). The workflow MUST execute `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify` so that Failsafe runs the packaged-artifact smoke on every change. The job MUST report a non-zero exit status — and therefore a failed PR check — whenever the smoke test does not pass.

#### Scenario: PR touching gdfkube-camel runs the IT

- **GIVEN** a pull request changes a file under `gdfkube-src/gdfkube-camel/`
- **WHEN** the GitHub Actions workflow is triggered
- **THEN** the job SHALL run `./mvnw -pl gdfkube-src/gdfkube-camel -am -DskipITs=false verify`
- **AND** the run SHALL include the `AppStartupIT` execution in the Failsafe report

#### Scenario: A regression of the original incident fails CI, not the deployed container

- **GIVEN** a pull request removes `camel-quarkus-direct` from `gdfkube-src/gdfkube-camel/pom.xml`
- **WHEN** the `gdfkube-camel-ci.yml` workflow runs
- **THEN** the workflow SHALL exit non-zero
- **AND** the PR check SHALL be marked failed
- **AND** the failure SHALL be observable on the PR before merge

#### Scenario: PRs not touching gdfkube-camel are not gated by this workflow

- **GIVEN** a pull request changes only files outside `gdfkube-src/gdfkube-camel/` and outside `.github/workflows/gdfkube-camel-ci.yml`
- **WHEN** the workflow's path filter is evaluated
- **THEN** the `gdfkube-camel-ci.yml` workflow SHALL NOT run
- **AND** no associated PR check SHALL be added

---

### Requirement: No live secret SHALL be introduced by build-verification changes

The CI workflow and the integration test MUST NOT introduce any credential, token, or secret value into the repository or into workflow run logs. Any environment variables required by the workflow MUST be sourced from `${{ secrets.* }}` references, and the workflow MUST not echo their values. Pre-commit trufflehog MUST remain green after this change lands.

#### Scenario: trufflehog pre-commit stays green

- **GIVEN** all files in this change are staged
- **WHEN** `pre-commit run --all-files` is executed
- **THEN** trufflehog SHALL report no findings
- **AND** the run SHALL exit with code 0

#### Scenario: The CI workflow logs contain no secret values

- **GIVEN** the `gdfkube-camel-ci.yml` workflow has completed a run
- **WHEN** the run logs are inspected
- **THEN** no `${{ secrets.* }}` value SHALL appear in plaintext
- **AND** no Gitea PAT, Kafka credential, or Mongo connection string with credentials SHALL appear

---

### Requirement: org-bootstrap SHALL idempotently provision per-org GitOps content from group events

The `org-bootstrap` route MUST consume `dbz.gdfkube.groups` (group `gdfkube-camel`, `auto.offset.reset=earliest`, manual commit) and MUST react to group lifecycle CDC events with the following filter:

- `op=c` → accept
- `op=r` → accept (snapshot row)
- `op=u` → accept (any change to a group document re-evaluates the bootstrap state)
- `op=d` → drop (no decommission flow in this capability)

The route MUST apply a 60-second in-memory dedup cache keyed on the group's `_id` to absorb Debezium replays.

For each accepted event the route MUST:

1. Extract `groupId = node._id` and `groupRepo = node.repo` (falling back to `gdfkube-{groupId}` if `repo` is empty/missing).
2. Ensure the per-org Gitea repo `gdfkube-{groupId}` exists via `GitRepoBootstrapper.ensure(owner, repoName, description)` (idempotent skip-if-exists; emits `create-repo` audit on creation).
3. Ensure the central Gitea repo `gdfkube-orgs` exists via the same bean (idempotent; emits `create-repo` audit on creation).
4. Acquire a per-repo `ReentrantLock` for `gdfkube-orgs`, then clone or pull it.
5. Compute the three target paths under `<workTree>/orgs/<groupId>/`:
   - `appproject.yaml`
   - `applicationset.yaml`
   - `<groupId>-clusterset.yaml`
6. If all target paths exist on disk, emit a `noop` audit event and return WITHOUT rendering or pushing.
7. Otherwise, render `argocd-org` and `rhacm-org` charts via `HelmTemplateRunner.render(chartRef, releaseName, valuesPath, outputDir)` using values from `HelmValuesBuilder.buildForOrg(groupId, groupRepo)`. Concatenate the two `rhacm-org` outputs (ManagedClusterSet + ManagedClusterSetBinding) into a single multi-doc YAML separated by `---` and write as `<groupId>-clusterset.yaml`.
8. Copy ONLY the missing files into `<workTree>/orgs/<groupId>/`. Files already present MUST NOT be overwritten.
9. Commit and push with author `gdfkube-camel <camel@gdfkube.gov.br>` and message `[gdfkube] GROUP-{groupId}: bootstrap org manifests`.
10. Emit a `bootstrap` audit event with the list of files added.
11. Commit the Kafka offset only after step 10 succeeds.

The route MUST NOT invoke `status-emitter` and MUST NOT call `stageUpdater` — group events have no request stage. On exception the route MUST publish to `dlq.gdfkube.groups` per the standard error-handling requirement; the existing `dlq-handler` route already consumes `dlq.gdfkube.*` and persists the message.

#### Scenario: First group event bootstraps both repos and writes all three files

- **GIVEN** the route is running and Gitea has neither `gdfkube-cultura` nor `gdfkube-orgs`
- **WHEN** an `op=c` event arrives for a group with `_id=cultura` and `repo=gdfkube-cultura`
- **THEN** `gdfkube-cultura` SHALL be created in Gitea
- **AND** `gdfkube-orgs` SHALL be created in Gitea
- **AND** a single commit on `gdfkube-orgs` SHALL contain exactly three files: `orgs/cultura/appproject.yaml`, `orgs/cultura/applicationset.yaml`, `orgs/cultura/cultura-clusterset.yaml`
- **AND** the commit message SHALL match `[gdfkube] GROUP-cultura: bootstrap org manifests`

#### Scenario: Replay of an already-bootstrapped group is a noop

- **GIVEN** the route has previously bootstrapped group `cultura` and all three target files exist in `gdfkube-orgs`
- **WHEN** another `op=u` event arrives for the same group
- **THEN** no second commit SHALL be produced on `gdfkube-orgs`
- **AND** an audit event with verb `noop` SHALL be emitted

#### Scenario: Partial state self-heals on next event

- **GIVEN** `gdfkube-orgs` already contains `orgs/cultura/appproject.yaml` only
- **WHEN** an event for `cultura` arrives
- **THEN** the resulting commit SHALL contain exactly `orgs/cultura/applicationset.yaml` and `orgs/cultura/cultura-clusterset.yaml`
- **AND** the existing `orgs/cultura/appproject.yaml` SHALL NOT be modified

#### Scenario: Delete event is dropped

- **GIVEN** the route is running
- **WHEN** an `op=d` event arrives for group `cultura`
- **THEN** no clone, no commit, and no DLQ message SHALL be produced

#### Scenario: Replay within 60 seconds is suppressed by dedup cache

- **GIVEN** the route has just successfully processed an event for group `cultura`
- **WHEN** the same event is replayed within 60 seconds
- **THEN** exactly one commit SHALL exist on `gdfkube-orgs` for that group
- **AND** the second invocation SHALL be suppressed by the dedup cache

#### Scenario: helm render failure flows to the groups DLQ

- **GIVEN** `HelmTemplateRunner.render(...)` throws on invocation
- **WHEN** an event for group `cultura` is processed (after 3 redeliveries with 1s/5s/25s backoff)
- **THEN** the message SHALL land on `dlq.gdfkube.groups` with all 9 mandatory DLQ context headers

---

### Requirement: Reusable beans SHALL back the request and org-bootstrap pipelines

The Camel module MUST provide two beans whose responsibilities are shared by the request pipeline (`repo-bootstrap`, `helm-render`) and the new `org-bootstrap` route:

- `gov.gdf.camel.bean.GitRepoBootstrapper#ensure(String owner, String repoName, String description)` MUST encapsulate the `gitProvider.repoExists` check followed by `gitProvider.createRepo` when absent. It MUST be idempotent (no-op when the repo exists).
- `gov.gdf.camel.bean.HelmTemplateRunner#render(String chartRef, String releaseName, String valuesPath, String outputDir)` MUST shell out to `helm template <release> /opt/charts/<chartRef> --values <valuesPath> --output-dir <outputDir> --include-crds` and return the list of rendered output paths. It MUST surface the helm subprocess exit code as an exception on non-zero.

The `repo-bootstrap` route MUST delegate its repo-existence/creation step to `GitRepoBootstrapper.ensure`. The `helm-render` route MUST delegate its helm subprocess invocation to `HelmTemplateRunner.render`. The observable behavior of both routes MUST remain unchanged after the delegation.

#### Scenario: GitRepoBootstrapper skips when repo already exists

- **GIVEN** `gitProvider.repoExists(owner, "gdfkube-cultura")` returns `true`
- **WHEN** `GitRepoBootstrapper.ensure(owner, "gdfkube-cultura", "...")` is invoked
- **THEN** `gitProvider.createRepo(...)` SHALL NOT be called

#### Scenario: GitRepoBootstrapper creates when repo absent

- **GIVEN** `gitProvider.repoExists(owner, "gdfkube-orgs")` returns `false`
- **WHEN** `GitRepoBootstrapper.ensure(owner, "gdfkube-orgs", "Org bootstrap manifests rendered by gdfkube-camel")` is invoked
- **THEN** `gitProvider.createRepo(owner, "gdfkube-orgs", ...)` SHALL be called exactly once

#### Scenario: Existing PipelineIntegrationTest passes after the delegation

- **GIVEN** `RepoBootstrapRoute` and `HelmRenderRoute` have been refactored to delegate to the new beans
- **WHEN** `PipelineIntegrationTest.goldenPath_existingRepoIsNotRecreated` runs
- **THEN** the test SHALL pass without modification

---

### Requirement: HelmValuesBuilder SHALL produce values for org-bootstrap charts

The `gov.gdf.camel.bean.HelmValuesBuilder` bean MUST expose a `buildForOrg(String groupId, String groupRepo)` method that writes `/tmp/{groupId}-bootstrap-values.yaml` and returns its path. The values document MUST contain:

- `meta.requestId` = `bootstrap-{groupId}`
- `meta.formId` = `org-bootstrap`
- `meta.org` = `{groupId}`
- `meta.email` = `null`
- `meta.submittedAt` = ISO-8601 timestamp at invocation
- `meta.correlationId` = `bootstrap-{groupId}`
- `system.naming.appProject` = `{groupId}`
- `system.naming.clusterSet` = `{groupId}`
- `system.naming.hostedClusterName` = `{groupId}`
- `system.naming.namespace` = `{groupId}`
- `system.labels.*` = the 6 required labels
- `system.giteaExternalUrl` = the configured `app.system.gitea-external-url`
- `system.giteaOwner` = the configured `app.system.gitea-owner`
- `vars` = `{}`

The existing `build(RequestEvent)` method MUST remain unchanged. New `getChartRef(String chartName)` and `getReleaseName(String groupId)` overloads MUST be available for the `org-bootstrap` route.

#### Scenario: buildForOrg writes a values file with the canonical naming shape

- **GIVEN** `app.system.gitea-owner=gdf` and `app.system.gitea-external-url=https://gitea.gdfkube.gov.br`
- **WHEN** `HelmValuesBuilder.buildForOrg("cultura", "gdfkube-cultura")` is invoked
- **THEN** the returned path SHALL be `/tmp/cultura-bootstrap-values.yaml`
- **AND** the file SHALL parse as YAML with `meta.requestId == "bootstrap-cultura"`, `meta.formId == "org-bootstrap"`, `system.naming.appProject == "cultura"`, `system.naming.clusterSet == "cultura"`

#### Scenario: build(RequestEvent) is unchanged after the addition

- **GIVEN** the new `buildForOrg` method has been added
- **WHEN** the existing `HelmValuesBuilderTest` (covering `build(RequestEvent)`) runs
- **THEN** the test SHALL pass without modification
