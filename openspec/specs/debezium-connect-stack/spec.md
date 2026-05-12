## ADDED Requirements

### Requirement: Stack SHALL run a single Kafka Connect worker on gdfkube-net

The repo-root `docker-compose.yml` MUST define a service `gdfkube-debezium-connect` running image `debezium/connect:2.7.3.Final`, attached to `gdfkube-net`, with `depends_on` `kafka1`/`kafka2`/`kafka3` `condition: service_healthy` and `gdfkube-connect-topics-init` `condition: service_completed_successfully`. The service MUST declare a healthcheck running `curl -sf http://localhost:8083/`. The service MUST publish port `8083` to the host bound to `127.0.0.1:8083:8083` ONLY. The service MUST NOT mount any host volume — all worker state lives in the 3 Connect-internal Kafka topics.

The service MUST set these environment variables:

| Variable | Value |
|---|---|
| `BOOTSTRAP_SERVERS` | `kafka1:19092,kafka2:19092,kafka3:19092` |
| `GROUP_ID` | `gdfkube-connect` |
| `CONFIG_STORAGE_TOPIC` | `connect-configs` |
| `OFFSET_STORAGE_TOPIC` | `connect-offsets` |
| `STATUS_STORAGE_TOPIC` | `connect-status` |
| `KEY_CONVERTER` | `org.apache.kafka.connect.json.JsonConverter` |
| `VALUE_CONVERTER` | `org.apache.kafka.connect.json.JsonConverter` |
| `KEY_CONVERTER_SCHEMAS_ENABLE` | `false` |
| `VALUE_CONVERTER_SCHEMAS_ENABLE` | `false` |

#### Scenario: Connect container comes up healthy

- **GIVEN** kafka1/2/3 are healthy and gdfkube-connect-topics-init has exited 0
- **WHEN** `docker compose up -d gdfkube-debezium-connect` is run
- **THEN** within 90 seconds `docker compose ps gdfkube-debezium-connect` SHALL report state `healthy`
- **AND** the service SHALL be running image `debezium/connect:2.7.3.Final`

#### Scenario: Only loopback host binding for the Connect REST port

- **GIVEN** the stack is running
- **WHEN** the host attempts a TCP connection to `127.0.0.1:8083`
- **THEN** the connection SHALL succeed and `curl http://127.0.0.1:8083/` SHALL return a Connect cluster info JSON body
- **AND** `docker-compose.yml` SHALL contain `127.0.0.1:8083:8083` and no `0.0.0.0` or unprefixed mapping for port 8083

---

### Requirement: Connect-internal topics SHALL be created idempotently by this capability

A one-shot service `gdfkube-connect-topics-init` MUST be defined in `docker-compose.yml` with `restart: "no"`, image `apache/kafka:3.7.2` (matching `kafka-init`), `depends_on` `kafka1`/`kafka2`/`kafka3` `condition: service_healthy`, and a bind-mount of `gdfkube-src/gdfkube-infra/debezium/init-connect-topics.sh` at `/scripts/init-connect-topics.sh:ro`. The script MUST run `kafka-topics.sh --create --if-not-exists` for the 3 internal topics with these exact settings:

| Topic | Partitions | RF | cleanup.policy |
|---|---|---|---|
| `connect-configs` | 1 | 3 | `compact` |
| `connect-offsets` | 25 | 3 | `compact` |
| `connect-status` | 5 | 3 | `compact` |

The script MUST NOT touch any topic owned by `kafka-broker-stack`.

#### Scenario: All 3 internal topics exist with compact cleanup policy

- **GIVEN** kafka1/2/3 are healthy
- **WHEN** `docker compose up gdfkube-connect-topics-init` exits
- **THEN** the service SHALL exit with code 0
- **AND** `kafka-topics.sh --bootstrap-server kafka1:19092 --list` SHALL contain `connect-configs`, `connect-offsets`, and `connect-status`
- **AND** `kafka-configs.sh --entity-type topics --entity-name <topic> --describe` SHALL report `cleanup.policy=compact` for each of the 3 topics
- **AND** `kafka-topics.sh --describe --topic connect-offsets` SHALL report `PartitionCount: 25` and `ReplicationFactor: 3`

#### Scenario: Re-running the init service is a no-op

- **GIVEN** the 3 internal topics already exist
- **WHEN** `docker compose run --rm gdfkube-connect-topics-init` is run
- **THEN** the run SHALL exit with code 0
- **AND** topic describe output SHALL be identical before and after the re-run

---

### Requirement: MongoDB connector SHALL be registered via idempotent REST PUT

A one-shot service `gdfkube-debezium-init` MUST be defined in `docker-compose.yml` with `restart: "no"`, `depends_on` `gdfkube-debezium-connect: service_healthy`, and an entrypoint that runs `curl -sf -X PUT -H 'Content-Type: application/json' --data @/connector-config.json http://gdfkube-debezium-connect:8083/connectors/gdfkube-mongo-source/config`. The connector configuration file `gdfkube-src/gdfkube-infra/debezium/connector-config.json` MUST be bind-mounted at `/connector-config.json:ro`.

The connector configuration MUST contain:

| Key | Value |
|---|---|
| `connector.class` | `io.debezium.connector.mongodb.MongoDbConnector` |
| `tasks.max` | `1` |
| `mongodb.connection.string` | `mongodb://mongo1:27017,mongo2:27017,mongo3:27017/?replicaSet=rs0` |
| `topic.prefix` | `dbz.gdfkube` |
| `database.include.list` | `gdfkube` |
| `collection.include.list` | `gdfkube.requests,gdfkube.forms` |
| `snapshot.mode` | `initial` |
| `capture.mode` | `change_streams_update_full_with_pre_image` |
| `signal.data.collection` | `gdfkube.debezium_signals` |
| `transforms` | `unwrap,reroute` |
| `transforms.unwrap.type` | `io.debezium.connector.mongodb.transforms.ExtractNewDocumentState` |
| `transforms.unwrap.delete.handling.mode` | `rewrite` |
| `transforms.unwrap.add.headers` | `op,source.ts_ms` |
| `transforms.reroute.type` | `org.apache.kafka.connect.transforms.RegexRouter` |
| `transforms.reroute.regex` | `dbz.gdfkube.gdfkube.(.*)` |
| `transforms.reroute.replacement` | `dbz.gdfkube.$1` |
| `key.converter` | `org.apache.kafka.connect.json.JsonConverter` |
| `value.converter` | `org.apache.kafka.connect.json.JsonConverter` |
| `key.converter.schemas.enable` | `false` |
| `value.converter.schemas.enable` | `false` |
| `errors.tolerance` | `all` |
| `errors.deadletterqueue.topic.name` | `dlq.gdfkube.debezium` |
| `errors.deadletterqueue.topic.replication.factor` | `3` |
| `errors.deadletterqueue.context.headers.enable` | `true` |

#### Scenario: Connector is registered and reports RUNNING

- **GIVEN** gdfkube-debezium-connect is healthy
- **WHEN** `docker compose up gdfkube-debezium-init` exits
- **THEN** the service SHALL exit with code 0
- **AND** `curl http://127.0.0.1:8083/connectors` SHALL return a JSON array containing `"gdfkube-mongo-source"`
- **AND** `curl http://127.0.0.1:8083/connectors/gdfkube-mongo-source/status` SHALL return a JSON object with `connector.state == "RUNNING"` and `tasks[0].state == "RUNNING"`

#### Scenario: Connector registration is idempotent

- **GIVEN** the connector is already registered
- **WHEN** `docker compose run --rm gdfkube-debezium-init` is run a second time
- **THEN** the run SHALL exit with code 0
- **AND** `curl /connectors/gdfkube-mongo-source/config` SHALL return the same configuration as before

---

### Requirement: Connector SHALL emit CDC events from gdfkube.requests and gdfkube.forms

After successful registration, the connector MUST publish change events from `gdfkube.requests` to topic `dbz.gdfkube.requests` and from `gdfkube.forms` to topic `dbz.gdfkube.forms`. Events MUST include the `op`, `source.ts_ms`, and (for `op=u`) `before`/`after` document images. Connector-level errors MUST land on `dlq.gdfkube.debezium` with `context.headers` populated.

#### Scenario: Snapshot replay on cold start

- **GIVEN** the MongoDB `gdfkube.requests` collection contains seeded documents
- **AND** the stack is brought up from a clean state (`docker compose down -v` then `up -d`)
- **WHEN** the connector finishes its initial snapshot
- **THEN** each seeded document SHALL produce a corresponding `op=r` event on `dbz.gdfkube.requests`
- **AND** the event payload SHALL include the full document under `after`

#### Scenario: Live change emits op=c

- **GIVEN** the connector is RUNNING with a completed snapshot
- **WHEN** a new document is inserted into `gdfkube.requests` via the Express API
- **THEN** an `op=c` event SHALL appear on `dbz.gdfkube.requests` keyed by the document's `_id`
- **AND** the event payload SHALL include the full document under `after`

#### Scenario: Update emits op=u with before/after pre-image

- **GIVEN** the connector is RUNNING
- **AND** `gdfkube.requests` was created with `changeStreamPreAndPostImages: true`
- **WHEN** an existing document's `status` field is updated from `approval` to `provisioning`
- **THEN** an `op=u` event SHALL appear on `dbz.gdfkube.requests`
- **AND** the event payload SHALL include `before.status == "approval"` and `after.status == "provisioning"`

#### Scenario: Malformed event lands on the connector DLQ

- **GIVEN** the connector is RUNNING
- **WHEN** a connector-level processing error occurs (e.g., schema conversion failure)
- **THEN** the offending message SHALL be produced to `dlq.gdfkube.debezium`
- **AND** the message SHALL carry context headers describing the original topic, partition, offset, and error class

---

### Requirement: Capability boundary SHALL be enforced

The Debezium capability MUST NOT modify any file inside `kafka-broker-stack`'s scope (`gdfkube-src/gdfkube-infra/kafka/**`). All Debezium artifacts (init script, connector config, registration script, README) MUST live under `gdfkube-src/gdfkube-infra/debezium/`.

#### Scenario: No edits to kafka-broker-stack files

- **GIVEN** the change is applied
- **WHEN** `git diff main -- gdfkube-src/gdfkube-infra/kafka/` is run
- **THEN** the output SHALL be empty
- **AND** `gdfkube-src/gdfkube-infra/debezium/` SHALL contain `init-connect-topics.sh`, `register-connector.sh`, `connector-config.json`, and `README.md`

---

### Requirement: README SHALL document connector lifecycle and reset path

A file at `gdfkube-src/gdfkube-infra/debezium/README.md` MUST exist and MUST document:

- The connector REST lifecycle: register (`PUT /connectors/.../config`), inspect (`GET /connectors/.../status`), delete (`DELETE /connectors/...`).
- The reset path: `docker compose down -v` wipes worker state since the 3 internal topics are stored in Kafka without a host volume.
- The topic-prefix mapping: `dbz.gdfkube` → events arrive on `dbz.gdfkube.<collection>` after the `RegexRouter` SMT.
- The DLQ topic name (`dlq.gdfkube.debezium`) and the context-header convention.

#### Scenario: README contains all required sections

- **GIVEN** the change is implemented
- **WHEN** `gdfkube-src/gdfkube-infra/debezium/README.md` is read
- **THEN** the file SHALL contain a section describing the connector REST lifecycle
- **AND** the file SHALL contain a section describing the `docker compose down -v` reset path
- **AND** the file SHALL document the `dbz.gdfkube.<collection>` topic naming rule
- **AND** the file SHALL document the DLQ topic `dlq.gdfkube.debezium`
