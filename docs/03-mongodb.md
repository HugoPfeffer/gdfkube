# MongoDB

> **Implementation Status:** Implemented
> **Source:** Handoff `app.jsx` (schemas, indexes, naming)
> **Last validated:** 2026-05-14

## Specs

- [`gdfkube-audit-log-collection`](../openspec/specs/gdfkube-audit-log-collection/spec.md)
- [`gdfkube-dlq-log-collection`](../openspec/specs/gdfkube-dlq-log-collection/spec.md)
- [`itsm-forms-collection`](../openspec/specs/itsm-forms-collection/spec.md)
- [`itsm-groups-collection`](../openspec/specs/itsm-groups-collection/spec.md)
- [`itsm-requests-collection`](../openspec/specs/itsm-requests-collection/spec.md)
- [`itsm-settings-collection`](../openspec/specs/itsm-settings-collection/spec.md)
- [`itsm-users-collection`](../openspec/specs/itsm-users-collection/spec.md)
- [`mongodb-replica-set-stack`](../openspec/specs/mongodb-replica-set-stack/spec.md)

## Role in the Pipeline

```
[Express] ──insert/update──▶ [MongoDB rs0] ──oplog──▶ [Debezium]
```

MongoDB is the system of record. Express writes; Debezium tails the oplog
and emits change events. No service reads from MongoDB except Express and the
portal — provisioning state changes always flow through CDC.

## Responsibilities

- Persist request documents and audit events.
- Hold the FormDef catalog (single source of truth for form schemas).
- Expose an oplog that Debezium can tail (this is why a replica set is required).
- **Does NOT** publish events itself, run business logic in stored procedures, or hold any cross-tenant secret material.

## Design

### Tech

- MongoDB 7.x.
- 3-node replica set (`rs0`), no sharding.
- StatefulSet with PVC-backed storage. `oplogSize` sized for ~7 days of write retention (matches the CDC topic retention).

### Topology

```
gdfkube-mongo-0  (primary)
gdfkube-mongo-1  (secondary)
gdfkube-mongo-2  (secondary)
```

- Service: `gdfkube-mongo-svc` (headless) for replica-set discovery.
- Connection string: `mongodb://gdfkube-mongo-0.gdfkube-mongo-svc:27017,gdfkube-mongo-1.gdfkube-mongo-svc:27017,gdfkube-mongo-2.gdfkube-mongo-svc:27017/gdfkube?replicaSet=rs0`.
- Database: `gdfkube`.

### Collections

| Collection | Owner | CDC-watched | Purpose |
|---|---|---|---|
| `requests` | Express | yes | Request documents. Primary entity. |
| `forms` | Express (admin) | yes | FormDef catalog. Schema source of truth. |
| `audit_log` | Camel `audit-sink` | no | Append-only audit trail. TTL-indexed (30d). |
| `dlq_log` | Camel `dlq-handler` | no | Materialized view of DLQ messages for operator visibility. |
| `debezium_signals` | (manual) | no | Debezium ad-hoc snapshot signals. Configured for completeness; not used in the demo flow. |

### `requests` Schema

Mirrors `Request` in `gdfkube-src/gdfkube-itsm/src/types.ts:60-81`.

```json
{
  "_id": "01HK6X3F5G9Q...",          // ULID, also requestId
  "formId": "cluster-request",
  "env": "production",
  "status": "approval",                // approval | provisioning | ready | failed
  "stage": 0,                          // 0..6 — index into pipeline stages
  "submittedAt": "2026-05-05T12:34:56Z",
  "requester": {
    "id": "u-joao",
    "name": "João Silva",
    "email": "joao@saude.df.gov.br",
    "role": "operator",
    "group": "saude"
  },
  "requesterGroupName": "saude",
  "vars": { "clusterName": "vacinacao", "nodeCount": 3, "environment": "production" },
  "meta": { "correlationId": "01HK6X3F5G9Q...", "submittedAt": "...", "formId": "cluster-request" },
  "policyChecks": [
    { "id": "quota", "label": "Org quota", "ok": true }
  ],
  "approvalChain": [
    { "actor": "u-maria", "action": "approved", "comment": "Looks good", "at": "2026-05-05T12:40:00Z" }
  ],
  "reason": null
}
```

### `forms` Schema

Mirrors `FormDef` + `Field` (`src/types.ts:142-175`).

```json
{
  "_id": "cluster-request",
  "name": "Provision hosted cluster",
  "topic": "gdfkube.requests.cluster",
  "status": "active",
  "fields": [
    { "key": "clusterName", "label": "Cluster name", "type": "text", "bucket": "vars", "required": true,
      "validation": "^[a-z0-9-]{3,32}$" },
    { "key": "nodeCount", "label": "Node count", "type": "number", "bucket": "vars", "min": 1, "max": 10 },
    { "key": "environment", "label": "Environment", "type": "select", "bucket": "vars",
      "options": "production|staging|development", "displayAs": "radio-cards" }
  ]
}
```

### `audit_log` Schema

```json
{
  "_id": "<ObjectId>",
  "requestId": "01HK6X3F5G9Q...",
  "stage": "camel",                    // form | mongo | debezium | kafka | camel | git | argocd
  "actor": "system" | "u-maria",
  "verb": "rendered" | "pushed" | "approved" | "synced" | ...,
  "detail": "...",
  "at": "2026-05-05T12:40:00Z"
}
```

TTL index on `at` with `expireAfterSeconds: 2592000` (30d).

### `dlq_log` Schema

```json
{
  "_id": "<ObjectId>",
  "topic": "dlq.gdfkube.helm-render",
  "requestId": "01HK6X3F5G9Q...",
  "headers": { "x-original-topic": "dbz.gdfkube.requests", "x-error-class": "...", "x-error-msg": "..." },
  "payload": { ... },
  "firstSeenAt": "...",
  "replayCount": 0,
  "lastReplayAt": null
}
```

### Indexes

| Name | Fields | Purpose |
|---|---|---|
| `idx_requestId` | `{ _id: 1 }` (implicit) + `{ "meta.correlationId": 1 }` | Cross-stage correlation; Kafka key = `_id`. |
| `idx_formId_status` | `{ formId: 1, status: 1 }` | Dashboard queries. |
| `idx_org_env` | `{ requesterGroupName: 1, env: 1 }` | Per-org filtering. |
| `idx_status` | `{ status: 1 }` | Pipeline-stage queries. |
| `idx_createdAt` | `{ submittedAt: 1 }` | Time-series, TTL-eligible (audit only). |

## Interfaces

| Direction | Counterpart | Protocol |
|---|---|---|
| Inbound | Express | TCP / Mongoose |
| Inbound | Camel `audit-sink`, `dlq-handler` | TCP / official MongoDB driver |
| Outbound (oplog) | Debezium | TCP / Mongo driver via Debezium connector |

## Operational Concerns

- **Replica set is mandatory.** Debezium needs the oplog. A single-node deployment without `--replSet` will not work even though the data path looks fine.
- **Backup:** out of scope here. Future PRD will define `mongodump` / Velero strategy.
- **Snapshot mode:** Debezium uses `snapshot.mode = initial`. On first connect it scans the watched collections; subsequent restarts resume from the saved offset.
- **Schema validation:** Mongoose-side at write time. There is no MongoDB-side `$jsonSchema` validator — Express owns validation.

## Decisions Resolved

- Topology: 3-node replica set, no sharding, no arbiter.
- Database: `gdfkube`. Collections: `requests`, `forms`, `audit_log`, `dlq_log`, `debezium_signals`.
- `debezium_signals` exists in config but is not driven by demo flows.
- TTL is on `audit_log` only (30d). `requests` retains forever.

## Open Questions

- Should `requests` get a TTL after `status === 'ready'` for N days? Not specified.
- How are FormDef edits versioned? Today the doc is mutated in place — historical schemas are lost.
- Authentication for in-cluster clients (Express, Camel, Debezium): assumed to be SCRAM, but not specified.

## References

- [02-express-api.md](./02-express-api.md) — the only writer for `requests`/`forms`.
- [04-debezium.md](./04-debezium.md) — oplog consumer, snapshot mode, signals collection.
- [06-camel.md](./06-camel.md) — writers for `audit_log` and `dlq_log`.
