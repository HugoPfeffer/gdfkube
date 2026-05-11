## 1. Kafka broker services in docker-compose.yml

- [x] 1.1 Generate a fixed `KAFKA_CLUSTER_ID` and add `kafka1` service to `docker-compose.yml` with image `apache/kafka:3.7.2`, KRaft env vars (`KAFKA_NODE_ID=1`, `process.roles=broker,controller`, `KAFKA_CONTROLLER_QUORUM_VOTERS`, `KAFKA_CLUSTER_ID`), dual-listener config (PLAINTEXT + CONTROLLER), healthcheck, named volume `kafka1-data` at `/var/lib/kafka/data`, host port `127.0.0.1:9092`, and `gdfkube-net` network
- [x] 1.2 Add `kafka2` service with `KAFKA_NODE_ID=2`, no host port mapping, same KRaft env vars and listener config as kafka1 (adjusted for node ID and advertised hostname), healthcheck, volume `kafka2-data`, `gdfkube-net`
- [x] 1.3 Add `kafka3` service with `KAFKA_NODE_ID=3`, same pattern as kafka2, volume `kafka3-data`
- [x] 1.4 Add `kafka1-data`, `kafka2-data`, `kafka3-data` to the `volumes:` section of `docker-compose.yml`
- [x] 1.5 Configure `kafka1` advertised listeners to include both the Docker-internal listener (`kafka1:19092`) and the host listener (`127.0.0.1:9092`) so host-side tools can connect

## 2. Topic init script

- [x] 2.1 Create `gdfkube-src/gdfkube-infra/kafka/init-topics.sh` with a shebang, `set -euo pipefail`, and a loop that runs `kafka-topics.sh --create --if-not-exists` for each of the 9 catalog topics with correct `--partitions` and `--replication-factor`
- [x] 2.2 Add `kafka-configs.sh --alter` calls in the script to set `retention.ms`, `min.insync.replicas=2`, and `cleanup.policy=delete` for each topic
- [x] 2.3 Make the script executable (`chmod +x`)

## 3. kafka-init service in docker-compose.yml

- [x] 3.1 Add `kafka-init` service to `docker-compose.yml` with image `apache/kafka:3.7.2`, `restart: "no"`, `depends_on` kafka1/kafka2/kafka3 `condition: service_healthy`, bind-mount of `init-topics.sh` at `/scripts/init-topics.sh:ro`, entrypoint running the script against `kafka1:19092`, on `gdfkube-net`

## 4. Connection contract documentation

- [x] 4.1 Create `gdfkube-src/gdfkube-infra/kafka/README.md` with in-network bootstrap string, host-side bootstrap string, consumer-group naming convention, required producer config, required consumer config, and DLQ context-header convention (all sourced from `docs/05-kafka.md`)

## 5. Verification

- [x] 5.1 Verify all three brokers come up healthy within 60 seconds via `docker compose up -d kafka1 kafka2 kafka3`
- [x] 5.2 Verify `kafka-init` exits 0 and all 9 topics are listed via `kafka-topics.sh --list`
- [x] 5.3 Verify each topic's partition count, RF, retention.ms, min.insync.replicas, and cleanup.policy match the catalog via `kafka-topics.sh --describe` and `kafka-configs.sh --describe`
- [x] 5.4 Verify idempotent re-run: `docker compose run --rm kafka-init` exits 0 with no config changes
- [x] 5.5 Verify produce/consume probe via `kafka-console-producer.sh` / `kafka-console-consumer.sh` on `gdfkube.audit` using internal PLAINTEXT listener
- [x] 5.6 Verify single-broker-loss tolerance: stop kafka2, produce/consume on `gdfkube.audit` still succeeds
- [x] 5.7 Verify cold-start: `docker compose down -v && docker compose up -d` → kafka-init runs cleanly
