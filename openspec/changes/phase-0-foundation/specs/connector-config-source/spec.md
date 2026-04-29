<!-- SPEC: connector-config-source | CAP-006 -->

## ADDED Requirements

### Requirement: REQ-006-01 connector.json shape and required fields

The file `gdfkube-src/connector.json` SHALL exist as valid JSON containing a top-level object with exactly two keys: `name` (literal value `gdfkube-mongo-source`) and `config` (an object). The `config` object MUST declare `connector.class: io.debezium.connector.mongodb.MongoDbConnector`, `topic.prefix: gdfkube`, a `mongodb.connection.string` value pointing at `mongo:27017` with `replicaSet=rs0`, and `capture.mode: change_streams_update_full_with_pre_image`. No SMT entries (`transforms*` keys) MAY appear in Phase 0.

#### Scenario: SCN-006-01-01 connector.json validates

- **GIVEN** `gdfkube-src/connector.json` is at the Phase 0 acceptance commit
- **WHEN** `jq -e '.name == "gdfkube-mongo-source" and .config["connector.class"] == "io.debezium.connector.mongodb.MongoDbConnector" and .config["capture.mode"] == "change_streams_update_full_with_pre_image" and (.config | keys | map(select(startswith("transforms"))) | length == 0)' gdfkube-src/connector.json` runs
- **THEN** the command MUST exit 0 and stdout MUST be `true`

#### Scenario: SCN-006-01-02 SMT entry in Phase 0 fails parity

- **GIVEN** `connector.json` is edited to add a `transforms` key
- **WHEN** `task test:parity` runs
- **THEN** `connector-parity.sh` MUST exit non-zero and stderr MUST contain `transforms keys forbidden in Phase 0` with the offending key names

### Requirement: REQ-006-02 Single source consumed by both registration paths

The contents of `gdfkube-src/connector.json` SHALL be the only authoritative source for the Debezium connector configuration. The local-dev path (`scripts/register-connector.sh` POSTing to the `kafka-connect` REST API) and the cluster path (the Strimzi `KafkaConnector` CR template that Phase 1 introduces) MUST both consume this file by reference; neither path MAY duplicate fields inline. Phase 0 MUST check in a placeholder `KafkaConnector` template under `gdfkube-src/scripts/strimzi-kafka-connector.template.yaml` that interpolates `connector.json` via the `connector-parity.sh` diff harness.

#### Scenario: SCN-006-02-01 REST and CR templates render identical config

- **GIVEN** `gdfkube-src/connector.json` is at the Phase 0 acceptance commit and the placeholder Strimzi template exists
- **WHEN** `./scripts/connector-parity.sh` runs locally
- **THEN** the script MUST exit 0 and stdout MUST report "connector.json fields=N matched=N drift=0" with `N` ≥ 4

#### Scenario: SCN-006-02-02 Inline override in CR template fails parity

- **GIVEN** the Strimzi template hard-codes `capture.mode: change_streams` instead of interpolating from `connector.json`
- **WHEN** `./scripts/connector-parity.sh` runs
- **THEN** the script MUST exit non-zero, stderr MUST identify `capture.mode` as the drifting field, and the message MUST cite guardrail G2
