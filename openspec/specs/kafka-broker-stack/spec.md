### Requirement: Stack SHALL run three Kafka brokers in KRaft mode on gdfkube-net

The repo-root `docker-compose.yml` MUST define services `kafka1`, `kafka2`, and `kafka3`, each running image `apache/kafka:3.7.2` with combined `process.roles=broker,controller` (KRaft mode). Each service MUST be attached to `gdfkube-net`. Each service MUST declare a healthcheck running `kafka-broker-api-versions.sh --bootstrap-server localhost:19092` and MUST mount a named Docker volume at `/var/lib/kafka/data` (`kafka1-data`, `kafka2-data`, `kafka3-data` respectively). Only `kafka1` MAY publish port `9092` to the host, and that publish MUST bind to `127.0.0.1` only. Each broker MUST listen on port `19092` for PLAINTEXT inter-broker/client traffic and port `9093` for CONTROLLER quorum traffic. `kafka1` MUST additionally listen on port `9092` for host-accessible traffic via a separate HOST listener.

#### Scenario: Three Kafka containers come up healthy

- **GIVEN** a clean checkout at `/workspace`
- **WHEN** `docker compose up -d kafka1 kafka2 kafka3` is run
- **THEN** within 60 seconds `docker compose ps kafka1 kafka2 kafka3` SHALL report all three services in state `healthy`
- **AND** each service SHALL be running image `apache/kafka:3.7.2`

#### Scenario: Only kafka1 is reachable from the host

- **GIVEN** the Kafka stack is running and healthy
- **WHEN** the host attempts a TCP connection to `127.0.0.1:9092`
- **THEN** the connection SHALL succeed and respond as a Kafka broker
- **AND** there SHALL be no `kafka2` or `kafka3` host port mapping in `docker-compose.yml`

---

### Requirement: KRaft quorum SHALL be initialized deterministically

A fixed `KAFKA_CLUSTER_ID` (env-driven or hard-coded for the demo) and `KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093` MUST be set on every broker so that re-creating volumes yields the same quorum. Each broker MUST use port `9093` for controller traffic (separate from the PLAINTEXT client port `19092`). `kafka1` additionally uses port `9092` for host-accessible traffic via a dedicated HOST listener.

#### Scenario: All brokers join the same KRaft quorum

- **GIVEN** the three Kafka brokers are healthy
- **WHEN** `docker compose logs kafka1 kafka2 kafka3` is inspected
- **THEN** each broker's logs SHALL contain the same `KAFKA_CLUSTER_ID` value
- **AND** each broker SHALL report active controller status without quorum errors

#### Scenario: Quorum survives volume recreation

- **GIVEN** the stack was previously running
- **WHEN** `docker compose down -v` is run and then `docker compose up -d kafka1 kafka2 kafka3`
- **THEN** all three brokers SHALL form a healthy quorum within 60 seconds using the same fixed cluster ID

---

### Requirement: Stack SHALL expose loopback-only host bindings

All host-published ports for the Kafka stack MUST be bound to `127.0.0.1`. No service MAY publish a port on `0.0.0.0` or any non-loopback interface. Inter-broker traffic MUST use Docker DNS names (`kafka1`, `kafka2`, `kafka3`) on the internal `gdfkube-net` network.

#### Scenario: No public host port mappings in compose config

- **GIVEN** the repo-root `docker-compose.yml`
- **WHEN** the file is parsed
- **THEN** every host port mapping under Kafka services SHALL be of the form `127.0.0.1:<port>:<container-port>`
- **AND** no entry SHALL omit the host-IP prefix (which would default to `0.0.0.0`)

---

### Requirement: All 11 catalog topics SHALL exist with exact settings after kafka-init exits

The `kafka-init` service MUST run `gdfkube-src/gdfkube-infra/kafka/init-topics.sh` against the broker bootstrap. The script MUST use `kafka-topics.sh --create --if-not-exists` for each topic and MUST set `retention.ms`, `min.insync.replicas`, and `cleanup.policy=delete` on every topic. The service MUST use `restart: "no"` and `depends_on` all three brokers with `condition: service_healthy`.

The following topics MUST be created with exact settings:

| Topic | Partitions | RF | Retention (ms) | min.insync.replicas |
|---|---|---|---|---|
| `dbz.gdfkube.requests` | 6 | 3 | 604800000 | 2 |
| `dbz.gdfkube.forms` | 1 | 3 | 604800000 | 2 |
| `dbz.gdfkube.groups` | 1 | 3 | 604800000 | 2 |
| `gdfkube.pipeline.status` | 6 | 3 | 1209600000 | 2 |
| `gdfkube.audit` | 3 | 3 | 2592000000 | 2 |
| `dlq.gdfkube.requests` | 3 | 3 | 2592000000 | 2 |
| `dlq.gdfkube.helm-render` | 1 | 3 | 2592000000 | 2 |
| `dlq.gdfkube.git-push` | 1 | 3 | 2592000000 | 2 |
| `dlq.gdfkube.repo-bootstrap` | 1 | 3 | 2592000000 | 2 |
| `dlq.gdfkube.groups` | 1 | 3 | 2592000000 | 2 |
| `dlq.gdfkube.debezium` | 1 | 3 | 2592000000 | 2 |

#### Scenario: All 11 topics exist after kafka-init

- **GIVEN** the three Kafka brokers are healthy
- **WHEN** `docker compose up kafka-init` exits
- **THEN** `kafka-init` SHALL exit with code 0
- **AND** `kafka-topics.sh --bootstrap-server kafka1:19092 --list` SHALL print all 11 topic names

#### Scenario: Topic partition and replication settings match the catalog

- **GIVEN** `kafka-init` has exited 0
- **WHEN** `kafka-topics.sh --bootstrap-server kafka1:19092 --describe --topic <topic>` is run for each catalog topic
- **THEN** each topic SHALL report the partition count and replication factor specified in the catalog table

#### Scenario: Topic config settings match the catalog

- **GIVEN** `kafka-init` has exited 0
- **WHEN** `kafka-configs.sh --bootstrap-server kafka1:19092 --entity-type topics --entity-name <topic> --describe` is run for each catalog topic
- **THEN** `retention.ms` SHALL match the catalog value
- **AND** `min.insync.replicas` SHALL equal `2`
- **AND** `cleanup.policy` SHALL equal `delete`

---

### Requirement: kafka-init SHALL be idempotent

Re-running `docker compose run --rm kafka-init` against a populated cluster MUST exit 0 and MUST NOT change any topic configuration. The `--if-not-exists` flag on `kafka-topics.sh` ensures existing topics are skipped; config settings MUST be applied idempotently (setting the same value is a no-op).

#### Scenario: Re-running kafka-init is a no-op

- **GIVEN** `kafka-init` has already run and all 11 topics exist
- **WHEN** `docker compose run --rm kafka-init` is run a second time
- **THEN** the run SHALL exit with code 0
- **AND** `kafka-topics.sh --describe` output for all topics SHALL be identical before and after the re-run

---

### Requirement: Broker data SHALL persist across container restarts via named volumes

Each broker's data directory (`/var/lib/kafka/data`) MUST be backed by a Docker-managed named volume (`kafka1-data`, `kafka2-data`, `kafka3-data`). Messages written before a `docker compose restart` of any individual broker MUST be readable after that broker returns to a healthy state.

#### Scenario: Produced message survives a broker restart

- **GIVEN** the Kafka stack is healthy and all topics exist
- **WHEN** a probe message is produced to `gdfkube.audit` using `kafka-console-producer.sh`
- **AND** then `docker compose restart kafka1`
- **AND** `kafka1` returns to state `healthy`
- **THEN** consuming from `gdfkube.audit` with `kafka-console-consumer.sh --from-beginning` SHALL return the probe message

#### Scenario: docker compose down -v wipes data and next up re-creates topics

- **GIVEN** the stack is running with persisted data
- **WHEN** `docker compose down -v` is run, then `docker compose up -d` is re-run, then `kafka-init` exits 0
- **THEN** `kafka-topics.sh --list` SHALL show all 11 topics
- **AND** consuming from `gdfkube.audit` SHALL return no prior probe messages

---

### Requirement: Cluster SHALL tolerate the loss of any single broker

With three brokers healthy and RF=3 plus `min.insync.replicas=2`, stopping any one broker MUST leave the remaining two able to accept produces and serve consumes for catalog topics.

#### Scenario: Produce and consume succeed with one broker down

- **GIVEN** all three Kafka brokers are healthy and all 11 topics exist
- **WHEN** `docker compose stop kafka2` is run
- **AND** a message is produced to `gdfkube.audit` via the remaining brokers
- **THEN** the produce SHALL succeed
- **AND** consuming the message from `gdfkube.audit` SHALL succeed

---

### Requirement: Connection contract SHALL be documented for downstream specs

A file at `gdfkube-src/gdfkube-infra/kafka/README.md` MUST exist and MUST contain:
- In-network bootstrap string: `kafka1:19092,kafka2:19092,kafka3:19092`
- Host-side bootstrap string: `127.0.0.1:9092`
- Consumer-group names: `gdfkube-camel`, `itsm-sse-{podName}`
- Required producer config: `enable.idempotence=true`, `acks=all`, `max.in.flight.requests.per.connection<=5`
- Required consumer config: `enable.auto.commit=false`, `auto.offset.reset` guidance
- DLQ context-header convention (copied from `docs/05-kafka.md`)

#### Scenario: README contains all required connection contract sections

- **GIVEN** the change is implemented
- **WHEN** `gdfkube-src/gdfkube-infra/kafka/README.md` is read
- **THEN** the file SHALL contain the in-network bootstrap string `kafka1:19092,kafka2:19092,kafka3:19092`
- **AND** the file SHALL contain the host-side bootstrap string `127.0.0.1:9092`
- **AND** the file SHALL list consumer groups `gdfkube-camel` and `itsm-sse-{podName}`
- **AND** the file SHALL list required producer config including `enable.idempotence=true` and `acks=all`
- **AND** the file SHALL list required consumer config including `enable.auto.commit=false`
- **AND** the file SHALL document the DLQ context-header convention with header names `x-original-topic`, `x-error-class`, `x-stage`, and `x-attempts`

---

### Requirement: Debezium signal collection SHALL be declared at bootstrap

The `gdfkube-src/gdfkube-infra/mongodb/init-camel-collections.js` script MUST idempotently create the `gdfkube.debezium_signals` collection so that the Debezium MongoDB connector's `signal.data.collection` target (declared in `gdfkube-infra/debezium/connector-config.json`) exists from the first run. The collection MUST NOT be required to have application-defined indexes; the implicit `_id` index is sufficient because Debezium polls the collection through its own driver and no application code reads from it.

#### Scenario: debezium_signals exists after init-camel-collections runs

- **GIVEN** a clean Mongo replica set with the `gdfkube` database empty
- **WHEN** `mongosh < init-camel-collections.js` is executed
- **THEN** `db.getCollectionNames()` on the `gdfkube` database SHALL include `debezium_signals`

#### Scenario: Re-running init-camel-collections is idempotent for debezium_signals

- **GIVEN** `init-camel-collections.js` has already run and `debezium_signals` exists
- **WHEN** the script is executed a second time
- **THEN** the run SHALL exit with code 0
- **AND** the existing `debezium_signals` collection SHALL be preserved without error
