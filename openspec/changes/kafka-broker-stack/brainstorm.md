## Design Summary

Stand up a 3-broker Apache Kafka 3.7 cluster in KRaft mode via the existing root `docker-compose.yml`, pre-create all 9 topics from the doc catalog with exact partition/replication/retention settings, and document the connection contract for downstream specs (Debezium, Camel, Express SSE). The stack mirrors the established mongo-stack patterns: named volumes per node, healthchecks, one-shot init container, loopback-only host binding.

This change is infrastructure-only — no application code changes, no Debezium/Camel/Express wiring. Topics are declared as skeleton handoffs for future specs.

## Alternatives Considered

### Option A: Single-broker dev-only setup

- **Approach**: Run one Kafka broker with RF=1 for minimal resource usage during development.
- **Pros**: Fastest startup, lowest memory footprint, simplest config.
- **Cons**: Cannot test RF=3 / min.insync.replicas=2 behavior. Single point of failure hides fault-tolerance bugs. Topic settings would diverge from the doc's production catalog.
- **Why not chosen**: The doc specifies 3 brokers with RF=3 and min.insync.replicas=2 as normative. A single-broker setup would make topic configs unrepresentative and prevent testing broker-loss tolerance, which is an explicit verification requirement.

### Option B: 3-broker cluster with ZooKeeper

- **Approach**: Run 3 Kafka brokers + a ZooKeeper ensemble (1 or 3 nodes) for metadata management.
- **Pros**: More established operational tooling. Some Kafka tooling still assumes ZooKeeper.
- **Cons**: Extra 1–3 containers for ZooKeeper. ZooKeeper is deprecated in Kafka 3.7. More moving parts in the compose file. Diverges from the doc's "KRaft mode" specification.
- **Why not chosen**: The doc explicitly specifies KRaft mode. Apache Kafka 3.7 has production-ready KRaft. ZooKeeper adds container overhead with no benefit for this use case.

### Option C: 3-broker KRaft cluster (combined controller+broker roles)

- **Approach**: 3 Kafka 3.7 nodes, each running both controller and broker roles via KRaft. Fixed cluster ID for deterministic quorum. One-shot init container for topic creation.
- **Pros**: Matches the doc spec exactly. No ZooKeeper overhead. Mirrors the mongo-stack pattern (3 data nodes + init container). Supports RF=3 / min.insync.replicas=2. Combined roles minimize container count.
- **Cons**: Combined controller+broker is slightly less production-like than dedicated controller nodes — but acceptable for a dev/demo compose stack.
- **Why not chosen**: This IS the chosen approach.

## Agreed Approach

**Option C: 3-broker KRaft cluster with combined roles.** This directly implements the doc's topology specification while keeping the compose file uniform with the existing mongo stack. The combined controller+broker role is appropriate for a 3-node dev/demo cluster and minimizes container count.

Key structural decisions:
- Image: `apache/kafka:3.7` (native KRaft, env-var configured)
- Services: `kafka1`, `kafka2`, `kafka3` + `kafka-init` in root `docker-compose.yml`
- Volumes: `kafka1-data`, `kafka2-data`, `kafka3-data` (named, at `/var/lib/kafka/data`)
- Network: existing `gdfkube-net` bridge
- Host access: only `kafka1` publishes `127.0.0.1:9092`
- Init mechanism: bind-mounted `init-topics.sh` using `kafka-topics.sh --create --if-not-exists`
- Topic catalog: all 9 topics from doc with exact partition/RF/retention/min.insync.replicas values

## Key Decisions

| Decision | Value | Rationale |
|---|---|---|
| Image | `apache/kafka:3.7` | Doc says "Apache Kafka 3.7+". Native KRaft; minimal env-var surface. |
| Topology | 3 nodes, combined controller+broker (KRaft) | Doc says 3 brokers, KRaft. Allows RF=3 / min.insync.replicas=2. |
| Network | `gdfkube-net` (existing bridge) | Shared with mongo stack so future services can reach both. |
| Host port | `kafka1` publishes `127.0.0.1:9092` only | Mirrors `mongo1` loopback pattern. |
| Inter-broker bootstrap | `kafka1:9092,kafka2:9092,kafka3:9092` | Docker DNS on `gdfkube-net`. K8s bootstrap name does not apply to compose. |
| Volumes | `kafka1-data`, `kafka2-data`, `kafka3-data` (named) | Mirrors mongo's `mongo{N}-data` pattern. |
| Topic init | One-shot `kafka-init` with `init-topics.sh` | Mirrors `mongo-init`: `restart: "no"`, `depends_on` healthy, idempotent. |
| Delivery semantics | At-least-once (per doc) | Broker-side only; producer idempotence is downstream concern. |
| Cleanup policy | `delete` on all topics | Doc explicitly says no compaction. |

## Open Questions

None — all design decisions are resolved per the PRD and `docs/05-kafka.md`. Deferred items (TLS, quotas, DR, monitoring, schema registry) are explicitly out of scope for this change.
