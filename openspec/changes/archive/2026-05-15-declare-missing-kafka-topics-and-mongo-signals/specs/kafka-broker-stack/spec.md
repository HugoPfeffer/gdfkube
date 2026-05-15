## RENAMED Requirements

- FROM: `### Requirement: All 9 catalog topics SHALL exist with exact settings after kafka-init exits`
- TO: `### Requirement: All 11 catalog topics SHALL exist with exact settings after kafka-init exits`

---

## MODIFIED Requirements

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

## ADDED Requirements

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
