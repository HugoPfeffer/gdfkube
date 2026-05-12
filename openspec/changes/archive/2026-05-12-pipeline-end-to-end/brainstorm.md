## Design Summary

Wire the end-to-end provisioning pipeline that closes the loop from SPA submission to SSE stage stream: Express persists requests to MongoDB → Debezium captures change events to `dbz.gdfkube.requests` → Camel orchestrator runs 8 routes (request-router, helm-render, git-push, repo-bootstrap, status-emitter, audit-sink, config-reload, dlq-handler) → emits `gdfkube.pipeline.status` → Express consumes and re-emits as SSE → SPA renders stage timeline. Audit and DLQ events land in two new Mongo collections.

The bundle creates 4 new capabilities (`debezium-connect-stack`, `camel-orchestrator-stack`, `gdfkube-audit-log-collection`, `gdfkube-dlq-log-collection`) and modifies 1 (`itsm-express-api`, ADDED requirements only — Submit endpoint behavior unchanged because Express remains a non-producer to Kafka). The kafka-broker-stack and mongodb-replica-set-stack are not modified.

Single-change bundle is justified: no subsystem is independently observable without the others, so verification only works end-to-end.

## Alternatives Considered

### Option A: Per-subsystem bundling (one change per capability)

- **Approach**: Split into 4–5 sequential change proposals — `debezium-connect-stack` first, then `camel-orchestrator-stack`, then collections, then `itsm-express-api` modifications.
- **Pros**: Smaller per-change scope; matches the kafka-broker-stack precedent (single capability).
- **Cons**: Each intermediate change is unverifiable in isolation (Debezium with no consumer; Camel with no producer driver; Express SSE with no events to consume). Reviewers cannot run an acceptance scenario until all 4 land. Risk of integration drift between proposals.
- **Why not chosen**: The pipeline is structurally end-to-end. Splitting hides integration bugs (header propagation, schema mismatch, approval-loop guard) until late. Bundling lets the verification scenarios actually run.

### Option B: Express also produces "form" stage to Kafka

- **Approach**: Have Express produce a `form` event to `gdfkube.pipeline.status` on `POST /requests`, with Camel synthesizing only `mongo` onward. Matches 06-camel.md §Status Events (one possible reading).
- **Pros**: Stage events are emitted closer to the event source; eliminates the "Camel backfills past stages" oddity.
- **Cons**: 02-express-api.md explicitly states "Express does NOT produce to Kafka. Only consumes." Doc contradiction must be resolved. Express gains a kafkajs producer surface that we have to maintain. Failure modes split across two producers (timeout, partial publish).
- **Why not chosen**: 02-express-api.md is the more specific Express contract and is preserved. Camel synthesizes the full 7-stage timeline from a single hop, keeping the producer surface centralized and the schema authoritative.

### Option C: Pipeline-end-to-end bundle (Camel as sole stage producer, Compose-only, MockGitProvider for dev)

- **Approach**: This change. Single bundle covering 4 new + 1 modified capability. Debezium runs as raw Kafka Connect container (Compose). Camel runs as one Quarkus JVM app with 8 in-process routes. Helm CLI invoked as subprocess. Express adds kafkajs consumer + SSE route only. `GitProvider` interface with real `GiteaGitProvider` and `MockGitProvider` (active in `%dev` profile). Two new Mongo collections (`audit_log` with 30d TTL; `dlq_log` no TTL).
- **Pros**: End-to-end verifiable. Matches doc contracts exactly. Compose-only keeps runtime uniform with existing kafka/mongo stacks. Single Quarkus app shares the Helm CLI binary and Git working dir. MockGitProvider removes Gitea as a moving part for dev/test.
- **Cons**: Bundle is larger than the kafka-broker-stack precedent (5 spec deltas vs 1). Reviewer load is higher.
- **Why not chosen**: This IS the chosen approach.

## Agreed Approach

**Option C — Pipeline end-to-end bundle.** Justification: pipeline only delivers value when the full hop completes (request → CDC → Camel → SSE), and verification scenarios cannot be authored against partial implementations. The bundle is structurally cohesive: every capability's interface contract (DLQ headers, `gdfkube.pipeline.status` schema, audit row shape, GitProvider seam) is enforced cross-capability.

Sole stage producer: Camel `status-emitter`. Express never writes to Kafka. Stage representation: integer 0–6 with `stageName` string in the SSE event (matches existing `Request.stage` Mongoose schema). Approval-loop guard: Debezium captures `change_streams_update_full_with_pre_image`, and `request-router` accepts `op=u` only when `before.status != after.status` AND `after.status == "provisioning"` — drops Camel's own `stage` write-back.

## Key Decisions

| Decision | Chosen | Alternative | Why not the alternative |
|---|---|---|---|
| Deployment surface | Docker Compose | K8s manifests via Helm chart | K8s precedent doesn't exist yet for the dev-loop; kafka/mongo are Compose; consistent runtime simpler to verify |
| Debezium runtime | Raw Kafka Connect container (`debezium/connect:2.7.3.Final`) | Strimzi `KafkaConnector` CR | CRs require a K8s cluster; not available in Compose |
| Connect internal-topic creation | New `gdfkube-connect-topics-init` service under Debezium capability | Extend existing `kafka-init` in `kafka-broker-stack` | Cleaner capability boundary; avoids touching the archived kafka spec |
| Connector-config delivery | One-shot REST `PUT` via curl | Mount JSON file and `kafka-connect-cli` | curl is portable and idempotent; CLI adds an image dep |
| Debezium capture mode | `change_streams_update_full_with_pre_image` | `change_streams_update_full` (default) | Without pre-image, request-router cannot reliably detect `before.status != after.status` and would loop on Camel's own `stage` write-back |
| Camel topology | One Quarkus app, 8 in-process routes | Per-route Camel K Integrations | K Integrations are K8s-only; single app shares Helm CLI binary and Git working dir |
| Camel image runtime | Quarkus JVM (`3.16.3`) | Quarkus native | Native build adds 5–10 minutes per iteration; JVM is acceptable for dev |
| Helm invocation | Subprocess `helm template` | Java Helm SDK | 06-camel.md explicitly chose subprocess; SDKs lag upstream Helm versions |
| Helm chart contents | Full charts (cluster-request, namespace-request, scale-patch, infra/argocd-org, infra/rhacm-org) | Stub charts that render trivially | User-elected scope; full charts are testable end-to-end |
| Git provider for dev/test | `MockGitProvider` (in-memory, `%dev` profile) | Compose-deployed Gitea | Gitea infra not yet specced; mock removes a moving part |
| Git provider for production | `GiteaGitProvider` (real REST + JGit) | GitHub/GitLab provider | Demo uses Gitea (per 08-git.md); third-party providers deferred |
| Approval-loop guard | Pre-image `before.status != after.status` AND `after.status == "provisioning"` | Single-field `status == "provisioning"` check | Single-field check fires on every `op=u` whose status field is unchanged-from-provisioning — causes infinite loops with `stage` write-back |
| Audit emission | Per-route Camel interceptor → `gdfkube.audit` → `audit-sink` route → `audit_log` | Inline `audit_log` writes from each route | Decoupling via Kafka enables future audit-stream consumers (UI, SIEM) |
| Stage emission ownership | Camel `status-emitter` synthesizes all 7 stages | Each subsystem produces its own stage | 02-express-api.md forbids Express producing; Debezium has no producer hook; centralizing keeps the schema enforceable |
| Stage representation | Integer 0–6 with `stageName` string in the event | String enum only | Existing `Request.stage` Mongoose schema is `Number 0–6`; integer is the source of truth |
| Retry backoff | `1s/5s/25s` with `backOffMultiplier=5.0` | `1s/5s/30s` (linear) | 06-camel.md prescribes geometric; 05-kafka.md's `30s` is the rounded narrative |
| DLQ behavior | Manual replay only | Auto-replay with attempt cap | Auto-replay risks loops on persistent failures; operator visibility takes precedence |
| Express SSE late-subscriber | Synthetic first event from current `Request.stage` field | Replay from Kafka offset | Per-client offset tracking is heavy; "miss earlier stages" is documented and acceptable |
| Image tags | Concrete patch tags (`debezium/connect:2.7.3.Final`, Quarkus `3.16.3`, Camel `4.6.0`, Helm `v3.16.x`) | Major-only tags | kafka-broker-stack retrospective documented the `3.7` vs `3.7.2` bug |
| Audit collection TTL | TTL on `at` field, `expireAfterSeconds=2592000` (30 days) | No TTL | 03-mongodb.md spec; audit retention is bounded by policy |
| DLQ collection TTL | None | TTL | Operator-controlled retention; DLQ entries must persist until manual replay |
| Collection bootstrap | Idempotent `init-camel-collections.js` extending the mongo-seed pattern | New per-collection init services | Mirrors existing `mongo-seed` precedent; one script for both collections keeps drift low |
| Express SSE topology | Single Express replica with in-memory `Map<requestId, Set<Response>>` | Multi-replica with Redis pub/sub | Single-replica is sufficient for demo scope; multi-replica deferred |
| SSE consumer group | `itsm-sse-${HOSTNAME}` (per-replica) | Shared `itsm-sse` group | Per-replica fan-out: every replica receives every event so all locally-attached subscribers see it. Shared group would partition events across replicas. |

## Open Questions

None at the brainstorm level — all scoping calls and doc contradictions are resolved in this design:

- Stage producer ownership: Camel only (02-express-api.md wins over 06-camel.md §Status Events).
- Retry backoff: `1s/5s/25s` with multiplier 5.0 (06-camel.md wins over 05-kafka.md's rounded `30s`).
- Camel route count: 8 (06-camel.md §Routes wins over §Topology's "6 routes" doc bug).
- `op=r` snapshot rows: treated identically to `op=c` (snapshot replays are intentional; downstream is idempotent).
- `op=d` (delete): out of scope.

Implementation-level questions (specific Helm chart template details, exact `values.schema.json` constraints, JGit timeout tuning) are deferred to design.md §Open Questions.
